from fastapi import Header, HTTPException, Depends, status
from sqlalchemy.orm import Session
from sqlalchemy import or_

from app.database import get_db
from app.models.platform_role import PlatformRole
from app.models.menu_permission import MenuPermission

ACTION_FIELDS = {
    "view": "can_view",
    "create": "can_create",
    "edit": "can_edit",
    "delete": "can_delete",
    "export": "can_export",
    "approve": "can_approve",
}


def require_permission(menu_name: str, action: str):
    """
    Returns a FastAPI dependency that blocks the request with 403 unless the
    calling user's role has the given action enabled for the given menu in
    the Menu Permissions table (Platform Roles > Menu Permissions).

    Platform Administrator always passes, matching the same full-access
    behavior already used at login and throughout menu permission seeding.

    Relies on the X-User-Role header, which the frontend already attaches
    to every request (see dashboardService.js apiClient interceptor).
    """
    field = ACTION_FIELDS.get(action, "can_view")

    def dependency(
        x_user_role: str = Header(default=None),
        db: Session = Depends(get_db)
    ):
        if x_user_role == "Platform Administrator":
            return True

        if not x_user_role:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access denied: no role context provided for '{menu_name}'."
            )

        role = db.query(PlatformRole).filter(
            or_(
                PlatformRole.role_name == x_user_role,
                PlatformRole.role_code == x_user_role
            )
        ).first()

        if not role:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access denied: role '{x_user_role}' is not recognized."
            )

        perm = db.query(MenuPermission).filter(
            MenuPermission.role_id == role.id,
            MenuPermission.menu_name == menu_name
        ).first()

        allowed = getattr(perm, field, False) if perm else False
        if not allowed:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Your role ('{x_user_role}') does not have {action} permission for {menu_name}."
            )

        return True

    return dependency
