from fastapi import APIRouter, Depends, HTTPException, Header, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from typing import Optional, List
import io
import csv
import openpyxl
from openpyxl import Workbook
from datetime import datetime

from app.database import get_db
from app.utils.permissions import require_permission
from app.services.candidate_role_service import CandidateRoleService
from app.services.classification_service import ClassificationService
from pydantic import BaseModel

router = APIRouter()


class ClassificationUpdate(BaseModel):
    classification: str


class BulkClassificationUpdate(BaseModel):
    role_ids: List[int]
    classification: str


class MergePreviewRequest(BaseModel):
    role_ids: List[int]


class MergeExecuteRequest(BaseModel):
    role_ids: List[int]
    destination_name: str
    description: Optional[str] = None
    merge_reason: str


class SplitPreviewRequest(BaseModel):
    split_method: str


class SplitDestinationRolePayload(BaseModel):
    role_name: str
    role_description: Optional[str] = None
    entitlements: List[dict]
    members: List[dict]


class SplitExecuteRequest(BaseModel):
    split_method: str
    splits: List[SplitDestinationRolePayload]
    split_reason: str


class LogActionPayload(BaseModel):
    action: str
    details: Optional[str] = None


class CandidateRoleCreate(BaseModel):
    role_name: str
    role_description: Optional[str] = None
    role_type: Optional[str] = "Business"
    risk_level: Optional[str] = "Low"
    classification: Optional[str] = None
    status: Optional[str] = "Draft"
    department: Optional[str] = None
    business_unit: Optional[str] = None


class CandidateRoleUpdate(BaseModel):
    role_name: Optional[str] = None
    role_description: Optional[str] = None
    role_type: Optional[str] = None
    risk_level: Optional[str] = None
    status: Optional[str] = None
    department: Optional[str] = None
    business_unit: Optional[str] = None


@router.get("/candidate-roles")
def get_candidate_roles(
    page: int = 1,
    limit: int = 10,
    search: Optional[str] = None,
    sort_by: Optional[str] = None,
    sort_order: Optional[str] = "desc",
    classification: Optional[str] = None,
    status: Optional[str] = None,
    risk_level: Optional[str] = None,
    department: Optional[str] = None,
    business_unit: Optional[str] = None,
    role_type: Optional[str] = None,
    db: Session = Depends(get_db),
    _perm: bool = Depends(require_permission("Role Engineering", "view"))
):
    return CandidateRoleService.get_candidate_roles(
        db=db,
        page=page,
        limit=limit,
        search=search,
        sort_by=sort_by,
        sort_order=sort_order,
        classification=classification,
        status=status,
        risk_level=risk_level,
        department=department,
        business_unit=business_unit,
        role_type=role_type
    )


@router.post("/candidate-roles/merge/preview")
def preview_merge(
    payload: MergePreviewRequest,
    db: Session = Depends(get_db),
    _perm: bool = Depends(require_permission("Role Engineering", "view"))
):
    from app.services.merge_role_service import MergeRoleService
    try:
        return MergeRoleService.preview_merge(db, payload.role_ids)
    except HTTPException as he:
        raise he
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/candidate-roles/merge")
def execute_merge(
    payload: MergeExecuteRequest,
    db: Session = Depends(get_db),
    x_user_name: str = Header(default="System"),
    _perm: bool = Depends(require_permission("Role Engineering", "edit"))
):
    from app.services.merge_role_service import MergeRoleService
    try:
        return MergeRoleService.execute_merge(
            db=db,
            role_ids=payload.role_ids,
            destination_name=payload.destination_name,
            description=payload.description,
            merge_reason=payload.merge_reason,
            user=x_user_name
        )
    except HTTPException as he:
        raise he
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/candidate-roles/merge/{history_id}/undo")
def undo_merge(
    history_id: int,
    db: Session = Depends(get_db),
    x_user_name: str = Header(default="System"),
    _perm: bool = Depends(require_permission("Role Engineering", "edit"))
):
    from app.services.merge_role_service import MergeRoleService
    try:
        return MergeRoleService.undo_merge(db, history_id, x_user_name)
    except HTTPException as he:
        raise he
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/candidate-roles/merge-history")
def get_merge_history(
    db: Session = Depends(get_db),
    _perm: bool = Depends(require_permission("Role Engineering", "view"))
):
    from app.models.role_merge_history import RoleMergeHistory
    from app.models.role_merge_source_roles import RoleMergeSourceRole
    from app.models.candidate_role import CandidateRole

    try:
        histories = db.query(RoleMergeHistory).order_by(RoleMergeHistory.created_at.desc()).all()
        results = []
        for h in histories:
            parent = db.query(CandidateRole).filter(CandidateRole.id == h.parent_role_id).first()
            sources = db.query(RoleMergeSourceRole).filter(RoleMergeSourceRole.merge_history_id == h.id).all()
            results.append({
                "id": h.id,
                "parent_role_id": h.parent_role_id,
                "parent_role_name": parent.role_name if parent else "Deleted Role",
                "parent_is_deleted": parent.is_deleted if parent else True,
                "merged_by": h.merged_by,
                "merge_reason": h.merge_reason,
                "created_at": h.created_at.isoformat() if h.created_at else None,
                "source_roles": [{"id": s.source_role_id, "role_name": s.source_role_name} for s in sources]
            })
        return results
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/candidate-roles/{role_id}/split/preview")
def preview_split(
    role_id: int,
    payload: SplitPreviewRequest,
    db: Session = Depends(get_db),
    _perm: bool = Depends(require_permission("Role Engineering", "view"))
):
    from app.services.split_role_service import SplitRoleService
    try:
        return SplitRoleService.preview_split(db, role_id, payload.split_method)
    except HTTPException as he:
        raise he
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/candidate-roles/{role_id}/split")
def execute_split(
    role_id: int,
    payload: SplitExecuteRequest,
    db: Session = Depends(get_db),
    x_user_name: str = Header(default="System"),
    _perm: bool = Depends(require_permission("Role Engineering", "edit"))
):
    from app.services.split_role_service import SplitRoleService
    try:
        splits_dicts = []
        for s in payload.splits:
            splits_dicts.append({
                "role_name": s.role_name,
                "role_description": s.role_description,
                "entitlements": s.entitlements,
                "members": s.members
            })
        return SplitRoleService.execute_split(
            db=db,
            role_id=role_id,
            split_method=payload.split_method,
            splits_payload=splits_dicts,
            split_reason=payload.split_reason,
            user=x_user_name
        )
    except HTTPException as he:
        raise he
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/candidate-roles/split/{history_id}/undo")
def undo_split(
    history_id: int,
    db: Session = Depends(get_db),
    x_user_name: str = Header(default="System"),
    _perm: bool = Depends(require_permission("Role Engineering", "edit"))
):
    from app.services.split_role_service import SplitRoleService
    try:
        return SplitRoleService.undo_split(db, history_id, x_user_name)
    except HTTPException as he:
        raise he
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/candidate-roles/split-history")
def get_split_history(
    db: Session = Depends(get_db),
    _perm: bool = Depends(require_permission("Role Engineering", "view"))
):
    from app.models.role_split_history import RoleSplitHistory
    from app.models.role_split_destination_roles import RoleSplitDestinationRole
    from app.models.candidate_role import CandidateRole

    try:
        histories = db.query(RoleSplitHistory).order_by(RoleSplitHistory.created_at.desc()).all()
        results = []
        for h in histories:
            original = db.query(CandidateRole).filter(CandidateRole.id == h.original_role_id).first()
            dests = db.query(RoleSplitDestinationRole).filter(RoleSplitDestinationRole.split_history_id == h.id).all()
            dest_roles = []
            for d in dests:
                r = db.query(CandidateRole).filter(CandidateRole.id == d.destination_role_id).first()
                if r:
                    dest_roles.append({"id": r.id, "role_name": r.role_name, "is_deleted": r.is_deleted})
            results.append({
                "id": h.id,
                "original_role_id": h.original_role_id,
                "original_role_name": original.role_name if original else "Deleted Role",
                "split_by": h.split_by,
                "split_reason": h.split_reason,
                "created_at": h.created_at.isoformat() if h.created_at else None,
                "destination_roles": dest_roles
            })
        return results
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/candidate-roles/log-action")
def log_action(
    payload: LogActionPayload,
    db: Session = Depends(get_db),
    x_user_name: str = Header(default="System"),
    _perm: bool = Depends(require_permission("Role Engineering", "edit"))
):
    from app.models.audit_log import AuditLog
    try:
        db.add(AuditLog(
            module="Role Engineering",
            action=payload.action,
            performed_by=x_user_name,
            old_value=None,
            new_value=payload.details
        ))
        db.commit()
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/candidate-roles/{role_id}")
def get_candidate_role_by_id(
    role_id: int,
    db: Session = Depends(get_db),
    _perm: bool = Depends(require_permission("Role Engineering", "view"))
):
    detail = CandidateRoleService.get_candidate_role_by_id(db, role_id)
    if not detail:
        raise HTTPException(status_code=404, detail="Candidate role not found")
    return detail


@router.post("/candidate-roles", status_code=201)
def create_candidate_role(
    payload: CandidateRoleCreate,
    db: Session = Depends(get_db),
    x_user_name: str = Header(default="System"),
    _perm: bool = Depends(require_permission("Role Engineering", "create"))
):
    try:
        role = CandidateRoleService.create_candidate_role(db, payload.dict(), x_user_name)
        return {
            "id": role.id,
            "role_name": role.role_name,
            "role_description": role.role_description,
            "role_type": role.role_type,
            "risk_level": role.risk_level,
            "classification": role.classification,
            "status": role.status,
            "department": role.department,
            "business_unit": role.business_unit
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.put("/candidate-roles/{role_id}")
def update_candidate_role(
    role_id: int,
    payload: CandidateRoleUpdate,
    db: Session = Depends(get_db),
    x_user_name: str = Header(default="System"),
    _perm: bool = Depends(require_permission("Role Engineering", "edit"))
):
    updated = CandidateRoleService.update_candidate_role(db, role_id, payload.dict(exclude_unset=True), x_user_name)
    if not updated:
        raise HTTPException(status_code=404, detail="Candidate role not found")
    return {
        "id": updated.id,
        "role_name": updated.role_name,
        "role_description": updated.role_description,
        "role_type": updated.role_type,
        "risk_level": updated.risk_level,
        "classification": updated.classification,
        "status": updated.status,
        "department": updated.department,
        "business_unit": updated.business_unit
    }


@router.delete("/candidate-roles/{role_id}")
def delete_candidate_role(
    role_id: int,
    db: Session = Depends(get_db),
    x_user_name: str = Header(default="System"),
    _perm: bool = Depends(require_permission("Role Engineering", "delete"))
):
    success = CandidateRoleService.delete_candidate_role(db, role_id, x_user_name)
    if not success:
        raise HTTPException(status_code=404, detail="Candidate role not found")
    return {"message": "Candidate role deleted successfully"}


@router.get("/classifications")
def get_classifications(
    _perm: bool = Depends(require_permission("Role Engineering", "view"))
):
    return ["Birthright", "Application", "Privileged"]


@router.put("/candidate-roles/{role_id}/classification")
def update_role_classification(
    role_id: int,
    payload: ClassificationUpdate,
    db: Session = Depends(get_db),
    x_user_name: str = Header(default="System"),
    _perm: bool = Depends(require_permission("Role Engineering", "edit"))
):
    try:
        return ClassificationService.update_role_classification(db, role_id, payload.classification, x_user_name)
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/candidate-roles/bulk-classification")
def bulk_classify_roles(
    payload: BulkClassificationUpdate,
    db: Session = Depends(get_db),
    x_user_name: str = Header(default="System"),
    _perm: bool = Depends(require_permission("Role Engineering", "edit"))
):
    try:
        count = ClassificationService.bulk_classify_roles(db, payload.role_ids, payload.classification, x_user_name)
        return {"message": f"Successfully updated {count} roles to {payload.classification}"}
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/candidate-roles/export/csv")
def export_candidate_roles_csv(
    search: Optional[str] = None,
    classification: Optional[str] = None,
    status: Optional[str] = None,
    risk_level: Optional[str] = None,
    department: Optional[str] = None,
    business_unit: Optional[str] = None,
    role_type: Optional[str] = None,
    db: Session = Depends(get_db),
    _perm: bool = Depends(require_permission("Role Engineering", "export"))
):
    # Fetch roles matching filter without page/limit (retrieve first 10000 roles)
    res = CandidateRoleService.get_candidate_roles(
        db=db, page=1, limit=10000, search=search,
        classification=classification, status=status, risk_level=risk_level,
        department=department, business_unit=business_unit, role_type=role_type
    )
    roles = res["roles"]

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "Role Name", "Description", "Classification", "Role Type", "Risk Level",
        "Status", "Confidence Score", "Users", "Applications", "Entitlements",
        "Department", "Business Unit", "Source", "Generated By", "Generated On"
    ])

    for r in roles:
        writer.writerow([
            r.role_name, r.role_description, r.classification or "", r.role_type, r.risk_level,
            r.status, r.confidence_score, r.user_count, r.application_count, r.entitlement_count,
            r.department or "", r.business_unit or "", r.source, r.generated_by,
            r.generated_on.strftime("%Y-%m-%d %H:%M:%S") if r.generated_on else ""
        ])

    output.seek(0)
    
    # Audit export action
    try:
        from app.models.audit_log import AuditLog
        from app.models.dashboard import RecentActivity
        audit = AuditLog(
            module="Role Engineering",
            action="Export Generated (CSV)",
            performed_by="System",
            timestamp=datetime.utcnow()
        )
        db.add(audit)
        db.commit()
    except Exception:
        pass

    return StreamingResponse(
        io.BytesIO(output.getvalue().encode("utf-8")),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=candidate_roles_export.csv"}
    )


@router.get("/candidate-roles/export/excel")
def export_candidate_roles_excel(
    search: Optional[str] = None,
    classification: Optional[str] = None,
    status: Optional[str] = None,
    risk_level: Optional[str] = None,
    department: Optional[str] = None,
    business_unit: Optional[str] = None,
    role_type: Optional[str] = None,
    db: Session = Depends(get_db),
    _perm: bool = Depends(require_permission("Role Engineering", "export"))
):
    res = CandidateRoleService.get_candidate_roles(
        db=db, page=1, limit=10000, search=search,
        classification=classification, status=status, risk_level=risk_level,
        department=department, business_unit=business_unit, role_type=role_type
    )
    roles = res["roles"]

    wb = Workbook()
    ws = wb.active
    ws.title = "Candidate Roles"

    headers = [
        "Role Name", "Description", "Classification", "Role Type", "Risk Level",
        "Status", "Confidence Score", "Users", "Applications", "Entitlements",
        "Department", "Business Unit", "Source", "Generated By", "Generated On"
    ]
    ws.append(headers)

    for r in roles:
        ws.append([
            r.role_name, r.role_description, r.classification or "", r.role_type, r.risk_level,
            r.status, r.confidence_score, r.user_count, r.application_count, r.entitlement_count,
            r.department or "", r.business_unit or "", r.source, r.generated_by,
            r.generated_on.strftime("%Y-%m-%d %H:%M:%S") if r.generated_on else ""
        ])

    file_stream = io.BytesIO()
    wb.save(file_stream)
    file_stream.seek(0)

    # Audit export action
    try:
        from app.models.audit_log import AuditLog
        audit = AuditLog(
            module="Role Engineering",
            action="Export Generated (Excel)",
            performed_by="System",
            timestamp=datetime.utcnow()
        )
        db.add(audit)
        db.commit()
    except Exception:
        pass

    return StreamingResponse(
        file_stream,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=candidate_roles_export.xlsx"}
    )



