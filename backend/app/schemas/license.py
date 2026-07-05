from pydantic import BaseModel, field_validator, model_validator
from datetime import datetime, date
from typing import Optional, List

PLAN_TYPES = ["Trial", "Standard", "Enterprise"]

class LicenseBase(BaseModel):
    company_name: str
    license_key: str
    plan_type: str
    valid_from: date
    valid_until: date
    max_users: int
    current_users: Optional[int] = 0

class LicenseCreate(LicenseBase):
    @field_validator('company_name', 'license_key')
    @classmethod
    def check_not_empty(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError('Field must not be empty or whitespace only')
        return v.strip()

    @field_validator('plan_type')
    @classmethod
    def check_plan_type(cls, v: str) -> str:
        if v not in PLAN_TYPES:
            raise ValueError(f"Plan type must be one of: {', '.join(PLAN_TYPES)}")
        return v

    @field_validator('max_users')
    @classmethod
    def check_max_users(cls, v: int) -> int:
        if v < 1:
            raise ValueError('Max users must be at least 1')
        return v

    @model_validator(mode='after')
    def check_dates_and_usage(self):
        if self.valid_until <= self.valid_from:
            raise ValueError('Valid Until date must be after Valid From date')
        if self.current_users and self.current_users > self.max_users:
            raise ValueError('Current users cannot exceed Max users')
        return self

class LicenseUpdate(BaseModel):
    company_name: Optional[str] = None
    license_key: Optional[str] = None
    plan_type: Optional[str] = None
    valid_from: Optional[date] = None
    valid_until: Optional[date] = None
    max_users: Optional[int] = None
    current_users: Optional[int] = None

    @field_validator('company_name', 'license_key')
    @classmethod
    def check_not_empty(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            if not v.strip():
                raise ValueError('Field must not be empty or whitespace only')
            return v.strip()
        return v

    @field_validator('plan_type')
    @classmethod
    def check_plan_type(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v not in PLAN_TYPES:
            raise ValueError(f"Plan type must be one of: {', '.join(PLAN_TYPES)}")
        return v

    @field_validator('max_users')
    @classmethod
    def check_max_users(cls, v: Optional[int]) -> Optional[int]:
        if v is not None and v < 1:
            raise ValueError('Max users must be at least 1')
        return v

class LicenseResponse(LicenseBase):
    id: int
    status: str  # computed: Active / Expired / Expiring Soon / Upcoming
    is_deleted: bool
    created_at: datetime
    updated_at: datetime
    created_by: Optional[str] = None
    modified_by: Optional[str] = None

    class Config:
        from_attributes = True

class LicensePaginatedResponse(BaseModel):
    total: int
    page: int
    limit: int
    total_pages: int
    licenses: List[LicenseResponse]

    class Config:
        from_attributes = True