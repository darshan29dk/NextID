from pydantic import BaseModel
from typing import Optional, Dict, Any
from datetime import datetime

class ProviderCredentialCreate(BaseModel):
    provider: str  # GitHub, AWS, MCP
    credential_name: str
    secret: str  # Write-only plaintext secret
    config: Optional[Dict[str, Any]] = None

class ProviderCredentialUpdate(BaseModel):
    credential_name: Optional[str] = None
    secret: Optional[str] = None
    config: Optional[Dict[str, Any]] = None
    status: Optional[str] = None

class ProviderCredentialResponse(BaseModel):
    id: int
    provider: str
    credential_name: str
    status: str
    config: Optional[Dict[str, Any]] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
