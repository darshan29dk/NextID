from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime


class AuditLogResponse(BaseModel):
    id: int
    module: str
    action: str
    performed_by: str
    old_value: Optional[str] = None
    new_value: Optional[str] = None
    timestamp: datetime

    class Config:
        from_attributes = True


class AuditLogPaginatedResponse(BaseModel):
    total: int
    page: int
    limit: int
    total_pages: int
    logs: List[AuditLogResponse]