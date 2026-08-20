import uuid
from datetime import datetime
from fastapi import APIRouter, Depends, Query, HTTPException
from typing import Dict, Any, List, Optional
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.cascade_revocation import RevocationJob
from app.models.jit_lease import JitLease
from app.services.revocation_service import process_revocation_job
from app.services.security_context import SecurityContext, get_security_context

router = APIRouter(prefix="/api/v1/unresolved-authority", tags=["Unresolved Authority Queue"])

@router.get("/queue")
def get_unresolved_authority_queue(
    sec_ctx: SecurityContext = Depends(get_security_context),
    db: Session = Depends(get_db)
):
    """
    Real Unresolved Authority Operations Queue:
    Queries actual database records for JitLeases and RevocationJobs in COMPENSATION_FAILED or UNVERIFIABLE states.
    Derives tenant_id strictly from SecurityContext.
    """
    tenant_id = sec_ctx.tenant_id
    items = []

    # 1. Query failed/unverifiable JIT leases for current tenant
    unresolved_leases = db.query(JitLease).filter(
        JitLease.tenant_id == tenant_id,
        JitLease.status.in_(["COMPENSATION_FAILED", "UNVERIFIABLE", "ISSUANCE_UNCERTAIN", "LOCAL_COMMIT_FAILED"])
    ).all()

    for lease in unresolved_leases:
        age = int((datetime.utcnow() - lease.created_at).total_seconds()) if lease.created_at else 0
        items.append({
            "id": lease.id,
            "tenant_id": lease.tenant_id,
            "provider_scope": lease.provider_type,
            "principal_name": lease.principal_id,
            "desired_state": "REVOKED",
            "observed_state": lease.status,
            "status": lease.status,
            "risk_level": "CRITICAL",
            "age_seconds": age,
            "authority_path": [
                {"name": "Human Tenant Owner", "type": "human_owner"},
                {"name": lease.principal_id, "type": "service_agent"},
                {"name": lease.resource, "type": "target_resource"}
            ],
            "failure_reason": f"JIT Lease '{lease.id}' in state '{lease.status}'. Provider lease ref: {lease.provider_lease_reference or 'N/A'}",
            "detected_at": lease.created_at.isoformat() if lease.created_at else datetime.utcnow().isoformat()
        })

    # 2. Query failed revocation jobs for current tenant
    failed_jobs = db.query(RevocationJob).filter(
        RevocationJob.tenant_id == tenant_id,
        RevocationJob.status.in_(["UNVERIFIABLE", "FAILED", "RETRY_EXHAUSTED", "COMPENSATION_FAILED"])
    ).all()

    for job in failed_jobs:
        age = int((datetime.utcnow() - job.created_at).total_seconds()) if job.created_at else 0
        items.append({
            "id": job.id,
            "tenant_id": job.tenant_id,
            "provider_scope": job.target_provider or "GENERIC",
            "principal_name": f"Principal-{job.target_credential_id}",
            "desired_state": "REVOKED",
            "observed_state": job.status,
            "status": job.status,
            "risk_level": "CRITICAL" if getattr(job, "mandatory", True) else "MEDIUM",
            "age_seconds": age,
            "authority_path": [
                {"name": "Tenant Root", "type": "human_owner"},
                {"name": f"Credential-{job.target_credential_id}", "type": "credential"},
                {"name": job.target_provider or "GENERIC", "type": "provider_target"}
            ],
            "failure_reason": f"Revocation job '{job.id}' in state '{job.status}'. Verification proof unavailable.",
            "detected_at": job.created_at.isoformat() if job.created_at else datetime.utcnow().isoformat()
        })

    return {
        "tenant_id": tenant_id,
        "unresolved_count": len(items),
        "items": items
    }

@router.post("/{item_id}/retry")
def retry_unresolved_authority_remediation(
    item_id: str,
    sec_ctx: SecurityContext = Depends(get_security_context),
    db: Session = Depends(get_db)
):
    """
    Real Remediation Retry Execution:
    Queries database for item, verifies tenant boundary, spawns RevocationJob, and dispatches through ConnectorRegistry.
    Updates final state based on real provider verification read-back.
    """
    tenant_id = sec_ctx.tenant_id

    # Check if item is a JitLease
    lease = db.query(JitLease).filter(JitLease.id == item_id, JitLease.tenant_id == tenant_id).first()
    if lease:
        lease.status = "REVOKING"
        
        # Spawn new RevocationJob DB record
        new_job = RevocationJob(
            tenant_id=tenant_id,
            target_identity=lease.principal_id,
            target_type=lease.provider_type,
            target_entitlement=lease.resource,
            status="PENDING",
            idempotency_key=f"idemp-retry-{lease.id[:8]}-{uuid.uuid4().hex[:6]}"
        )
        db.add(new_job)
        db.commit()

        # Dispatch execution and verification through ConnectorRegistry
        try:
            executed_job = process_revocation_job(db=db, job=new_job)
            final_status = executed_job.status
        except Exception as err:
            final_status = "RETRY_FAILED"

        return {
            "item_id": item_id,
            "tenant_id": tenant_id,
            "action": "REMEDIATION_RETRY_EXECUTED",
            "new_status": final_status,
            "job_id": new_job.id,
            "message": f"Remediation job '{new_job.id}' executed and verified via ConnectorRegistry. Final status: '{final_status}'."
        }

    # Check if item is a RevocationJob
    job = db.query(RevocationJob).filter(RevocationJob.id == item_id, RevocationJob.tenant_id == tenant_id).first()
    if job:
        job.status = "PENDING"
        job.retry_count = 0
        db.commit()

        try:
            executed_job = process_revocation_job(db=db, job=job)
            final_status = executed_job.status
        except Exception as err:
            final_status = "RETRY_FAILED"

        return {
            "item_id": item_id,
            "tenant_id": tenant_id,
            "action": "REMEDIATION_RETRY_EXECUTED",
            "new_status": final_status,
            "job_id": job.id,
            "message": f"Revocation job '{job.id}' re-dispatched and verified via ConnectorRegistry. Final status: '{final_status}'."
        }

    raise HTTPException(status_code=404, detail=f"Unresolved authority item '{item_id}' not found for tenant '{tenant_id}'. Cross-tenant access rejected.")
