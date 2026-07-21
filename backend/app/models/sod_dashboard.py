import uuid
from sqlalchemy import Column, String, Text, DateTime, Integer
from datetime import datetime
from app.database import Base

class GovernanceDashboardPreferences(Base):
    __tablename__ = "governance_dashboard_preferences"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()), index=True)
    user_id = Column(Integer, nullable=False, index=True)
    default_filters = Column(Text, nullable=True)  # JSON string
    favorite_widgets = Column(Text, nullable=True)  # JSON string
    layout = Column(Text, nullable=True)  # JSON string
    theme = Column(String(30), default="dark", nullable=False)
    last_updated = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
