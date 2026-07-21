from fastapi import APIRouter, Depends, HTTPException, status, Header
from sqlalchemy.orm import Session
from sqlalchemy import or_
from typing import List, Optional
import json
from datetime import datetime, date

from app.database import get_db
from app.models.license import License
from app.models.audit_log import AuditLog
from app.models.dashboard import RecentActivity
from app.schemas.license import (
    LicenseCreate, LicenseUpdate, LicenseResponse, LicensePaginatedResponse
)

router = APIRouter()

def compute_status(lic: License) -> str:
    today = date.today()
    if today < lic.valid_from:
        return "Upcoming"
    if today > lic.valid_until:
        return "Expired"
    days_left = (lic.valid_until - today).days
    if days_left <= 30:
        return "Expiring Soon"
    return "Active"

def write_audit_record(db: Session, user: str, action: str, details_dict: dict, old_val_dict: dict = None):
    try:
        old_val_str = json.dumps(old_val_dict, default=str) if old_val_dict else None
        new_val_str = json.dumps(details_dict, default=str) if details_dict else None

        if action == "DELETE_LICENSE":
            old_val_str = json.dumps(details_dict, default=str)
            new_val_str = None
        elif action == "UPDATE_LICENSE":
            changes = details_dict.get("changes", {})
            old_state = {k: v["old"] for k, v in changes.items()}
            new_state = {k: v["new"] for k, v in changes.items()}
            old_val_str = json.dumps(old_state, default=str)
            new_val_str = json.dumps(new_state, default=str)

        audit = AuditLog(
            module="License Management",
            action=action.replace("_LICENSE", "").title(),
            performed_by=user,
            old_value=old_val_str,
            new_value=new_val_str,
            timestamp=datetime.utcnow()
        )
        db.add(audit)

        activity_label = "created"
        if action == "UPDATE_LICENSE":
            activity_label = "updated"
        elif action == "DELETE_LICENSE":
            activity_label = "deleted"

        activity = RecentActivity(
            user=user,
            action=f"License {activity_label} - {details_dict.get('company_name', '')}",
            status="info" if action != "DELETE_LICENSE" else "warning",
            created_at=datetime.utcnow()
        )
        db.add(activity)
        db.commit()
    except Exception as e:
        print(f"Warning: Failed to write audit record: {e}")

@router.get("/licenses", response_model=LicensePaginatedResponse)
def get_licenses(
    page: int = 1,
    limit: int = 10,
    search: Optional[str] = None,
    plan_type: Optional[str] = None,
    status: Optional[str] = None,
    db: Session = Depends(get_db)
):
    if page < 1:
        page = 1
    if limit < 1:
        limit = 10

    query = db.query(License).filter(License.is_deleted == False)

    if search:
        search_term = f"%{search}%"
        query = query.filter(
            or_(
                License.company_name.like(search_term),
                License.license_key.like(search_term)
            )
        )
    if plan_type:
        query = query.filter(License.plan_type == plan_type)

    all_licenses = query.order_by(License.id.desc()).all()

    # Attach computed status to each record (not stored in DB)
    for lic in all_licenses:
        lic.status = compute_status(lic)

    if status:
        all_licenses = [l for l in all_licenses if l.status == status]

    total = len(all_licenses)
    total_pages = (total + limit - 1) // limit if total > 0 else 1
    start_idx = (page - 1) * limit
    paged = all_licenses[start_idx:start_idx + limit]

    return LicensePaginatedResponse(
        total=total,
        page=page,
        limit=limit,
        total_pages=total_pages,
        licenses=paged
    )

@router.get("/licenses/{id}", response_model=LicenseResponse)
def get_license(id: int, db: Session = Depends(get_db)):
    lic = db.query(License).filter(License.id == id, License.is_deleted == False).first()
    if not lic:
        raise HTTPException(status_code=404, detail="License not found")
    lic.status = compute_status(lic)
    return lic

@router.post("/licenses", response_model=LicenseResponse, status_code=status.HTTP_201_CREATED)
def create_license(
    payload: LicenseCreate,
    db: Session = Depends(get_db),
    x_user_name: str = Header(default="Unknown User")
):
    if db.query(License).filter(License.license_key == payload.license_key, License.is_deleted == False).first():
        raise HTTPException(status_code=400, detail="A license with this key already exists.")

    lic = License(
        company_name=payload.company_name,
        license_key=payload.license_key,
        plan_type=payload.plan_type,
        valid_from=payload.valid_from,
        valid_until=payload.valid_until,
        max_users=payload.max_users,
        current_users=payload.current_users or 0,
        is_deleted=False,
        created_by=x_user_name,
        modified_by=x_user_name
    )
    db.add(lic)
    db.commit()
    db.refresh(lic)

    write_audit_record(
        db=db,
        user=x_user_name,
        action="CREATE_LICENSE",
        details_dict={
            "id": lic.id,
            "company_name": lic.company_name,
            "license_key": lic.license_key,
            "plan_type": lic.plan_type,
            "max_users": lic.max_users
        }
    )

    lic.status = compute_status(lic)
    return lic

@router.put("/licenses/{id}", response_model=LicenseResponse)
def update_license(
    id: int,
    payload: LicenseUpdate,
    db: Session = Depends(get_db),
    x_user_name: str = Header(default="Unknown User")
):
    lic = db.query(License).filter(License.id == id, License.is_deleted == False).first()
    if not lic:
        raise HTTPException(status_code=404, detail="License not found")

    if payload.license_key and payload.license_key != lic.license_key:
        if db.query(License).filter(License.license_key == payload.license_key, License.is_deleted == False, License.id != id).first():
            raise HTTPException(status_code=400, detail="A license with this key already exists.")

    # Validate current_users against max_users (using whichever value applies post-update)
    new_max = payload.max_users if payload.max_users is not None else lic.max_users
    new_current = payload.current_users if payload.current_users is not None else lic.current_users
    if new_current > new_max:
        raise HTTPException(status_code=400, detail="Current users cannot exceed Max users.")

    changes = {}
    for field, value in payload.model_dump(exclude_unset=True).items():
        old_val = getattr(lic, field)
        if old_val != value:
            setattr(lic, field, value)
            changes[field] = {"old": old_val, "new": value}

    if changes:
        lic.updated_at = datetime.utcnow()
        lic.modified_by = x_user_name
        db.commit()
        db.refresh(lic)

        write_audit_record(
            db=db,
            user=x_user_name,
            action="UPDATE_LICENSE",
            details_dict={
                "id": lic.id,
                "company_name": lic.company_name,
                "changes": changes
            }
        )

    lic.status = compute_status(lic)
    return lic

@router.delete("/licenses/{id}")
def delete_license(
    id: int,
    db: Session = Depends(get_db),
    x_user_name: str = Header(default="Unknown User")
):
    lic = db.query(License).filter(License.id == id, License.is_deleted == False).first()
    if not lic:
        raise HTTPException(status_code=404, detail="License not found")

    lic.is_deleted = True
    lic.updated_at = datetime.utcnow()
    lic.modified_by = x_user_name
    db.commit()

    write_audit_record(
        db=db,
        user=x_user_name,
        action="DELETE_LICENSE",
        details_dict={
            "id": lic.id,
            "company_name": lic.company_name,
            "license_key": lic.license_key
        }
    )

    return {"detail": "License deleted successfully"}