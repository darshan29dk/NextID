from fastapi import APIRouter, Depends, HTTPException, status, Header, Query
from sqlalchemy.orm import Session
import json
from datetime import datetime
from typing import List, Optional

from app.database import get_db
from app.models.import_preview import ImportPreview
from app.models.connector import Connector
from app.models.audit_log import AuditLog
from app.models.dashboard import RecentActivity
from app.schemas.import_preview import (
    ImportPreviewResponse, PreviewSummaryResponse, PreviewSummaryFieldStats,
    ImportPreviewPaginatedResponse
)
from app.services.preview_engine import PreviewEngine

router = APIRouter()

# Authentication Helpers
def check_write_permission(x_user_role: str = Header(default="Read Only User")):
    if x_user_role not in ["Platform Administrator", "Data Steward"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied. Only Administrators and Data Stewards can generate previews."
        )

# Audit Log Helper
def write_preview_audit(db: Session, user: str, connector_id: int, action: str):
    try:
        connector = db.query(Connector).filter(Connector.id == connector_id).first()
        conn_name = connector.connector_name if connector else f"ID {connector_id}"

        audit = AuditLog(
            module="Import Preview",
            action=action, # "Generate Preview", "Clear Preview"
            performed_by=user,
            old_value=None,
            new_value=json.dumps({"connector_id": connector_id, "connector_name": conn_name}),
            timestamp=datetime.utcnow()
        )
        db.add(audit)

        # Recent Activity Feed
        activity = RecentActivity(
            user=user,
            action=f"Import preview {action.lower()}d for {conn_name}",
            status="info" if action == "Generate" else "warning",
            created_at=datetime.utcnow()
        )
        db.add(activity)
        db.commit()
    except Exception as e:
        print(f"Warning: Failed to write preview audit: {e}")

@router.post("/connectors/{id}/preview", dependencies=[Depends(check_write_permission)])
def generate_connector_preview(
    id: int,
    table_name: Optional[str] = None,
    db: Session = Depends(get_db),
    x_user_name: str = Header(default="System")
):
    try:
        res = PreviewEngine.generate_preview(db, id, table_name)
        write_preview_audit(db, x_user_name, id, "Generate")
        return res
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/connectors/{id}/preview", response_model=ImportPreviewPaginatedResponse)
def get_connector_preview(
    id: int,
    page: int = 1,
    limit: int = 25,
    status_filter: Optional[str] = Query(default=None, alias="status"),
    search: Optional[str] = None,
    db: Session = Depends(get_db)
):
    if page < 1:
        page = 1
    if limit < 1:
        limit = 25

    # 1. Fetch all previews for the connector to generate complete dry-run statistics
    all_previews = db.query(ImportPreview).filter(ImportPreview.connector_id == id).all()
    total_records = len(all_previews)
    valid_records = sum(1 for p in all_previews if p.status == "Valid")
    warning_records = sum(1 for p in all_previews if p.status == "Warning")
    error_records = sum(1 for p in all_previews if p.status == "Error")

    # Calculate validation failures statistics by field
    field_errors = {}
    field_warnings = {}
    for p in all_previews:
        try:
            if p.validation_result:
                val_res = json.loads(p.validation_result)
                for field_name, issues in val_res.items():
                    for issue in issues:
                        sev = issue.get("status", "Error")
                        if sev == "Error":
                            field_errors[field_name] = field_errors.get(field_name, 0) + 1
                        elif sev == "Warning":
                            field_warnings[field_name] = field_warnings.get(field_name, 0) + 1
        except Exception:
            pass

    field_stats = []
    all_fields = set(list(field_errors.keys()) + list(field_warnings.keys()))
    for f in all_fields:
        errs = field_errors.get(f, 0)
        warns = field_warnings.get(f, 0)
        field_stats.append(PreviewSummaryFieldStats(
            field_name=f,
            errors_count=errs,
            warnings_count=warns,
            total_failures=errs + warns
        ))
    field_stats.sort(key=lambda x: x.total_failures, reverse=True)

    summary = PreviewSummaryResponse(
        total_records=total_records,
        valid_records=valid_records,
        warning_records=warning_records,
        error_records=error_records,
        field_stats=field_stats
    )

    # 2. Build filtered query for page grid display
    query = db.query(ImportPreview).filter(ImportPreview.connector_id == id)

    if status_filter:
        query = query.filter(ImportPreview.status == status_filter)

    if search:
        search_term = f"%{search}%"
        # Search inside source_data, transformed_data, errors, or warnings
        from sqlalchemy import or_
        query = query.filter(
            or_(
                ImportPreview.source_data.like(search_term),
                ImportPreview.transformed_data.like(search_term),
                ImportPreview.errors.like(search_term),
                ImportPreview.warnings.like(search_term)
            )
        )

    total_filtered = query.count()
    total_pages = (total_filtered + limit - 1) // limit if total_filtered > 0 else 1
    offset = (page - 1) * limit
    records = query.order_by(ImportPreview.record_number.asc()).offset(offset).limit(limit).all()

    return {
        "total": total_filtered,
        "page": page,
        "limit": limit,
        "total_pages": total_pages,
        "summary": summary,
        "records": records
    }

@router.delete("/connectors/{id}/preview", dependencies=[Depends(check_write_permission)])
def clear_connector_preview(
    id: int,
    db: Session = Depends(get_db),
    x_user_name: str = Header(default="System")
):
    db.query(ImportPreview).filter(ImportPreview.connector_id == id).delete()
    db.commit()
    write_preview_audit(db, x_user_name, id, "Clear")
    return {"message": "Preview cleared successfully"}
