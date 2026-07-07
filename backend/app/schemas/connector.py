from pydantic import BaseModel, Field
from datetime import datetime
from typing import List, Optional

# --- Logs & Files ---
class ConnectorLogResponse(BaseModel):
    id: int
    connector_id: int
    action: str
    details: Optional[str] = None
    status: str
    timestamp: datetime

    class Config:
        from_attributes = True

class ConnectorFileResponse(BaseModel):
    id: int
    connector_id: int
    file_name: str
    file_type: str
    file_size: int
    upload_date: datetime
    uploaded_by: str

    class Config:
        from_attributes = True

# --- Base Schema ---
class ConnectorBase(BaseModel):
    connector_name: str
    connector_type: str  # "CSV", "Excel", "Database"
    description: Optional[str] = None
    status: Optional[str] = "Draft"
    health_status: Optional[str] = "Unknown"
    environment: Optional[str] = "Development"
    auth_type: Optional[str] = "Basic"
    tags: Optional[str] = None
    database_type: Optional[str] = None
    host: Optional[str] = None
    port: Optional[int] = None
    database_name: Optional[str] = None
    username: Optional[str] = None
    password: Optional[str] = None  # Transmitted plain in creation, encrypted on write
    ssl_enabled: Optional[bool] = False
    connection_timeout: Optional[int] = 30
    csv_delimiter: Optional[str] = ","
    csv_encoding: Optional[str] = "UTF-8"
    excel_sheet_name: Optional[str] = None
    file_path: Optional[str] = None

# --- Create & Update ---
class ConnectorCreate(ConnectorBase):
    pass

class ConnectorUpdate(BaseModel):
    connector_name: Optional[str] = None
    connector_type: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    health_status: Optional[str] = None
    environment: Optional[str] = None
    auth_type: Optional[str] = None
    tags: Optional[str] = None
    database_type: Optional[str] = None
    host: Optional[str] = None
    port: Optional[int] = None
    database_name: Optional[str] = None
    username: Optional[str] = None
    password: Optional[str] = None
    ssl_enabled: Optional[bool] = None
    connection_timeout: Optional[int] = None
    csv_delimiter: Optional[str] = None
    csv_encoding: Optional[str] = None
    excel_sheet_name: Optional[str] = None
    file_path: Optional[str] = None

# --- Read Response (Masks Password) ---
class ConnectorResponse(BaseModel):
    id: int
    connector_name: str
    connector_type: str
    description: Optional[str] = None
    status: str
    health_status: str
    environment: str
    auth_type: str
    tags: Optional[str] = None
    version: int
    database_type: Optional[str] = None
    host: Optional[str] = None
    port: Optional[int] = None
    database_name: Optional[str] = None
    username: Optional[str] = None
    # Password is explicitly omitted for security
    ssl_enabled: bool
    connection_timeout: Optional[int] = None
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
class ConnectorPaginatedResponse(BaseModel):
    total: int
    page: int
    limit: int
    total_pages: int
    connectors: List[ConnectorResponse]

# --- Bulk Operations ---
class BulkDeleteRequest(BaseModel):
    ids: List[int]

class BulkStatusUpdateRequest(BaseModel):
    ids: List[int]
    status: str  # e.g. "Draft", "Configured", "Connected", "Failed", "Disabled"

class BulkStatusUpdateResponse(BaseModel):
    updated_count: int
