from pydantic import BaseModel
from datetime import datetime
from typing import Optional

class ConnectorFieldMappingCreate(BaseModel):
    connector_id: Optional[int] = None
    source_field: str
    target_module: str
    target_attribute_name: str
    transformation_type: Optional[str] = None

class ConnectorFieldMappingResponse(BaseModel):
    id: int
    connector_id: int
    source_field: str
    target_module: str
    target_attribute_name: str
    transformation_type: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    created_by: Optional[str] = None
    modified_by: Optional[str] = None

    class Config:
        from_attributes = True