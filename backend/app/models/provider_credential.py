import uuid
from datetime import datetime
from sqlalchemy import Column, String, Text, DateTime, Integer, UniqueConstraint
from app.database import Base

class ProviderCredential(Base):
    """
    Provider Credential model storing HashiCorp Vault URIs and SHA-256 fingerprints.
    Zero raw plaintext or encrypted secrets stored in database.
    """
    __tablename__ = "provider_credentials"

    id = Column(Integer, primary_key=True, autoincrement=True, index=True)
    tenant_id = Column(String(50), nullable=False, default="default_tenant", index=True)
    
    provider = Column(String(50), nullable=False, default="GENERIC", index=True)  # GITHUB, AWS_IAM, MCP, GENERIC
    credential_name = Column(String(150), nullable=True, index=True)
    credential_type = Column(String(50), nullable=False, default="API_KEY", index=True)  # API_KEY, OAUTH_REFRESH_TOKEN, SERVICE_ACCOUNT_KEY, MCP_SESSION_TOKEN
    target_resource = Column(String(200), nullable=False, default="global", index=True)
    
    vault_reference_uri = Column(String(250), nullable=False)  # vault://secret/data/...
    credential_fingerprint_sha256 = Column(String(64), nullable=False, index=True)
    encrypted_secret = Column(Text, nullable=True, default="VAULT_MANAGED")
    
    status = Column(String(30), default="ACTIVE", nullable=False)  # ACTIVE, REVOKED, EXPIRED, QUARANTINED
    expires_at = Column(DateTime, nullable=True)
    
    created_by = Column(String(100), default="System", nullable=False)
    modified_by = Column(String(100), default="System", nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    __table_args__ = (
        UniqueConstraint("tenant_id", "credential_fingerprint_sha256", name="uq_tenant_credential_fingerprint"),
    )
