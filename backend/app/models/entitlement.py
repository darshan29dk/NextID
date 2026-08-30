import uuid
from datetime import datetime
from sqlalchemy import Column, String, Text, Boolean, DateTime
from app.database import Base

class Entitlement(Base):
    """
    Normalized Entitlement model for Roles, Groups, Permissions, Scopes, and Resource Access rights.
    """
    __tablename__ = "entitlements"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()), index=True)
    tenant_id = Column(String(50), nullable=False, default="default_tenant", index=True)
    application_id = Column(String(36), nullable=True, index=True)
    external_entitlement_id = Column(String(200), nullable=True, index=True)
    name = Column(String(200), nullable=False, index=True)
    type = Column(String(50), nullable=False)  # ROLE, GROUP, PERMISSION, SCOPE, RESOURCE_ACCESS
    
    description = Column(Text, nullable=True)
    owner_principal_id = Column(String(36), nullable=True, index=True)
    risk_level = Column(String(50), default="LOW", nullable=False)  # LOW, MEDIUM, HIGH, CRITICAL
    
    privileged = Column(Boolean, default=False, nullable=False)
    requestable = Column(Boolean, default=True, nullable=False)
    birthright_eligible = Column(Boolean, default=False, nullable=False)
    expires_allowed = Column(Boolean, default=True, nullable=False)
    
    status = Column(String(50), default="ACTIVE", nullable=False)  # ACTIVE, DEPRECATED, INACTIVE
    
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
