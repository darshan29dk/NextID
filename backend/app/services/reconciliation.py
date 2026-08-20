import os
import logging
import requests
from datetime import datetime
from typing import Dict, Any, List
from sqlalchemy.orm import Session
from app.models.provider_credential import ProviderCredential
from app.models.cascade_revocation import DelegationLink
from app.models.principal import Principal

logger = logging.getLogger(__name__)

from app.connectors.registry import ConnectorRegistry
from app.connectors.base import RevocationRequest, VerificationState

def check_external_provider_status(provider: str, target_identity: str, tenant_id: str = "default_tenant") -> str:
    """
    Interrogates live external SaaS/Cloud Provider REST API via ConnectorRegistry to observe actual current status.
    Fails closed with 'UNKNOWN' for unconfigured or unsupported providers.
    """
    connector = ConnectorRegistry.get_connector(provider)
    req = RevocationRequest(
        tenant_id=tenant_id,
        provider=provider,
        target_id=target_identity,
        target_type="GENERIC",
        target_entitlement="credentials"
    )
    
    ver_res = connector.verify(req)
    if ver_res.state in [VerificationState.VERIFIED_REVOKED, VerificationState.ALREADY_ABSENT]:
        return "REVOKED"
    elif ver_res.state == VerificationState.STILL_ACTIVE:
        return "ACTIVE"
    else:
        return "UNKNOWN"


from app.models.revocation import RevocationJob
from app.services.revocation_service import process_revocation_job

def reconcile_provider_drift(db: Session, tenant_id: str = "default_tenant", auto_remediate: bool = True) -> Dict[str, Any]:
    """
    Continuous Reconciliation Engine (Milestone M3):
    Compares NextID desired state against actual observed provider state via ConnectorRegistry.
    Transitions through convergence states: DRIFTED -> REMEDIATING -> VERIFYING -> CONVERGED (or UNRESOLVED / UNVERIFIABLE).
    Spawns RevocationJob for auto-remediation and enforces provider read-back verification.
    """
    credentials = db.query(ProviderCredential).filter(
        ProviderCredential.tenant_id == tenant_id
    ).all()

    drift_items = []
    unverifiable_count = 0
    remediated_count = 0
    unresolved_target_ids = []

    for cred in credentials:
        provider_name = (getattr(cred, "provider", "GENERIC") or "GENERIC").upper()
        cred_name = getattr(cred, "credential_name", f"cred-{cred.id}")
        
        # Desired state in NextID DB vs observed state in external provider
        desired_state = cred.status.upper()
        
        # Handle manual verification separation
        if desired_state in ["MANUALLY_CONFIRMED", "MANUAL_VERIFIED"]:
            drift_items.append({
                "credential_id": cred.id,
                "provider": provider_name,
                "credential_name": cred_name,
                "desired_state": "REVOKED",
                "observed_state": "MANUALLY_VERIFIED",
                "drift_classification": "MANUALLY_CONFIRMED",
                "remediation_status": "MANUALLY_CONFIRMED",
                "verification_type": "MANUAL_VERIFIED",
                "detected_at": datetime.utcnow().isoformat()
            })
            continue

        observed_state = check_external_provider_status(provider_name, cred_name, tenant_id)

        if observed_state == "UNKNOWN":
            unverifiable_count += 1
            unresolved_target_ids.append(cred_name)
            logger.warning(f"[RECONCILIATION] Unverifiable provider state for '{cred_name}' ({provider_name}). Failing closed.")
            drift_items.append({
                "credential_id": cred.id,
                "provider": provider_name,
                "credential_name": cred_name,
                "desired_state": desired_state,
                "observed_state": "UNKNOWN",
                "drift_classification": "UNVERIFIABLE",
                "remediation_status": "MANUAL_ACTION_REQUIRED",
                "verification_type": "UNVERIFIABLE",
                "detected_at": datetime.utcnow().isoformat()
            })
        elif desired_state == "REVOKED" and observed_state == "REVOKED":
            drift_items.append({
                "credential_id": cred.id,
                "provider": provider_name,
                "credential_name": cred_name,
                "desired_state": "REVOKED",
                "observed_state": "REVOKED",
                "drift_classification": "CONVERGED",
                "remediation_status": "CONVERGED",
                "verification_type": "PROVIDER_VERIFIED",
                "detected_at": datetime.utcnow().isoformat()
            })
        elif desired_state == "REVOKED" and observed_state == "ACTIVE":
            # DRIFT DETECTED!
            logger.warning(f"[RECONCILIATION] Drift detected for '{cred_name}' ({provider_name}): Desired=REVOKED, Observed=ACTIVE. Initiating Auto-Remediation.")
            
            remediation_status = "REMEDIATING"
            job_id = None

            if auto_remediate:
                job = RevocationJob(
                    tenant_id=tenant_id,
                    target_type=provider_name,
                    target_identity=cred_name,
                    target_entitlement="credentials",
                    target_class="MANDATORY",
                    status="PENDING",
                    created_by="ReconciliationEngine"
                )
                db.add(job)
                db.commit()
                db.refresh(job)
                job_id = job.id

                # Execute through Revocation Engine & ConnectorRegistry
                processed = process_revocation_job(db, job)

                if processed.status == "CONFIRMED":
                    cred.status = "REVOKED"
                    db.commit()
                    remediation_status = "CONVERGED"
                    remediated_count += 1
                    logger.info(f"[RECONCILIATION] Auto-remediation CONVERGED for '{cred_name}' ({provider_name}).")
                else:
                    remediation_status = "UNRESOLVED"
                    unresolved_target_ids.append(cred_name)
                    logger.warning(f"[RECONCILIATION] Auto-remediation UNRESOLVED for '{cred_name}' ({provider_name}). Status: {processed.status}.")

            drift_items.append({
                "credential_id": cred.id,
                "provider": provider_name,
                "credential_name": cred_name,
                "desired_state": "REVOKED",
                "observed_state": observed_state,
                "drift_classification": "DRIFTED",
                "remediation_status": remediation_status,
                "verification_type": "PROVIDER_VERIFIED",
                "revocation_job_id": job_id,
                "detected_at": datetime.utcnow().isoformat()
            })

    scanned_at = datetime.utcnow().isoformat()
    unresolved_count = len(unresolved_target_ids)
    actual_drift_count = len([d for d in drift_items if d.get("drift_classification") == "DRIFTED"])

    if unverifiable_count > 0:
        convergence_status = "UNVERIFIABLE"
    elif unresolved_count > 0:
        convergence_status = "UNRESOLVED"
    elif any(d["remediation_status"] == "REMEDIATING" for d in drift_items):
        convergence_status = "REMEDIATING"
    else:
        convergence_status = "CONVERGED"

    logger.info(f"[RECONCILIATION] Scan for Tenant '{tenant_id}' complete. Scanned {len(credentials)}, Convergence: {convergence_status}, Unresolved: {unresolved_count}.")

    return {
        "tenant_id": tenant_id,
        "desired_state_version": "v3.0-authority-convergence",
        "observed_state_version": "v3.0-provider-backed",
        "scanned_at": scanned_at,
        "total_scanned": len(credentials),
        "drift_count": actual_drift_count,
        "unverifiable_count": unverifiable_count,
        "remediated_count": remediated_count,
        "unresolved_target_count": unresolved_count,
        "unresolved_target_ids": unresolved_target_ids,
        "convergence_status": convergence_status,
        "drift_items": drift_items
    }
