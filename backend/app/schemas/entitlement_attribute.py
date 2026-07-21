from pydantic import BaseModel, Field, field_validator
from datetime import datetime
from typing import Optional, List
from app.schemas.attribute_category import AttributeCategoryResponse

class EntitlementAttributeBase(BaseModel):
    attribute_name: str
    display_name: str
    description: Optional[str] = None
    category_id: Optional[int] = None
    application_name: Optional[str] = None
    entitlement_type: Optional[str] = None
    attribute_type: Optional[str] = "Custom" # "System", "Custom"
    data_type: str # String, Integer, Boolean, Date, DateTime, Email, Phone, Dropdown, Multi Select, Number, Text Area
    default_value: Optional[str] = None
    validation_rule: Optional[str] = None
    display_order: Optional[int] = 0
    is_required: Optional[bool] = False
    is_unique: Optional[bool] = False
    is_searchable: Optional[bool] = False
    is_editable: Optional[bool] = True
    status: Optional[str] = "Active" # "Active", "Inactive", "Deprecated"
    is_system: Optional[bool] = False

class EntitlementAttributeCreate(EntitlementAttributeBase):
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

    @field_validator('display_order')
    @classmethod
    def validate_display_order(cls, v: Optional[int]) -> Optional[int]:
        if v is not None and v < 0:
            raise ValueError('Display order must be a non-negative integer')
        return v

class EntitlementAttributeUpdate(BaseModel):
    attribute_name: Optional[str] = None
    display_name: Optional[str] = None
    description: Optional[str] = None
    category_id: Optional[int] = None
    application_name: Optional[str] = None
    entitlement_type: Optional[str] = None
    attribute_type: Optional[str] = None
    data_type: Optional[str] = None
    default_value: Optional[str] = None
    validation_rule: Optional[str] = None
    display_order: Optional[int] = None
    is_required: Optional[bool] = None
    is_unique: Optional[bool] = None
    is_searchable: Optional[bool] = None
    is_editable: Optional[bool] = None
    status: Optional[str] = None
    is_system: Optional[bool] = None

    @field_validator('attribute_name', 'display_name', 'data_type')
    @classmethod
    def check_not_empty(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            if not v.strip():
                raise ValueError('Field must not be empty or whitespace only')
            return v.strip()
        return v

    @field_validator('display_order')
    @classmethod
    def validate_display_order(cls, v: Optional[int]) -> Optional[int]:
        if v is not None and v < 0:
            raise ValueError('Display order must be a non-negative integer')
        return v

class EntitlementAttributeResponse(EntitlementAttributeBase):
    id: int
    is_deleted: bool
    created_at: datetime
    updated_at: datetime
    created_by: Optional[str] = None
    modified_by: Optional[str] = None
    category: Optional[AttributeCategoryResponse] = None

    class Config:
        from_attributes = True

class EntitlementAttributePaginatedResponse(BaseModel):
    total: int
    page: int
    limit: int
    total_pages: int
    attributes: List[EntitlementAttributeResponse]

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

class AttributeUsageInfo(BaseModel):
    roles_count: int = 0
    systems_count: int = 0
    policies_count: int = 0
    active_mappings_count: int = 0

class EntitlementAttributeDetailResponse(BaseModel):
    attribute: EntitlementAttributeResponse
    audit_history: List[AuditLogSchema]
    usage: Optional[AttributeUsageInfo] = None

    class Config:
        from_attributes = True

class EntitlementAttributeBulkStatusRequest(BaseModel):
    ids: List[int]
    status: str

    @field_validator('status')
    @classmethod
    def validate_status(cls, v: str) -> str:
        valid_statuses = {"Active", "Inactive", "Deprecated"}
        if v not in valid_statuses:
            raise ValueError(f'Status must be one of: {", ".join(valid_statuses)}')
        return v

class EntitlementAttributeBulkDeleteRequest(BaseModel):
    ids: List[int]
