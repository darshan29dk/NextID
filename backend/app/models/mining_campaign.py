from sqlalchemy import Column, Integer, String, DateTime, Boolean, ForeignKey, Float, Text
from datetime import datetime
from app.database import Base


class MiningCampaign(Base):
    """
    RD-001 / RD-002: A configured run of the role mining engine. Scoped
    either to a single Application or across the whole unified repository.
    Running it (POST /mining-campaigns/{id}/run) executes the scikit-learn
    DBSCAN clustering engine (see app/services/role_mining_engine.py),
    which populates CandidateRole / CandidateRoleEntitlement /
    CampaignAccountResult rows and writes the summary fields below.
    """
    __tablename__ = "mining_campaigns"

    id = Column(Integer, primary_key=True, index=True)
    campaign_name = Column(String(150), nullable=False)
    description = Column(Text, nullable=True)

    scope_type = Column(String(50), default="All", nullable=False)  # "All" or "Application"
    application_id = Column(Integer, ForeignKey("applications.id"), index=True, nullable=True)

    # DBSCAN parameters, configurable per campaign so the mining sensitivity
    # can be tuned without a code change. eps is a Jaccard-distance
    # threshold (0-1, lower = stricter similarity required); min_samples is
    # the minimum cluster size for a group to count as a candidate role.
    eps = Column(Float, default=0.4, nullable=False)
    min_samples = Column(Integer, default=2, nullable=False)

    status = Column(String(50), default="Draft", nullable=False)  # "Draft", "Running", "Completed", "Failed"
    error_message = Column(Text, nullable=True)

    # Result summary, written after a successful run (RD-005/RD-006 roll-up)
    total_accounts_analyzed = Column(Integer, default=0, nullable=False)
    total_candidate_roles = Column(Integer, default=0, nullable=False)
    total_outliers = Column(Integer, default=0, nullable=False)
    coverage_percentage = Column(Float, default=0.0, nullable=False)
    last_run_at = Column(DateTime, nullable=True)

    # Extended mining summary metrics (per Dharankumar Bera's enterprise IAM
    # feedback - the summary should tell the full data-ingestion story, not
    # just accounts/roles/coverage/outliers).
    identities_analyzed = Column(Integer, default=0, nullable=False)
    applications_analyzed = Column(Integer, default=0, nullable=False)
    entitlements_analyzed = Column(Integer, default=0, nullable=False)
    avg_confidence_score = Column(Float, default=0.0, nullable=False)

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    created_by = Column(String(100), default="System", nullable=False)
    modified_by = Column(String(100), default="System", nullable=False)
    is_deleted = Column(Boolean, default=False, nullable=False)
