from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Float, Boolean
from datetime import datetime
from app.database import Base


class CandidateRole(Base):
    """
    Candidate Business/Technical/Hybrid Role.
    Tracks discovered and created candidate roles, their classification, and metadata.
    """
    __tablename__ = "candidate_roles"

    id = Column(Integer, primary_key=True, index=True)
    campaign_id = Column(Integer, ForeignKey("mining_campaigns.id"), index=True, nullable=True)  # nullable for custom roles created via API

    role_name = Column(String(150), nullable=False)
    role_description = Column(String(500), nullable=True)
    role_type = Column(String(50), default="Business", nullable=False)  # "Business", "Technical", "Hybrid"
    risk_level = Column(String(50), default="Low", nullable=False)  # "Low", "Medium", "High"
    classification = Column(String(100), nullable=True)  # "Birthright", "Requestable", "Business", "Technical"
    status = Column(String(50), default="Draft", nullable=False)  # "Draft", "Reviewed", "Approved", "Rejected", "Published"
    confidence_score = Column(Float, default=0.0, nullable=False)  # 0-100

    job_function = Column(String(100), nullable=True)  # job title cluster was discovered under
    cluster_label = Column(Integer, nullable=True)  # DBSCAN label (null for manual)

    member_count = Column(Integer, default=0, nullable=False)  # backward compatible count
    user_count = Column(Integer, default=0, nullable=False)
    entitlement_count = Column(Integer, default=0, nullable=False)
    application_count = Column(Integer, default=0, nullable=False)

    department = Column(String(100), nullable=True)
    business_unit = Column(String(100), nullable=True)
    source = Column(String(100), default="Mining", nullable=False)  # "Mining", "Manual"
    generated_by = Column(String(100), default="System", nullable=False)
    generated_on = Column(DateTime, default=datetime.utcnow, nullable=False)

    sod_violation_count = Column(Integer, default=0, nullable=False)

    # RE-005: Role Owner denormalized fields (mirrors active RoleOwnerHistory)
    primary_owner_name = Column(String(200), nullable=True)
    primary_owner_email = Column(String(200), nullable=True)
    primary_owner_id = Column(Integer, nullable=True)
    backup_owner_name = Column(String(200), nullable=True)
    backup_owner_email = Column(String(200), nullable=True)
    backup_owner_id = Column(Integer, nullable=True)
    owner_review_date = Column(DateTime, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    created_by = Column(String(100), default="System", nullable=False)
    modified_by = Column(String(100), default="System", nullable=False)
    is_deleted = Column(Boolean, default=False, nullable=False)

