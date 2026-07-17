from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime

class SodPolicyRuleBase(BaseModel):
    application_name: str
    entitlement_one: str
    entitlement_two: str
    condition_type: str = "AND"  # AND, OR, NOT

class SodPolicyRuleCreate(SodPolicyRuleBase):
    pass

class SodPolicyRuleResponse(SodPolicyRuleBase):
    id: int
    policy_id: str
    created_date: datetime

    class Config:
        from_attributes = True

class SodPolicyBase(BaseModel):
    policy_name: str
    description: Optional[str] = None
    risk_level: str = "LOW"  # LOW, MEDIUM, HIGH, CRITICAL
    policy_type: str = "STATIC"  # STATIC, DYNAMIC
    status: str = "DRAFT"  # ACTIVE, INACTIVE, DRAFT, SUSPENDED, DEPRECATED
    business_owner: str
    approver: str

class SodPolicyCreate(SodPolicyBase):
    rules: List[SodPolicyRuleCreate]

class SodPolicyUpdate(SodPolicyBase):
    rules: List[SodPolicyRuleCreate]

class SodPolicyResponse(SodPolicyBase):
    id: str
    policy_code: str
    created_by: str
    created_date: datetime
    updated_by: Optional[str] = None
    updated_date: datetime
    version: int
    rules: List[SodPolicyRuleResponse] = []

    class Config:
        from_attributes = True

class SodPolicyAuditResponse(BaseModel):
    id: int
    policy_id: str
    action: str
    performed_by: str
    old_value: Optional[str] = None
    new_value: Optional[str] = None
    timestamp: datetime

    class Config:
        from_attributes = True

class SodPolicyListKPIs(BaseModel):
    total: int
    active: int
    inactive: int
    critical: int
    high: int
    draft: int

class SodPolicyListResponse(BaseModel):
    policies: List[SodPolicyResponse]
    total: int
    page: int
    limit: int
    kpis: SodPolicyListKPIs
