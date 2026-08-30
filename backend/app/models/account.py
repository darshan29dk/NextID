import uuid
from datetime import datetime
from sqlalchemy import Column, String, DateTime, ForeignKey, JSON
from sqlalchemy.orm import relationship
from app.database import Base

class Account(Base):
    """
    Normalized Account model representing a user or service account instance
    within an application or target provider system.
    """
    __tablename__ = "accounts"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()), index=True)
    tenant_id = Column(String(50), nullable=False, default="default_tenant", index=True)
    principal_id = Column(String(36), ForeignKey("principals.id", ondelete="CASCADE"), nullable=True, index=True)
    application_id = Column(String(36), nullable=True, index=True)
    external_account_id = Column(String(200), nullable=False, index=True)
    username = Column(String(200), nullable=False, index=True)
    status = Column(String(50), default="ACTIVE", nullable=False)  # ACTIVE, DISABLED, SUSPENDED, DELETED
    account_type = Column(String(50), default="HUMAN", nullable=False)  # HUMAN, SERVICE_ACCOUNT, WORKLOAD, AGENT, BOT
    
    raw_attributes = Column(JSON, nullable=True)
    
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    disabled_at = Column(DateTime, nullable=True)
    last_seen_at = Column(DateTime, nullable=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    principal = relationship("Principal", backref="accounts")
