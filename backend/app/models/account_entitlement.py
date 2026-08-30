import uuid
from datetime import datetime
from sqlalchemy import Column, String, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from app.database import Base

class AccountEntitlement(Base):
    """
    Join model linking an Account to an Entitlement with grant source and lifecycle constraints.
    """
    __tablename__ = "account_entitlements"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()), index=True)
    tenant_id = Column(String(50), nullable=False, default="default_tenant", index=True)
    account_id = Column(String(36), ForeignKey("accounts.id", ondelete="CASCADE"), nullable=False, index=True)
    entitlement_id = Column(String(36), ForeignKey("entitlements.id", ondelete="CASCADE"), nullable=False, index=True)
    
    source = Column(String(50), nullable=False)  # BIRTHRIGHT, REQUEST, ROLE, DELEGATION, JIT, MANUAL, EXTERNAL_SYNC
    
    valid_from = Column(DateTime, default=datetime.utcnow, nullable=False)
    valid_until = Column(DateTime, nullable=True)
    granted_by = Column(String(200), nullable=True)
    policy_decision_id = Column(String(100), nullable=True)
    status = Column(String(50), default="ACTIVE", nullable=False)  # ACTIVE, REVOKED, EXPIRED
    
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    account = relationship("Account", backref="entitlement_links")
    entitlement = relationship("Entitlement", backref="account_links")
