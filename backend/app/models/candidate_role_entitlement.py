from sqlalchemy import Column, Integer, String, Float, Boolean, ForeignKey, DateTime
from datetime import datetime
from app.database import Base


class CandidateRoleEntitlement(Base):
    """
    Entitlement mapped to a candidate role.
    """
    __tablename__ = "candidate_role_entitlements"

    id = Column(Integer, primary_key=True, index=True)
    candidate_role_id = Column(Integer, ForeignKey("candidate_roles.id"), index=True, nullable=False)
    entitlement_id = Column(Integer, ForeignKey("application_entitlements.id"), index=True, nullable=True)
    
    application_name = Column(String(150), nullable=True)
    entitlement_name = Column(String(255), nullable=False)
    risk = Column(String(50), default="Low", nullable=False)  # "Low", "Medium", "High"
    
    member_coverage_pct = Column(Float, default=0.0, nullable=False)
    is_core = Column(Boolean, default=False, nullable=False)  # True = part of the role's core definition
    
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

