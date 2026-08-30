import uuid
from datetime import datetime
from sqlalchemy import Column, String, Text, DateTime, JSON
from app.database import Base

class LifecycleEvent(Base):
    """
    Model representing Joiner-Mover-Leaver (JML) lifecycle events.
    """
    __tablename__ = "lifecycle_events"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()), index=True)
    tenant_id = Column(String(50), nullable=False, default="default_tenant", index=True)
    principal_id = Column(String(36), nullable=False, index=True)
    
    event_type = Column(String(50), nullable=False, index=True)  # JOINER, MOVER, LEAVER, REHIRE
    source = Column(String(100), default="HRMS", nullable=False)
    external_event_id = Column(String(200), nullable=True, index=True)
    
    effective_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    payload_hash = Column(String(64), nullable=True)
    payload = Column(JSON, nullable=True)
    
    status = Column(String(50), default="PROCESSED", nullable=False)  # RECEIVED, PROCESSING, PROCESSED, FAILED
    error_details = Column(Text, nullable=True)
    
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
