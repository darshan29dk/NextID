from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Boolean
from sqlalchemy.orm import relationship
from datetime import datetime
from app.database import Base

class PlatformUser(Base):
    __tablename__ = "platform_users"

    id = Column(Integer, primary_key=True, index=True)
    employee_id = Column(String(50), unique=True, index=True, nullable=False)
    first_name = Column(String(100), nullable=False)
    last_name = Column(String(100), nullable=False)
    email = Column(String(150), unique=True, index=True, nullable=False)
    phone = Column(String(50), nullable=True)
    department = Column(String(100), index=True, nullable=True)
    job_title = Column(String(100), nullable=True)
    business_role = Column(String(100), nullable=True)
    platform_role_id = Column(Integer, ForeignKey("platform_roles.id"), nullable=True)
    status = Column(String(50), index=True, default="Active")
    manager = Column(String(100), nullable=True)
    is_deleted = Column(Boolean, index=True, default=False)
    last_login = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    created_by = Column(String(100), default="System", nullable=True)
    modified_by = Column(String(100), default="System", nullable=True)

    # Establish relation to PlatformRole
    platform_role = relationship("PlatformRole")
