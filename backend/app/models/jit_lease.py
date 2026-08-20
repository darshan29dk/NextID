import uuid
from datetime import datetime
from sqlalchemy import Column, String, Text, DateTime, Integer, Boolean, UniqueConstraint
from app.database import Base

class JitLease(Base):
    """
    JIT Credential Lease Model (Milestone M5.2 Hardened):
    - ZERO Secret Storage: Plaintext AWS secret keys, session tokens, Vault tokens, or OAuth bearer tokens are NEVER stored.
    - Bound to M4 Policy Decision ID & Policy Version.
    - DB UNIQUE Constraint on (tenant_id, idempotency_key).
    - Complete Crash-Safe State Machine:
      PENDING, ISSUING, ACTIVE, ISSUANCE_UNCERTAIN, COMPENSATING, COMPENSATION_FAILED,
      EXPIRING, REVOKING, VERIFYING, REVOKED, EXPIRED, EXPIRY_UNVERIFIED, UNVERIFIABLE
    """
    __tablename__ = "jit_leases"

    __table_args__ = (
        UniqueConstraint("tenant_id", "idempotency_key", name="uq_jit_leases_tenant_idempotency"),
    )

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()), index=True)
    lease_id = Column(String(100), unique=True, nullable=False, index=True)
    tenant_id = Column(String(50), nullable=False, default="default_tenant", index=True)
    principal_id = Column(String(100), nullable=False, index=True)
    
    provider_type = Column(String(50), nullable=False, default="AWS_STS")  # AWS_STS, VAULT, OAUTH, API_KEY
    provider_account_id = Column(String(100), nullable=True, default="acc-123456789012")
    resource = Column(String(255), nullable=False)
    
    policy_decision_id = Column(String(100), nullable=False, default="PD-M4-001")
    policy_version = Column(String(50), nullable=False, default="v4.0-m4-governance")
    
    requested_permissions_json = Column(Text, nullable=False, default="[]")
    effective_permissions_json = Column(Text, nullable=False, default="[]")
    permissions_granted_json = Column(Text, nullable=True, default="[]")
    
    provider_lease_reference = Column(String(255), nullable=True)
    aws_assumed_role_arn = Column(String(255), nullable=True)
    vault_lease_id = Column(String(255), nullable=True)
    secret_reference = Column(String(255), nullable=True)
    credential_fingerprint_sha256 = Column(String(64), nullable=True, index=True)
    
    issued_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    expires_at = Column(DateTime, nullable=False)
    revoked_at = Column(DateTime, nullable=True)
    
    status = Column(String(50), default="ACTIVE", nullable=False, index=True)
    # Status Enum: PENDING, ISSUING, ACTIVE, ISSUANCE_UNCERTAIN, COMPENSATING, COMPENSATION_FAILED, EXPIRING, REVOKING, VERIFYING, REVOKED, EXPIRED, EXPIRY_UNVERIFIED, UNVERIFIABLE
    
    renewable = Column(Boolean, default=False, nullable=False)
    renewal_count = Column(Integer, default=0, nullable=False)
    max_renewals = Column(Integer, default=0, nullable=False)
    
    trace_id = Column(String(100), nullable=True, index=True)
    idempotency_key = Column(String(64), nullable=True, index=True)
    
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    @property
    def provider(self) -> str:
        return self.provider_type

    @provider.setter
    def provider(self, value: str):
        self.provider_type = value
