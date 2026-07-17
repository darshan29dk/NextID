from pydantic import BaseModel
from typing import Optional
from datetime import datetime

class GovernanceDashboardPreferencesBase(BaseModel):
    default_filters: Optional[str] = None
    favorite_widgets: Optional[str] = None
    layout: Optional[str] = None
    theme: Optional[str] = "dark"

class GovernanceDashboardPreferencesUpdate(GovernanceDashboardPreferencesBase):
    pass

class GovernanceDashboardPreferencesResponse(GovernanceDashboardPreferencesBase):
    id: str
    user_id: int
    last_updated: datetime

    class Config:
        from_attributes = True
