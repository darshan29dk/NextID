import logging
from datetime import datetime
from typing import Dict, Any
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.identity import Identity
from app.models.cascade_revocation import DelegationLink, RevocationEvent
from app.models.provider_credential import ProviderCredential
from app.models.revocation import RevocationJob
from app.routes.cascade_revocation import run_cascade
from app.services.audit_chain import append_tamper_evident_audit
from app.utils.permissions import require_permission

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/kill-switch", tags=["Emergency Scoped Kill Switches"])

@router.post("/tenant/{tenant_id}")
def emergency_tenant_kill_switch(
    tenant_id: str,
    reason: str = "Emergency Tenant Freeze Triggered",
    _perm: bool = Depends(require_permission("Cascade Revocation", "execute")),
    db: Session = Depends(get_db)
) -> Dict[str, Any]:
    """
    Tenant-Wide Emergency Kill Switch:
    Immediately freezes all identities, delegation links, and active credentials for tenant_id.
    """
    identities_updated = db.query(Identity).filter(
        Identity.tenant_id == tenant_id
    ).update({"is_frozen": True, "status": "FROZEN"}, synchronize_session=False)

    links_updated = db.query(DelegationLink).filter(
        DelegationLink.tenant_id == tenant_id
    ).update({"is_frozen": True, "status": "QUARANTINED"}, synchronize_session=False)

    creds_updated = db.query(ProviderCredential).filter(
        ProviderCredential.tenant_id == tenant_id
    ).update({"status": "QUARANTINED"}, synchronize_session=False)

    db.commit()

    append_tamper_evident_audit(
        db=db,
        module="Emergency Kill Switch",
        action="TENANT_KILL_SWITCH_TRIGGERED",
        performed_by="Operator",
        new_value=f"CRITICAL: Tenant-wide kill switch executed for '{tenant_id}'. Freezing {identities_updated} identities, {links_updated} links, {creds_updated} credentials. Reason: {reason}",
        tenant_id=tenant_id
    )

    return {
        "tenant_id": tenant_id,
        "action": "TENANT_EMERGENCY_KILL_SWITCH",
        "identities_frozen": identities_updated,
        "delegation_links_quarantined": links_updated,
        "provider_credentials_quarantined": creds_updated,
        "triggered_at": datetime.utcnow().isoformat(),
        "reason": reason
    }

@router.post("/provider/{provider_name}")
def emergency_provider_kill_switch(
    provider_name: str,
    tenant_id: str = "default_tenant",
    reason: str = "Emergency Provider Scope Freeze Triggered",
    _perm: bool = Depends(require_permission("Cascade Revocation", "execute")),
    db: Session = Depends(get_db)
) -> Dict[str, Any]:
    """
    Provider-Scoped Emergency Kill Switch:
    Quarantines all credentials and jobs associated with a specific cloud/SaaS provider.
    """
    provider_upper = provider_name.upper()

    creds_updated = db.query(ProviderCredential).filter(
        ProviderCredential.tenant_id == tenant_id,
        ProviderCredential.provider == provider_upper
    ).update({"status": "QUARANTINED"}, synchronize_session=False)

    jobs_updated = db.query(RevocationJob).filter(
        RevocationJob.tenant_id == tenant_id,
        RevocationJob.target_type == provider_upper,
        RevocationJob.status.in_(["PENDING", "IN_PROGRESS", "VERIFYING"])
    ).update({"status": "ESCALATED"}, synchronize_session=False)

    db.commit()

    append_tamper_evident_audit(
        db=db,
        module="Emergency Kill Switch",
        action="PROVIDER_KILL_SWITCH_TRIGGERED",
        performed_by="Operator",
        new_value=f"CRITICAL: Provider kill switch executed for '{provider_upper}' (Tenant: {tenant_id}). Quarantined {creds_updated} credentials and escalated {jobs_updated} active jobs.",
        tenant_id=tenant_id
    )

    return {
        "tenant_id": tenant_id,
        "provider": provider_upper,
        "action": "PROVIDER_EMERGENCY_KILL_SWITCH",
        "credentials_quarantined": creds_updated,
        "jobs_escalated": jobs_updated,
        "triggered_at": datetime.utcnow().isoformat(),
        "reason": reason
    }

@router.post("/agent/{agent_id}")
def emergency_agent_kill_switch(
    agent_id: int,
    tenant_id: str = "default_tenant",
    reason: str = "Emergency Compromised Agent Kill Switch Triggered",
    _perm: bool = Depends(require_permission("Cascade Revocation", "execute")),
    db: Session = Depends(get_db)
) -> Dict[str, Any]:
    """
    Agent-Scoped Emergency Kill Switch:
    Instantly freezes an agent identity and initiates a full cascade revocation sweep across downstream links.
    """
    agent = db.query(Identity).filter(
        Identity.id == agent_id,
        Identity.tenant_id == tenant_id
    ).first()

    if not agent:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Agent identity #{agent_id} not found."
        )

    agent.is_frozen = True
    agent.status = "FROZEN"
    db.commit()

    # Trigger cascade revocation event
    event = RevocationEvent(
        tenant_id=tenant_id,
        source_identity_id=agent_id,
        reason=f"EMERGENCY_KILL_SWITCH: {reason}",
        status="Pending"
    )
    db.add(event)
    db.commit()
    db.refresh(event)

    # Execute cascade revocation sweep
    run_cascade(event.id)

    db.refresh(event)

    return {
        "tenant_id": tenant_id,
        "agent_id": agent_id,
        "agent_display_name": agent.display_name,
        "action": "AGENT_EMERGENCY_KILL_SWITCH",
        "cascade_event_id": event.id,
        "cascade_status": event.status,
        "revoked_count": event.revoked_count,
        "triggered_at": datetime.utcnow().isoformat()
    }
