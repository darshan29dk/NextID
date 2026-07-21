from pydantic import BaseModel, Field, field_validator
from datetime import datetime
from typing import Optional, List

class PlatformRoleBase(BaseModel):
    role_code: str
    role_name: str
    description: str
    role_type: str # "System", "Business", "Application", "Technical", "Shared"
    risk_level: str # "Low", "Medium", "High", "Critical"
    status: Optional[str] = "Active" # "Draft", "Active", "Inactive", "Deprecated"
    approval_required: Optional[bool] = False
    is_system_role: Optional[bool] = False

class PlatformRoleCreate(PlatformRoleBase):
    @field_validator('role_code', 'role_name', 'description', 'role_type', 'risk_level')
    @classmethod
    def check_not_empty(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError('Field must not be empty or whitespace only')
        return v.strip()

    @field_validator('role_type')
    @classmethod
    def validate_role_type(cls, v: str) -> str:
        valid_types = {"System", "Business", "Application", "Technical", "Shared"}
        if v not in valid_types:
            raise ValueError(f'Role type must be one of: {", ".join(valid_types)}')
        return v

    @field_validator('risk_level')
    @classmethod
    def validate_risk_level(cls, v: str) -> str:
        valid_risks = {"Low", "Medium", "High", "Critical"}
        if v not in valid_risks:
            raise ValueError(f'Risk level must be one of: {", ".join(valid_risks)}')
        return v

    @field_validator('status')
    @classmethod
    def validate_status(cls, v: Optional[str]) -> Optional[str]:
        if v:
            valid_statuses = {"Draft", "Active", "Inactive", "Deprecated"}
            if v not in valid_statuses:
                raise ValueError(f'Status must be one of: {", ".join(valid_statuses)}')
        return v

class PlatformRoleUpdate(BaseModel):
    role_code: Optional[str] = None
    role_name: Optional[str] = None
    description: Optional[str] = None
    role_type: Optional[str] = None
    risk_level: Optional[str] = None
    status: Optional[str] = None
    approval_required: Optional[bool] = None
    is_system_role: Optional[bool] = None

    @field_validator('role_code', 'role_name', 'description', 'role_type', 'risk_level')
    @classmethod
    def check_not_empty(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            if not v.strip():
                raise ValueError('Field must not be empty or whitespace only')
            return v.strip()
        return v

    @field_validator('role_type')
    @classmethod
    def validate_role_type(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            valid_types = {"System", "Business", "Application", "Technical", "Shared"}
            if v not in valid_types:
                raise ValueError(f'Role type must be one of: {", ".join(valid_types)}')
        return v

    @field_validator('risk_level')
    @classmethod
    def validate_risk_level(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            valid_risks = {"Low", "Medium", "High", "Critical"}
            if v not in valid_risks:
                raise ValueError(f'Risk level must be one of: {", ".join(valid_risks)}')
        return v

    @field_validator('status')
    @classmethod
    def validate_status(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            valid_statuses = {"Draft", "Active", "Inactive", "Deprecated"}
            if v not in valid_statuses:
                raise ValueError(f'Status must be one of: {", ".join(valid_statuses)}')
        return v

class PlatformRoleResponse(PlatformRoleBase):
    id: int
    is_deleted: bool
    created_at: datetime
    updated_at: datetime
    created_by: str
    modified_by: str
    users_assigned: int = 0

    class Config:
        from_attributes = True

# Simple representations for detailed drawer nesting
class AssignedUserSchema(BaseModel):
    id: int
    employee_id: str
    first_name: str
    last_name: str
    email: str
    department: Optional[str] = None
    job_title: Optional[str] = None

    class Config:
        from_attributes = True

class AuditLogSchema(BaseModel):
    id: int
    module: str
    action: str
    performed_by: str
    old_value: Optional[str] = None
    new_value: Optional[str] = None
    timestamp: datetime

    class Config:
        from_attributes = True

class PlatformRoleDetailResponse(BaseModel):
    role: PlatformRoleResponse
    assigned_users: List[AssignedUserSchema]
    audit_history: List[AuditLogSchema]

    class Config:
        from_attributes = True

class PlatformRolePaginatedResponse(BaseModel):
    total: int
    page: int
    limit: int
    total_pages: int
    roles: List[PlatformRoleResponse]

    class Config:
        from_attributes = True
