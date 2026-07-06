from pydantic import BaseModel, Field, field_validator
from datetime import datetime
from typing import Optional, List

DEFAULT_MENUS = [
    "Dashboard",
    "Administration",
    "Platform Users",
    "Platform Roles",
    "Menu Permissions",
    "Settings",
    "SMTP Settings",
    "Branding",
    "Audit Logs",
    "License",
    "Data Foundation",
    "Role Discovery",
    "Role Engineering",
    "Role Catalog",
    "Governance",
    "Role Lifecycle",
    "Analytics",
    "Reports"
]

class PlatformRoleMini(BaseModel):
    id: int
    role_code: str
    role_name: str

    class Config:
        from_attributes = True

class MenuPermissionBase(BaseModel):
    role_id: int
    menu_name: str
    can_view: Optional[bool] = False
    can_create: Optional[bool] = False
    can_edit: Optional[bool] = False
    can_delete: Optional[bool] = False
    can_export: Optional[bool] = False
    can_approve: Optional[bool] = False

class MenuPermissionCreate(MenuPermissionBase):
    @field_validator('menu_name')
    @classmethod
    def validate_menu_name(cls, v: str) -> str:
        stripped = v.strip()
        if stripped not in DEFAULT_MENUS:
            raise ValueError(f"Menu name must be one of: {', '.join(DEFAULT_MENUS)}")
        return stripped

    @field_validator('role_id')
    @classmethod
    def validate_role_id(cls, v: int) -> int:
        if v < 1:
            raise ValueError('role_id must be a valid positive integer')
        return v

class MenuPermissionUpdate(BaseModel):
    can_view: Optional[bool] = None
    can_create: Optional[bool] = None
    can_edit: Optional[bool] = None
    can_delete: Optional[bool] = None
    can_export: Optional[bool] = None
    can_approve: Optional[bool] = None

class MenuPermissionResponse(MenuPermissionBase):
    id: int
    created_at: datetime
    updated_at: datetime
    created_by: Optional[str] = None
    modified_by: Optional[str] = None
    role: Optional[PlatformRoleMini] = None

    class Config:
        from_attributes = True

class MenuPermissionPaginatedResponse(BaseModel):
    total: int
    page: int
    limit: int
    total_pages: int
    permissions: List[MenuPermissionResponse]

    class Config:
        from_attributes = True
