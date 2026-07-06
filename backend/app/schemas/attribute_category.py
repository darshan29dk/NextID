from pydantic import BaseModel
from datetime import datetime
from typing import Optional

class AttributeCategoryBase(BaseModel):
    category_name: str
    description: Optional[str] = None

class AttributeCategoryCreate(AttributeCategoryBase):
    pass

class AttributeCategoryResponse(AttributeCategoryBase):
    id: int
    is_deleted: bool
    created_at: datetime
    updated_at: datetime
    created_by: Optional[str] = None
    modified_by: Optional[str] = None

    class Config:
        from_attributes = True
