from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import or_
from typing import Optional
from datetime import datetime

from app.database import get_db
from app.models.audit_log import AuditLog
from app.schemas.audit_log import AuditLogPaginatedResponse

router = APIRouter()


@router.get("/audit-logs", response_model=AuditLogPaginatedResponse)
def get_audit_logs(
    page: int = 1,
    limit: int = 10,
    search: Optional[str] = None,
    module: Optional[str] = None,
    action: Optional[str] = None,
    performed_by: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    db: Session = Depends(get_db)
):
    if page < 1:
        page = 1
    if limit < 1:
        limit = 10

    query = db.query(AuditLog)

    if search:
        search_term = f"%{search}%"
        query = query.filter(
            or_(
                AuditLog.module.like(search_term),
                AuditLog.action.like(search_term),
                AuditLog.performed_by.like(search_term)
            )
        )

    if module:
        query = query.filter(AuditLog.module == module)
    if action:
        query = query.filter(AuditLog.action == action)
    if performed_by:
        query = query.filter(AuditLog.performed_by == performed_by)

    if start_date:
        try:
            start_dt = datetime.strptime(start_date, "%Y-%m-%d")
            query = query.filter(AuditLog.timestamp >= start_dt)
        except ValueError:
            pass
    if end_date:
        try:
            end_dt = datetime.strptime(end_date, "%Y-%m-%d")
            end_dt = end_dt.replace(hour=23, minute=59, second=59)
            query = query.filter(AuditLog.timestamp <= end_dt)
        except ValueError:
            pass

    total = query.count()
    total_pages = (total + limit - 1) // limit if total > 0 else 1

    logs = query.order_by(AuditLog.timestamp.desc()).offset((page - 1) * limit).limit(limit).all()

    return AuditLogPaginatedResponse(
        total=total,
        page=page,
        limit=limit,
        total_pages=total_pages,
        logs=logs
    )


@router.get("/audit-logs/modules")
def get_audit_log_modules(db: Session = Depends(get_db)):
    rows = db.query(AuditLog.module).distinct().all()
    return {"modules": [r[0] for r in rows]}


@router.get("/audit-logs/actions")
def get_audit_log_actions(db: Session = Depends(get_db)):
    rows = db.query(AuditLog.action).distinct().all()
    return {"actions": [r[0] for r in rows]}