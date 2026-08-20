import uuid
from datetime import datetime
from sqlalchemy import Column, String, Text, DateTime, Integer, Boolean, JSON
from app.database import Base

class DelegationPolicy(Base):
    """
    Centralized Delegation & Authorization Policy entity holding depth limits, redelegation rules,
    and privilege containment rules.
    """
    __tablename__ = "delegation_policies"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()), index=True)
    tenant_id = Column(String(50), nullable=False, default="default_tenant", index=True)
    policy_name = Column(String(150), nullable=False, index=True)
    description = Column(Text, nullable=True)
    
    max_depth = Column(Integer, default=5, nullable=False)
    ttl_seconds = Column(Integer, default=86400, nullable=False)
    can_redelegate = Column(Boolean, default=True, nullable=False)
    cross_org_allowed = Column(Boolean, default=False, nullable=False)
    requires_approval = Column(Boolean, default=False, nullable=False)
    
    allowed_permissions_json = Column(Text, nullable=True)  # JSON array of permitted entitlement strings
    denied_permissions_json = Column(Text, nullable=True)   # JSON array of explicitly denied entitlements
    
    version = Column(Integer, default=1, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    previous_version_id = Column(String(36), nullable=True)
    
    created_by = Column(String(100), default="System", nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
