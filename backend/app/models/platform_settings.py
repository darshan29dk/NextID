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
    updated_at = Column(DateTime, default=datetime.utcnow)
    updated_by = Column(String(100), nullable=True)