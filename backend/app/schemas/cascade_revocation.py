from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime

class RevocationEventCreate(BaseModel):
    source_identity_id: int
    reason: Optional[str] = None

class CascadeActionResponse(BaseModel):
    id: int
    event_id: int
    target_type: str
    target_identifier: str
    action_type: Optional[str] = "REVOCATION"
    status: str
    hop_depth: Optional[int] = 0
    confirmed_at: Optional[datetime] = None
    retry_count: int
    error_message: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True

class RevocationEventResponse(BaseModel):
    id: int
    source_identity_id: int
    reason: Optional[str] = None
    status: str
    total_targets: int
    revoked_count: int
    failed_count: int
    duration_seconds: Optional[float] = 0.0
    created_at: datetime
    completed_at: Optional[datetime] = None
    actions: List[CascadeActionResponse] = []

    class Config:
        from_attributes = True

class RevocationEventStatusResponse(BaseModel):
    id: int
    status: str
    total_targets: int
    revoked_count: int
    failed_count: int
    duration_seconds: Optional[float] = 0.0

    class Config:
        from_attributes = True

class DelegationLinkCreate(BaseModel):
    parent_identity_id: int
    child_identity_id: int
    delegation_type: Optional[str] = "DELEGATE"

class DelegationLinkResponse(BaseModel):
    id: int
    parent_identity_id: int
    child_identity_id: int
    delegation_type: str
    status: str
    created_at: datetime

    class Config:
        from_attributes = True
