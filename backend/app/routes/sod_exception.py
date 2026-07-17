import csv
import io
import json
from datetime import datetime, timedelta
from typing import List, Optional
import openpyxl

from fastapi import APIRouter, HTTPException, Depends, Header, UploadFile, File
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import or_, and_
from pydantic import BaseModel

from app.database import get_db
from app.utils.permissions import require_permission
from app.models.sod_exception import SodException, SodExceptionApproval, SodExceptionComment, SodExceptionAttachment, SodExceptionAudit
from app.models.sod_violation import SodViolation
from app.models.sod_policy import SodPolicy
from app.schemas.sod_exception import (
    SodExceptionCreate,
    SodExceptionUpdate,
    SodExceptionResponse,
    SodExceptionCommentCreate,
    SodExceptionCommentResponse,
    SodExceptionAttachmentResponse,
    SodExceptionApprovalResponse,
    SodExceptionListResponse
)

router = APIRouter()

def write_exception_audit(db: Session, exception_id: str, action: str, performed_by: str, old_val: dict = None, new_val: dict = None):
    """Writes audit logs for exception actions."""
    old_str = json.dumps(old_val) if old_val else None
    new_str = json.dumps(new_val) if new_val else None
    
    # 1. Sod exception audit
    audit = SodExceptionAudit(
        exception_id=exception_id,
        action=action,
        performed_by=performed_by,
        old_value=old_str,
        new_value=new_str,
        timestamp=datetime.utcnow()
    )
    db.add(audit)
    db.commit()

def get_next_exception_number(db: Session) -> str:
    """Generates sequential number like EXC-001, EXC-002, etc."""
    count = db.query(SodException).count()
    return f"EXC-{str(count + 1).zfill(3)}"

@router.get("/governance/exceptions/dashboard", response_model=dict)
def get_exceptions_dashboard(db: Session = Depends(get_db)):
    """Summary KPI metrics for exceptions view."""
    total = db.query(SodException).count()
    pending = db.query(SodException).filter(SodException.status == "PENDING").count()
    approved = db.query(SodException).filter(SodException.status == "APPROVED").count()
    active = db.query(SodException).filter(SodException.status == "ACTIVE").count()
    expired = db.query(SodException).filter(SodException.status == "EXPIRED").count()
    rejected = db.query(SodException).filter(SodException.status == "REJECTED").count()
    revoked = db.query(SodException).filter(SodException.status == "REVOKED").count()
    
    # Simple distributions for charts
    status_dist = {"PENDING": pending, "ACTIVE": active, "EXPIRED": expired, "REJECTED": rejected, "REVOKED": revoked}
    
    dept_dist = {}
    for r in db.query(SodException.department).all():
        d = r[0] or "Unknown"
        dept_dist[d] = dept_dist.get(d, 0) + 1
        
    app_dist = {}
    for r in db.query(SodException.application_name).all():
        app_dist[r[0]] = app_dist.get(r[0], 0) + 1
        
    type_dist = {
        "TEMPORARY": db.query(SodException).filter(SodException.exception_type == "TEMPORARY").count(),
        "PERMANENT": db.query(SodException).filter(SodException.exception_type == "PERMANENT").count()
    }
    
    return {
        "kpis": {
            "total": total,
            "pending": pending,
            "approved": approved + active,
            "active": active,
            "expired": expired,
            "rejected": rejected,
            "revoked": revoked
        },
        "charts": {
            "status": status_dist,
            "department": dept_dist,
            "application": app_dist,
            "type": type_dist
        }
    }

@router.post("/governance/exceptions", response_model=SodExceptionResponse, dependencies=[Depends(require_permission("SoD Policies", "create"))])
def create_exception_request(
    payload: SodExceptionCreate,
    x_user_name: str = Header(default="System"),
    db: Session = Depends(get_db)
):
    # Form Validations
    if not payload.business_justification.strip():
        raise HTTPException(status_code=400, detail="Business justification is required.")
        
    if payload.exception_type == "TEMPORARY":
        if not payload.expiry_date:
            raise HTTPException(status_code=400, detail="Temporary exceptions must specify an expiry date.")
        if payload.expiry_date < datetime.utcnow():
            raise HTTPException(status_code=400, detail="Expiry date cannot be in the past.")
            
    # Check active duplicate exceptions for the same policy & user
    duplicate = db.query(SodException).filter(
        SodException.policy_id == payload.policy_id,
        SodException.user_id == payload.user_id,
        SodException.status.in_(["ACTIVE", "APPROVED", "PENDING", "UNDER_REVIEW"])
    ).first()
    
    if duplicate:
        raise HTTPException(
            status_code=400,
            detail=f"An active or pending exception request already exists for this user and policy ({duplicate.exception_number})."
        )
        
    # AI Score Calculation
    policy = db.query(SodPolicy).filter(SodPolicy.id == payload.policy_id).first()
    risk_level = policy.risk_level.upper() if policy else "LOW"
    
    if risk_level == "CRITICAL":
        ai_score = 92
        ai_rec = "Caution: Critical threat level. Approve only with verified compensating controls."
    elif risk_level == "HIGH":
        ai_score = 74
        ai_rec = "Recommendation: Review compensating controls before signing off."
    elif risk_level == "MEDIUM":
        ai_score = 48
        ai_rec = "Recommendation: Standard business justification is acceptable."
    else:
        ai_score = 20
        ai_rec = "Recommendation: Auto-approved low risk exception."
        
    num = get_next_exception_number(db)
    
    # Create exception request
    exception = SodException(
        exception_number=num,
        violation_id=payload.violation_id,
        policy_id=payload.policy_id,
        user_id=payload.user_id,
        employee_id=payload.employee_id,
        username=payload.username,
        department=payload.department,
        application_name=payload.application_name,
        exception_type=payload.exception_type,
        business_justification=payload.business_justification,
        compensating_controls=payload.compensating_controls,
        expiry_date=payload.expiry_date if payload.exception_type == "TEMPORARY" else None,
        risk_acceptance=payload.risk_acceptance,
        requested_by=x_user_name,
        status="PENDING",
        sla_due_date=datetime.utcnow() + timedelta(days=5),
        is_sla_overdue=False,
        ai_risk_score=ai_score,
        ai_recommendation=ai_rec,
        needs_recertification=True if payload.exception_type == "PERMANENT" else False,
        next_recertification_date=datetime.utcnow() + timedelta(days=180) if payload.exception_type == "PERMANENT" else None
    )
    db.add(exception)
    db.flush()
    
    # Initialize the first approval level step (Manager Review)
    appr = SodExceptionApproval(
        exception_id=exception.id,
        approver_name="Pending Assignment",
        approval_level="Manager Review",
        approval_status="PENDING"
    )
    db.add(appr)
    db.commit()
    db.refresh(exception)
    
    write_exception_audit(db, exception.id, "Request", x_user_name, new_val={"exception_number": num})
    return exception

@router.get("/governance/exceptions", response_model=SodExceptionListResponse)
def get_exceptions(
    search: Optional[str] = None,
    exception_type: Optional[str] = None,
    status: Optional[str] = None,
    department: Optional[str] = None,
    application: Optional[str] = None,
    requested_by: Optional[str] = None,
    page: int = 1,
    limit: int = 10,
    db: Session = Depends(get_db)
):
    query = db.query(SodException)
    
    # Search filter mapping
    if search:
        term = f"%{search}%"
        query = query.filter(
            or_(
                SodException.exception_number.like(term),
                SodException.username.like(term),
                SodException.employee_id.like(term),
                SodException.department.like(term),
                SodException.application_name.like(term),
                SodException.requested_by.like(term)
            )
        )
        
    # Filters
    if exception_type:
        query = query.filter(SodException.exception_type == exception_type)
    if status:
        query = query.filter(SodException.status == status)
    if department:
        query = query.filter(SodException.department == department)
    if application:
        query = query.filter(SodException.application_name == application)
    if requested_by:
        query = query.filter(SodException.requested_by == requested_by)
        
    total = query.count()
    exceptions = query.order_by(SodException.requested_date.desc()).offset((page - 1) * limit).limit(limit).all()
    
    return {
        "exceptions": exceptions,
        "total": total,
        "page": page,
        "limit": limit
    }

@router.get("/governance/exceptions/{id}", response_model=SodExceptionResponse)
def get_exception_detail(id: str, db: Session = Depends(get_db)):
    exc = db.query(SodException).filter(SodException.id == id).first()
    if not exc:
        raise HTTPException(status_code=404, detail="Exception request not found.")
    return exc

@router.delete("/governance/exceptions/{id}", dependencies=[Depends(require_permission("SoD Policies", "delete"))])
def delete_exception(id: str, x_user_name: str = Header(default="System"), db: Session = Depends(get_db)):
    exc = db.query(SodException).filter(SodException.id == id).first()
    if not exc:
        raise HTTPException(status_code=404, detail="Exception request not found.")
        
    db.delete(exc)
    db.commit()
    
    write_exception_audit(db, id, "Delete", x_user_name)
    return {"message": "Exception request deleted successfully."}

class ApprovalPayload(BaseModel):
    comments: Optional[str] = None

@router.post("/governance/exceptions/{id}/approve", response_model=SodExceptionResponse, dependencies=[Depends(require_permission("SoD Policies", "edit"))])
def approve_exception_level(
    id: str,
    payload: ApprovalPayload,
    x_user_name: str = Header(default="System"),
    db: Session = Depends(get_db)
):
    exc = db.query(SodException).filter(SodException.id == id).first()
    if not exc:
        raise HTTPException(status_code=404, detail="Exception request not found.")
        
    # Find current pending approval step
    current_step = db.query(SodExceptionApproval).filter(
        SodExceptionApproval.exception_id == id,
        SodExceptionApproval.approval_status == "PENDING"
    ).first()
    
    if not current_step:
        raise HTTPException(status_code=400, detail="No pending approvals found for this exception request.")
        
    # Approve step
    current_step.approval_status = "APPROVED"
    current_step.approver_name = x_user_name
    current_step.approved_date = datetime.utcnow()
    current_step.comments = payload.comments
    
    # 2. Advanced workflow level transitions
    next_level = None
    if current_step.approval_level == "Manager Review":
        next_level = "Governance Review"
        exc.status = "UNDER_REVIEW"
        exc.reviewed_by = x_user_name
        exc.review_date = datetime.utcnow()
    elif current_step.approval_level == "Governance Review":
        next_level = "Security Approval"
    elif current_step.approval_level == "Security Approval":
        # Final level approved!
        exc.status = "ACTIVE"
        exc.approved_by = x_user_name
        exc.approved_date = datetime.utcnow()
        
        # Link violation and update its status
        if exc.violation_id:
            violation = db.query(SodViolation).filter(SodViolation.id == exc.violation_id).first()
            if violation:
                old_stat = violation.status
                violation.status = "EXCEPTION_APPROVED"
                db.commit()
                # Log timeline
                from app.services.sod_violation_service import write_violation_audit
                write_violation_audit(
                    db, violation.id, "Exception Approved Status", x_user_name,
                    old_val={"status": old_stat}, new_val={"status": "EXCEPTION_APPROVED"}
                )
                
    if next_level:
        db.add(SodExceptionApproval(
            exception_id=id,
            approver_name="Pending Assignment",
            approval_level=next_level,
            approval_status="PENDING"
        ))
        
    db.commit()
    db.refresh(exc)
    
    write_exception_audit(
        db, id, f"Approval: {current_step.approval_level}", x_user_name,
        new_val={"level": current_step.approval_level, "status": exc.status}
    )
    return exc

@router.post("/governance/exceptions/{id}/reject", response_model=SodExceptionResponse, dependencies=[Depends(require_permission("SoD Policies", "edit"))])
def reject_exception(
    id: str,
    payload: ApprovalPayload,
    x_user_name: str = Header(default="System"),
    db: Session = Depends(get_db)
):
    exc = db.query(SodException).filter(SodException.id == id).first()
    if not exc:
        raise HTTPException(status_code=404, detail="Exception request not found.")
        
    current_step = db.query(SodExceptionApproval).filter(
        SodExceptionApproval.exception_id == id,
        SodExceptionApproval.approval_status == "PENDING"
    ).first()
    
    if current_step:
        current_step.approval_status = "REJECTED"
        current_step.approver_name = x_user_name
        current_step.approved_date = datetime.utcnow()
        current_step.comments = payload.comments
        
    exc.status = "REJECTED"
    db.commit()
    db.refresh(exc)
    
    write_exception_audit(db, id, "Rejection", x_user_name, new_val={"remarks": payload.comments})
    return exc

class ExtendPayload(BaseModel):
    new_expiry: datetime

@router.post("/governance/exceptions/{id}/extend", response_model=SodExceptionResponse, dependencies=[Depends(require_permission("SoD Policies", "edit"))])
def extend_exception(
    id: str,
    payload: ExtendPayload,
    x_user_name: str = Header(default="System"),
    db: Session = Depends(get_db)
):
    exc = db.query(SodException).filter(SodException.id == id).first()
    if not exc:
        raise HTTPException(status_code=404, detail="Exception request not found.")
        
    if payload.new_expiry <= datetime.utcnow():
        raise HTTPException(status_code=400, detail="Extension expiry date must be in the future.")
        
    old_exp = exc.expiry_date
    exc.expiry_date = payload.new_expiry
    db.commit()
    db.refresh(exc)
    
    write_exception_audit(
        db, id, "Extension", x_user_name,
        old_val={"expiry": old_exp.isoformat() if old_exp else None},
        new_val={"expiry": payload.new_expiry.isoformat()}
    )
    return exc

@router.post("/governance/exceptions/{id}/renew", response_model=SodExceptionResponse, dependencies=[Depends(require_permission("SoD Policies", "edit"))])
def renew_exception(
    id: str,
    x_user_name: str = Header(default="System"),
    db: Session = Depends(get_db)
):
    exc = db.query(SodException).filter(SodException.id == id).first()
    if not exc:
        raise HTTPException(status_code=404, detail="Exception request not found.")
        
    old_status = exc.status
    exc.status = "PENDING"
    exc.renewal_count += 1
    
    # Re-initialize approvals
    db.query(SodExceptionApproval).filter(SodExceptionApproval.exception_id == id).delete()
    db.add(SodExceptionApproval(
        exception_id=id,
        approver_name="Pending Assignment",
        approval_level="Manager Review",
        approval_status="PENDING"
    ))
    db.commit()
    db.refresh(exc)
    
    write_exception_audit(db, id, "Renewal", x_user_name, old_val={"status": old_status}, new_val={"status": "PENDING"})
    return exc

@router.post("/governance/exceptions/{id}/revoke", response_model=SodExceptionResponse, dependencies=[Depends(require_permission("SoD Policies", "edit"))])
def revoke_exception(
    id: str,
    x_user_name: str = Header(default="System"),
    db: Session = Depends(get_db)
):
    exc = db.query(SodException).filter(SodException.id == id).first()
    if not exc:
        raise HTTPException(status_code=404, detail="Exception request not found.")
        
    old_status = exc.status
    exc.status = "REVOKED"
    db.commit()
    
    # Reopen matching violation if present
    if exc.violation_id:
        violation = db.query(SodViolation).filter(SodViolation.id == exc.violation_id).first()
        if violation:
            old_stat = violation.status
            violation.status = "OPEN"
            db.commit()
            from app.services.sod_violation_service import write_violation_audit
            write_violation_audit(
                db, violation.id, "Exception Revoked Status", x_user_name,
                old_val={"status": old_stat}, new_val={"status": "OPEN"}
            )
            
    db.refresh(exc)
    write_exception_audit(db, id, "Revocation", x_user_name, old_val={"status": old_status}, new_val={"status": "REVOKED"})
    return exc

@router.post("/governance/exceptions/{id}/comments", response_model=SodExceptionCommentResponse)
def add_exception_comment(
    id: str,
    payload: SodExceptionCommentCreate,
    x_user_name: str = Header(default="System"),
    db: Session = Depends(get_db)
):
    exc = db.query(SodException).filter(SodException.id == id).first()
    if not exc:
        raise HTTPException(status_code=404, detail="Exception request not found.")
        
    c = SodExceptionComment(
        exception_id=id,
        comment=payload.comment,
        created_by=x_user_name,
        is_internal=payload.is_internal
    )
    db.add(c)
    db.commit()
    db.refresh(c)
    return c

@router.post("/governance/exceptions/{id}/attachments", response_model=SodExceptionAttachmentResponse)
def upload_exception_attachment(
    id: str,
    file: UploadFile = File(...),
    x_user_name: str = Header(default="System"),
    db: Session = Depends(get_db)
):
    exc = db.query(SodException).filter(SodException.id == id).first()
    if not exc:
        raise HTTPException(status_code=404, detail="Exception request not found.")
        
    filename = file.filename
    content = file.file.read()
    size = len(content)
    
    att = SodExceptionAttachment(
        exception_id=id,
        filename=filename,
        file_size=size,
        uploaded_by=x_user_name
    )
    db.add(att)
    db.commit()
    db.refresh(att)
    return att

# ── Bulk Actions ──
class BulkPayload(BaseModel):
    ids: List[str]
    comments: Optional[str] = None

@router.post("/governance/exceptions/bulk-approve", dependencies=[Depends(require_permission("SoD Policies", "edit"))])
def bulk_approve_exceptions(payload: BulkPayload, x_user_name: str = Header(default="System"), db: Session = Depends(get_db)):
    exceptions = db.query(SodException).filter(SodException.id.in_(payload.ids)).all()
    count = len(exceptions)
    for exc in exceptions:
        current_step = db.query(SodExceptionApproval).filter(
            SodExceptionApproval.exception_id == exc.id,
            SodExceptionApproval.approval_status == "PENDING"
        ).first()
        if current_step:
            current_step.approval_status = "APPROVED"
            current_step.approver_name = x_user_name
            current_step.approved_date = datetime.utcnow()
            current_step.comments = payload.comments
        
        # In bulk, we auto-transition fully to ACTIVE approved state
        exc.status = "ACTIVE"
        exc.approved_by = x_user_name
        exc.approved_date = datetime.utcnow()
        
        if exc.violation_id:
            v = db.query(SodViolation).filter(SodViolation.id == exc.violation_id).first()
            if v:
                v.status = "EXCEPTION_APPROVED"
                
        write_exception_audit(db, exc.id, "Approval (Bulk)", x_user_name, new_val={"status": "ACTIVE"})
    db.commit()
    return {"message": f"Successfully approved {count} exceptions."}

@router.post("/governance/exceptions/bulk-reject", dependencies=[Depends(require_permission("SoD Policies", "edit"))])
def bulk_reject_exceptions(payload: BulkPayload, x_user_name: str = Header(default="System"), db: Session = Depends(get_db)):
    exceptions = db.query(SodException).filter(SodException.id.in_(payload.ids)).all()
    count = len(exceptions)
    for exc in exceptions:
        current_step = db.query(SodExceptionApproval).filter(
            SodExceptionApproval.exception_id == exc.id,
            SodExceptionApproval.approval_status == "PENDING"
        ).first()
        if current_step:
            current_step.approval_status = "REJECTED"
            current_step.approver_name = x_user_name
            current_step.approved_date = datetime.utcnow()
            current_step.comments = payload.comments
        
        exc.status = "REJECTED"
        write_exception_audit(db, exc.id, "Rejection (Bulk)", x_user_name, new_val={"status": "REJECTED"})
    db.commit()
    return {"message": f"Successfully rejected {count} exceptions."}

@router.post("/governance/exceptions/bulk-revoke", dependencies=[Depends(require_permission("SoD Policies", "edit"))])
def bulk_revoke_exceptions(payload: BulkPayload, x_user_name: str = Header(default="System"), db: Session = Depends(get_db)):
    exceptions = db.query(SodException).filter(SodException.id.in_(payload.ids)).all()
    count = len(exceptions)
    for exc in exceptions:
        exc.status = "REVOKED"
        if exc.violation_id:
            v = db.query(SodViolation).filter(SodViolation.id == exc.violation_id).first()
            if v:
                v.status = "OPEN"
        write_exception_audit(db, exc.id, "Revocation (Bulk)", x_user_name, new_val={"status": "REVOKED"})
    db.commit()
    return {"message": f"Successfully revoked {count} exceptions."}

# ── CSV & Excel Exports ──
@router.get("/governance/exceptions/export/csv")
def export_exceptions_csv(db: Session = Depends(get_db)):
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "Exception Number", "User", "Employee ID", "Department", 
        "Policy Code", "Matched Violation ID", "Connected App", "Type", "Status", "Expiry Date", "Requested By"
    ])
    
    exceptions = db.query(SodException).all()
    for exc in exceptions:
        writer.writerow([
            exc.exception_number,
            exc.username,
            exc.employee_id,
            exc.department or "",
            exc.policy.policy_code if exc.policy else "",
            exc.violation_id or "",
            exc.application_name,
            exc.exception_type,
            exc.status,
            exc.expiry_date.strftime("%Y-%m-%d %H:%M:%S") if exc.expiry_date else "PERMANENT",
            exc.requested_by
        ])
        
    output.seek(0)
    return StreamingResponse(
        io.BytesIO(output.getvalue().encode("utf-8")),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=sod_exceptions_export.csv"}
    )

@router.get("/governance/exceptions/export/excel")
def export_exceptions_excel(db: Session = Depends(get_db)):
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "SoD Exceptions"
    
    ws.append([
        "Exception Number", "User", "Employee ID", "Department", 
        "Policy Code", "Matched Violation ID", "Connected App", "Type", "Status", "Expiry Date", "Requested By", "Compensating Controls"
    ])
    
    exceptions = db.query(SodException).all()
    for exc in exceptions:
        ws.append([
            exc.exception_number,
            exc.username,
            exc.employee_id,
            exc.department or "",
            exc.policy.policy_code if exc.policy else "",
            exc.violation_id or "",
            exc.application_name,
            exc.exception_type,
            exc.status,
            exc.expiry_date.strftime("%Y-%m-%d %H:%M:%S") if exc.expiry_date else "PERMANENT",
            exc.requested_by,
            exc.compensating_controls or ""
        ])
        
    out = io.BytesIO()
    wb.save(out)
    out.seek(0)
    return StreamingResponse(
        out,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=sod_exceptions_export.xlsx"}
    )
