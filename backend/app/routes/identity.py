from fastapi import APIRouter, Depends, HTTPException, Header, UploadFile, File
from sqlalchemy.orm import Session
from sqlalchemy import or_, asc, desc
from typing import Optional, List
from datetime import datetime
from pydantic import BaseModel
import csv
import io

from app.database import get_db
from app.models.identity import Identity
from app.models.application_account import ApplicationAccount
from app.models.application import Application
from app.models.application_account_entitlement import ApplicationAccountEntitlement
from app.models.application_entitlement import ApplicationEntitlement
from app.models.audit_log import AuditLog
from app.schemas.identity import IdentityResponse, IdentityPaginatedResponse, IdentityCreate
from app.utils.permissions import require_permission

router = APIRouter()


class BulkDeleteRequest(BaseModel):
    ids: List[int]


def write_identity_audit(db: Session, user: str, action: str, old_val: dict = None, new_val: dict = None):
    """Identity Repository CRUD/bulk actions previously wrote nothing to the
    Audit Log at all - this closes that gap, mirroring the write_xxx_audit
    helper pattern used across every other module."""
    import json
    try:
        audit = AuditLog(
            module="Identity Repository",
            action=action,
            performed_by=user,
            old_value=json.dumps(old_val, default=str) if old_val else None,
            new_value=json.dumps(new_val, default=str) if new_val else None,
            timestamp=datetime.utcnow()
        )
        db.add(audit)
        db.commit()
    except Exception as e:
        print(f"Warning: Failed to write identity audit record: {e}")


@router.get("/identities", response_model=IdentityPaginatedResponse)
def get_identities(
    page: int = 1,
    limit: int = 25,
    search: Optional[str] = None,
    department: Optional[str] = None,
    status: Optional[str] = None,
    sortBy: Optional[str] = "created_at",
    sortOrder: Optional[str] = "desc",
    db: Session = Depends(get_db),
    _perm: bool = Depends(require_permission("Identity Repository", "view"))
):
    if page < 1:
        page = 1
    if limit < 1:
        limit = 25

    query = db.query(Identity).filter(Identity.is_deleted == False)

    if search:
        search_term = f"%{search}%"
        query = query.filter(
            or_(
                Identity.display_name.like(search_term),
                Identity.first_name.like(search_term),
                Identity.last_name.like(search_term),
                Identity.email.like(search_term),
                Identity.employee_id.like(search_term)
            )
        )

    if department:
        query = query.filter(Identity.department == department)
    if status:
        query = query.filter(Identity.status == status)

    sort_fields = {
        "display_name": Identity.display_name,
        "employee_id": Identity.employee_id,
        "email": Identity.email,
        "department": Identity.department,
        "status": Identity.status,
        "created_at": Identity.created_at,
        "imported_at": Identity.imported_at
    }
    sort_col = sort_fields.get(sortBy, Identity.created_at)
    query = query.order_by(asc(sort_col) if sortOrder == "asc" else desc(sort_col))

    total = query.count()
    total_pages = (total + limit - 1) // limit if total > 0 else 0
    offset = (page - 1) * limit
    identities = query.offset(offset).limit(limit).all()

    return {
        "total": total,
        "page": page,
        "limit": limit,
        "total_pages": total_pages,
        "identities": identities
    }


def _find_existing_identity(db, email, employee_id, exclude_id=None):
    """Looks up a non-deleted identity by email first, then employee_id."""
    query = db.query(Identity).filter(Identity.is_deleted == False)
    if exclude_id:
        query = query.filter(Identity.id != exclude_id)
    if email:
        found = query.filter(Identity.email == email).first()
        if found:
            return found
    if employee_id:
        found = query.filter(Identity.employee_id == employee_id).first()
        if found:
            return found
    return None


@router.post("/identities", response_model=IdentityResponse)
def create_identity(
    payload: IdentityCreate,
    db: Session = Depends(get_db),
    x_user_name: str = Header(default="System"),
    _perm: bool = Depends(require_permission("Identity Repository", "create"))
):
    duplicate = _find_existing_identity(db, payload.email, payload.employee_id)
    if duplicate:
        raise HTTPException(
            status_code=409,
            detail=f"An identity with this email or employee ID already exists (ID {duplicate.id}, '{duplicate.display_name or duplicate.email}', source: {duplicate.source_connector_name or 'Manual Entry'}). Edit that record instead of creating a duplicate."
        )

    display_name = payload.display_name or f"{payload.first_name or ''} {payload.last_name or ''}".strip() or payload.email

    identity = Identity(
        employee_id=payload.employee_id,
        first_name=payload.first_name,
        last_name=payload.last_name,
        display_name=display_name or None,
        email=payload.email,
        department=payload.department,
        job_title=payload.job_title,
        manager=payload.manager,
        status=payload.status or "Active",
        source_connector_id=None,
        source_connector_name="Manual Entry",
        imported_at=datetime.utcnow(),
        created_by=x_user_name,
        modified_by=x_user_name
    )
    db.add(identity)
    db.commit()
    db.refresh(identity)

    write_identity_audit(db, x_user_name, "Create", new_val={"id": identity.id, "email": identity.email, "display_name": identity.display_name})
    return identity


@router.post("/identities/bulk-upload")
def bulk_upload_identities(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    x_user_name: str = Header(default="System"),
    _perm: bool = Depends(require_permission("Identity Repository", "create"))
):
    if not file.filename or not file.filename.lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="Only CSV files are supported for bulk identity upload.")

    raw = file.file.read()
    try:
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        text = raw.decode("latin-1")

    reader = csv.DictReader(io.StringIO(text))
    rows = [
        {str(k).strip().lower(): (v.strip() if isinstance(v, str) else v) for k, v in row.items() if k}
        for row in reader
    ]

    if not rows:
        return {"total": 0, "created": 0, "updated": 0, "errors": 0}

    def get(row, *keys):
        for k in keys:
            if row.get(k):
                return row[k]
        return None

    created_count = 0
    updated_count = 0
    error_count = 0

    for row in rows:
        try:
            email = get(row, "email", "email_address", "mail", "user_email")
            employee_id = get(row, "employee_id", "emp_id", "identity_id", "id", "user_id")
            first_name = get(row, "first_name", "firstname", "first", "given_name")
            last_name = get(row, "last_name", "lastname", "last", "family_name", "surname")
            department = get(row, "department", "dept", "org_unit")
            job_title = get(row, "job_title", "title", "job_level", "role", "designation", "position")
            manager = get(row, "manager", "manager_id", "manager_email", "reports_to")
            status_val = get(row, "status", "user_status", "state", "active_status") or "Active"

            if not email and not employee_id:
                error_count += 1
                continue

            existing = _find_existing_identity(db, email, employee_id)
            if existing:
                existing.employee_id = employee_id or existing.employee_id
                existing.first_name = first_name or existing.first_name
                existing.last_name = last_name or existing.last_name
                existing.email = email or existing.email
                existing.department = department or existing.department
                existing.job_title = job_title or existing.job_title
                existing.manager = manager or existing.manager
                existing.status = status_val or existing.status
                existing.modified_by = x_user_name
                updated_count += 1
            else:
                display_name = get(row, "display_name", "name", "full_name") or f"{first_name or ''} {last_name or ''}".strip() or email
                identity = Identity(
                    employee_id=employee_id,
                    first_name=first_name,
                    last_name=last_name,
                    display_name=display_name or None,
                    email=email,
                    department=department,
                    job_title=job_title,
                    manager=manager,
                    status=status_val,
                    source_connector_id=None,
                    source_connector_name="Bulk Upload",
                    imported_at=datetime.utcnow(),
                    created_by=x_user_name,
                    modified_by=x_user_name
                )
                db.add(identity)
                created_count += 1
        except Exception as exc:
            print(f"Error processing identity row {row}: {exc}")
            error_count += 1

    db.commit()

    write_identity_audit(
        db, x_user_name, "Bulk Upload",
        new_val={"total": len(rows), "created": created_count, "updated": updated_count, "errors": error_count, "filename": file.filename}
    )

    return {
        "total": len(rows),
        "created": created_count,
        "updated": updated_count,
        "errors": error_count
    }


@router.delete("/identities/bulk-upload/reset")
def reset_bulk_uploaded_identities(
    db: Session = Depends(get_db),
    x_user_name: str = Header(default="System"),
    _perm: bool = Depends(require_permission("Identity Repository", "delete"))
):
    """
    Soft-deletes every identity whose source is 'Bulk Upload', leaving
    connector-imported and manually created identities untouched. Lets an
    admin clear out a test/demo CSV batch without affecting anything else.
    """
    matches = db.query(Identity).filter(
        Identity.source_connector_name == "Bulk Upload",
        Identity.is_deleted == False
    ).all()

    count = len(matches)
    for identity in matches:
        identity.is_deleted = True
        identity.modified_by = x_user_name
    db.commit()

    write_identity_audit(db, x_user_name, "Reset Bulk Upload", new_val={"deleted": count})
    return {"deleted": count}


@router.post("/identities/bulk-delete")
def bulk_delete_identities(
    payload: BulkDeleteRequest,
    db: Session = Depends(get_db),
    x_user_name: str = Header(default="System"),
    _perm: bool = Depends(require_permission("Identity Repository", "delete"))
):
    """
    Soft-deletes a specific set of identities, chosen via checkboxes on the
    Identity Repository list — regardless of source (connector, manual,
    bulk upload). Used for general test-data cleanup, unlike the narrower
    Reset Bulk Upload button which only targets source='Bulk Upload' rows.
    """
    if not payload.ids:
        return {"deleted": 0}

    matches = db.query(Identity).filter(
        Identity.id.in_(payload.ids),
        Identity.is_deleted == False
    ).all()

    count = len(matches)
    for identity in matches:
        identity.is_deleted = True
        identity.modified_by = x_user_name
    db.commit()

    write_identity_audit(db, x_user_name, "Bulk Delete", new_val={"deleted": count, "ids": payload.ids})
    return {"deleted": count}


@router.get("/identities/filters/meta")
def get_identity_filter_meta(
    db: Session = Depends(get_db),
    _perm: bool = Depends(require_permission("Identity Repository", "view"))
):
    departments = [
        row[0] for row in db.query(Identity.department).filter(
            Identity.is_deleted == False, Identity.department.isnot(None)
        ).distinct().all()
    ]
    statuses = [
        row[0] for row in db.query(Identity.status).filter(
            Identity.is_deleted == False
        ).distinct().all()
    ]
    return {"departments": sorted(departments), "statuses": sorted(statuses)}


@router.get("/identities/stats")
def get_identity_stats(
    db: Session = Depends(get_db),
    _perm: bool = Depends(require_permission("Identity Repository", "view"))
):
    from sqlalchemy import func
    total = db.query(func.count(Identity.id)).filter(Identity.is_deleted == False).scalar() or 0
    active = db.query(func.count(Identity.id)).filter(Identity.is_deleted == False, Identity.status == "Active").scalar() or 0
    inactive = total - active
    
    # Count unique departments
    depts = db.query(func.count(func.distinct(Identity.department))).filter(
        Identity.is_deleted == False, 
        Identity.department != None, 
        Identity.department != ""
    ).scalar() or 0
    
    return {
        "total": total,
        "active": active,
        "inactive": inactive,
        "departments": depts
    }


@router.get("/identities/{id}", response_model=IdentityResponse)
def get_identity(
    id: int,
    db: Session = Depends(get_db),
    _perm: bool = Depends(require_permission("Identity Repository", "view"))
):
    identity = db.query(Identity).filter(Identity.id == id, Identity.is_deleted == False).first()
    if not identity:
        raise HTTPException(status_code=404, detail="Identity not found")
    return identity


@router.put("/identities/{id}", response_model=IdentityResponse)
def update_identity(
    id: int,
    payload: IdentityCreate,
    db: Session = Depends(get_db),
    x_user_name: str = Header(default="System"),
    _perm: bool = Depends(require_permission("Identity Repository", "edit"))
):
    identity = db.query(Identity).filter(Identity.id == id, Identity.is_deleted == False).first()
    if not identity:
        raise HTTPException(status_code=404, detail="Identity not found")

    duplicate = _find_existing_identity(db, payload.email, payload.employee_id, exclude_id=id)
    if duplicate:
        raise HTTPException(
            status_code=409,
            detail=f"Another identity already uses this email or employee ID (ID {duplicate.id}, '{duplicate.display_name or duplicate.email}')."
        )

    old_state = {
        "employee_id": identity.employee_id, "first_name": identity.first_name, "last_name": identity.last_name,
        "email": identity.email, "department": identity.department, "job_title": identity.job_title,
        "manager": identity.manager, "status": identity.status
    }

    identity.employee_id = payload.employee_id
    identity.first_name = payload.first_name
    identity.last_name = payload.last_name
    identity.display_name = payload.display_name or f"{payload.first_name or ''} {payload.last_name or ''}".strip() or payload.email
    identity.email = payload.email
    identity.department = payload.department
    identity.job_title = payload.job_title
    identity.manager = payload.manager
    identity.status = payload.status or "Active"
    identity.modified_by = x_user_name
    db.commit()
    db.refresh(identity)

    new_state = {
        "employee_id": identity.employee_id, "first_name": identity.first_name, "last_name": identity.last_name,
        "email": identity.email, "department": identity.department, "job_title": identity.job_title,
        "manager": identity.manager, "status": identity.status
    }
    write_identity_audit(db, x_user_name, "Update", old_val=old_state, new_val=new_state)
    return identity


@router.delete("/identities/{id}")
def delete_identity(
    id: int,
    db: Session = Depends(get_db),
    x_user_name: str = Header(default="System"),
    _perm: bool = Depends(require_permission("Identity Repository", "delete"))
):
    identity = db.query(Identity).filter(Identity.id == id, Identity.is_deleted == False).first()
    if not identity:
        raise HTTPException(status_code=404, detail="Identity not found")
    identity.is_deleted = True
    identity.modified_by = x_user_name
    db.commit()

    write_identity_audit(db, x_user_name, "Delete", old_val={"id": identity.id, "email": identity.email, "display_name": identity.display_name})
    return {"success": True}


@router.get("/identities/{id}/accounts")
def get_identity_correlated_accounts(
    id: int,
    db: Session = Depends(get_db),
    _perm: bool = Depends(require_permission("Identity Repository", "view"))
):
    identity = db.query(Identity).filter(Identity.id == id, Identity.is_deleted == False).first()
    if not identity:
        raise HTTPException(status_code=404, detail="Identity not found")

    if not identity.email:
        return {"accounts": [], "correlation_note": "This identity has no email on file, so account correlation cannot run."}

    matches = db.query(ApplicationAccount, Application).join(
        Application, ApplicationAccount.application_id == Application.id
    ).filter(
        ApplicationAccount.email == identity.email,
        ApplicationAccount.is_deleted == False,
        Application.is_deleted == False
    ).all()

    return {
        "accounts": [
            {
                "id": acc.id,
                "application_id": app.id,
                "application_name": app.application_name,
                "account_id": acc.account_id,
                "account_name": acc.account_name,
                "email": acc.email,
                "status": acc.status,
                "imported_at": acc.imported_at.isoformat() if acc.imported_at else None,
                "correlation_status": acc.correlation_status,
                "correlation_method": acc.correlation_method,
                "correlation_confidence": acc.correlation_confidence
            } for acc, app in matches
        ]
    }


@router.get("/identities/{id}/entitlements")
def get_identity_entitlements(
    id: int,
    db: Session = Depends(get_db),
    _perm: bool = Depends(require_permission("Identity Repository", "view"))
):
    identity = db.query(Identity).filter(Identity.id == id, Identity.is_deleted == False).first()
    if not identity:
        raise HTTPException(status_code=404, detail="Identity not found")

    if not identity.email:
        return {"entitlements": [], "correlation_note": "This identity has no email on file, so entitlement correlation cannot run."}

    matched_accounts = db.query(ApplicationAccount, Application).join(
        Application, ApplicationAccount.application_id == Application.id
    ).filter(
        ApplicationAccount.email == identity.email,
        ApplicationAccount.is_deleted == False,
        Application.is_deleted == False
    ).all()

    if not matched_accounts:
        return {"entitlements": [], "correlation_note": "No correlated accounts found for this identity, so there are no entitlements to show."}

    account_app_lookup = {acc.id: app for acc, app in matched_accounts}
    account_ids = list(account_app_lookup.keys())

    links = db.query(ApplicationAccountEntitlement, ApplicationEntitlement).outerjoin(
        ApplicationEntitlement, ApplicationAccountEntitlement.entitlement_id == ApplicationEntitlement.id
    ).filter(
        ApplicationAccountEntitlement.account_id.in_(account_ids)
    ).all()

    if not links:
        return {"entitlements": [], "correlation_note": "This identity's correlated account(s) don't have any entitlement assignments imported yet."}

    results = []
    for link, ent in links:
        app = account_app_lookup.get(link.account_id)
        results.append({
            "application_name": app.application_name if app else None,
            "entitlement_name": ent.entitlement_name if ent else link.entitlement_name_raw,
            "entitlement_type": ent.entitlement_type if ent else None,
            "description": ent.description if ent else None,
            "matched": link.matched
        })

    return {"entitlements": results}


@router.get("/identities/{id}/timeline")
def get_identity_timeline(
    id: int,
    db: Session = Depends(get_db),
    _perm: bool = Depends(require_permission("Identity Repository", "view"))
):
    identity = db.query(Identity).filter(Identity.id == id, Identity.is_deleted == False).first()
    if not identity:
        raise HTTPException(status_code=404, detail="Identity not found")

    if identity.source_connector_name == "Manual Entry":
        origin_details = "Created manually"
    elif identity.source_connector_name == "Bulk Upload":
        origin_details = "Added via bulk CSV upload"
    elif identity.source_connector_name:
        origin_details = f"Imported via connector '{identity.source_connector_name}'"
    else:
        origin_details = "Identity created"

    events = []
    events.append({
        "event": "Identity Imported",
        "details": origin_details,
        "timestamp": identity.imported_at.isoformat() if identity.imported_at else identity.created_at.isoformat()
    })
    if identity.updated_at and identity.updated_at != identity.created_at:
        events.append({
            "event": "Identity Updated",
            "details": "Identity record was updated",
            "timestamp": identity.updated_at.isoformat()
        })

    if identity.email:
        matches = db.query(ApplicationAccount, Application).join(
            Application, ApplicationAccount.application_id == Application.id
        ).filter(
            ApplicationAccount.email == identity.email,
            ApplicationAccount.is_deleted == False
        ).all()
        for acc, app in matches:
            events.append({
                "event": "Account Correlated",
                "details": f"Correlated account found in '{app.application_name}' ({acc.account_id})",
                "timestamp": acc.imported_at.isoformat() if acc.imported_at else None
            })

        account_ids = [acc.id for acc, app in matches]
        app_lookup = {acc.id: app for acc, app in matches}
        if account_ids:
            links = db.query(ApplicationAccountEntitlement, ApplicationEntitlement).outerjoin(
                ApplicationEntitlement, ApplicationAccountEntitlement.entitlement_id == ApplicationEntitlement.id
            ).filter(
                ApplicationAccountEntitlement.account_id.in_(account_ids),
                ApplicationAccountEntitlement.matched == True
            ).all()
            for link, ent in links:
                app = app_lookup.get(link.account_id)
                events.append({
                    "event": "Entitlement Correlated",
                    "details": f"Entitlement '{ent.entitlement_name if ent else link.entitlement_name_raw}' linked in '{app.application_name if app else 'Unknown'}'",
                    "timestamp": link.created_at.isoformat() if link.created_at else None
                })

    events.sort(key=lambda e: e["timestamp"] or "", reverse=True)
    return {"events": events}

