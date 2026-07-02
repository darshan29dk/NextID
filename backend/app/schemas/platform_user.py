from pydantic import BaseModel, Field, field_validator, EmailStr
from datetime import datetime
from typing import Optional, List
import re

# Phone regex pattern matching common formats (7-20 digits/spaces/dashes/parens)
PHONE_REGEX = re.compile(r"^\+?[\d\s\-\(\)\.]{7,20}$")

class PlatformRoleResponse(BaseModel):
    id: int
    name: str
    description: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

class PlatformUserBase(BaseModel):
    employee_id: str
    first_name: str
    last_name: str
    email: EmailStr
    phone: Optional[str] = None
    department: Optional[str] = None
    job_title: Optional[str] = None
    business_role: Optional[str] = None
    platform_role_id: Optional[int] = None
    status: Optional[str] = "Active"
    manager: Optional[str] = None

class PlatformUserCreate(PlatformUserBase):
    @field_validator('first_name', 'last_name', 'employee_id')
    @classmethod
    def check_not_empty(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError('Field must not be empty or whitespace only')
        return v.strip()

    @field_validator('phone')
    @classmethod
    def validate_phone(cls, v: Optional[str]) -> Optional[str]:
        if v and v.strip():
            stripped = v.strip()
            if not PHONE_REGEX.match(stripped):
                raise ValueError('Invalid phone number format')
            return stripped
        return None

class PlatformUserUpdate(BaseModel):
    employee_id: Optional[str] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    department: Optional[str] = None
    job_title: Optional[str] = None
    business_role: Optional[str] = None
    platform_role_id: Optional[int] = None
    status: Optional[str] = None
    manager: Optional[str] = None

    @field_validator('first_name', 'last_name', 'employee_id')
    @classmethod
    def check_not_empty(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            if not v.strip():
                raise ValueError('Field must not be empty or whitespace only')
            return v.strip()
        return v

    @field_validator('phone')
    @classmethod
    def validate_phone(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v.strip():
            stripped = v.strip()
            if not PHONE_REGEX.match(stripped):
                raise ValueError('Invalid phone number format')
            return stripped
        return None

class PlatformUserResponse(PlatformUserBase):
    id: int
    is_deleted: bool
    last_login: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime
    created_by: Optional[str] = None
    modified_by: Optional[str] = None
    platform_role: Optional[PlatformRoleResponse] = None

    class Config:
        from_attributes = True

class PlatformUserPaginatedResponse(BaseModel):
    total: int
    page: int
    limit: int
    total_pages: int
    users: List[PlatformUserResponse]

    class Config:
        from_attributes = True
