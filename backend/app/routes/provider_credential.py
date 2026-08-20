import hashlib
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.provider_credential import ProviderCredential
from app.schemas.provider_credential import (
    ProviderCredentialCreate,
    ProviderCredentialUpdate,
    ProviderCredentialResponse
)
from app.utils.permissions import require_permission

router = APIRouter(prefix="/api/provider-credentials", tags=["Provider Credentials"])

@router.get("", response_model=List[ProviderCredentialResponse])
@router.get("/", response_model=List[ProviderCredentialResponse])
def list_provider_credentials(
    tenant_id: Optional[str] = "default_tenant",
    provider: Optional[str] = None,
    _perm: bool = Depends(require_permission("Cascade Revocation", "view")),
    db: Session = Depends(get_db)
):
    query = db.query(ProviderCredential).filter(ProviderCredential.tenant_id == tenant_id)
    if provider:
        query = query.filter(ProviderCredential.provider == provider.upper())
    return query.order_by(ProviderCredential.id.desc()).all()

@router.get("/{cred_id}", response_model=ProviderCredentialResponse)
def get_provider_credential(
    cred_id: int,
    tenant_id: Optional[str] = "default_tenant",
    _perm: bool = Depends(require_permission("Cascade Revocation", "view")),
    db: Session = Depends(get_db)
):
    cred = db.query(ProviderCredential).filter(
        ProviderCredential.id == cred_id,
        ProviderCredential.tenant_id == tenant_id
    ).first()
    if not cred:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"ProviderCredential with ID {cred_id} not found."
        )
    return cred

@router.post("", response_model=ProviderCredentialResponse, status_code=status.HTTP_201_CREATED)
@router.post("/", response_model=ProviderCredentialResponse, status_code=status.HTTP_201_CREATED)
def create_provider_credential(
    payload: ProviderCredentialCreate,
    _perm: bool = Depends(require_permission("Cascade Revocation", "edit")),
    db: Session = Depends(get_db)
):
    tenant = payload.tenant_id or "default_tenant"
    existing = db.query(ProviderCredential).filter(
        ProviderCredential.tenant_id == tenant,
        ProviderCredential.credential_name == payload.credential_name
    ).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Credential with name '{payload.credential_name}' already exists for tenant '{tenant}'."
        )

    fingerprint = payload.credential_fingerprint_sha256
    if not fingerprint:
        fingerprint = hashlib.sha256(payload.vault_reference_uri.encode("utf-8")).hexdigest()

    cred = ProviderCredential(
        tenant_id=tenant,
        provider=payload.provider.upper(),
        credential_name=payload.credential_name,
        vault_reference_uri=payload.vault_reference_uri,
        credential_fingerprint_sha256=fingerprint,
        config=payload.config,
        status="ACTIVE"
    )
    db.add(cred)
    db.commit()
    db.refresh(cred)
    return cred

@router.put("/{cred_id}", response_model=ProviderCredentialResponse)
def update_provider_credential(
    cred_id: int,
    payload: ProviderCredentialUpdate,
    tenant_id: Optional[str] = "default_tenant",
    _perm: bool = Depends(require_permission("Cascade Revocation", "edit")),
    db: Session = Depends(get_db)
):
    cred = db.query(ProviderCredential).filter(
        ProviderCredential.id == cred_id,
        ProviderCredential.tenant_id == tenant_id
    ).first()
    if not cred:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"ProviderCredential with ID {cred_id} not found."
        )

    if payload.credential_name:
        cred.credential_name = payload.credential_name
    if payload.vault_reference_uri:
        cred.vault_reference_uri = payload.vault_reference_uri
        cred.credential_fingerprint_sha256 = hashlib.sha256(payload.vault_reference_uri.encode("utf-8")).hexdigest()
    if payload.credential_fingerprint_sha256:
        cred.credential_fingerprint_sha256 = payload.credential_fingerprint_sha256
    if payload.config is not None:
        cred.config = payload.config
    if payload.status:
        cred.status = payload.status.upper()

    db.commit()
    db.refresh(cred)
    return cred

@router.delete("/{cred_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_provider_credential(
    cred_id: int,
    tenant_id: Optional[str] = "default_tenant",
    _perm: bool = Depends(require_permission("Cascade Revocation", "edit")),
    db: Session = Depends(get_db)
):
    cred = db.query(ProviderCredential).filter(
        ProviderCredential.id == cred_id,
        ProviderCredential.tenant_id == tenant_id
    ).first()
    if not cred:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"ProviderCredential with ID {cred_id} not found."
        )

    db.delete(cred)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
