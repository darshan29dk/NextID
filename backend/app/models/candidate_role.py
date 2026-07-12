from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Float
from datetime import datetime
from app.database import Base


class CandidateRole(Base):
    """
    RD-003 / RD-006: One cluster discovered by a mining campaign run — a
    group of accounts within the same job function that share a largely
    common entitlement set. confidence_score (0-100) is the average
    Jaccard similarity of each member's entitlement set to the role's
    core entitlement set (see CandidateRoleEntitlement).
    """
    __tablename__ = "candidate_roles"

    id = Column(Integer, primary_key=True, index=True)
    campaign_id = Column(Integer, ForeignKey("mining_campaigns.id"), index=True, nullable=False)

    role_name = Column(String(150), nullable=False)
    job_function = Column(String(100), nullable=True)  # the job_title this cluster was discovered under
    cluster_label = Column(Integer, nullable=False)  # raw DBSCAN cluster label, for traceability

    member_count = Column(Integer, default=0, nullable=False)
    confidence_score = Column(Float, default=0.0, nullable=False)  # 0-100

    status = Column(String(50), default="Proposed", nullable=False)  # "Proposed" (later: Approved/Rejected via Role Engineering)

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
