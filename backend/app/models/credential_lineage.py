import uuid
from datetime import datetime
from sqlalchemy import Column, String, Text, DateTime, Integer, Index, ForeignKey
from sqlalchemy.orm import relationship
from app.database import Base

class CredentialLineageNode(Base):
    """
    Phase 6: Credential Lineage Model.
    Tracks derived credentials independently from identity delegation.
    ZERO RAW SECRETS PERSISTED. Stores fingerprints and references only.
    """
    __tablename__ = "credential_lineage_nodes"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()), index=True)
    tenant_id = Column(String(50), nullable=False, default="default_tenant", index=True)
    
    credential_id = Column(String(100), unique=True, nullable=False, index=True)
    parent_credential_id = Column(String(100), nullable=True, index=True)
    
    issuer_principal_id = Column(String(100), nullable=False, index=True)
    holder_principal_id = Column(String(100), nullable=False, index=True)
    
    provider = Column(String(50), nullable=False, default="AWS_STS")  # AWS_STS, VAULT, GITHUB, OAUTH, MCP
    provider_reference = Column(String(255), nullable=True)
    credential_type = Column(String(50), nullable=False)  # STS_SESSION, VAULT_LEASE, OAUTH_TOKEN, MCP_SESSION
    
    scope = Column(String(255), nullable=True)
    resource = Column(String(255), nullable=False)
    
    issued_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    expires_at = Column(DateTime, nullable=False)
    revoked_at = Column(DateTime, nullable=True)
    
    authority_epoch = Column(Integer, default=1, nullable=False)
    policy_decision_id = Column(String(100), nullable=False, default="PD-V2-001")
    credential_fingerprint_sha256 = Column(String(64), nullable=False, index=True)
    
    status = Column(String(30), default="ACTIVE", nullable=False, index=True)  # ACTIVE, REVOKED, EXPIRED

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    __table_args__ = (
        Index("idx_cred_lineage_tenant_holder", "tenant_id", "holder_principal_id"),
        Index("idx_cred_lineage_parent", "tenant_id", "parent_credential_id"),
    )

    def to_dict(self):
        return {
            "id": self.id,
            "credential_id": self.credential_id,
            "parent_credential_id": self.parent_credential_id,
            "tenant_id": self.tenant_id,
            "issuer_principal_id": self.issuer_principal_id,
            "holder_principal_id": self.holder_principal_id,
            "provider": self.provider,
            "provider_reference": self.provider_reference,
            "credential_type": self.credential_type,
            "scope": self.scope,
            "resource": self.resource,
            "issued_at": self.issued_at.isoformat() if self.issued_at else None,
            "expires_at": self.expires_at.isoformat() if self.expires_at else None,
            "revoked_at": self.revoked_at.isoformat() if self.revoked_at else None,
            "authority_epoch": self.authority_epoch,
            "policy_decision_id": self.policy_decision_id,
            "fingerprint": self.credential_fingerprint_sha256,
            "status": self.status
        }
