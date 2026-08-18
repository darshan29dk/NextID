from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.provider_credential import ProviderCredential
from app.schemas.provider_credential import (
    ProviderCredentialCreate,
    ProviderCredentialUpdate,
    ProviderCredentialResponse
)
from app.utils.secret_encryption import encrypt_secret
from app.utils.permissions import require_permission

router = APIRouter(prefix="/api/provider-credentials", tags=["Provider Credentials"])

@router.get("", response_model=List[ProviderCredentialResponse])
@router.get("/", response_model=List[ProviderCredentialResponse])
def list_provider_credentials(
    provider: Optional[str] = None,
    _perm: bool = Depends(require_permission("Cascade Revocation", "view")),
    db: Session = Depends(get_db)
):
    query = db.query(ProviderCredential)
    if provider:
        query = query.filter(ProviderCredential.provider == provider)
    return query.order_by(ProviderCredential.id.desc()).all()

@router.get("/{cred_id}", response_model=ProviderCredentialResponse)
def get_provider_credential(
    cred_id: int,
    _perm: bool = Depends(require_permission("Cascade Revocation", "view")),
    db: Session = Depends(get_db)
):
    cred = db.query(ProviderCredential).filter(ProviderCredential.id == cred_id).first()
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
    existing = db.query(ProviderCredential).filter(
        ProviderCredential.credential_name == payload.credential_name
    ).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Credential with name '{payload.credential_name}' already exists."
        )

    encrypted = encrypt_secret(payload.secret)

    cred = ProviderCredential(
        provider=payload.provider,
        credential_name=payload.credential_name,
        encrypted_secret=encrypted,
        config=payload.config,
        status="Active"
    )
    db.add(cred)
    db.commit()
    db.refresh(cred)
    return cred

@router.put("/{cred_id}", response_model=ProviderCredentialResponse)
def update_provider_credential(
    cred_id: int,
    payload: ProviderCredentialUpdate,
    _perm: bool = Depends(require_permission("Cascade Revocation", "edit")),
    db: Session = Depends(get_db)
):
    cred = db.query(ProviderCredential).filter(ProviderCredential.id == cred_id).first()
    if not cred:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"ProviderCredential with ID {cred_id} not found."
        )

    if payload.credential_name:
        cred.credential_name = payload.credential_name
    if payload.secret:
        cred.encrypted_secret = encrypt_secret(payload.secret)
    if payload.config is not None:
        cred.config = payload.config
    if payload.status:
        cred.status = payload.status

    db.commit()
    db.refresh(cred)
    return cred

@router.delete("/{cred_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_provider_credential(
    cred_id: int,
    _perm: bool = Depends(require_permission("Cascade Revocation", "edit")),
    db: Session = Depends(get_db)
):
    cred = db.query(ProviderCredential).filter(ProviderCredential.id == cred_id).first()
    if not cred:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"ProviderCredential with ID {cred_id} not found."
        )

    db.delete(cred)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
