from pydantic import BaseModel, field_validator
from datetime import datetime
from typing import Optional, List


class MiningCampaignCreate(BaseModel):
    campaign_name: str
    description: Optional[str] = None
    scope_type: str = "All"  # "All" or "Application"
    application_id: Optional[int] = None
    eps: float = 0.4
    min_samples: int = 2

    @field_validator("campaign_name")
    @classmethod
    def check_name(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("Campaign name is required")
        return v.strip()

    @field_validator("scope_type")
    @classmethod
    def check_scope(cls, v: str) -> str:
        if v not in ("All", "Application"):
            raise ValueError("scope_type must be 'All' or 'Application'")
        return v


class MiningCampaignResponse(BaseModel):
    id: int
    campaign_name: str
    description: Optional[str] = None
    scope_type: str
    application_id: Optional[int] = None
    eps: float
    min_samples: int
    status: str
    error_message: Optional[str] = None
    total_accounts_analyzed: int
    total_candidate_roles: int
    total_outliers: int
    coverage_percentage: float
    identities_analyzed: int = 0
    applications_analyzed: int = 0
    entitlements_analyzed: int = 0
    avg_confidence_score: float = 0.0
    last_run_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime
    created_by: Optional[str] = None
    modified_by: Optional[str] = None

    class Config:
        from_attributes = True


class MiningCampaignPaginatedResponse(BaseModel):
    total: int
    page: int
    limit: int
    total_pages: int
    campaigns: List[MiningCampaignResponse]

    class Config:
        from_attributes = True
