from sqlalchemy import Column, Integer, String, DateTime, Boolean
from datetime import datetime
from app.database import Base

class PlatformSettings(Base):
    __tablename__ = "platform_settings"

    id = Column(Integer, primary_key=True, index=True)
    app_name = Column(String(100), default="rAnalyzer")
    support_email = Column(String(150), default="")
    default_timezone = Column(String(50), default="Asia/Kolkata")
    session_timeout_minutes = Column(Integer, default=15)
    otp_expiry_minutes = Column(Integer, default=10)
    default_theme = Column(String(20), default="light")
    maintenance_mode = Column(Boolean, default=False)

    # SMTP Settings - used for sending OTP/notification emails. Previously
    # this only existed as hardcoded env vars in auth.py; now configurable
    # from the Settings page instead of needing a backend redeploy.
    smtp_host = Column(String(150), nullable=True)
    smtp_port = Column(Integer, default=587)
    smtp_username = Column(String(150), nullable=True)
    smtp_password = Column(String(255), nullable=True)
    smtp_from_email = Column(String(150), nullable=True)
    smtp_from_name = Column(String(100), nullable=True)
    smtp_use_tls = Column(Boolean, default=True)

    # Personalization - company branding shown on the login page and header.
    company_display_name = Column(String(150), nullable=True)
    logo_path = Column(String(500), nullable=True)
    primary_color = Column(String(20), nullable=True)  # hex, e.g. "#4a90d9"

    updated_at = Column(DateTime, default=datetime.utcnow)
    updated_by = Column(String(100), nullable=True)