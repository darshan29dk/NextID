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

    smtp_host: Optional[str] = None
    smtp_port: Optional[int] = None
    smtp_username: Optional[str] = None
    # smtp_password intentionally omitted - never send the stored password
    # back to the frontend. smtp_password_set tells the UI whether one is
    # already configured, without exposing the value itself.
    smtp_password_set: bool = False
    smtp_from_email: Optional[str] = None
    smtp_from_name: Optional[str] = None
    smtp_use_tls: Optional[bool] = None

    company_display_name: Optional[str] = None
    logo_path: Optional[str] = None
    primary_color: Optional[str] = None

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

    smtp_host: Optional[str] = None
    smtp_port: Optional[int] = None
    smtp_username: Optional[str] = None
    smtp_password: Optional[str] = None
    smtp_from_email: Optional[str] = None
    smtp_from_name: Optional[str] = None
    smtp_use_tls: Optional[bool] = None

    company_display_name: Optional[str] = None
    primary_color: Optional[str] = None
