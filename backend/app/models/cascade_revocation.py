from sqlalchemy import Column, Integer, String, Text, Float, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime
from app.database import Base

class RevocationEvent(Base):
    __tablename__ = "revocation_events"

    id = Column(Integer, primary_key=True, index=True)
    source_identity_id = Column(Integer, ForeignKey("identities.id"), nullable=False, index=True)
    reason = Column(Text, nullable=True)
    status = Column(String(30), nullable=False, default="Pending", index=True)  # Pending, In Progress, Completed, Failed
    
    total_targets = Column(Integer, default=0, nullable=False)
    revoked_count = Column(Integer, default=0, nullable=False)
    failed_count = Column(Integer, default=0, nullable=False)
    duration_seconds = Column(Float, default=0.0, nullable=True)
    
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    completed_at = Column(DateTime, nullable=True)

    source_identity = relationship("Identity", backref="revocation_events")
    actions = relationship("CascadeAction", back_populates="event", cascade="all, delete-orphan")

class CascadeAction(Base):
    __tablename__ = "cascade_actions"

    id = Column(Integer, primary_key=True, index=True)
    event_id = Column(Integer, ForeignKey("revocation_events.id", ondelete="CASCADE"), nullable=False)
    target_type = Column(String(50), nullable=False)  # SERVICE_ACCOUNT, API_KEY, AGENT_SESSION, HUMAN_ACCOUNT
    target_identifier = Column(String(200), nullable=False)
    status = Column(String(30), nullable=False, default="Pending")  # Pending, Confirmed, Failed
    
    confirmed_at = Column(DateTime, nullable=True)
    retry_count = Column(Integer, default=0, nullable=False)
    error_message = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    event = relationship("RevocationEvent", back_populates="actions")
