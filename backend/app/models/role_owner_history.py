from sqlalchemy import Column, Integer, String, DateTime, Boolean, ForeignKey, Text
from datetime import datetime
from app.database import Base


class RoleOwnerHistory(Base):
    """
    Tracks every owner assignment change for a candidate role.
    Provides full audit trail: who owned the role, what type, when assigned, and when superseded.
    """
    __tablename__ = "role_owner_history"

    id = Column(Integer, primary_key=True, index=True)
    candidate_role_id = Column(Integer, ForeignKey("candidate_roles.id"), nullable=False, index=True)

    # Owner identity
    owner_user_id = Column(Integer, ForeignKey("platform_users.id"), nullable=True)
    owner_name = Column(String(200), nullable=False)
    owner_email = Column(String(200), nullable=True)
    owner_type = Column(String(50), nullable=False)  # "Primary" or "Backup"

    # Review date enforcement
    review_date = Column(DateTime, nullable=True)
    is_expired = Column(Boolean, default=False, nullable=False)

    # Assignment lifecycle
    assigned_by = Column(String(100), nullable=False, default="System")
    assigned_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    removed_at = Column(DateTime, nullable=True)
    is_active = Column(Boolean, default=True, nullable=False, index=True)
    change_reason = Column(Text, nullable=True)

    # Notification tracking
    notification_sent = Column(Boolean, default=False, nullable=False)
    notification_sent_at = Column(DateTime, nullable=True)
