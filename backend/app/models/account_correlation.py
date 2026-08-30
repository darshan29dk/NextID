"""
Phase 12 — Deterministic Account Correlation
Maps external accounts to Principals using deterministic evidence rules.
Ambiguous high-risk accounts go to MANUAL_REVIEW — never auto-correlated.
NO ML confidence scoring.
"""
import uuid
from datetime import datetime
from sqlalchemy import Column, String, Integer, DateTime, Text, Boolean, Index, Float
from app.database import Base


class AccountCorrelationRecord(Base):
    """
    Deterministic account correlation: external account → Principal.
    Correlation evidence: employee_id, email, UPN, username, directory_object_id, provider immutable ID.
    Statuses: MATCHED | UNMATCHED | AMBIGUOUS | MANUAL_REVIEW
    """
    __tablename__ = "account_correlation_records"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id = Column(String(50), nullable=False, index=True)

    # The external account
    external_account_id = Column(String(200), nullable=False, index=True)
    external_system = Column(String(100), nullable=False, index=True)  # AD | GITHUB | OKTA | SCIM | etc.
    username = Column(String(200), nullable=True, index=True)

    # The matched (or candidate) principal
    matched_principal_id = Column(String(36), nullable=True, index=True)
    candidate_principal_ids = Column(Text, nullable=True)  # JSON array when AMBIGUOUS

    # Status: MATCHED | UNMATCHED | AMBIGUOUS | MANUAL_REVIEW
    status = Column(String(30), nullable=False, server_default="UNMATCHED", index=True)

    # Evidence used for matching (JSON): which fields matched and how
    correlation_evidence = Column(Text, nullable=True)

    # Rule-based confidence: deterministic formula, fully explainable — NOT ML
    # e.g., exact_email_match=1.0, partial_username_match=0.7
    rule_confidence = Column(Float, nullable=True)
    confidence_explanation = Column(Text, nullable=True)  # Human-readable formula output

    # Risk flag: MATCHED ambiguous high-risk accounts must be blocked from auto-correlation
    risk_level = Column(String(20), nullable=True)  # LOW | MEDIUM | HIGH | CRITICAL
    requires_manual_review = Column(Boolean, nullable=False, server_default="false")

    # Review
    reviewed_by = Column(String(36), nullable=True)
    reviewed_at = Column(DateTime, nullable=True)
    review_decision = Column(String(30), nullable=True)  # CONFIRM | REJECT | ESCALATE

    # Audit
    authority_epoch = Column(Integer, nullable=True)
    trace_id = Column(String(100), nullable=True)
    correlation_rule_version = Column(String(20), nullable=True)

    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    __table_args__ = (
        Index("idx_acct_corr_tenant_status", "tenant_id", "status"),
        Index("idx_acct_corr_external", "tenant_id", "external_system", "external_account_id"),
    )
