"""
RE-005 – Role Owner API Routes
RE-006 – Preview Final Role API Routes

Endpoints:
  GET    /api/platform-users/search              - search users for owner picker
  GET    /api/candidate-roles/{id}/owners        - get current owners
  POST   /api/candidate-roles/{id}/owners        - assign an owner
  DELETE /api/candidate-roles/{id}/owners/{type} - remove owner (Primary/Backup)
  GET    /api/candidate-roles/{id}/owners/history- full owner history
  GET    /api/candidate-roles/{id}/preview       - full role preview (RE-006)
  GET    /api/candidate-roles/{id}/preview/export/json   - download preview JSON
  GET    /api/candidate-roles/{id}/preview/export/csv    - download preview CSV
  GET    /api/candidate-roles/{id}/preview/export/excel  - download preview Excel
  POST   /api/role-owners/enforce-expiry         - system job: flag expired owners
"""

from fastapi import APIRouter, Depends, HTTPException, Header, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from typing import Optional
from pydantic import BaseModel
import io

from app.database import get_db
from app.utils.permissions import require_permission
from app.services.role_owner_service import RoleOwnerService
from app.services.role_preview_service import RolePreviewService

router = APIRouter()


# ─────────────────────────────────────────────────────────────────────────────
# Pydantic schemas
# ─────────────────────────────────────────────────────────────────────────────

class AssignOwnerPayload(BaseModel):
    owner_type: str                     # "Primary" or "Backup"
    owner_name: str
    owner_email: Optional[str] = None
    owner_user_id: Optional[int] = None
    review_date: str                    # required; "YYYY-MM-DD" or "YYYY-MM-DDTHH:MM"
    change_reason: Optional[str] = None


# ─────────────────────────────────────────────────────────────────────────────
# Platform User Search (for owner picker autocomplete)
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/users/search-for-owner")
def search_platform_users(
    q: Optional[str] = Query(default="", alias="q"),
    limit: int = Query(default=20, le=100),
    db: Session = Depends(get_db),
    _perm: bool = Depends(require_permission("Role Engineering", "view"))
):
    """
    Search platform users by name, email, employee_id, or department.
    Returns lightweight list for the Role Owner assignment dropdown.
    """
    try:
        return RoleOwnerService.search_platform_users(db, query=q or "", limit=limit)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ─────────────────────────────────────────────────────────────────────────────
# RE-005 – Role Owner Endpoints
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/candidate-roles/{role_id}/owners")
def get_current_owners(
    role_id: int,
    db: Session = Depends(get_db),
    _perm: bool = Depends(require_permission("Role Engineering", "view"))
):
    """Returns the current active Primary and Backup owners for a candidate role."""
    try:
        return RoleOwnerService.get_current_owners(db, role_id)
    except ValueError as ve:
        raise HTTPException(status_code=404, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/candidate-roles/{role_id}/owners", status_code=201)
def assign_owner(
    role_id: int,
    payload: AssignOwnerPayload,
    db: Session = Depends(get_db),
    x_user_name: str = Header(default="System"),
    _perm: bool = Depends(require_permission("Role Engineering", "edit"))
):
    """
    Assigns a Primary or Backup owner to a candidate role.
    Validates for duplicate owners and deactivates any previous owner of the same type.
    Sends an in-platform notification.
    """
    try:
        result = RoleOwnerService.assign_owner(
            db=db,
            role_id=role_id,
            owner_type=payload.owner_type,
            owner_name=payload.owner_name,
            owner_email=payload.owner_email,
            owner_user_id=payload.owner_user_id,
            review_date=payload.review_date,
            change_reason=payload.change_reason,
            assigned_by=x_user_name
        )
        return result
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/candidate-roles/{role_id}/owners/{owner_type}")
def remove_owner(
    role_id: int,
    owner_type: str,
    reason: Optional[str] = Query(default=None),
    db: Session = Depends(get_db),
    x_user_name: str = Header(default="System"),
    _perm: bool = Depends(require_permission("Role Engineering", "edit"))
):
    """
    Removes the active owner of a given type (Primary or Backup) from a candidate role.
    """
    if owner_type not in ("Primary", "Backup"):
        raise HTTPException(status_code=400, detail="owner_type must be 'Primary' or 'Backup'")
    try:
        return RoleOwnerService.remove_owner(db, role_id, owner_type, x_user_name, reason)
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/candidate-roles/{role_id}/owners/history")
def get_owner_history(
    role_id: int,
    db: Session = Depends(get_db),
    _perm: bool = Depends(require_permission("Role Engineering", "view"))
):
    """Returns the full ownership history (active and removed) for a candidate role."""
    try:
        return RoleOwnerService.get_owner_history(db, role_id)
    except ValueError as ve:
        raise HTTPException(status_code=404, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/role-owners/enforce-expiry")
def enforce_review_date_expiry(
    db: Session = Depends(get_db),
    x_user_name: str = Header(default="System"),
    _perm: bool = Depends(require_permission("Role Engineering", "edit"))
):
    """
    System maintenance endpoint.
    Scans all active owner records and flags those past their review_date as expired.
    Also triggers in-platform notifications for each newly-expired record.
    """
    try:
        count = RoleOwnerService.enforce_review_date_expiry(db)
        return {
            "message": f"Expiry enforcement complete. {count} owner record(s) flagged as expired.",
            "expired_count": count
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ─────────────────────────────────────────────────────────────────────────────
# RE-006 – Preview Final Role Endpoints
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/candidate-roles/{role_id}/preview")
def get_role_preview(
    role_id: int,
    db: Session = Depends(get_db),
    _perm: bool = Depends(require_permission("Role Engineering", "view"))
):
    """
    Returns the complete role preview including:
    - All role metadata
    - Computed risk score
    - Entitlements (core + non-core)
    - Members
    - Current owners (primary + backup)
    - Owner history
    - SoD violations
    - Audit trail
    - Readiness checks (pass/fail with severity)
    """
    try:
        return RolePreviewService.build_preview(db, role_id)
    except ValueError as ve:
        raise HTTPException(status_code=404, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/candidate-roles/{role_id}/preview/export/json")
def export_preview_json(
    role_id: int,
    db: Session = Depends(get_db),
    _perm: bool = Depends(require_permission("Role Engineering", "export"))
):
    """Downloads the full role preview as a JSON file."""
    try:
        json_str = RolePreviewService.export_preview_json(db, role_id)
        return StreamingResponse(
            io.BytesIO(json_str.encode("utf-8")),
            media_type="application/json",
            headers={"Content-Disposition": f"attachment; filename=role_{role_id}_preview.json"}
        )
    except ValueError as ve:
        raise HTTPException(status_code=404, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/candidate-roles/{role_id}/preview/export/csv")
def export_preview_csv(
    role_id: int,
    db: Session = Depends(get_db),
    _perm: bool = Depends(require_permission("Role Engineering", "export"))
):
    """Downloads the full role preview as a multi-section CSV file."""
    try:
        csv_str = RolePreviewService.export_preview_csv(db, role_id)
        return StreamingResponse(
            io.BytesIO(csv_str.encode("utf-8")),
            media_type="text/csv",
            headers={"Content-Disposition": f"attachment; filename=role_{role_id}_preview.csv"}
        )
    except ValueError as ve:
        raise HTTPException(status_code=404, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/candidate-roles/{role_id}/preview/export/excel")
def export_preview_excel(
    role_id: int,
    db: Session = Depends(get_db),
    _perm: bool = Depends(require_permission("Role Engineering", "export"))
):
    """Downloads the full role preview as a multi-sheet Excel workbook."""
    try:
        excel_bytes = RolePreviewService.export_preview_excel(db, role_id)
        return StreamingResponse(
            io.BytesIO(excel_bytes),
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f"attachment; filename=role_{role_id}_preview.xlsx"}
        )
    except ValueError as ve:
        raise HTTPException(status_code=404, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
