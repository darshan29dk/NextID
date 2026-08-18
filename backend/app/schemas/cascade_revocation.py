from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime

class RevocationEventCreate(BaseModel):
    source_identity_id: int
    trigger_type: Optional[str] = "MANUAL"
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

class RevocationStatsResponse(BaseModel):
    total_events: int
    avg_seconds: float
    p95_seconds: float
    worst_case_seconds: float
    events_with_failures: int

class SimulationAffectedIdentity(BaseModel):
    identity_id: int
    display_name: str
    identity_type: str
    hop_depth: int

class RevocationSimulationResponse(BaseModel):
    source_identity_id: int
    would_affect_count: int
    max_hop_depth: int
    affected_identities: List[SimulationAffectedIdentity]
    warnings: List[str]

class DelegationLinkCreate(BaseModel):
    parent_identity_id: int
    child_identity_id: int
    delegation_type: Optional[str] = "DELEGATE"
    origin_org: Optional[str] = None

class DelegationLinkResponse(BaseModel):
    id: int
    parent_identity_id: int
    child_identity_id: int
    delegation_type: str
    origin_org: Optional[str] = None
    status: str
    created_at: datetime

    class Config:
        from_attributes = True
