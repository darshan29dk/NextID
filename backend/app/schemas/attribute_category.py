from pydantic import BaseModel, field_validator
from datetime import datetime
from typing import Optional, List

class AttributeCategoryBase(BaseModel):
    category_name: str
    description: Optional[str] = None

class AttributeCategoryCreate(AttributeCategoryBase):
    @field_validator('category_name')
    @classmethod
    def check_not_empty(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError('Category Name must not be empty or whitespace only')
        return v.strip()

class AttributeCategoryUpdate(BaseModel):
    category_name: Optional[str] = None
    description: Optional[str] = None

    @field_validator('category_name')
    @classmethod
    def check_not_empty(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            if not v.strip():
                raise ValueError('Category Name must not be empty or whitespace only')
            return v.strip()
        return v

class AttributeCategoryResponse(AttributeCategoryBase):
    id: int
    is_deleted: bool
    created_at: datetime
    updated_at: datetime
    created_by: Optional[str] = None
    modified_by: Optional[str] = None

    class Config:
        from_attributes = True