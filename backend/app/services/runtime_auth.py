import uuid
import logging
from datetime import datetime
from typing import Dict, Any, Optional, List
from sqlalchemy.orm import Session
from app.models.principal import Principal
from app.models.identity import Identity
from app.models.delegation_policy import DelegationPolicy
from app.models.trust_contract import TrustContract
from app.services.policy_engine import evaluate_policy_chain, evaluate_delegation_governance

logger = logging.getLogger(__name__)

# Centrally enforced precedence hierarchy:
# DENY > REQUIRE_APPROVAL > ALLOW_REDUCED_SCOPE > ALLOW
PRECEDENCE_WEIGHTS = {
    "DENY": 4,
    "REQUIRE_APPROVAL": 3,
    "ALLOW_REDUCED_SCOPE": 2,
    "ALLOW": 1
}

def combine_governance_decisions(decisions: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Centralized Decision Combination Function:
    Enforces deterministic precedence hierarchy:
    DENY > REQUIRE_APPROVAL > ALLOW_REDUCED_SCOPE > ALLOW
    """
    if not decisions:
        return {
            "decision": "DENY",
            "reason_code": "DEFAULT_DENY",
            "explanation": "No evaluation decisions provided. Default DENY applied."
        }

    highest_decision = max(decisions, key=lambda d: PRECEDENCE_WEIGHTS.get(d.get("decision", "DENY"), 4))
    return highest_decision

def authorize_runtime_action(
    db: Optional[Session] = None,
    tenant_id: str = "default_tenant",
    principal_id: Any = 1,
    action: str = "EXECUTE",
    resource: str = "ALL",
    task_purpose: str = "DEFAULT_TASK",
    risk_score: float = 0.0,
    requested_permissions: Optional[List[str]] = None,
    parent_permissions: Optional[List[str]] = None,
    delegation_depth: int = 0,
    max_depth: int = 2,
    can_redelegate: bool = True,
    cross_org: bool = False,
    allow_scope_reduction: bool = False,
    context: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """
    Enhanced Milestone M4 Runtime Delegation Governance Engine:
    Evaluates:
    - Principal freeze / revocation / inactive status
    - Monotonic authority epoch freshness (epoch >= expected)
    - Required task/purpose verification
    - Structural delegation caps (max_depth, can_redelegate)
    - Privilege non-amplification (Child ⊆ Parent) with optional scope truncation
    - Cross-org TrustContract validation (active, unexpired, approval requirements)
    - Centrally enforced precedence hierarchy (DENY > REQUIRE_APPROVAL > ALLOW_REDUCED_SCOPE > ALLOW)
    Returns complete explainable audit payload.
    """
    context = context or {}
    evaluated_at = datetime.utcnow().isoformat()
    trace_id = context.get("trace_id") or f"trace-m4-{uuid.uuid4().hex[:8]}"
    
    # Extract context overrides if present
    requested_permissions = requested_permissions if requested_permissions is not None else context.get("requested_permissions")
    parent_permissions = parent_permissions if parent_permissions is not None else context.get("parent_permissions")
    delegation_depth = delegation_depth if delegation_depth != 0 else context.get("delegation_depth", 0)
    max_depth = max_depth if max_depth != 2 else context.get("max_depth", 2)
    if "can_redelegate" in context:
        can_redelegate = context["can_redelegate"]
    if "cross_org" in context:
        cross_org = context["cross_org"]
    if "allow_scope_reduction" in context:
        allow_scope_reduction = context["allow_scope_reduction"]

    display_name = f"principal-{principal_id}"
    principal_type = "AI_AGENT"
    is_frozen = context.get("is_frozen", False)
    status_str = context.get("status", "ACTIVE")
    authority_epoch = context.get("authority_epoch", 1)

    # Normalize db parameter if invalid object passed
    if db is not None and not (hasattr(db, "query") or hasattr(db, "add")):
        db = None
        try:
            principal_obj = db.query(Principal).filter(
                Principal.id == str(principal_id),
                Principal.tenant_id == tenant_id
            ).first()

            identity_obj = None
            if not principal_obj and str(principal_id).isdigit():
                identity_obj = db.query(Identity).filter(
                    Identity.id == int(principal_id),
                    Identity.tenant_id == tenant_id
                ).first()

            if principal_obj:
                display_name = principal_obj.display_name
                principal_type = principal_obj.principal_type
                is_frozen = principal_obj.is_frozen
                status_str = principal_obj.status
                authority_epoch = principal_obj.authority_epoch
            elif identity_obj:
                display_name = identity_obj.display_name
                principal_type = "IDENTITY"
                is_frozen = getattr(identity_obj, "is_frozen", False)
                status_str = identity_obj.status
                authority_epoch = getattr(identity_obj, "authority_epoch", 1)
        except Exception as err:
            logger.warning(f"Error querying DB for principal {principal_id}: {err}")

    # Helper function to format standard response contract
    def build_response(
        decision: str,
        reason_code: str,
        explanation: str,
        effective_permissions: Optional[List[str]] = None,
        dropped_permissions: Optional[List[str]] = None,
        policy_id: str = "pol-m4-default",
        policy_version: str = "v4.0-m4-governance",
        trust_contract_id: Optional[str] = None,
        requires_approval: bool = False
    ) -> Dict[str, Any]:
        eff = effective_permissions if effective_permissions is not None else (requested_permissions or [action])
        drp = dropped_permissions if dropped_permissions is not None else []
        authorized = (decision in ["ALLOW", "ALLOW_REDUCED_SCOPE"])

        return {
            "decision": decision,
            "reason_code": reason_code,
            "effective_permissions": eff,
            "dropped_permissions": drp,
            "policy_id": policy_id,
            "policy_version": policy_version,
            "trust_contract_id": trust_contract_id,
            "requires_approval": requires_approval or (decision == "REQUIRE_APPROVAL"),
            "evaluated_at": evaluated_at,
            "trace_id": trace_id,
            "subject": f"principal-{principal_id}",
            "actor": display_name,
            "action": action,
            "resource": resource,
            "tenant_id": tenant_id,
            "task_purpose": task_purpose,
            "risk_score": risk_score,
            "authority_epoch": authority_epoch,
            "policy_version_id": policy_version,
            "authorized": authorized,
            "explanation": explanation
        }

    evaluation_candidates: List[Dict[str, Any]] = []

    # 2. Check Principal Freeze & Status (Precedence: MUST DENY)
    if is_frozen or (status_str or "").upper() in ["FROZEN", "REVOKING", "REVOKED", "INACTIVE"]:
        return build_response(
            decision="DENY",
            reason_code="PRINCIPAL_FROZEN_OR_REVOKED",
            explanation=f"Principal '{display_name}' ({principal_type}) is currently {status_str}/frozen. Access denied.",
            effective_permissions=[]
        )

    # 3. Check Stale Authority Epoch
    requested_epoch = context.get("requested_authority_epoch")
    if requested_epoch is not None and requested_epoch < authority_epoch:
        return build_response(
            decision="DENY",
            reason_code="STALE_AUTHORITY_EPOCH",
            explanation=f"Requested authority epoch {requested_epoch} is stale against current epoch {authority_epoch}.",
            effective_permissions=[]
        )

    # 4. Check Required Task / Purpose Verification
    if context.get("require_task_purpose", False) and (not task_purpose or task_purpose in ["DEFAULT_TASK", "NONE", ""]):
        return build_response(
            decision="DENY",
            reason_code="MISSING_TASK_PURPOSE",
            explanation="Policy requires a valid task/purpose context for execution.",
            effective_permissions=[]
        )

    # 5. Check Cross-Org / Cross-Tenant Trust Contracts
    target_tenant = context.get("target_tenant_id")
    if cross_org or (target_tenant and target_tenant != tenant_id):
        contract_obj = None
        if db is not None and target_tenant:
            try:
                contract_obj = db.query(TrustContract).filter(
                    TrustContract.source_tenant_id == tenant_id,
                    TrustContract.target_tenant_id == target_tenant
                ).first()
            except Exception as err:
                logger.warning(f"Error querying TrustContract: {err}")

        contract_valid = context.get("trust_contract_valid", True if contract_obj else False)
        contract_expired = context.get("trust_contract_expired", False)
        contract_requires_appr = context.get("trust_contract_requires_approval", getattr(contract_obj, "requires_approval", True))
        tc_id = getattr(contract_obj, "id", "tc-cross-org-01") if contract_obj else context.get("trust_contract_id", "tc-external")

        if contract_expired or getattr(contract_obj, "is_active", True) is False:
            return build_response(
                decision="DENY",
                reason_code="TRUST_CONTRACT_EXPIRED",
                explanation=f"Cross-org TrustContract with '{target_tenant or 'partner'}' is expired or inactive.",
                effective_permissions=[],
                trust_contract_id=tc_id
            )

        if not contract_valid and contract_obj is None and not context.get("trust_contract_valid"):
            return build_response(
                decision="DENY",
                reason_code="MISSING_TRUST_CONTRACT",
                explanation=f"No valid cross-org TrustContract established between tenant '{tenant_id}' and '{target_tenant or 'external'}'.",
                effective_permissions=[],
                trust_contract_id=tc_id
            )

        if contract_requires_appr or risk_score >= 0.7:
            evaluation_candidates.append(build_response(
                decision="REQUIRE_APPROVAL",
                reason_code="CROSS_ORG_APPROVAL_REQUIRED",
                explanation=f"Cross-org delegation from tenant '{tenant_id}' requires Four-Eyes approval under TrustContract.",
                effective_permissions=[],
                trust_contract_id=tc_id,
                requires_approval=True
            ))

    # 6. Evaluate Structural Delegation & Privilege Containment
    if parent_permissions is not None and requested_permissions is not None:
        gov_res = evaluate_delegation_governance(
            parent_permissions=parent_permissions,
            child_permissions=requested_permissions,
            delegation_depth=delegation_depth,
            max_depth=max_depth,
            can_redelegate=can_redelegate,
            allow_scope_reduction=allow_scope_reduction
        )
        if gov_res["decision"] == "DENY":
            evaluation_candidates.append(build_response(
                decision="DENY",
                reason_code=gov_res["reason_code"],
                explanation=gov_res["explanation"],
                effective_permissions=[],
                dropped_permissions=gov_res.get("dropped_permissions", [])
            ))
        elif gov_res["decision"] == "ALLOW_REDUCED_SCOPE":
            evaluation_candidates.append(build_response(
                decision="ALLOW_REDUCED_SCOPE",
                reason_code=gov_res["reason_code"],
                explanation=gov_res["explanation"],
                effective_permissions=gov_res["granted_permissions"],
                dropped_permissions=gov_res["dropped_permissions"]
            ))
        elif gov_res["decision"] == "ALLOW":
            evaluation_candidates.append(build_response(
                decision="ALLOW",
                reason_code=gov_res["reason_code"],
                explanation=gov_res["explanation"],
                effective_permissions=gov_res.get("granted_permissions", requested_permissions),
                dropped_permissions=[]
            ))
    else:
        if delegation_depth >= max_depth:
            evaluation_candidates.append(build_response(
                decision="DENY",
                reason_code="MAX_DELEGATION_DEPTH_EXCEEDED",
                explanation=f"Delegation depth {delegation_depth} reaches or exceeds max depth {max_depth}.",
                effective_permissions=[]
            ))
        if delegation_depth > 0 and not can_redelegate:
            evaluation_candidates.append(build_response(
                decision="DENY",
                reason_code="REDELEGATION_PROHIBITED",
                explanation="Principal policy has can_redelegate=False. Sub-delegation is prohibited.",
                effective_permissions=[]
            ))

    # 7. Evaluate Policy Chain from DB if available
    if db is not None:
        try:
            policies = db.query(DelegationPolicy).filter(
                DelegationPolicy.tenant_id == tenant_id,
                DelegationPolicy.is_active == True
            ).all()

            if policies:
                eval_ctx = {
                    "tenant_id": tenant_id,
                    "principal_id": principal_id,
                    "principal_type": principal_type,
                    "action": action,
                    "resource": resource,
                    "risk_score": risk_score,
                    "task_purpose": task_purpose
                }
                pol_res = evaluate_policy_chain(policies, eval_ctx)
                pol_dec = pol_res.get("decision", "ALLOW")
                if pol_dec in ["DENY", "REQUIRE_APPROVAL"]:
                    evaluation_candidates.append(build_response(
                        decision=pol_dec,
                        reason_code=pol_res.get("reason_code", f"POLICY_{pol_dec}"),
                        explanation=pol_res.get("explanation", f"Policy chain evaluated {pol_dec}."),
                        effective_permissions=[] if pol_dec == "DENY" else (requested_permissions or [action]),
                        policy_id=pol_res.get("policy_name", "pol-chain"),
                        policy_version=pol_res.get("policy_version_id", "v4.0-policy")
                    ))
        except Exception as err:
            logger.warning(f"Error evaluating policy chain in DB: {err}")

    # If candidates exist, combine them through central precedence hierarchy (DENY > REQUIRE_APPROVAL > ALLOW_REDUCED_SCOPE > ALLOW)
    if evaluation_candidates:
        return combine_governance_decisions(evaluation_candidates)

    # 8. Permitted Default
    granted_perms = requested_permissions if requested_permissions else [action]
    return build_response(
        decision="ALLOW",
        reason_code="PERMITTED",
        explanation=f"Runtime action '{action}' on resource '{resource}' permitted for '{display_name}'.",
        effective_permissions=granted_perms,
        dropped_permissions=[]
    )
