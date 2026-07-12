from sqlalchemy import Column, Integer, String, Float, Boolean, ForeignKey
from app.database import Base


class CandidateRoleEntitlement(Base):
    """
    The entitlement set that defines a candidate role. member_coverage_pct
    is what fraction of the role's members actually hold this entitlement
    (0-100) — an entitlement only becomes part of the role's "core" set
    (is_core = True) once it clears the campaign's core inclusion threshold,
    so a role's definition reflects what most members share, not just what
    one member happens to have.
    """
    __tablename__ = "candidate_role_entitlements"

    id = Column(Integer, primary_key=True, index=True)
    candidate_role_id = Column(Integer, ForeignKey("candidate_roles.id"), index=True, nullable=False)
    entitlement_id = Column(Integer, ForeignKey("application_entitlements.id"), index=True, nullable=True)
    entitlement_name = Column(String(255), nullable=False)
    member_coverage_pct = Column(Float, default=0.0, nullable=False)
    is_core = Column(Boolean, default=False, nullable=False)  # True = part of the role's core definition
