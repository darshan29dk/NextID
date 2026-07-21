from pydantic import BaseModel, Field, field_validator
from datetime import datetime
from typing import Optional, List
from app.schemas.attribute_category import AttributeCategoryResponse

class IdentityAttributeBase(BaseModel):
    attribute_name: str
    display_name: str
    description: Optional[str] = None
    attribute_type: str = "Custom" # "System", "Custom"
    data_type: str # String, Integer, Boolean, Date, DateTime, Email, Phone, Dropdown, Multi Select, Number, Text Area
    is_required: Optional[bool] = False
    is_unique: Optional[bool] = False
    is_searchable: Optional[bool] = False
    is_editable: Optional[bool] = True
    default_value: Optional[str] = None
    display_order: Optional[int] = 0
    status: Optional[str] = "Active" # "Active", "Inactive", "Deprecated"
    category_id: Optional[int] = None
    validation_rule: Optional[str] = None

class IdentityAttributeCreate(IdentityAttributeBase):
    @field_validator('attribute_name', 'display_name', 'data_type')
    @classmethod
    def check_not_empty(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError('Field must not be empty or whitespace only')
        return v.strip()

    @field_validator('data_type')
    @classmethod
    def validate_data_type(cls, v: str) -> str:
        valid_types = {
            "String", "Integer", "Boolean", "Date", "DateTime",
            "Email", "Phone", "Dropdown", "Multi Select", "Number", "Text Area"
        }
        if v not in valid_types:
            raise ValueError(f'Data type must be one of: {", ".join(valid_types)}')
        return v

    @field_validator('status')
    @classmethod
    def validate_status(cls, v: Optional[str]) -> Optional[str]:
        if v:
            valid_statuses = {"Active", "Inactive", "Deprecated"}
            if v not in valid_statuses:
                raise ValueError(f'Status must be one of: {", ".join(valid_statuses)}')
        return v

class IdentityAttributeUpdate(BaseModel):
    attribute_name: Optional[str] = None
    display_name: Optional[str] = None
    description: Optional[str] = None
    attribute_type: Optional[str] = None
    data_type: Optional[str] = None
    is_required: Optional[bool] = None
    is_unique: Optional[bool] = None
    is_searchable: Optional[bool] = None
    is_editable: Optional[bool] = None
    default_value: Optional[str] = None
    display_order: Optional[int] = None
    status: Optional[str] = None
    category_id: Optional[int] = None
    validation_rule: Optional[str] = None

    @field_validator('attribute_name', 'display_name', 'data_type')
    @classmethod
    def check_not_empty(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            if not v.strip():
                raise ValueError('Field must not be empty or whitespace only')
            return v.strip()
        return v

class IdentityAttributeResponse(IdentityAttributeBase):
    id: int
    is_deleted: bool
    created_at: datetime
    updated_at: datetime
    created_by: Optional[str] = None
    modified_by: Optional[str] = None
    category: Optional[AttributeCategoryResponse] = None

    class Config:
        from_attributes = True

class IdentityAttributePaginatedResponse(BaseModel):
    total: int
    page: int
    limit: int
    total_pages: int
    attributes: List[IdentityAttributeResponse]

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

class IdentityAttributeDetailResponse(BaseModel):
    attribute: IdentityAttributeResponse
    audit_history: List[AuditLogSchema]

    class Config:
        from_attributes = True
