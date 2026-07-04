from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class PlatformSettingsResponse(BaseModel):
    id: int
    app_name: str
    support_email: str
    default_timezone: str
    session_timeout_minutes: int
    otp_expiry_minutes: int
    default_theme: str
    maintenance_mode: bool
    updated_at: datetime
    updated_by: Optional[str] = None

    class Config:
        from_attributes = True


class PlatformSettingsUpdate(BaseModel):
    app_name: Optional[str] = None
    support_email: Optional[str] = None
    default_timezone: Optional[str] = None
    session_timeout_minutes: Optional[int] = None
    otp_expiry_minutes: Optional[int] = None
    default_theme: Optional[str] = None
    maintenance_mode: Optional[bool] = None