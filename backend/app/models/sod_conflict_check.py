"""
Phase 8 — Segregation of Duties (SoD) Engine
Extends existing SodPolicy / SodPolicyRule / SodException models.
Adds IGA-specific SoD check integration point for access requests.
NO AI/ML. Pure deterministic rule evaluation.
"""
import uuid
from datetime import datetime
from sqlalchemy import Column, String, Integer, DateTime, Text, Boolean, Index
from app.database import Base


class SoDConflictCheck(Base):
    """
    Persists deterministic SoD check results for each access request evaluation.
    Result: CLEAR | CONFLICT | EXCEPTION_REQUIRED
    Never silently overrides SoD.
    """
    __tablename__ = "sod_conflict_checks"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id = Column(String(50), nullable=False, index=True)

    # What triggered the check
    trigger_type = Column(String(50), nullable=False)  # ACCESS_REQUEST | JIT | MOVER | BIRTHRIGHT | CERTIFICATION
    trigger_id = Column(String(36), nullable=True, index=True)

    # Principal being evaluated
    principal_id = Column(String(36), nullable=False, index=True)

    # Entitlement being requested/evaluated
    requested_entitlement_id = Column(String(36), nullable=True, index=True)
    requested_entitlement_name = Column(String(200), nullable=True)

    # Conflicting entitlement(s) held
    conflicting_entitlement_ids = Column(Text, nullable=True)  # JSON array
    conflicting_policy_ids = Column(Text, nullable=True)       # JSON array

    # Deterministic result
    result = Column(String(30), nullable=False, index=True)  # CLEAR | CONFLICT | EXCEPTION_REQUIRED
    risk_level = Column(String(20), nullable=True)           # LOW | MEDIUM | HIGH | CRITICAL

    # Exception reference if applicable
    exception_id = Column(String(36), nullable=True, index=True)
    exception_valid = Column(Boolean, nullable=True)

    evaluated_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    authority_epoch = Column(Integer, nullable=True)
    policy_version = Column(Integer, nullable=True)
    trace_id = Column(String(100), nullable=True)

    __table_args__ = (
        Index("idx_sod_check_tenant_principal", "tenant_id", "principal_id"),
        Index("idx_sod_check_trigger", "tenant_id", "trigger_type", "trigger_id"),
    )
