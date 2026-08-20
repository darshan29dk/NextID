import uuid
from datetime import datetime
from sqlalchemy import Column, String, Text, DateTime, Integer
from app.database import Base

class RevocationDLQ(Base):
    """
    Revocation Dead-Letter Queue (DLQ) model storing failed security operations for manual analysis & replay.
    """
    __tablename__ = "revocation_dlq"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()), index=True)
    tenant_id = Column(String(50), nullable=False, default="default_tenant", index=True)
    job_id = Column(String(36), nullable=True, index=True)
    event_id = Column(Integer, nullable=True, index=True)
    
    reason_code = Column(String(100), nullable=False, index=True)  # MAX_RETRIES_EXCEEDED, CIRCUIT_BREAKER_OPEN, PERMANENT_ERROR
    payload_json = Column(Text, nullable=False)
    error_message = Column(Text, nullable=True)
    
    status = Column(String(30), nullable=False, default="PENDING_REPLAY", index=True)  # PENDING_REPLAY, REPLAYED, DISCARDED
    replayed_at = Column(DateTime, nullable=True)
    replayed_by = Column(String(100), nullable=True)
    
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
