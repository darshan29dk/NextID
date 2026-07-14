from fastapi import APIRouter, Depends, HTTPException, Header
from sqlalchemy.orm import Session
from typing import Optional
from pydantic import BaseModel

from app.database import get_db
from app.utils.permissions import require_permission
from app.services.role_catalog_service import RoleCatalogService

router = APIRouter(prefix="/role-catalog")


class PublishRoleRequest(BaseModel):
    change_summary: Optional[str] = None


# ─────────────────────────────────────────────────────────────────────────────
# RC-001: Publish action
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/{role_id}/publish", status_code=201)
def publish_role(
    role_id: int,
    payload: PublishRoleRequest,
    db: Session = Depends(get_db),
    x_user_name: str = Header(default="System"),
    _perm: bool = Depends(require_permission("Role Engineering", "edit"))
):
    """Publishes a candidate role (status 'Ready For Publish') to the Role Catalog."""
    try:
        return RoleCatalogService.publish_role(
            db=db, role_id=role_id, user=x_user_name, change_summary=payload.change_summary
        )
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ─────────────────────────────────────────────────────────────────────────────
# RC-001/RC-002/RC-003: Listing
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/kpi")
def get_catalog_kpi(
    db: Session = Depends(get_db),
    _perm: bool = Depends(require_permission("Role Engineering", "view"))
):
    try:
        return RoleCatalogService.get_catalog_kpi(db)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/published")
def get_published_roles(
    page: int = 1,
    limit: int = 10,
    search: Optional[str] = None,
    role_type: Optional[str] = None,
    classification: Optional[str] = None,
    sort_by: Optional[str] = None,
    sort_order: Optional[str] = "desc",
    status: str = "Published",
    db: Session = Depends(get_db),
    _perm: bool = Depends(require_permission("Role Engineering", "view"))
):
    """
    RC-001 Published Roles list. Pass role_type=Business or role_type=Technical
    to power RC-002/RC-003 as filtered views of the same catalog.
    """
    try:
        return RoleCatalogService.get_published_roles(
            db=db, page=page, limit=limit, search=search,
            role_type=role_type, classification=classification,
            sort_by=sort_by, sort_order=sort_order, status=status
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ─────────────────────────────────────────────────────────────────────────────
# RC-004: Role Details workspace
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/{role_id}")
def get_role_catalog_detail(
    role_id: int,
    db: Session = Depends(get_db),
    _perm: bool = Depends(require_permission("Role Engineering", "view"))
):
    try:
        return RoleCatalogService.get_role_catalog_detail(db, role_id)
    except ValueError as ve:
        raise HTTPException(status_code=404, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ─────────────────────────────────────────────────────────────────────────────
# RC-005: Version History
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/{role_id}/versions")
def get_version_history(
    role_id: int,
    db: Session = Depends(get_db),
    _perm: bool = Depends(require_permission("Role Engineering", "view"))
):
    try:
        return RoleCatalogService.get_version_history(db, role_id)
    except ValueError as ve:
        raise HTTPException(status_code=404, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
