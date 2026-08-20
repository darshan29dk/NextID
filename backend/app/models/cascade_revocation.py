from sqlalchemy import Column, Integer, String, Text, Float, DateTime, ForeignKey, Boolean
from sqlalchemy.orm import relationship
from datetime import datetime
from app.database import Base
from app.models.identity import Identity
from app.models.revocation import RevocationJob

class RevocationEvent(Base):
    __tablename__ = "revocation_events"

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(String(50), nullable=False, default="default_tenant", index=True)
    source_identity_id = Column(Integer, ForeignKey("identities.id"), nullable=False, index=True)
    reason = Column(Text, nullable=True)
    status = Column(String(30), nullable=False, default="Pending", index=True)  # Pending, In Progress, CONFIRMED, PARTIALLY_REVOKED, Failed
    
    total_targets = Column(Integer, default=0, nullable=False)
    revoked_count = Column(Integer, default=0, nullable=False)
    failed_count = Column(Integer, default=0, nullable=False)
    duration_seconds = Column(Float, default=0.0, nullable=True)
    
    propagation_lag_ms = Column(Float, nullable=True)  # TTFR (Time To Full Revocation) - NULL unless 100% mandatory targets confirmed
    incomplete_revocation_count = Column(Integer, default=0, nullable=False)
    unconfirmed_target_ids = Column(Text, nullable=True)  # JSON array of unconfirmed target IDs
    graph_snapshot_id = Column(String(36), nullable=True)
    policy_version_id = Column(String(36), nullable=True)
    
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    completed_at = Column(DateTime, nullable=True)

    source_identity = relationship(Identity, foreign_keys=[source_identity_id], backref="revocation_events")
    actions = relationship("CascadeAction", back_populates="event", cascade="all, delete-orphan")

class CascadeAction(Base):
    __tablename__ = "cascade_actions"

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(String(50), nullable=False, default="default_tenant", index=True)
    event_id = Column(Integer, ForeignKey("revocation_events.id", ondelete="CASCADE"), nullable=False)
    target_type = Column(String(50), nullable=False)  # SERVICE_ACCOUNT, API_KEY, AGENT_SESSION, HUMAN_ACCOUNT, DELEGATION
    target_identifier = Column(String(200), nullable=False)
    action_type = Column(String(50), nullable=True, default="REVOCATION")  # REVOCATION, Max Depth Exceeded, Cycle Detected
    target_class = Column(String(30), default="MANDATORY", nullable=False)  # MANDATORY, BEST_EFFORT, INFORMATIONAL
    
    status = Column(String(30), nullable=False, default="Pending")  # Pending, Confirmed, Failed, Escalated
    
    depends_on_action_id = Column(Integer, nullable=True)
    execution_group = Column(Integer, default=1, nullable=False)
    priority = Column(Integer, default=10, nullable=False)
    
    hop_depth = Column(Integer, default=0, nullable=False)
    confirmed_at = Column(DateTime, nullable=True)
    retry_count = Column(Integer, default=0, nullable=False)
    error_message = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    revocation_job_id = Column(String(36), ForeignKey("revocation_jobs.id"), nullable=True)

    event = relationship("RevocationEvent", back_populates="actions")
    revocation_job = relationship(RevocationJob, backref="cascade_actions")

class DelegationLink(Base):
    __tablename__ = "delegation_links"

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(String(50), nullable=False, default="default_tenant", index=True)
    parent_identity_id = Column(Integer, ForeignKey("identities.id"), nullable=False, index=True)
    child_identity_id = Column(Integer, ForeignKey("identities.id"), nullable=False, index=True)
    delegation_type = Column(String(50), nullable=False, default="DELEGATE")  # DELEGATE, AGENT, DEPUTY
    origin_org = Column(String(150), nullable=True)
    
    authority_epoch = Column(Integer, default=1, nullable=False)
    is_frozen = Column(Boolean, default=False, nullable=False)
    can_redelegate = Column(Boolean, default=True, nullable=False)
    max_depth = Column(Integer, default=5, nullable=False)
    
    status = Column(String(30), nullable=False, default="Active", index=True)  # Active, Inactive, Revoked
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    parent_identity = relationship(Identity, foreign_keys=[parent_identity_id], backref="outgoing_delegations")
    child_identity = relationship(Identity, foreign_keys=[child_identity_id], backref="incoming_delegations")

    @property
    def parent_id(self) -> str:
        return str(self.parent_identity_id)

    @property
    def child_id(self) -> str:
        return str(self.child_identity_id)

    @property
    def resource(self) -> str:
        return "ALL"
