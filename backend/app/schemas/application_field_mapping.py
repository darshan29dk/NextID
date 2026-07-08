from pydantic import BaseModel
from datetime import datetime
from typing import List, Optional

class ApplicationFieldMappingItem(BaseModel):
    source_field: str
    target_module: str  # "Account", "Entitlement", "Role"
    target_attribute_name: str
    transformation_type: Optional[str] = None

class ApplicationFieldMappingResponse(BaseModel):
    id: int
    application_id: int
    source_field: str
    target_module: str
    target_attribute_name: str
    transformation_type: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True