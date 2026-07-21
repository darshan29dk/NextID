from pydantic import BaseModel
from datetime import datetime
from typing import Optional, List

class ValidationRuleBase(BaseModel):
    connector_id: int
    mapping_id: Optional[int] = None
    rule_name: str
    validation_type: str
    parameters: Optional[str] = None
    severity: Optional[str] = "Error"
    error_message: str
    enabled: Optional[bool] = True
    execution_order: Optional[int] = 0

class ValidationRuleCreate(ValidationRuleBase):
    pass

class ValidationRuleUpdate(BaseModel):
    rule_name: Optional[str] = None
    validation_type: Optional[str] = None
    parameters: Optional[str] = None
    severity: Optional[str] = None
    error_message: Optional[str] = None
    enabled: Optional[bool] = None
    execution_order: Optional[int] = None

class ValidationRuleResponse(ValidationRuleBase):
    id: int
    created_at: datetime
    updated_at: datetime
    created_by: str
    modified_by: str
    is_deleted: bool

    class Config:
        from_attributes = True

class ValidationRulePaginatedResponse(BaseModel):
    total: int
    page: int
    limit: int
    total_pages: int
    rules: List[ValidationRuleResponse]

class TestValidationRequest(BaseModel):
    value: str
    validation_type: str
    parameters: Optional[str] = None

class TestValidationResponse(BaseModel):
    success: bool
    status: str  # "Valid", "Warning", "Error"
    message: Optional[str] = None
