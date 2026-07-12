from sqlalchemy import Column, Integer, String, DateTime, ForeignKey
from datetime import datetime
from app.database import Base


class RoleSplitHistory(Base):
    """
    Historical log record of a candidate roles split action.
    """
    __tablename__ = "role_split_history"

    id = Column(Integer, primary_key=True, index=True)
    original_role_id = Column(Integer, ForeignKey("candidate_roles.id"), index=True, nullable=False)
    
    split_by = Column(String(100), default="System", nullable=False)
    split_reason = Column(String(500), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
