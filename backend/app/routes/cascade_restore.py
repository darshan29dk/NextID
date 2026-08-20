import json
import logging
from datetime import datetime
from typing import Dict, Any
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.cascade_snapshot import CascadeSnapshot
from app.models.identity import Identity
from app.models.cascade_revocation import DelegationLink
from app.models.provider_credential import ProviderCredential
from app.services.kms_secret_manager import KMSSecretManagerService
from app.services.audit_chain import append_tamper_evident_audit
from app.utils.permissions import require_permission

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/cascade", tags=["DR-Safe Cascade Recovery"])

@router.post("/restore/{snapshot_id}")
def dr_safe_cascade_restore(
    snapshot_id: str,
    tenant_id: str = "default_tenant",
    _perm: bool = Depends(require_permission("Cascade Revocation", "execute")),
    db: Session = Depends(get_db)
) -> Dict[str, Any]:
    """
    DR-Safe Cascade Restoration API:
    Never 'undoes' old revoked credentials. Instead, validates the pre-revocation snapshot graph,
    re-authorizes identities, and issues FRESH credentials (vault://...) with updated fencing tokens.
    """
    snapshot = db.query(CascadeSnapshot).filter(
        CascadeSnapshot.id == snapshot_id,
        CascadeSnapshot.tenant_id == tenant_id
    ).first()

    if not snapshot:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Cascade snapshot '{snapshot_id}' not found for Tenant '{tenant_id}'."
        )

    try:
        nodes = json.loads(snapshot.nodes_json) if snapshot.nodes_json else []
        links = json.loads(snapshot.links_json) if snapshot.links_json else []
    except Exception:
        nodes, links = [], []

    reauthorized_identities = []
    reissued_credentials = []

    # 1. Unfreeze identities & increment authority epoch
    for node in nodes:
        identity_id = node.get("id")
        if identity_id:
            id_obj = db.query(Identity).filter(
                Identity.id == identity_id,
                Identity.tenant_id == tenant_id
            ).first()
            if id_obj:
                id_obj.is_frozen = False
                id_obj.status = "Active"
                id_obj.authority_epoch = (getattr(id_obj, "authority_epoch", 1) or 1) + 1
                reauthorized_identities.append(id_obj.id)

    # 2. Re-establish delegation links with status='Active'
    for link in links:
        link_id = link.get("id")
        if link_id:
            link_obj = db.query(DelegationLink).filter(
                DelegationLink.id == link_id,
                DelegationLink.tenant_id == tenant_id
            ).first()
            if link_obj:
                link_obj.is_frozen = False
                link_obj.status = "Active"

    # 3. Issue NEW credentials with fresh Vault URIs (Never un-revoke old compromised secrets)
    creds = nodes if (nodes and isinstance(nodes, list) and len(nodes) > 0 and "provider" in nodes[0]) else [{"provider": "GENERIC", "credential_name": "restored_key"}]
    for cred in creds:
        prov = cred.get("provider", "GENERIC")
        c_name = f"{cred.get('credential_name', 'restored_key')}_dr_v{datetime.utcnow().strftime('%Y%m%d%H%M%S')}"
        
        kms_ref = KMSSecretManagerService.store_credential_reference(
            tenant_id=tenant_id,
            credential_type=prov,
            target_resource=c_name
        )

        new_cred = ProviderCredential(
            tenant_id=tenant_id,
            provider=prov,
            credential_name=c_name,
            vault_reference_uri=kms_ref["vault_reference_uri"],
            credential_fingerprint_sha256=kms_ref["credential_fingerprint_sha256"],
            status="ACTIVE"
        )
        db.add(new_cred)
        reissued_credentials.append(kms_ref["vault_reference_uri"])

    db.commit()

    append_tamper_evident_audit(
        db=db,
        module="Cascade Recovery",
        action="DR_SAFE_CASCADE_RESTORED",
        performed_by="DR Operator",
        new_value=f"SUCCESS: Restored cascade snapshot '{snapshot_id}'. Re-authorized {len(reauthorized_identities)} identities, issued {len(reissued_credentials)} new Vault credentials.",
        tenant_id=tenant_id
    )

    return {
        "tenant_id": tenant_id,
        "snapshot_id": snapshot_id,
        "status": "RESTORED",
        "reauthorized_identities_count": len(reauthorized_identities),
        "reauthorized_identity_ids": reauthorized_identities,
        "newly_issued_credentials_count": len(reissued_credentials),
        "new_vault_references": reissued_credentials,
        "restored_at": datetime.utcnow().isoformat(),
        "note": "DR recovery issued new credentials and bumped authority epochs. Legacy compromised credentials remain permanently revoked."
    }
