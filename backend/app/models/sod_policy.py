import uuid
from sqlalchemy import Column, String, Text, DateTime, ForeignKey, Integer
from sqlalchemy.orm import relationship
from datetime import datetime
from app.database import Base

class SodPolicy(Base):
    __tablename__ = "sod_policies"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()), index=True)
    policy_code = Column(String(50), unique=True, nullable=False, index=True)
    policy_name = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)
    risk_level = Column(String(20), nullable=False, default="LOW")  # LOW, MEDIUM, HIGH, CRITICAL
    policy_type = Column(String(20), nullable=False, default="STATIC")  # STATIC, DYNAMIC
    status = Column(String(20), nullable=False, default="DRAFT")  # ACTIVE, INACTIVE, DRAFT, SUSPENDED, DEPRECATED
    business_owner = Column(String(100), nullable=False)
    approver = Column(String(100), nullable=False)
    created_by = Column(String(100), nullable=False, default="System")
    created_date = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_by = Column(String(100), nullable=True)
    updated_date = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    version = Column(Integer, default=1, nullable=False)

    rules = relationship("SodPolicyRule", back_populates="policy", cascade="all, delete-orphan")

class SodPolicyRule(Base):
    __tablename__ = "sod_policy_rules"

    id = Column(Integer, primary_key=True, index=True)
    policy_id = Column(String(36), ForeignKey("sod_policies.id"), nullable=False)
    application_name = Column(String(100), nullable=False)
    entitlement_one = Column(String(100), nullable=False)
    entitlement_two = Column(String(100), nullable=False)
    condition_type = Column(String(20), nullable=False, default="AND")  # AND, OR, NOT
    created_date = Column(DateTime, default=datetime.utcnow, nullable=False)

    policy = relationship("SodPolicy", back_populates="rules")

class SodPolicyAudit(Base):
    __tablename__ = "sod_policy_audit"

    id = Column(Integer, primary_key=True, index=True)
    policy_id = Column(String(36), nullable=False)
    action = Column(String(50), nullable=False)
    performed_by = Column(String(100), nullable=False)
    old_value = Column(Text, nullable=True)
    new_value = Column(Text, nullable=True)
    timestamp = Column(DateTime, default=datetime.utcnow, nullable=False)
