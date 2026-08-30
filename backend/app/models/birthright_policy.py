"""
Phase 11 — Birthright Access Policy
Deterministic policy: conditions (department, job_title, etc.) → entitlements.
Versioned, auditable, replayable. Recalculated on MOVER.
NO AI role prediction.
"""
import uuid
from datetime import datetime
from sqlalchemy import Column, String, Integer, DateTime, Text, Boolean, Index
from app.database import Base


class BirthrightPolicy(Base):
    """
    Deterministic Birthright Policy: maps identity attributes to entitlements.
    Always versioned. Active policies are immutable — changes create new versions.
    """
    __tablename__ = "birthright_policies"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id = Column(String(50), nullable=False, index=True)
    name = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)

    # Conditions (JSON): e.g. {"department": "FINANCE", "employment_type": "EMPLOYEE"}
    conditions = Column(Text, nullable=False)

    # Entitled entitlement_id
    entitlement_id = Column(String(36), nullable=False, index=True)
    entitlement_name = Column(String(200), nullable=True)

    # Policy lifecycle
    version = Column(Integer, nullable=False, server_default="1")
    # Status: DRAFT | ACTIVE | DEPRECATED | ARCHIVED
    status = Column(String(30), nullable=False, server_default="DRAFT", index=True)

    effective_from = Column(DateTime, nullable=True)
    effective_to = Column(DateTime, nullable=True)

    created_by = Column(String(36), nullable=False)
    approved_by = Column(String(36), nullable=True)
    approved_at = Column(DateTime, nullable=True)

    # Audit hash of conditions + entitlement_id for tamper detection
    policy_hash = Column(String(64), nullable=True)

    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    __table_args__ = (
        Index("idx_birthright_tenant_status", "tenant_id", "status"),
        Index("idx_birthright_entitlement", "tenant_id", "entitlement_id"),
    )


class BirthrightEvaluation(Base):
    """
    Audit record for each birthright policy evaluation (JOINER or MOVER).
    Stores inputs, matched policies, and resulting grants/removals.
    """
    __tablename__ = "birthright_evaluations"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id = Column(String(50), nullable=False, index=True)
    principal_id = Column(String(36), nullable=False, index=True)

    # Trigger: JOINER | MOVER
    trigger_type = Column(String(20), nullable=False)
    trigger_event_id = Column(String(36), nullable=True)

    # Input identity attributes evaluated (JSON)
    evaluated_attributes = Column(Text, nullable=True)

    # Matched policies (JSON array of policy_ids)
    matched_policy_ids = Column(Text, nullable=True)

    # Grants (JSON): entitlements provisioned as BIRTHRIGHT
    granted_entitlement_ids = Column(Text, nullable=True)

    # Removals (JSON): entitlements removed because conditions no longer match
    removed_entitlement_ids = Column(Text, nullable=True)

    authority_epoch = Column(Integer, nullable=True)
    evaluated_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    trace_id = Column(String(100), nullable=True)

    __table_args__ = (
        Index("idx_birthright_eval_tenant_principal", "tenant_id", "principal_id"),
    )
