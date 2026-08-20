from pydantic import BaseModel
from typing import Optional, Dict, Any
from datetime import datetime

class ProviderCredentialCreate(BaseModel):
    tenant_id: Optional[str] = "default_tenant"
    provider: str  # GITHUB, AWS_IAM, MCP, GENERIC
    credential_name: str
    vault_reference_uri: str  # vault://secret/data/provider/key
    credential_fingerprint_sha256: Optional[str] = None
    config: Optional[Dict[str, Any]] = None

class ProviderCredentialUpdate(BaseModel):
    credential_name: Optional[str] = None
    vault_reference_uri: Optional[str] = None
    credential_fingerprint_sha256: Optional[str] = None
    config: Optional[Dict[str, Any]] = None
    status: Optional[str] = None

class ProviderCredentialResponse(BaseModel):
    id: int
    tenant_id: str
    provider: str
    credential_name: str
    vault_reference_uri: str
    credential_fingerprint_sha256: str
    status: str
    config: Optional[Dict[str, Any]] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
