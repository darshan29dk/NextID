from sqlalchemy import Column, Integer, String, DateTime, ForeignKey
from datetime import datetime
from app.database import Base


class CandidateRoleMember(Base):
    """
    Identities assigned to candidate roles.
    """
    __tablename__ = "candidate_role_members"

    id = Column(Integer, primary_key=True, index=True)
    candidate_role_id = Column(Integer, ForeignKey("candidate_roles.id"), index=True, nullable=False)
    identity_id = Column(Integer, ForeignKey("identities.id"), index=True, nullable=False)

    employee_id = Column(String(100), nullable=True)
    employee_name = Column(String(150), nullable=True)
    department = Column(String(100), nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
