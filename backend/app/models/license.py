from sqlalchemy import Column, Integer, String, DateTime, Date, Boolean
from datetime import datetime
from app.database import Base

class License(Base):
    __tablename__ = "licenses"

    id = Column(Integer, primary_key=True, index=True)
    company_name = Column(String(150), nullable=False, index=True)
    license_key = Column(String(100), unique=True, index=True, nullable=False)
    plan_type = Column(String(50), index=True, nullable=False)  # Trial / Standard / Enterprise
    valid_from = Column(Date, nullable=False)
    valid_until = Column(Date, nullable=False)
    max_users = Column(Integer, nullable=False)
    current_users = Column(Integer, default=0, nullable=False)
    is_deleted = Column(Boolean, index=True, default=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    created_by = Column(String(100), default="System", nullable=True)
    modified_by = Column(String(100), default="System", nullable=True)