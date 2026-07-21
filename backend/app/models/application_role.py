from sqlalchemy import Column, Integer, String, DateTime, Boolean, JSON, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime
from app.database import Base

class ApplicationRole(Base):
    __tablename__ = "application_roles"

    id = Column(Integer, primary_key=True, index=True)
    application_id = Column(Integer, ForeignKey("applications.id"), index=True, nullable=False)
    role_name = Column(String(150), nullable=False)
    description = Column(String(255), nullable=True)
    raw_data = Column(JSON, nullable=True)

    imported_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    created_by = Column(String(100), default="System", nullable=False)
    modified_by = Column(String(100), default="System", nullable=False)
    is_deleted = Column(Boolean, default=False, nullable=False)

    application = relationship("Application", backref="roles")