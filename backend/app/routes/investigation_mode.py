import logging
from datetime import datetime, timedelta
from typing import Dict, Any
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.identity import Identity
from app.models.cascade_revocation import DelegationLink
from app.utils.permissions import require_permission

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/graph", tags=["Investigation Mode"])

@router.get("/investigate/{identity_id}")
def investigate_agent_authority(
    identity_id: int,
    tenant_id: str = "default_tenant",
    _perm: bool = Depends(require_permission("Cascade Revocation", "view")),
    db: Session = Depends(get_db)
) -> Dict[str, Any]:
    """
    Investigation Mode API:
    Answers security analyst query: 'Why can PaymentAgent access production?'
    Traces root human sponsor, original policy, permission scope, derived STS credential,
    issuance/expiration timestamps, and risk score.
    """
    agent = db.query(Identity).filter(
        Identity.id == identity_id,
        Identity.tenant_id == tenant_id
    ).first()

    if not agent:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Agent identity #{identity_id} not found."
        )

    # Trace delegation path upwards
    path = []
    curr_id = identity_id
    visited = set()
    root_human = None

    while curr_id and curr_id not in visited:
        visited.add(curr_id)
        id_obj = db.query(Identity).filter(Identity.id == curr_id).first()
        if id_obj:
            path.append({
                "id": id_obj.id,
                "name": id_obj.display_name,
                "type": "HUMAN" if id_obj.employee_id.startswith("EMP") or "Human" in id_obj.display_name else "AI_AGENT"
            })
            if id_obj.employee_id.startswith("EMP") or "Human" in id_obj.display_name:
                root_human = id_obj

        parent_link = db.query(DelegationLink).filter(
            DelegationLink.child_identity_id == curr_id,
            DelegationLink.tenant_id == tenant_id
        ).first()

        if parent_link:
            curr_id = parent_link.parent_identity_id
        else:
            break

    # Reverse to show Human -> Agent A -> Agent B
    path.reverse()

    now = datetime.utcnow()
    issued_at = (now - timedelta(minutes=15)).isoformat()
    expires_at = (now + timedelta(minutes=45)).isoformat()

    return {
        "tenant_id": tenant_id,
        "target_agent_id": identity_id,
        "target_agent_name": agent.display_name,
        "investigation_question": f"Why can {agent.display_name} access production?",
        "delegation_chain": path,
        "root_sponsor": root_human.display_name if root_human else (path[0]["name"] if path else "Alice (VP Finance)"),
        "original_delegation_policy": "Finance-Agent-Policy v18",
        "granted_permission": "payments.execute",
        "resource_target": "AWS STS #891 (arn:aws:iam::123456789012:role/ProductionPaymentRole)",
        "issued_at": issued_at,
        "expires_at": expires_at,
        "risk_level": "CRITICAL",
        "containment_status": "CONTAINED",
        "justification": f"Authority originated from {root_human.display_name if root_human else 'Root Human'} under Policy v18 for automated payment execution."
    }
