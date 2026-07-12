from sqlalchemy import Column, Integer, String, ForeignKey
from sqlalchemy.orm import relationship
from app.database import Base


class RoleMergeSourceRole(Base):
    """
    Source roles that were merged under a merge operation.
    """
    __tablename__ = "role_merge_source_roles"

    id = Column(Integer, primary_key=True, index=True)
    merge_history_id = Column(Integer, ForeignKey("role_merge_history.id", ondelete="CASCADE"), index=True, nullable=False)
    source_role_id = Column(Integer, ForeignKey("candidate_roles.id"), index=True, nullable=False)
    source_role_name = Column(String(150), nullable=False)

    merge_history = relationship("RoleMergeHistory", back_populates="source_roles")
