from sqlalchemy import Column, Integer, String, Boolean, DateTime
from datetime import datetime
from app.database import Base

class CorrelationRule(Base):
    __tablename__ = "correlation_rules"

    id = Column(Integer, primary_key=True, index=True)
    rule_name = Column(String(100), nullable=False)
    
    # Matching target attributes
    identity_attribute = Column(String(100), nullable=False)  # e.g., "email", "display_name", "first_name"
    account_attribute = Column(String(100), nullable=False)   # e.g., "email", "account_name"
    
    match_type = Column(String(50), default="Exact")  # "Exact", "Partial"
    confidence_score = Column(Integer, default=100)  # 0 to 100
    is_active = Column(Boolean, default=True, nullable=False)

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    created_by = Column(String(100), default="System", nullable=False)
    modified_by = Column(String(100), default="System", nullable=False)
