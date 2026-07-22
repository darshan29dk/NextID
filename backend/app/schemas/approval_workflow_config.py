from pydantic import BaseModel
from datetime import datetime
from typing import List, Optional


class ApprovalWorkflowLevelBase(BaseModel):
    level_number: int = 1
    approver_type: str = "Manager of the user"
    specific_approver_id: Optional[int] = None
    specific_approver_name: Optional[str] = None
    specific_approver_email: Optional[str] = None
    timeout_hours: int = 48
    quorum: str = "ALL — every resolved approver must approve"
    fallback_action: str = "No fallback — remind approver & alert admins"


class ApprovalWorkflowLevelCreate(ApprovalWorkflowLevelBase):
    pass


class ApprovalWorkflowLevelResponse(ApprovalWorkflowLevelBase):
    id: int
    workflow_id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class ApprovalWorkflowConfigBase(BaseModel):
    name: str
    scope: str = "Default — all applications"
    risk_level: str = "ALL"
    workflow_mode: str = "Unified"
    description: Optional[str] = None
    is_active: bool = True
    is_default: bool = False


class ApprovalWorkflowConfigCreate(ApprovalWorkflowConfigBase):
    levels: List[ApprovalWorkflowLevelCreate] = []


class ApprovalWorkflowConfigUpdate(BaseModel):
    name: Optional[str] = None
    scope: Optional[str] = None
    risk_level: Optional[str] = None
    workflow_mode: Optional[str] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None
    is_default: Optional[bool] = None
    levels: Optional[List[ApprovalWorkflowLevelCreate]] = None


class ApprovalWorkflowConfigResponse(ApprovalWorkflowConfigBase):
    id: int
    created_at: datetime
    updated_at: datetime
    created_by: str
    modified_by: str
    levels: List[ApprovalWorkflowLevelResponse] = []

    class Config:
        from_attributes = True


class ApprovalWorkflowPaginatedResponse(BaseModel):
    total: int
    page: int
    limit: int
    total_pages: int
    workflows: List[ApprovalWorkflowConfigResponse]
