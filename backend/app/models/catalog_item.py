import uuid
from datetime import datetime
from sqlalchemy import Column, String, Text, Integer, Boolean, DateTime
from app.database import Base

class CatalogItem(Base):
    """
    Access Catalog Item representing requestable roles, groups, or entitlements.
    """
    __tablename__ = "catalog_items"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()), index=True)
    tenant_id = Column(String(50), nullable=False, default="default_tenant", index=True)
    application_id = Column(String(36), nullable=True, index=True)
    entitlement_id = Column(String(36), nullable=True, index=True)
    
    name = Column(String(200), nullable=False, index=True)
    description = Column(Text, nullable=True)
    risk_level = Column(String(50), default="LOW", nullable=False)  # LOW, MEDIUM, HIGH, CRITICAL
    requestable = Column(Boolean, default=True, nullable=False)
    
    approval_policy_id = Column(String(100), nullable=True)
    sod_policy_id = Column(String(100), nullable=True)
    
    default_ttl_hours = Column(Integer, default=24, nullable=False)
    max_ttl_hours = Column(Integer, default=720, nullable=False)
    requires_business_justification = Column(Boolean, default=True, nullable=False)
    
    owner_principal_id = Column(String(36), nullable=True, index=True)
    status = Column(String(50), default="ACTIVE", nullable=False)  # ACTIVE, DEPRECATED, INACTIVE
    
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
