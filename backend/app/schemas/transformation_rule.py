from pydantic import BaseModel
from datetime import datetime
from typing import Optional, List

class TransformationRuleBase(BaseModel):
    connector_id: int
    mapping_id: Optional[int] = None
    rule_name: str
    transformation_type: str
    expression: Optional[str] = None
    parameters: Optional[str] = None
    execution_order: Optional[int] = 0
    enabled: Optional[bool] = True

class TransformationRuleCreate(TransformationRuleBase):
    pass

class TransformationRuleUpdate(BaseModel):
    rule_name: Optional[str] = None
    transformation_type: Optional[str] = None
    expression: Optional[str] = None
    parameters: Optional[str] = None
    execution_order: Optional[int] = None
    enabled: Optional[bool] = None

class TransformationRuleResponse(TransformationRuleBase):
    id: int
    created_at: datetime
    updated_at: datetime
    created_by: str
    modified_by: str
    is_deleted: bool

    class Config:
        from_attributes = True

class TransformationRulePaginatedResponse(BaseModel):
    total: int
    page: int
    limit: int
    total_pages: int
    rules: List[TransformationRuleResponse]

class TestTransformationRequest(BaseModel):
    value: str
    transformation_type: str
    expression: Optional[str] = None
    parameters: Optional[str] = None

class TestTransformationResponse(BaseModel):
    success: bool
    output_value: Optional[str] = None
    error_message: Optional[str] = None
