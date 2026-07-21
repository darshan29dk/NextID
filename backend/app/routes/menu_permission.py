from fastapi import APIRouter, Depends, HTTPException, status, Header
from sqlalchemy.orm import Session
from sqlalchemy import or_, and_
from typing import List, Optional
import json
from datetime import datetime

from app.database import get_db
from app.models.platform_role import PlatformRole
from app.models.menu_permission import MenuPermission
from app.models.audit_log import AuditLog
from app.models.dashboard import RecentActivity
from app.schemas.menu_permission import (
    MenuPermissionCreate, MenuPermissionUpdate, MenuPermissionResponse, MenuPermissionPaginatedResponse
)
from app.cache import cache_delete

router = APIRouter()

# Helper for Audit Logging
def write_permission_audit(db: Session, user: str, action: str, old_val: dict = None, new_val: dict = None):
    try:
        old_val_str = json.dumps(old_val, default=str) if old_val else None
        new_val_str = json.dumps(new_val, default=str) if new_val else None

        audit = AuditLog(
            module="Menu Permissions",
            action=action, # "Create", "Update", "Delete", "Permission Change"
            performed_by=user,
            old_value=old_val_str,
            new_value=new_val_str,
            timestamp=datetime.utcnow()
        )
        db.add(audit)

        # Recent Activity Feed
        role_name = ""
        menu_name = ""
        if new_val:
            role_name = new_val.get("role_name", "")
            menu_name = new_val.get("menu_name", "")
        elif old_val:
            role_name = old_val.get("role_name", "")
            menu_name = old_val.get("menu_name", "")

        activity = RecentActivity(
            user=user,
            action=f"Menu Permissions {action.lower()}d - Role: {role_name}, Menu: {menu_name}",
            status="info" if action != "Delete" else "warning",
            created_at=datetime.utcnow()
        )
        db.add(activity)
        db.commit()
    except Exception as e:
        print(f"Warning: Failed to write menu permission audit: {e}")

@router.get("/menu-permissions", response_model=MenuPermissionPaginatedResponse)
def get_menu_permissions(
    page: int = 1,
    limit: int = 10,
    search: Optional[str] = None,
    role_id: Optional[int] = None,
    db: Session = Depends(get_db)
):
    if page < 1:
        page = 1
    if limit < 1:
        limit = 10

    query = db.query(MenuPermission)

    if role_id:
        query = query.filter(MenuPermission.role_id == role_id)
        
    if search:
        search_term = f"%{search}%"
        # We can join PlatformRole to search by role name or code
        query = query.join(PlatformRole).filter(
            or_(
                MenuPermission.menu_name.like(search_term),
                PlatformRole.role_name.like(search_term),
                PlatformRole.role_code.like(search_term)
            )
        )

    total = query.count()
    total_pages = (total + limit - 1) // limit if total > 0 else 1
    permissions = query.order_by(MenuPermission.id.desc()).offset((page - 1) * limit).limit(limit).all()

    return MenuPermissionPaginatedResponse(
        total=total,
        page=page,
        limit=limit,
        total_pages=total_pages,
        permissions=permissions
    )

@router.get("/menu-permissions/{roleId}", response_model=List[MenuPermissionResponse])
def get_role_menu_permissions(roleId: int, db: Session = Depends(get_db)):
    role = db.query(PlatformRole).filter(PlatformRole.id == roleId, PlatformRole.is_deleted == False).first()
    if not role:
        raise HTTPException(status_code=404, detail="Platform Role not found.")
        
    permissions = db.query(MenuPermission).filter(MenuPermission.role_id == roleId).all()
    return permissions

@router.post("/menu-permissions", response_model=MenuPermissionResponse, status_code=status.HTTP_201_CREATED)
def create_menu_permission(
    payload: MenuPermissionCreate,
    db: Session = Depends(get_db),
    x_user_name: str = Header(default="Unknown User")
):
    # Verify Role exists
    role = db.query(PlatformRole).filter(PlatformRole.id == payload.role_id, PlatformRole.is_deleted == False).first()
    if not role:
        raise HTTPException(status_code=400, detail="The selected Platform Role does not exist.")

    # Duplicate Check
    existing = db.query(MenuPermission).filter(
        and_(
            MenuPermission.role_id == payload.role_id,
            MenuPermission.menu_name == payload.menu_name
        )
    ).first()
    if existing:
        raise HTTPException(
            status_code=400,
            detail=f"A permission mapping for menu '{payload.menu_name}' and role '{role.role_name}' already exists."
        )

    # Create permission
    perm = MenuPermission(
        role_id=payload.role_id,
        menu_name=payload.menu_name,
        can_view=payload.can_view,
        can_create=payload.can_create,
        can_edit=payload.can_edit,
        can_delete=payload.can_delete,
        can_export=payload.can_export,
        can_approve=payload.can_approve,
        created_by=x_user_name,
        modified_by=x_user_name
    )
    db.add(perm)
    db.commit()
    db.refresh(perm)

    # Log action
    perm_dict = {
        "id": perm.id,
        "role_name": role.role_name,
        "menu_name": perm.menu_name,
        "can_view": perm.can_view,
        "can_create": perm.can_create,
        "can_edit": perm.can_edit,
        "can_delete": perm.can_delete,
        "can_export": perm.can_export,
        "can_approve": perm.can_approve
    }
    write_permission_audit(db=db, user=x_user_name, action="Create", old_val=None, new_val=perm_dict)
    cache_delete(f"menu_perms:{payload.role_id}")

    return perm

@router.put("/menu-permissions/{roleId}", response_model=List[MenuPermissionResponse])
def bulk_update_role_permissions(
    roleId: int,
    payloads: List[MenuPermissionCreate],
    db: Session = Depends(get_db),
    x_user_name: str = Header(default="Unknown User")
):
    role = db.query(PlatformRole).filter(PlatformRole.id == roleId, PlatformRole.is_deleted == False).first()
    if not role:
        raise HTTPException(status_code=404, detail="Platform Role not found.")

    updated_perms = []
    for payload in payloads:
        # Validate role ID matches path
        if payload.role_id != roleId:
            raise HTTPException(status_code=400, detail="Payload role_id must match the URL roleId.")

        # Find or create
        perm = db.query(MenuPermission).filter(
            and_(
                MenuPermission.role_id == roleId,
                MenuPermission.menu_name == payload.menu_name
            )
        ).first()

        old_state = None
        if perm:
            old_state = {
                "can_view": perm.can_view,
                "can_create": perm.can_create,
                "can_edit": perm.can_edit,
                "can_delete": perm.can_delete,
                "can_export": perm.can_export,
                "can_approve": perm.can_approve
            }
            perm.can_view = payload.can_view
            perm.can_create = payload.can_create
            perm.can_edit = payload.can_edit
            perm.can_delete = payload.can_delete
            perm.can_export = payload.can_export
            perm.can_approve = payload.can_approve
            perm.modified_by = x_user_name
            perm.updated_at = datetime.utcnow()
        else:
            perm = MenuPermission(
                role_id=roleId,
                menu_name=payload.menu_name,
                can_view=payload.can_view,
                can_create=payload.can_create,
                can_edit=payload.can_edit,
                can_delete=payload.can_delete,
                can_export=payload.can_export,
                can_approve=payload.can_approve,
                created_by=x_user_name,
                modified_by=x_user_name
            )
            db.add(perm)

        db.commit()
        db.refresh(perm)
        updated_perms.append(perm)

        # Audit permission change if updated
        new_state = {
            "can_view": perm.can_view,
            "can_create": perm.can_create,
            "can_edit": perm.can_edit,
            "can_delete": perm.can_delete,
            "can_export": perm.can_export,
            "can_approve": perm.can_approve
        }
        if old_state != new_state:
            audit_old = {"role_name": role.role_name, "role_code": role.role_code, "menu_name": perm.menu_name, **(old_state or {})}
            audit_new = {"role_name": role.role_name, "role_code": role.role_code, "menu_name": perm.menu_name, **new_state}
            write_permission_audit(
                db=db,
                user=x_user_name,
                action="Permission Change" if old_state else "Create",
                old_val=audit_old if old_state else None,
                new_val=audit_new
            )

    cache_delete(f"menu_perms:{roleId}")
    return updated_perms

@router.put("/menu-permissions/record/{id}", response_model=MenuPermissionResponse)
def update_single_permission_record(
    id: int,
    payload: MenuPermissionUpdate,
    db: Session = Depends(get_db),
    x_user_name: str = Header(default="Unknown User")
):
    perm = db.query(MenuPermission).filter(MenuPermission.id == id).first()
    if not perm:
        raise HTTPException(status_code=404, detail="Permission record not found.")

    role = db.query(PlatformRole).filter(PlatformRole.id == perm.role_id).first()
    role_name = role.role_name if role else "Unknown Role"
    role_code = role.role_code if role else ""

    old_state = {
        "id": perm.id,
        "role_name": role_name,
        "role_code": role_code,
        "menu_name": perm.menu_name,
        "can_view": perm.can_view,
        "can_create": perm.can_create,
        "can_edit": perm.can_edit,
        "can_delete": perm.can_delete,
        "can_export": perm.can_export,
        "can_approve": perm.can_approve
    }

    changes = {}
    for field, value in payload.model_dump(exclude_unset=True).items():
        old_val = getattr(perm, field)
        if old_val != value:
            setattr(perm, field, value)
            changes[field] = {"old": old_val, "new": value}

    if changes:
        perm.updated_at = datetime.utcnow()
        perm.modified_by = x_user_name
        db.commit()
        db.refresh(perm)

        new_state = {
            "id": perm.id,
            "role_name": role_name,
            "role_code": role_code,
            "menu_name": perm.menu_name,
            "can_view": perm.can_view,
            "can_create": perm.can_create,
            "can_edit": perm.can_edit,
            "can_delete": perm.can_delete,
            "can_export": perm.can_export,
            "can_approve": perm.can_approve
        }

        write_permission_audit(
            db=db,
            user=x_user_name,
            action="Permission Change",
            old_val=old_state,
            new_val=new_state
        )
        cache_delete(f"menu_perms:{perm.role_id}")

    return perm

@router.delete("/menu-permissions/{id}")
def delete_menu_permission(
    id: int,
    db: Session = Depends(get_db),
    x_user_name: str = Header(default="Unknown User")
):
    perm = db.query(MenuPermission).filter(MenuPermission.id == id).first()
    if not perm:
        raise HTTPException(status_code=404, detail="Permission record not found.")

    role = db.query(PlatformRole).filter(PlatformRole.id == perm.role_id).first()
    role_name = role.role_name if role else "Unknown"
    deleted_role_id = perm.role_id

    # Log action
    perm_dict = {
        "id": perm.id,
        "role_name": role_name,
        "menu_name": perm.menu_name,
        "can_view": perm.can_view,
        "can_create": perm.can_create,
        "can_edit": perm.can_edit,
        "can_delete": perm.can_delete,
        "can_export": perm.can_export,
        "can_approve": perm.can_approve
    }

    db.delete(perm)
    db.commit()

    write_permission_audit(db=db, user=x_user_name, action="Delete", old_val=perm_dict, new_val=None)
    cache_delete(f"menu_perms:{deleted_role_id}")

    return {"detail": "Permission mapping deleted successfully"}
