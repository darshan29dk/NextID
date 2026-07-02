from pydantic import BaseModel
from datetime import datetime
from typing import List, Dict

class DepartmentCoverageData(BaseModel):
    department: str
    coverage: int
    target: int

class ApplicationDistributionData(BaseModel):
    name: str
    accounts: int
    max: int
    color: str

class RoleLifecycleData(BaseModel):
    label: str
    count: int
    total: int
    color: str

class MiningTrendPoint(BaseModel):
    month: str
    candidates: int
    published: int

    class Config:
        from_attributes = True

class DashboardStatsResponse(BaseModel):
    totalUsers: int
    accounts: int
    applications: int
    entitlements: int
    candidateRoles: int
    publishedRoles: int
    birthrightRoles: int
    sodConflicts: int
    pendingApprovals: int
    departmentCoverage: List[DepartmentCoverageData]
    riskDistribution: Dict[str, int]
    applicationDistribution: List[ApplicationDistributionData]
    roleLifecycle: List[RoleLifecycleData]
    miningTrend: List[MiningTrendPoint]

    class Config:
        from_attributes = True
        populate_by_name = True

class RecentActivityResponse(BaseModel):
    id: int
    user: str
    action: str
    status: str
    created_at: datetime

    class Config:
        from_attributes = True

class ApprovalQueueResponse(BaseModel):
    id: int
    role_name: str
    requester: str
    due_in_days: int
    risk_level: str

    class Config:
        from_attributes = True

class SyncApiRequest(BaseModel):
    provider: str
    apiKey: str

