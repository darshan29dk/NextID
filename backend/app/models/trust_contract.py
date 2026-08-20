import uuid
from datetime import datetime
from sqlalchemy import Column, String, Text, DateTime, Integer, Boolean
from app.database import Base

class TrustContract(Base):
    """
    Trust Contract model defining allowed external partner org boundaries and delegation rules.
    """
    __tablename__ = "trust_contracts"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()), index=True)
    tenant_id = Column(String(50), nullable=False, default="default_tenant", index=True)
    partner_org_name = Column(String(150), nullable=False, index=True)
    description = Column(Text, nullable=True)
    
    allowed_resources_json = Column(Text, nullable=True)
    max_ttl_seconds = Column(Integer, default=86400, nullable=False)
    requires_human_approval = Column(Boolean, default=True, nullable=False)
    
    status = Column(String(30), default="ACTIVE", nullable=False)  # ACTIVE, SUSPENDED, EXPIRED
    valid_until = Column(DateTime, nullable=True)
    
    created_by = Column(String(100), default="System", nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
