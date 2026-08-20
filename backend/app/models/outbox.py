import uuid
from datetime import datetime
from sqlalchemy import Column, String, Text, DateTime, Integer
from app.database import Base

class OutboxEvent(Base):
    """
    Transactional Outbox model ensuring at-least-once publishing of revocation events and jobs.
    """
    __tablename__ = "outbox_events"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()), index=True)
    tenant_id = Column(String(50), nullable=False, default="default_tenant", index=True)
    aggregate_type = Column(String(50), nullable=False, index=True)  # REVOCATION_EVENT, REVOCATION_JOB
    aggregate_id = Column(String(100), nullable=False, index=True)
    event_type = Column(String(100), nullable=False)
    payload_json = Column(Text, nullable=False)
    
    status = Column(String(30), nullable=False, default="PENDING_PUBLISH", index=True)  # PENDING_PUBLISH, PUBLISHED, FAILED_PUBLISH
    claimed_by = Column(String(100), nullable=True, index=True)
    lease_expires_at = Column(DateTime, nullable=True)
    published_at = Column(DateTime, nullable=True)
    
    retry_count = Column(Integer, default=0, nullable=False)
    max_retries = Column(Integer, default=5, nullable=False)
    error_log = Column(Text, nullable=True)
    
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
