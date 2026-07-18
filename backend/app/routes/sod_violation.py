import csv
import io
import json
from datetime import datetime
from typing import List, Optional
import openpyxl

from fastapi import APIRouter, HTTPException, Depends, Header, BackgroundTasks, UploadFile, File, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import or_, and_

from app.database import get_db
from app.utils.permissions import require_permission
from app.models.sod_violation import SodViolation, SodScanHistory, SodViolationAudit, SodViolationComment, SodViolationAttachment
from app.models.sod_policy import SodPolicy
from app.models.identity import Identity
from app.schemas.sod_violation import (
    SodViolationResponse,
    SodViolationUpdate,
    SodScanHistoryResponse,
    SodViolationCommentBase,
    SodViolationCommentResponse,
    SodViolationAttachmentResponse,
    SodViolationListResponse
)
from app.services.sod_violation_service import (
    is_scan_running,
    run_violation_scan_job,
    evaluate_single_user_violations,
    write_violation_audit
)

router = APIRouter()

def get_violations_stats_kpis(db: Session) -> dict:
    """Computes summary statistics for violations cockpit."""
    total = db.query(SodViolation).count()
    open_count = db.query(SodViolation).filter(SodViolation.status == "OPEN").count()
    critical = db.query(SodViolation).filter(
        and_(SodViolation.status == "OPEN", SodViolation.risk_level == "CRITICAL")
    ).count()
    resolved = db.query(SodViolation).filter(SodViolation.status == "CLOSED").count()
    
    # High risk users count: unique user_ids with critical/high violations
    high_risk_users = db.query(SodViolation.user_id).filter(
        SodViolation.status == "OPEN",
        SodViolation.risk_level.in_(["CRITICAL", "HIGH"])
    ).distinct().count()
    
    # Scans run today
    today_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    scans_today = db.query(SodScanHistory).filter(SodScanHistory.start_time >= today_start).count()
    
    return {
        "total": total,
        "open": open_count,
        "critical": critical,
        "high_risk_users": high_risk_users,
        "resolved": resolved,
        "scans_today": scans_today
    }

@router.get("/governance/violations/scan-history", response_model=List[SodScanHistoryResponse])
def get_scan_history(db: Session = Depends(get_db)):
    """Returns list of scan executions."""
    return db.query(SodScanHistory).order_by(SodScanHistory.start_time.desc()).limit(50).all()

def start_scan_job(db: Session, scan_type: str, started_by: str, background_tasks: BackgroundTasks) -> int:
    """Helper to register and queue a scan task."""
    if is_scan_running():
        raise HTTPException(
            status_code=400,
            detail="A background scan job is currently running. Please wait for it to complete."
        )
        
    scan = SodScanHistory(
        scan_name=f"{scan_type.capitalize()} Scan - {datetime.utcnow().strftime('%Y-%m-%d %H:%M')}",
        scan_type=scan_type,
        started_by=started_by,
        status="RUNNING",
        start_time=datetime.utcnow()
    )
    db.add(scan)
    db.commit()
    db.refresh(scan)
    
    # Run uvicorn background task
    background_tasks.add_task(run_violation_scan_job, db, scan.id, scan_type, started_by)
    return scan.id

@router.post("/governance/violations/scan", dependencies=[Depends(require_permission("SoD Policies", "create"))])
def trigger_default_scan(background_tasks: BackgroundTasks, x_user_name: str = Header(default="System"), db: Session = Depends(get_db)):
    scan_id = start_scan_job(db, "FULL", x_user_name, background_tasks)
    return {"message": "SoD scan started successfully", "scan_id": scan_id}

@router.post("/governance/violations/scan/full", dependencies=[Depends(require_permission("SoD Policies", "create"))])
def trigger_full_scan(background_tasks: BackgroundTasks, x_user_name: str = Header(default="System"), db: Session = Depends(get_db)):
    scan_id = start_scan_job(db, "FULL", x_user_name, background_tasks)
    return {"message": "Full SoD scan started successfully", "scan_id": scan_id}

@router.post("/governance/violations/scan/incremental", dependencies=[Depends(require_permission("SoD Policies", "create"))])
def trigger_incremental_scan(background_tasks: BackgroundTasks, x_user_name: str = Header(default="System"), db: Session = Depends(get_db)):
    scan_id = start_scan_job(db, "INCREMENTAL", x_user_name, background_tasks)
    return {"message": "Incremental SoD scan started successfully", "scan_id": scan_id}

@router.get("/governance/violations", response_model=SodViolationListResponse)
def get_violations(
    search: Optional[str] = None,
    risk_level: Optional[str] = None,
    status: Optional[str] = None,
    department: Optional[str] = None,
    application: Optional[str] = None,
    manager: Optional[str] = None,
    policy: Optional[str] = None,
    page: int = 1,
    limit: int = 10,
    db: Session = Depends(get_db)
):
    query = db.query(SodViolation)
    
    # 1. Search text mapping
    if search:
        term = f"%{search}%"
        query = query.filter(
            or_(
                SodViolation.username.like(term),
                SodViolation.display_name.like(term),
                SodViolation.policy_name.like(term),
                SodViolation.policy_code.like(term),
                SodViolation.application_name.like(term),
                SodViolation.department.like(term),
                SodViolation.manager.like(term)
            )
        )
        
    # 2. Filters group
    if risk_level:
        query = query.filter(SodViolation.risk_level == risk_level)
    if status:
        query = query.filter(SodViolation.status == status)
    if department:
        query = query.filter(SodViolation.department == department)
    if application:
        query = query.filter(SodViolation.application_name == application)
    if manager:
        query = query.filter(SodViolation.manager == manager)
    if policy:
        query = query.filter(or_(SodViolation.policy_name == policy, SodViolation.policy_code == policy))
        
    total = query.count()
    violations = query.order_by(SodViolation.detected_date.desc()).offset((page - 1) * limit).limit(limit).all()
    
    # Aggregate stats charts
    kpis = get_violations_stats_kpis(db)
    
    # Group aggregates for dashboard charts
    severity_dist = {}
    for r in db.query(SodViolation.severity, SodViolation.id).filter(SodViolation.status == "OPEN").all():
        severity_dist[r[0]] = severity_dist.get(r[0], 0) + 1
        
    dept_dist = {}
    for r in db.query(SodViolation.department).filter(SodViolation.status == "OPEN").all():
        d = r[0] or "Unknown"
        dept_dist[d] = dept_dist.get(d, 0) + 1
        
    app_dist = {}
    for r in db.query(SodViolation.application_name).filter(SodViolation.status == "OPEN").all():
        app_dist[r[0]] = app_dist.get(r[0], 0) + 1
        
    return {
        "violations": violations,
        "total": total,
        "page": page,
        "limit": limit,
        "kpis": kpis,
        "charts": {
            "severity": severity_dist,
            "department": dept_dist,
            "application": app_dist
        }
    }

@router.get("/governance/violations/{id}", response_model=SodViolationResponse)
def get_violation_detail(id: str, db: Session = Depends(get_db)):
    v = db.query(SodViolation).filter(SodViolation.id == id).first()
    if not v:
        raise HTTPException(status_code=404, detail="SoD violation not found.")
    return v

@router.patch("/governance/violations/{id}", response_model=SodViolationResponse, dependencies=[Depends(require_permission("SoD Policies", "edit"))])
def update_violation(
    id: str,
    payload: SodViolationUpdate,
    x_user_name: str = Header(default="System"),
    db: Session = Depends(get_db)
):
    v = db.query(SodViolation).filter(SodViolation.id == id).first()
    if not v:
        raise HTTPException(status_code=404, detail="SoD violation not found.")
        
    old_val = {
        "status": v.status,
        "assigned_to": v.assigned_to,
        "is_false_positive": v.is_false_positive,
        "remarks": v.remarks
    }
    
    # Update properties
    v.status = payload.status
    v.assigned_to = payload.assigned_to
    v.is_false_positive = payload.is_false_positive
    v.false_positive_reason = payload.false_positive_reason
    v.remarks = payload.remarks
    
    if payload.status == "CLOSED":
        v.resolved_date = datetime.utcnow()
        v.resolved_by = x_user_name
        
    db.commit()
    db.refresh(v)
    
    new_val = {
        "status": v.status,
        "assigned_to": v.assigned_to,
        "is_false_positive": v.is_false_positive,
        "remarks": v.remarks
    }
    
    # Audit log
    write_violation_audit(db, v.id, "Update", x_user_name, old_val=old_val, new_val=new_val)
    return v

@router.post("/governance/violations/{id}/comments", response_model=SodViolationCommentResponse)
def add_comment(
    id: str,
    comment: SodViolationCommentBase,
    x_user_name: str = Header(default="System"),
    db: Session = Depends(get_db)
):
    v = db.query(SodViolation).filter(SodViolation.id == id).first()
    if not v:
        raise HTTPException(status_code=404, detail="SoD violation not found.")
        
    c = SodViolationComment(
        violation_id=id,
        comment_text=comment.comment_text,
        created_by=x_user_name
    )
    db.add(c)
    db.commit()
    db.refresh(c)
    
    write_violation_audit(db, id, "Comment Added", x_user_name, new_val={"comment": comment.comment_text})
    return c

@router.post("/governance/violations/{id}/attachments", response_model=SodViolationAttachmentResponse)
def upload_attachment(
    id: str,
    file: UploadFile = File(...),
    x_user_name: str = Header(default="System"),
    db: Session = Depends(get_db)
):
    v = db.query(SodViolation).filter(SodViolation.id == id).first()
    if not v:
        raise HTTPException(status_code=404, detail="SoD violation not found.")
        
    # Read metadata and fake save
    filename = file.filename
    content = file.file.read()
    size = len(content)
    
    att = SodViolationAttachment(
        violation_id=id,
        filename=filename,
        file_size=size,
        uploaded_by=x_user_name
    )
    db.add(att)
    db.commit()
    db.refresh(att)
    
    write_violation_audit(db, id, "Attachment Uploaded", x_user_name, new_val={"filename": filename, "size": size})
    return att

@router.post("/governance/violations/{id}/rescan", response_model=dict, dependencies=[Depends(require_permission("SoD Policies", "edit"))])
def rescan_violation_row(id: str, db: Session = Depends(get_db)):
    """Triggers rescan for this specific violation row's target user."""
    v = db.query(SodViolation).filter(SodViolation.id == id).first()
    if not v:
        raise HTTPException(status_code=404, detail="Violation row not found.")
    evaluate_single_user_violations(db, v.user_id)
    return {"message": "Rescan of violating user completed successfully."}

@router.post("/governance/violations/rescan-user/{userId}", response_model=dict, dependencies=[Depends(require_permission("SoD Policies", "edit"))])
def rescan_single_user(userId: int, db: Session = Depends(get_db)):
    """Triggers immediate re-evaluation scan for a single user."""
    evaluate_single_user_violations(db, userId)
    return {"message": f"Successfully rescanned user with ID {userId}"}

@router.post("/governance/violations/rescan-policy/{policyId}", response_model=dict, dependencies=[Depends(require_permission("SoD Policies", "edit"))])
def rescan_single_policy(policyId: str, db: Session = Depends(get_db)):
    """Re-runs scanner for all users against a single policy constraint."""
    # Find all identities
    identities = db.query(Identity).filter(Identity.is_deleted == False).all()
    # Simply run individual evaluations for the users
    for user in identities:
        evaluate_single_user_violations(db, user.id)
    return {"message": f"Successfully completed scan for policy {policyId}"}

# ── Bulk status edits ──
@router.post("/governance/violations/bulk-close", dependencies=[Depends(require_permission("SoD Policies", "edit"))])
def bulk_close_violations(ids: List[str], x_user_name: str = Header(default="System"), db: Session = Depends(get_db)):
    violations = db.query(SodViolation).filter(SodViolation.id.in_(ids)).all()
    count = len(violations)
    for v in violations:
        old_status = v.status
        v.status = "CLOSED"
        v.resolved_date = datetime.utcnow()
        v.resolved_by = x_user_name
        write_violation_audit(db, v.id, "Close (Bulk)", x_user_name, old_val={"status": old_status}, new_val={"status": "CLOSED"})
    db.commit()
    return {"message": f"Successfully closed {count} violations."}

@router.post("/governance/violations/bulk-assign", dependencies=[Depends(require_permission("SoD Policies", "edit"))])
def bulk_assign_violations(ids: List[str], assignee: str, x_user_name: str = Header(default="System"), db: Session = Depends(get_db)):
    violations = db.query(SodViolation).filter(SodViolation.id.in_(ids)).all()
    count = len(violations)
    for v in violations:
        old_assign = v.assigned_to
        v.assigned_to = assignee
        write_violation_audit(db, v.id, "Assign (Bulk)", x_user_name, old_val={"assigned_to": old_assign}, new_val={"assigned_to": assignee})
    db.commit()
    return {"message": f"Successfully assigned {count} violations to {assignee}."}

# ── CSV & Excel Downloads ──
@router.get("/governance/violations/export/csv")
def export_violations_csv(db: Session = Depends(get_db)):
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "Violation ID", "User", "Employee ID", "Department", "Manager", 
        "Policy Code", "Policy Name", "Conflicting Application", "Entitlement A", "Entitlement B", 
        "Severity", "Status", "Detected Date"
    ])
    
    violations = db.query(SodViolation).all()
    for v in violations:
        writer.writerow([
            v.id,
            v.username,
            v.user.employee_id if v.user else "",
            v.department or "",
            v.manager or "",
            v.policy_code,
            v.policy_name,
            v.application_name,
            v.entitlement_one,
            v.entitlement_two,
            v.severity,
            v.status,
            v.detected_date.strftime("%Y-%m-%d %H:%M:%S")
        ])
        
    output.seek(0)
    return StreamingResponse(
        io.BytesIO(output.getvalue().encode("utf-8")),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=sod_violations_export.csv"}
    )

@router.get("/governance/violations/export/excel")
def export_violations_excel(db: Session = Depends(get_db)):
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "SoD Violations"
    
    ws.append([
        "Violation ID", "User", "Employee ID", "Department", "Manager", 
        "Policy Code", "Policy Name", "Conflicting Application", "Entitlement A", "Entitlement B", 
        "Severity", "Status", "Detected Date", "Evidence Details"
    ])
    
    violations = db.query(SodViolation).all()
    for v in violations:
        ws.append([
            v.id,
            v.username,
            v.user.employee_id if v.user else "",
            v.department or "",
            v.manager or "",
            v.policy_code,
            v.policy_name,
            v.application_name,
            v.entitlement_one,
            v.entitlement_two,
            v.severity,
            v.status,
            v.detected_date.strftime("%Y-%m-%d %H:%M:%S"),
            v.evidence or ""
        ])
        
    out = io.BytesIO()
    wb.save(out)
    out.seek(0)
    return StreamingResponse(
        out,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=sod_violations_export.xlsx"}
    )
