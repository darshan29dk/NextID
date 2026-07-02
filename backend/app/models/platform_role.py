from sqlalchemy import Column, Integer, String, DateTime, Boolean
from datetime import datetime
from app.database import Base

class PlatformRole(Base):
    __tablename__ = "platform_roles"

    id = Column(Integer, primary_key=True, index=True)
    role_code = Column(String(50), unique=True, index=True, nullable=False)
    role_name = Column(String(100), unique=True, index=True, nullable=False)
    description = Column(Text, nullable=False)
    role_type = Column(String(50), index=True, nullable=False) # "System", "Business", "Application", "Technical", "Shared"
    risk_level = Column(String(50), index=True, nullable=False) # "Low", "Medium", "High", "Critical"
    status = Column(String(50), index=True, default="Active", nullable=False) # "Draft", "Active", "Inactive", "Deprecated"
    approval_required = Column(Boolean, default=False, nullable=False)
    is_system_role = Column(Boolean, default=False, nullable=False)
    is_deleted = Column(Boolean, index=True, default=False, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    created_by = Column(String(100), default="System", nullable=False)
    modified_by = Column(String(100), default="System", nullable=False)
