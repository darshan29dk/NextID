from datetime import datetime
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from ..database import Base

class RoleMergeHistory(Base):
    __tablename__ = "role_merge_history"

    id = Column(Integer, primary_key=True, index=True)
    parent_role_id = Column(Integer, ForeignKey("candidate_roles.id"), nullable=False)
    merged_by = Column(String(100), nullable=False)
    merge_reason = Column(String(500), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    source_roles = relationship("RoleMergeSourceRole", back_populates="merge_history", cascade="all, delete-orphan")
