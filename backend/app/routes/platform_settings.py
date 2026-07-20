import os
from fastapi import APIRouter, Depends, Header, UploadFile, File, HTTPException
from sqlalchemy.orm import Session
from datetime import datetime

from app.database import get_db
from app.models.platform_settings import PlatformSettings
from app.models.audit_log import AuditLog
from app.schemas.platform_settings import PlatformSettingsResponse, PlatformSettingsUpdate

router = APIRouter()

# Fields whose real values should never be written to the audit log in
# plaintext (credentials) - masked instead so the change is still visible.
SENSITIVE_FIELDS = {"smtp_password"}


def write_settings_audit(db: Session, user: str, changes: dict):
    """Records settings changes in the shared audit_logs table."""
    try:
        import json
        old_state = {}
        new_state = {}
        for k, v in changes.items():
            if k in SENSITIVE_FIELDS:
                old_state[k] = "(hidden)" if v["old"] else None
                new_state[k] = "(hidden)" if v["new"] else None
            else:
                old_state[k] = v["old"]
                new_state[k] = v["new"]

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


def _to_response(settings: PlatformSettings) -> PlatformSettingsResponse:
    data = {c.name: getattr(settings, c.name) for c in PlatformSettings.__table__.columns if c.name != "smtp_password"}
    data["smtp_password_set"] = bool(settings.smtp_password)
    return PlatformSettingsResponse(**data)


@router.get("/settings", response_model=PlatformSettingsResponse)
def get_settings(db: Session = Depends(get_db)):
    settings = db.query(PlatformSettings).first()
    return _to_response(settings)


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

    return _to_response(settings)


@router.post("/settings/logo", response_model=PlatformSettingsResponse)
async def upload_logo(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    x_user_name: str = Header(default="Unknown User")
):
    """Uploads a company logo for Personalization - mirrors the disk-write
    pattern used for governance attachments (backend/uploads/, safe filename)."""
    allowed_ext = (".png", ".jpg", ".jpeg", ".svg", ".webp")
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in allowed_ext:
        raise HTTPException(status_code=400, detail=f"Unsupported file type '{ext}'. Use PNG, JPG, SVG, or WEBP.")

    contents = await file.read()
    if len(contents) > 2 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Logo file too large (max 2MB).")

    uploads_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "uploads")
    if not os.path.exists(uploads_dir):
        os.makedirs(uploads_dir)

    safe_filename = f"logo_{int(datetime.utcnow().timestamp())}{ext}"
    disk_path = os.path.join(uploads_dir, safe_filename)
    with open(disk_path, "wb") as f:
        f.write(contents)

    settings = db.query(PlatformSettings).first()
    old_logo = settings.logo_path
    settings.logo_path = f"uploads/{safe_filename}"
    settings.updated_at = datetime.utcnow()
    settings.updated_by = x_user_name
    db.commit()
    db.refresh(settings)

    write_settings_audit(db, user=x_user_name, changes={"logo_path": {"old": old_logo, "new": settings.logo_path}})

    return _to_response(settings)


@router.delete("/settings/logo", response_model=PlatformSettingsResponse)
def remove_logo(
    db: Session = Depends(get_db),
    x_user_name: str = Header(default="Unknown User")
):
    """Clears the company logo, reverting Personalization to the default
    (no-logo) state. Also removes the file from disk if it still exists."""
    settings = db.query(PlatformSettings).first()
    old_logo = settings.logo_path

    if not old_logo:
        return _to_response(settings)

    disk_path = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), old_logo)
    if os.path.exists(disk_path):
        try:
            os.remove(disk_path)
        except OSError:
            pass

    settings.logo_path = None
    settings.updated_at = datetime.utcnow()
    settings.updated_by = x_user_name
    db.commit()
    db.refresh(settings)

    write_settings_audit(db, user=x_user_name, changes={"logo_path": {"old": old_logo, "new": None}})

    return _to_response(settings)
