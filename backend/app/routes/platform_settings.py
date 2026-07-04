from fastapi import APIRouter, Depends, Header
from sqlalchemy.orm import Session
from datetime import datetime

from app.database import get_db
from app.models.platform_settings import PlatformSettings
from app.models.audit_log import AuditLog
from app.schemas.platform_settings import PlatformSettingsResponse, PlatformSettingsUpdate

router = APIRouter()


def write_settings_audit(db: Session, user: str, changes: dict):
    """Records settings changes in the shared audit_logs table."""
    try:
        import json
        old_state = {k: v["old"] for k, v in changes.items()}
        new_state = {k: v["new"] for k, v in changes.items()}

        audit = AuditLog(
            module="Settings",
            action="Update",
            performed_by=user,
            old_value=json.dumps(old_state, default=str),
            new_value=json.dumps(new_state, default=str),
            timestamp=datetime.utcnow()
        )
        db.add(audit)
        db.commit()
    except Exception as e:
        print(f"Warning: Failed to write settings audit record: {e}")


@router.get("/settings", response_model=PlatformSettingsResponse)
def get_settings(db: Session = Depends(get_db)):
    settings = db.query(PlatformSettings).first()
    return settings


@router.put("/settings", response_model=PlatformSettingsResponse)
def update_settings(
    payload: PlatformSettingsUpdate,
    db: Session = Depends(get_db),
    x_user_name: str = Header(default="Unknown User")
):
    settings = db.query(PlatformSettings).first()

    changes = {}
    for field, value in payload.model_dump(exclude_unset=True).items():
        old_val = getattr(settings, field)
        if old_val != value:
            setattr(settings, field, value)
            changes[field] = {"old": old_val, "new": value}

    if changes:
        settings.updated_at = datetime.utcnow()
        settings.updated_by = x_user_name
        db.commit()
        db.refresh(settings)

        write_settings_audit(db, user=x_user_name, changes=changes)

    return settings