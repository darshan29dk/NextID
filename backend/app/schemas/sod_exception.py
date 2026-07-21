from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime

class SodExceptionApprovalBase(BaseModel):
    approver_name: str
    approval_level: str
    approval_status: str
    comments: Optional[str] = None

class SodExceptionApprovalResponse(SodExceptionApprovalBase):
    id: int
    exception_id: str
    approved_date: Optional[datetime] = None

    class Config:
        from_attributes = True

class SodExceptionCommentBase(BaseModel):
    comment: str
    is_internal: bool = False

class SodExceptionCommentCreate(SodExceptionCommentBase):
    pass

class SodExceptionCommentResponse(SodExceptionCommentBase):
    id: int
    exception_id: str
    created_by: str
    created_date: datetime

    class Config:
        from_attributes = True

class SodExceptionAttachmentResponse(BaseModel):
    id: int
    exception_id: str
    filename: str
    file_size: int
    uploaded_by: str
    uploaded_at: datetime

    class Config:
        from_attributes = True

class SodExceptionAuditResponse(BaseModel):
    id: int
    exception_id: str
    action: str
    performed_by: str
    old_value: Optional[str] = None
    new_value: Optional[str] = None
    timestamp: datetime

    class Config:
        from_attributes = True

class SodExceptionBase(BaseModel):
    exception_type: str = "TEMPORARY"  # TEMPORARY, PERMANENT
    business_justification: str
    compensating_controls: Optional[str] = None
    expiry_date: Optional[datetime] = None
    risk_acceptance: bool = False

class SodExceptionCreate(SodExceptionBase):
    violation_id: Optional[str] = None
    policy_id: str
    user_id: int
    employee_id: str
    username: str
    department: Optional[str] = None
    application_name: str

class SodExceptionUpdate(SodExceptionBase):
    status: Optional[str] = None

class SodExceptionResponse(SodExceptionBase):
    id: str
    exception_number: str
    violation_id: Optional[str] = None
    policy_id: str
    user_id: int
    employee_id: str
    username: str
    department: Optional[str] = None
    application_name: str
    requested_by: str
    requested_date: datetime
    approved_by: Optional[str] = None
    approved_date: Optional[datetime] = None
    reviewed_by: Optional[str] = None
    review_date: Optional[datetime] = None
    status: str
    renewal_count: int
    sla_due_date: Optional[datetime] = None
    is_sla_overdue: bool
    ai_risk_score: int
    ai_recommendation: Optional[str] = None
    needs_recertification: bool
    next_recertification_date: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime
    
    approvals: List[SodExceptionApprovalResponse] = []
    comments: List[SodExceptionCommentResponse] = []
    attachments: List[SodExceptionAttachmentResponse] = []

    class Config:
        from_attributes = True

class SodExceptionListResponse(BaseModel):
    exceptions: List[SodExceptionResponse]
    total: int
    page: int
    limit: int
