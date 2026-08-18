import uuid
from sqlalchemy import Column, String, Text, DateTime, Integer, JSON
from datetime import datetime
from app.database import Base

class RevocationJob(Base):
    __tablename__ = "revocation_jobs"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()), index=True)
    target_type = Column(String(50), nullable=False, index=True)  # GITHUB, AWS_IAM, MCP_SESSION, GENERIC
    target_identity = Column(String(200), nullable=False, index=True)  # email, username, ARN, session_id
    target_entitlement = Column(String(200), nullable=False)  # role, permission, policy_arn, token
    
    status = Column(String(30), nullable=False, default="PENDING", index=True)  # PENDING, IN_PROGRESS, CONFIRMED, FAILED, ESCALATED
    
    attempted_at = Column(DateTime, nullable=True)  # Timestamp when execution attempt starts
    confirmed_at = Column(DateTime, nullable=True)  # Timestamp when target system confirms removal
    escalated_at = Column(DateTime, nullable=True)  # Timestamp when retries fail and job is escalated
    
    retry_count = Column(Integer, default=0, nullable=False)
    max_retries = Column(Integer, default=3, nullable=False)
    
    error_log = Column(Text, nullable=True)
    confirmation_payload = Column(Text, nullable=True)  # Stores JSON confirmation response string
    
    created_by = Column(String(100), nullable=False, default="System")
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
