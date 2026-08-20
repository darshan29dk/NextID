from datetime import datetime
from typing import Optional
from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.services.security_context import SecurityContext, get_security_context
from app.services.temporal_provenance_service import TemporalProvenanceService
from app.models.credential_lineage import CredentialLineageNode

router = APIRouter(prefix="/api/v1", tags=["Temporal Graph, Provenance & Credential Lineage"])

@router.get("/authority/graph/history")
def get_historical_authority_graph_endpoint(
    at: Optional[str] = Query(None, description="ISO timestamp for historical graph reconstruction (e.g. 2026-08-20T10:00:00Z)"),
    sec_ctx: SecurityContext = Depends(get_security_context),
    db: Session = Depends(get_db)
):
    """
    Phase 4: Historical Authority Graph Endpoint.
    Reconstructs the exact authority graph valid at time 'at' without mutating current state.
    """
    tenant_id = sec_ctx.tenant_id
    if at:
        try:
            at_dt = datetime.fromisoformat(at.replace("Z", "+00:00"))
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid ISO timestamp format for 'at' parameter.")
    else:
        at_dt = datetime.utcnow()

    return TemporalProvenanceService.get_temporal_authority_graph(db=db, tenant_id=tenant_id, at_timestamp=at_dt)

@router.get("/authority/provenance/{principal_id}")
def get_authority_provenance_endpoint(
    principal_id: str,
    resource: Optional[str] = Query(None, description="Target resource scope filter"),
    permission: Optional[str] = Query(None, description="Target permission claim filter"),
    at: Optional[str] = Query(None, description="Historical timestamp filter"),
    sec_ctx: SecurityContext = Depends(get_security_context),
    db: Session = Depends(get_db)
):
    """
    Phase 5: Explanatory Authority Provenance Endpoint.
    Answers: 'Why does this principal have this authority?' returning root source, delegation path, policies, and confidence.
    """
    tenant_id = sec_ctx.tenant_id
    at_dt = datetime.fromisoformat(at.replace("Z", "+00:00")) if at else None

    prov = TemporalProvenanceService.get_authority_provenance(
        db=db,
        tenant_id=tenant_id,
        principal_id=principal_id,
        resource=resource,
        permission=permission,
        at_timestamp=at_dt
    )

    if not prov.get("provenance_found"):
        raise HTTPException(status_code=404, detail=prov.get("message", "Provenance not found."))

    return prov

@router.get("/credentials/lineage/{principal_id}")
def get_credential_lineage_endpoint(
    principal_id: str,
    sec_ctx: SecurityContext = Depends(get_security_context),
    db: Session = Depends(get_db)
):
    """
    Phase 6: Credential Lineage Tree Endpoint.
    Returns derived credentials for principal (zero raw secrets persisted).
    """
    tenant_id = sec_ctx.tenant_id
    nodes = db.query(CredentialLineageNode).filter(
        CredentialLineageNode.tenant_id == tenant_id,
        CredentialLineageNode.holder_principal_id == principal_id
    ).all()

    return {
        "title": "NextID Derived Credential Lineage Tree",
        "tenant_id": tenant_id,
        "principal_id": principal_id,
        "total_credentials": len(nodes),
        "credentials": [n.to_dict() for n in nodes]
    }
