import uuid
from datetime import datetime
from sqlalchemy import Column, String, Text, DateTime, Integer
from app.database import Base

class RevocationJobAttempt(Base):
    """
    Rich attempt history model logging every retry execution, fencing token, duration,
    provider request ID, HTTP status code, retry classification, and verification result.
    """
    __tablename__ = "revocation_job_attempts"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()), index=True)
    tenant_id = Column(String(50), nullable=False, default="default_tenant", index=True)
    job_id = Column(String(36), nullable=False, index=True)
    
    attempt_number = Column(Integer, nullable=False)
    fencing_token = Column(String(100), nullable=True, index=True)
    provider_request_id = Column(String(100), nullable=True)
    
    provider = Column(String(50), nullable=True)  # GITHUB, AWS_IAM, MCP_SESSION, GENERIC
    operation = Column(String(50), nullable=True)  # REMOVE_MEMBER, DETACH_POLICY, TERMINATE_SESSION
    http_status = Column(Integer, nullable=True)
    error_code = Column(String(50), nullable=True)
    
    retry_classification = Column(String(30), default="TRANSIENT", nullable=False)  # TRANSIENT, PERMANENT
    duration_ms = Column(Integer, default=0, nullable=False)
    verification_result = Column(String(30), default="UNVERIFIED", nullable=False)  # VERIFIED, UNVERIFIED, FAILED
    
    error_message = Column(Text, nullable=True)
    provider_response_json = Column(Text, nullable=True)
    
    started_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    completed_at = Column(DateTime, nullable=True)
    attempted_at = Column(DateTime, default=datetime.utcnow, nullable=False)
