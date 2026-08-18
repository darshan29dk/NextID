from sqlalchemy import Column, Integer, String, Text, DateTime
from datetime import datetime
from app.database import Base

class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, index=True)
    module = Column(String(100), default="Platform Roles", nullable=False)
    action = Column(String(100), nullable=False)
    performed_by = Column(String(100), nullable=False)
    old_value = Column(Text, nullable=True) # Storing JSON representation of old state
    new_value = Column(Text, nullable=True) # Storing JSON representation of new state
    timestamp = Column(DateTime, default=datetime.utcnow, nullable=False)
    record_hash = Column(String(128), nullable=True)
