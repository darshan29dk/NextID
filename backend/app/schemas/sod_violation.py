from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime

class SodViolationCommentBase(BaseModel):
    comment_text: str

class SodViolationCommentCreate(SodViolationCommentBase):
    pass

class SodViolationCommentResponse(SodViolationCommentBase):
    id: int
    violation_id: str
    created_by: str
    created_at: datetime

    class Config:
        from_attributes = True

class SodViolationAttachmentResponse(BaseModel):
    id: int
    violation_id: str
    filename: str
    file_size: int
    uploaded_by: str
    uploaded_at: datetime

    class Config:
        from_attributes = True

class SodViolationAuditResponse(BaseModel):
    id: int
    violation_id: str
    action: str
    performed_by: str
    old_value: Optional[str] = None
    new_value: Optional[str] = None
    timestamp: datetime

    class Config:
        from_attributes = True

class SodViolationBase(BaseModel):
    assigned_to: Optional[str] = None
    status: str = "OPEN"
    remarks: Optional[str] = None
    is_false_positive: bool = False
    false_positive_reason: Optional[str] = None

class SodViolationUpdate(SodViolationBase):
    pass

class SodViolationResponse(SodViolationBase):
    id: str
    policy_id: str
    policy_code: str
    policy_name: str
    user_id: int
    username: str
    display_name: Optional[str] = None
    department: Optional[str] = None
    manager: Optional[str] = None
    application_name: str
    entitlement_one: str
    entitlement_two: str
    risk_level: str
    severity: str
    detected_date: datetime
    resolved_date: Optional[datetime] = None
    resolved_by: Optional[str] = None
    scan_id: Optional[int] = None
    risk_score: int
    evidence: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    
    comments: List[SodViolationCommentResponse] = []
    attachments: List[SodViolationAttachmentResponse] = []

    class Config:
        from_attributes = True

class SodScanHistoryResponse(BaseModel):
    id: int
    scan_name: str
    scan_type: str
    started_by: str
    start_time: datetime
    end_time: Optional[datetime] = None
    total_users: int
    users_scanned: int
    violations_found: int
    status: str
    progress_pct: int

    class Config:
        from_attributes = True

class SodViolationListKPIs(BaseModel):
    total: int
    open: int
    critical: int
    high_risk_users: int
    resolved: int
    scans_today: int

class SodViolationListCharts(BaseModel):
    severity: dict
    department: dict
    application: dict

class SodViolationListResponse(BaseModel):
    violations: List[SodViolationResponse]
    total: int
    page: int
    limit: int
    kpis: SodViolationListKPIs
    charts: SodViolationListCharts
