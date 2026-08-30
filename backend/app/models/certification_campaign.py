"""
Phase 9 — Access Certification Campaign
Extends existing ConnectorCertificationRun concept but for IGA access reviews.
CertificationCampaign + CertificationItem models.
REVOKE decision routes to existing RevocationJob engine.
NO AI/ML recommendations.
"""
import uuid
from datetime import datetime
from sqlalchemy import Column, String, Integer, DateTime, Text, Boolean, Index
from app.database import Base


class CertificationCampaign(Base):
    """
    Certification Campaign: manager, app owner, privileged access, service account,
    agent authority, or entitlement owner reviews.
    """
    __tablename__ = "certification_campaigns"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id = Column(String(50), nullable=False, index=True)
    name = Column(String(200), nullable=False)

    # Types: MANAGER | APPLICATION_OWNER | PRIVILEGED_ACCESS | SERVICE_ACCOUNT |
    #        AGENT_AUTHORITY | ENTITLEMENT_OWNER
    campaign_type = Column(String(50), nullable=False, index=True)

    scope = Column(Text, nullable=True)  # JSON scope filters
    created_by = Column(String(36), nullable=False)

    starts_at = Column(DateTime, nullable=False)
    due_at = Column(DateTime, nullable=False)
    completed_at = Column(DateTime, nullable=True)

    # Status: DRAFT | ACTIVE | COMPLETED | CANCELLED | EXPIRED
    status = Column(String(30), nullable=False, server_default="DRAFT", index=True)

    total_items = Column(Integer, nullable=False, server_default="0")
    reviewed_items = Column(Integer, nullable=False, server_default="0")
    revoked_items = Column(Integer, nullable=False, server_default="0")
    kept_items = Column(Integer, nullable=False, server_default="0")

    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    __table_args__ = (
        Index("idx_cert_campaign_tenant_status", "tenant_id", "status"),
    )


class CertificationItem(Base):
    """
    A single access record under review in a campaign.
    Decision: KEEP | REVOKE | REDUCE | DELEGATE_REVIEW | EXCEPTION
    REVOKE MUST route through existing RevocationJob engine.
    """
    __tablename__ = "certification_items"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id = Column(String(50), nullable=False, index=True)
    campaign_id = Column(String(36), nullable=False, index=True)

    # What is under review
    principal_id = Column(String(36), nullable=False, index=True)
    account_id = Column(String(36), nullable=True, index=True)
    entitlement_id = Column(String(36), nullable=True, index=True)
    delegation_id = Column(String(36), nullable=True, index=True)
    credential_id = Column(String(36), nullable=True, index=True)

    reviewer_id = Column(String(36), nullable=False, index=True)

    # Decision: KEEP | REVOKE | REDUCE | DELEGATE_REVIEW | EXCEPTION
    decision = Column(String(30), nullable=True, index=True)
    decision_reason = Column(Text, nullable=True)
    decided_at = Column(DateTime, nullable=True)

    # Status: PENDING | REVIEWED | ESCALATED | TIMED_OUT
    status = Column(String(30), nullable=False, server_default="PENDING", index=True)

    # If REVOKE — reference to created RevocationJob
    revocation_job_id = Column(String(36), nullable=True, index=True)
    provider_verified = Column(Boolean, nullable=True)

    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    __table_args__ = (
        Index("idx_cert_item_tenant_campaign", "tenant_id", "campaign_id"),
        Index("idx_cert_item_reviewer", "tenant_id", "reviewer_id", "status"),
    )
