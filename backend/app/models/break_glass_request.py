"""
Phase 10 — Break Glass Emergency Access
Deterministic emergency authority with mandatory audit, TTL, maker-checker
and mandatory post-use review.
NEVER creates permanent authority.
"""
import uuid
from datetime import datetime
from sqlalchemy import Column, String, Integer, DateTime, Text, Boolean, Index
from app.database import Base


class BreakGlassRequest(Base):
    """
    Emergency temporary access grant with mandatory constraints:
    - Strong authentication required
    - Maker-checker for high-risk resources
    - Maximum TTL enforced
    - Mandatory audit at every state transition
    - Mandatory post-use review before closure
    - Provider revocation + verification on expiry
    """
    __tablename__ = "break_glass_requests"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id = Column(String(50), nullable=False, index=True)

    # Requester
    principal_id = Column(String(36), nullable=False, index=True)
    authenticated_with = Column(String(100), nullable=True)  # MFA method used

    # Target resource
    resource = Column(String(300), nullable=False)
    requested_permissions = Column(Text, nullable=True)  # JSON array
    target_application_id = Column(String(36), nullable=True, index=True)

    # Justification
    reason = Column(Text, nullable=False)
    incident_ticket = Column(String(100), nullable=True)

    # TTL — enforced maximum, never permanent
    requested_ttl_hours = Column(Integer, nullable=False)
    max_ttl_hours = Column(Integer, nullable=False, server_default="4")
    approved_ttl_hours = Column(Integer, nullable=True)

    # Status: REQUESTED | PENDING_CHECKER | APPROVED | DENIED | ACTIVE | EXPIRED | REVOKING | CLOSED
    status = Column(String(30), nullable=False, server_default="REQUESTED", index=True)

    # Approval
    approver_principal_id = Column(String(36), nullable=True, index=True)
    approved_at = Column(DateTime, nullable=True)
    denied_reason = Column(Text, nullable=True)

    # Maker-checker second approver (for high-risk)
    checker_principal_id = Column(String(36), nullable=True, index=True)
    checker_approved_at = Column(DateTime, nullable=True)
    requires_maker_checker = Column(Boolean, nullable=False, server_default="false")

    # JIT lease reference when ACTIVE
    jit_lease_id = Column(String(36), nullable=True, index=True)

    # Lifecycle
    activated_at = Column(DateTime, nullable=True)
    expires_at = Column(DateTime, nullable=True)
    revoked_at = Column(DateTime, nullable=True)
    provider_verified = Column(Boolean, nullable=True)

    # Post-use review
    post_use_reviewed = Column(Boolean, nullable=False, server_default="false")
    post_use_reviewer_id = Column(String(36), nullable=True)
    post_use_review_at = Column(DateTime, nullable=True)
    post_use_findings = Column(Text, nullable=True)

    # Audit
    authority_epoch = Column(Integer, nullable=True)
    trace_id = Column(String(100), nullable=True)
    policy_decision_id = Column(String(100), nullable=True)

    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    __table_args__ = (
        Index("idx_break_glass_tenant_status", "tenant_id", "status"),
        Index("idx_break_glass_principal", "tenant_id", "principal_id"),
    )
