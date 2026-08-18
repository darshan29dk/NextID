from pydantic import BaseModel
from datetime import datetime
from typing import List, Optional, Dict, Any

class IdentityResponse(BaseModel):
    id: int
    employee_id: Optional[str] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    display_name: Optional[str] = None
    email: Optional[str] = None
    department: Optional[str] = None
    org: Optional[str] = None
    job_title: Optional[str] = None
    manager: Optional[str] = None
    status: str
    max_delegation_depth: Optional[int] = None
    attributes: Optional[Dict[str, Any]] = None
    source_connector_id: Optional[int] = None
    source_connector_name: Optional[str] = None
    imported_at: datetime
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

class IdentityPaginatedResponse(BaseModel):
    total: int
    page: int
    limit: int
    total_pages: int
    identities: List[IdentityResponse]

class IdentityCreate(BaseModel):
    employee_id: Optional[str] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    display_name: Optional[str] = None
    email: Optional[str] = None
    department: Optional[str] = None
    org: Optional[str] = None
    job_title: Optional[str] = None
    manager: Optional[str] = None
    status: Optional[str] = "Active"
    max_delegation_depth: Optional[int] = None
