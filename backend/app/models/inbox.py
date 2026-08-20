import uuid
from datetime import datetime
from sqlalchemy import Column, String, DateTime, UniqueConstraint
from app.database import Base

class InboxMessage(Base):
    """
    Consumer Inbox model ensuring zero-duplicate execution for at-least-once queue dispatches.
    """
    __tablename__ = "inbox_messages"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()), index=True)
    tenant_id = Column(String(50), nullable=False, default="default_tenant", index=True)
    message_id = Column(String(100), nullable=False, index=True)
    consumer_id = Column(String(100), nullable=False, default="revocation_worker")
    
    status = Column(String(30), nullable=False, default="PROCESSED")
    lease_expires_at = Column(DateTime, nullable=True)
    processed_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    __table_args__ = (
        UniqueConstraint("tenant_id", "message_id", name="uq_tenant_message_id"),
    )
