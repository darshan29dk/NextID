from fastapi import APIRouter, Depends, HTTPException, status
from typing import Dict, Any, Optional, List
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from app.database import get_db
from app.services.runtime_auth import authorize_runtime_action

router = APIRouter(prefix="/api/v1/runtime-auth", tags=["Runtime Delegation Governance"])

class RuntimeAuthRequest(BaseModel):
    tenant_id: str = Field(default="default_tenant", description="Tenant ID context")
    principal_id: Any = Field(default=1, description="Principal ID or Agent identifier")
    action: str = Field(default="EXECUTE", description="Requested action or entitlement")
    resource: str = Field(default="ALL", description="Target resource identifier")
    task_purpose: str = Field(default="DEFAULT_TASK", description="ABAC Task / Purpose context")
    risk_score: float = Field(default=0.0, ge=0.0, le=1.0, description="Risk score (0.0 - 1.0)")
    requested_permissions: Optional[List[str]] = Field(default=None, description="Child requested permissions list")
    parent_permissions: Optional[List[str]] = Field(default=None, description="Parent granted permissions list")
    delegation_depth: int = Field(default=0, ge=0, description="Current delegation depth")
    max_depth: int = Field(default=2, ge=1, description="Maximum permitted delegation depth")
    can_redelegate: bool = Field(default=True, description="Whether sub-delegation is allowed")
    cross_org: bool = Field(default=False, description="Whether request crosses org/tenant boundaries")
    allow_scope_reduction: bool = Field(default=False, description="Whether scope truncation fallback is permitted")
    context: Optional[Dict[str, Any]] = Field(default_factory=dict, description="Additional context parameters")

class RuntimeAuthResponse(BaseModel):
    decision: str
    reason_code: str
    effective_permissions: List[str]
    dropped_permissions: List[str]
    policy_id: str
    policy_version: str
    trust_contract_id: Optional[str] = None
    requires_approval: bool
    evaluated_at: str
    trace_id: str
    subject: str
    actor: str
    action: str
    resource: str
    tenant_id: str
    task_purpose: str
    risk_score: float
    authority_epoch: int
    authorized: bool
    explanation: str

@router.post("/evaluate", response_model=RuntimeAuthResponse)
def evaluate_runtime_delegation_endpoint(
    req: RuntimeAuthRequest,
    db: Session = Depends(get_db)
):
    """
    Evaluates runtime delegation request against NextID M4 Governance rules:
    - Principal freeze / revocation / stale epoch check
    - Required task/purpose verification
    - Structural delegation caps (max_depth, can_redelegate)
    - Cross-org TrustContract approval & expiration check
    - Privilege non-amplification (Child ⊆ Parent)
    - Centrally enforced precedence (DENY > REQUIRE_APPROVAL > ALLOW_REDUCED_SCOPE > ALLOW)
    """
    try:
        result = authorize_runtime_action(
            db=db,
            tenant_id=req.tenant_id,
            principal_id=req.principal_id,
            action=req.action,
            resource=req.resource,
            task_purpose=req.task_purpose,
            risk_score=req.risk_score,
            requested_permissions=req.requested_permissions,
            parent_permissions=req.parent_permissions,
            delegation_depth=req.delegation_depth,
            max_depth=req.max_depth,
            can_redelegate=req.can_redelegate,
            cross_org=req.cross_org,
            allow_scope_reduction=req.allow_scope_reduction,
            context=req.context
        )
        return result
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error evaluating runtime delegation governance: {str(e)}"
        )
