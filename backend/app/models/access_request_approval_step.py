"""
Phase 7 — Deterministic Approval Workflow Engine
Extends existing ApprovalWorkflowConfig + ApprovalRequest models.
Introduces IGA-specific AccessRequestApprovalStep tied to AccessRequest.
NO AI/ML. All routing is deterministic via policy.
"""
import uuid
from datetime import datetime
from sqlalchemy import Column, String, Integer, DateTime, Text, Boolean, ForeignKey, Index
from app.database import Base


class AccessRequestApprovalStep(Base):
    """
    A single deterministic approval step tied to an AccessRequest.
    Multi-stage: each step has an order, approver type, and decision.
    """
    __tablename__ = "access_request_approval_steps"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id = Column(String(50), nullable=False, index=True)
    access_request_id = Column(String(36), nullable=False, index=True)

    step_order = Column(Integer, nullable=False)

    # Deterministic approver routing: MANAGER | APPLICATION_OWNER | ENTITLEMENT_OWNER |
    # SECURITY_ADMIN | COMPLIANCE | CUSTOM_ROLE
    approver_type = Column(String(50), nullable=False)
    approver_principal_id = Column(String(36), nullable=True, index=True)
    approver_role = Column(String(100), nullable=True)

    # Step status: PENDING | APPROVED | DENIED | ESCALATED | TIMED_OUT | SKIPPED
    status = Column(String(30), nullable=False, server_default="PENDING", index=True)

    # Decision fields
    decision = Column(String(30), nullable=True)  # APPROVED | DENIED | ABSTAIN
    decision_reason = Column(Text, nullable=True)
    decided_by_principal_id = Column(String(36), nullable=True)
    decided_at = Column(DateTime, nullable=True)

    # SLA
    due_at = Column(DateTime, nullable=True)
    timeout_hours = Column(Integer, nullable=False, server_default="48")
    escalated = Column(Boolean, nullable=False, server_default="false")
    escalated_at = Column(DateTime, nullable=True)

    # Audit
    policy_decision_id = Column(String(100), nullable=True)
    trace_id = Column(String(100), nullable=True)

    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    __table_args__ = (
        Index("idx_ar_approval_step_tenant_req", "tenant_id", "access_request_id"),
    )
