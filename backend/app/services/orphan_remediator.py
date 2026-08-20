import logging
from datetime import datetime
from typing import Dict, Any
from sqlalchemy.orm import Session
from app.models.cascade_revocation import DelegationLink
from app.models.identity import Identity
from app.models.revocation import RevocationJob
from app.services.revocation_service import process_revocation_job

logger = logging.getLogger(__name__)

def remediate_orphan_delegation(db: Session, tenant_id: str, link_id: int) -> Dict[str, Any]:
    """
    Orphan Remediation Engine:
    Executes quarantine workflow reusing the core Revocation Engine:
    QUARANTINED -> RevocationJob Created -> Executed via revocation_service -> VERIFIED -> RESOLVED.
    """
    link = db.query(DelegationLink).filter(
        DelegationLink.tenant_id == tenant_id,
        DelegationLink.id == link_id
    ).first()

    if not link:
        raise Exception(f"DelegationLink '{link_id}' not found for Tenant '{tenant_id}'.")

    # 1. State: QUARANTINED
    link.status = "QUARANTINED"
    link.is_frozen = True
    db.commit()
    logger.info(f"[ORPHAN REMEDIATOR] Quarantined delegation link #{link_id}.")

    # 2. State: REMEDIATING - Spawn RevocationJob reusing Revocation Engine
    link.status = "REMEDIATING"
    db.commit()

    child_ident = db.query(Identity).filter(Identity.id == link.child_identity_id).first()
    target_identity_str = child_ident.display_name if child_ident else f"Identity-{link.child_identity_id}"

    job = RevocationJob(
        tenant_id=tenant_id,
        target_type="GENERIC",
        target_identity=target_identity_str,
        target_entitlement=f"delegation_link_{link_id}",
        target_class="MANDATORY",
        status="PENDING",
        created_by="OrphanRemediator"
    )
    db.add(job)
    db.commit()
    db.refresh(job)

    # Process job through real revocation engine
    processed_job = process_revocation_job(db, job)

    if processed_job.status == "CONFIRMED":
        if child_ident:
            child_ident.status = "REVOKED"
            child_ident.is_frozen = True
            db.commit()

        # 3. State: RESOLVED
        link.status = "RESOLVED"
        db.commit()
        logger.info(f"[ORPHAN REMEDIATOR] Successfully remediated orphan link #{link_id} (Job ID: {processed_job.id}, Job Status: CONFIRMED).")
        res_status = "RESOLVED"
    else:
        link.status = "UNRESOLVED"
        db.commit()
        logger.warning(f"[ORPHAN REMEDIATOR] Orphan link #{link_id} remediation unconfirmed (Job ID: {processed_job.id}, Job Status: {processed_job.status}). Status set to UNRESOLVED.")
        res_status = "UNRESOLVED"

    return {
        "link_id": link_id,
        "child_identity_id": link.child_identity_id,
        "revocation_job_id": processed_job.id,
        "job_status": processed_job.status,
        "status": res_status,
        "resolved_at": datetime.utcnow().isoformat()
    }
