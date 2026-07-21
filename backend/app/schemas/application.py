from pydantic import BaseModel
from datetime import datetime
from typing import List, Optional

# --- Base Schema ---
class ApplicationBase(BaseModel):
    application_name: str
    application_type: str  # "CSV", "Excel"
    description: Optional[str] = None
    status: Optional[str] = "Draft"
    health_status: Optional[str] = "Unknown"
    environment: Optional[str] = "Development"
    tags: Optional[str] = None
    csv_delimiter: Optional[str] = ","
    csv_encoding: Optional[str] = "UTF-8"
    excel_sheet_name: Optional[str] = None
    file_path: Optional[str] = None

# --- Create & Update ---
class ApplicationCreate(ApplicationBase):
    pass

class ApplicationUpdate(BaseModel):
    application_name: Optional[str] = None
    application_type: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    health_status: Optional[str] = None
    environment: Optional[str] = None
    tags: Optional[str] = None
    csv_delimiter: Optional[str] = None
    csv_encoding: Optional[str] = None
    excel_sheet_name: Optional[str] = None
    file_path: Optional[str] = None

# --- Read Response ---
class ApplicationResponse(BaseModel):
    id: int
    application_name: str
    application_type: str
    description: Optional[str] = None
    status: str
    health_status: str
    environment: str
    tags: Optional[str] = None
    version: int
    csv_delimiter: Optional[str] = None
    csv_encoding: Optional[str] = None
    excel_sheet_name: Optional[str] = None
    file_path: Optional[str] = None
    success_count: int
    failure_count: int
    last_sync_duration: Optional[int] = None
    created_at: datetime
    updated_at: datetime
    created_by: str
    modified_by: str
    last_tested: Optional[datetime] = None
    last_sync: Optional[datetime] = None
    is_deleted: bool

    class Config:
        from_attributes = True

# --- Paginated Response ---
class ApplicationPaginatedResponse(BaseModel):
    total: int
    page: int
    limit: int
    total_pages: int
    applications: List[ApplicationResponse]

# --- Bulk Operations ---
class BulkDeleteRequest(BaseModel):
    ids: List[int]

class BulkStatusUpdateRequest(BaseModel):
    ids: List[int]
    status: str

class BulkStatusUpdateResponse(BaseModel):
    updated_count: int