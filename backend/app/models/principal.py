import uuid
from datetime import datetime
from sqlalchemy import Column, String, Text, DateTime, Integer, Boolean
from app.database import Base

class Principal(Base):
    """
    Abstract Principal Authority model for Humans, AI Agents, and Service Accounts.
    Holds monotonic authority_epoch and is_frozen cascade flag.
    """
    __tablename__ = "principals"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()), index=True)
    tenant_id = Column(String(50), nullable=False, default="default_tenant", index=True)
    principal_type = Column(String(50), nullable=False, index=True)  # HUMAN, AI_AGENT, SERVICE_ACCOUNT
    
    display_name = Column(String(200), nullable=False)
    email = Column(String(200), nullable=True, index=True)
    
    authority_epoch = Column(Integer, default=1, nullable=False)
    status = Column(String(50), default="ACTIVE", nullable=False)  # ACTIVE, FROZEN, REVOKING, REVOKED, SUSPENDED, EXPIRED
    is_frozen = Column(Boolean, default=False, nullable=False)
    
    sponsor_id = Column(String(100), nullable=True)  # Owner/Sponsor identity ID for autonomous agents
    valid_from = Column(DateTime, default=datetime.utcnow, nullable=False)
    expires_at = Column(DateTime, nullable=True)
    
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
