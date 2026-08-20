import uuid
from datetime import datetime
from sqlalchemy import Column, String, Text, DateTime, Integer, UniqueConstraint
from app.database import Base

class RevocationJob(Base):
    __tablename__ = "revocation_jobs"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()), index=True)
    tenant_id = Column(String(50), nullable=False, default="default_tenant", index=True)
    
    target_type = Column(String(50), nullable=False, index=True)  # GITHUB, AWS_IAM, MCP_SESSION, GENERIC
    target_identity = Column(String(200), nullable=False, index=True)  # email, username, ARN, session_id
    target_entitlement = Column(String(200), nullable=False)  # role, permission, policy_arn, token
    target_class = Column(String(30), default="MANDATORY", nullable=False)  # MANDATORY, BEST_EFFORT, INFORMATIONAL
    
    status = Column(String(30), nullable=False, default="PENDING", index=True)  # PENDING, IN_PROGRESS, VERIFYING, VERIFYING_DELAYED, CONFIRMED, MANUALLY_VERIFIED, FAILED, ESCALATED
    
    idempotency_key = Column(String(128), nullable=True, index=True)
    fencing_token = Column(String(100), nullable=True, index=True)  # Monotonic fencing token for worker lease validation
    fencing_token_seq = Column(Integer, default=0, nullable=False)  # Integer sequence counter for monotonic fence enforcement
    lease_expires_at = Column(DateTime, nullable=True)
    
    execution_group = Column(Integer, default=1, nullable=False)
    priority = Column(Integer, default=10, nullable=False)
    
    attempted_at = Column(DateTime, nullable=True)
    confirmed_at = Column(DateTime, nullable=True)
    escalated_at = Column(DateTime, nullable=True)
    
    retry_count = Column(Integer, default=0, nullable=False)
    max_retries = Column(Integer, default=3, nullable=False)
    
    error_log = Column(Text, nullable=True)
    confirmation_payload = Column(Text, nullable=True)  # Stores JSON confirmation response string
    verification_evidence = Column(Text, nullable=True)  # Sanitized RFC 8785 canonical JSON evidence snippet + SHA-256 digest
    
    created_by = Column(String(100), nullable=False, default="System")
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    __table_args__ = (
        UniqueConstraint("tenant_id", "idempotency_key", name="uq_tenant_idempotency_key"),
    )
