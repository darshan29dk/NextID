import uuid
from datetime import datetime
from sqlalchemy import Column, String, Text, DateTime, Integer
from app.database import Base

class PoisonMessage(Base):
    """
    Poison Message model storing outbox events that fail 5 consecutive delivery attempts.
    """
    __tablename__ = "poison_messages"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()), index=True)
    tenant_id = Column(String(50), nullable=False, default="default_tenant", index=True)
    outbox_id = Column(String(36), nullable=False, index=True)
    
    aggregate_type = Column(String(50), nullable=False)
    aggregate_id = Column(String(100), nullable=False)
    payload_json = Column(Text, nullable=False)
    
    error_stack = Column(Text, nullable=True)
    failed_attempts = Column(Integer, default=5, nullable=False)
    
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
