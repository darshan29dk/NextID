from pydantic import BaseModel
from datetime import datetime
from typing import Optional, List, Dict

class ImportPreviewResponse(BaseModel):
    id: int
    connector_id: int
    record_number: int
    source_data: str
    transformed_data: str
    validation_result: Optional[str] = None
    status: str
    errors: Optional[str] = None
    warnings: Optional[str] = None
    previewed_at: datetime

    class Config:
        from_attributes = True

class PreviewSummaryFieldStats(BaseModel):
    field_name: str
    errors_count: int
    warnings_count: int
    total_failures: int

class PreviewSummaryResponse(BaseModel):
    total_records: int
    valid_records: int
    warning_records: int
    error_records: int
    field_stats: List[PreviewSummaryFieldStats]

class ImportPreviewPaginatedResponse(BaseModel):
    total: int
    page: int
    limit: int
    total_pages: int
    summary: PreviewSummaryResponse
    records: List[ImportPreviewResponse]
