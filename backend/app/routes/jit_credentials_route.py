from fastapi import APIRouter, Depends, HTTPException, status
from typing import Dict, Any, Optional, List
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from app.database import get_db
from app.services.jit_broker import issue_jit_credential, revoke_jit_lease, list_active_leases
from app.services.blast_radius_engine import calculate_blast_radius

router = APIRouter(prefix="/api/v1/jit", tags=["JIT Credential Broker & Blast Radius"])

class JitIssueRequest(BaseModel):
    tenant_id: str = Field(default="default_tenant", description="Tenant ID context")
    principal_id: Any = Field(default="agent-01", description="Principal ID or Agent identifier")
    action: str = Field(default="EXECUTE", description="Requested action or entitlement")
    resource: str = Field(default="AWS_S3_BUCKET", description="Target resource identifier")
    provider_type: str = Field(default="AWS_STS", description="Provider credential type: AWS_STS, VAULT, OAUTH, API_KEY")
    ttl_seconds: int = Field(default=3600, ge=60, le=86400, description="Credential TTL in seconds")
    requested_permissions: Optional[List[str]] = Field(default=None, description="Child requested permissions")
    parent_permissions: Optional[List[str]] = Field(default=None, description="Parent granted permissions")
    delegation_depth: int = Field(default=0, ge=0)
    max_depth: int = Field(default=2, ge=1)
    can_redelegate: bool = Field(default=True)
    cross_org: bool = Field(default=False)
    allow_scope_reduction: bool = Field(default=False)
    context: Optional[Dict[str, Any]] = Field(default_factory=dict)

class JitRevokeRequest(BaseModel):
    lease_id: str = Field(description="JIT Lease ID to revoke")
    tenant_id: str = Field(default="default_tenant", description="Tenant ID context")

class BlastRadiusRequest(BaseModel):
    principal_id: Any = Field(description="Principal ID to simulate revocation for")
    tenant_id: str = Field(default="default_tenant", description="Tenant ID context")

@router.post("/issue")
def issue_jit_credential_endpoint(
    req: JitIssueRequest,
    db: Session = Depends(get_db)
):
    """
    Evaluates M4 runtime governance policy and issues a real short-lived provider credential (AWS STS / Vault / OAuth).
    """
    try:
        result = issue_jit_credential(
            tenant_id=req.tenant_id,
            principal_id=req.principal_id,
            resource=req.resource,
            db=db,
            action=req.action,
            provider_type=req.provider_type,
            ttl_seconds=req.ttl_seconds,
            requested_permissions=req.requested_permissions,
            parent_permissions=req.parent_permissions,
            delegation_depth=req.delegation_depth,
            max_depth=req.max_depth,
            can_redelegate=req.can_redelegate,
            cross_org=req.cross_org,
            allow_scope_reduction=req.allow_scope_reduction,
            context=req.context
        )
        if not result.get("authorized", False):
            return result
        return result
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error issuing JIT credential: {str(e)}"
        )

@router.post("/revoke")
def revoke_jit_lease_endpoint(
    req: JitRevokeRequest,
    db: Session = Depends(get_db)
):
    """
    Revokes an active JIT credential lease instantly.
    """
    try:
        res = revoke_jit_lease(
            lease_id=req.lease_id,
            tenant_id=req.tenant_id,
            db=db
        )
        return res
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error revoking JIT lease: {str(e)}"
        )

@router.get("/leases")
def list_jit_leases_endpoint(
    tenant_id: str = "default_tenant",
    principal_id: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """
    Returns active JIT credential leases for tenant/principal.
    """
    try:
        leases = list_active_leases(
            tenant_id=tenant_id,
            principal_id=principal_id,
            db=db
        )
        return {"tenant_id": tenant_id, "active_leases": leases, "count": len(leases)}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error listing JIT leases: {str(e)}"
        )

@router.post("/blast-radius/simulate")
def simulate_blast_radius_endpoint(
    req: BlastRadiusRequest,
    db: Session = Depends(get_db)
):
    """
    Simulates graph blast radius for revoking a principal (downstream agents, active leases, impacted resources).
    """
    try:
        res = calculate_blast_radius(
            principal_id=req.principal_id,
            tenant_id=req.tenant_id,
            db=db
        )
        return res
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error simulating blast radius: {str(e)}"
        )
