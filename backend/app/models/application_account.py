from sqlalchemy import Column, Integer, String, DateTime, Boolean, JSON, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime
from app.database import Base

class ApplicationAccount(Base):
    __tablename__ = "application_accounts"

    id = Column(Integer, primary_key=True, index=True)
    application_id = Column(Integer, ForeignKey("applications.id"), nullable=False)
    account_id = Column(String(150), nullable=False)  # external identifier from source system
    account_name = Column(String(150), nullable=True)
    email = Column(String(150), nullable=True)
    status = Column(String(50), default="Active", nullable=False)  # "Active", "Inactive", "Disabled"
    raw_data = Column(JSON, nullable=True)  # full imported row, in case source has extra fields

    imported_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    created_by = Column(String(100), default="System", nullable=False)
    modified_by = Column(String(100), default="System", nullable=False)
    is_deleted = Column(Boolean, default=False, nullable=False)

    application = relationship("Application", backref="accounts")