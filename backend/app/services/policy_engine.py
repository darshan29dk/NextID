import json
import logging
from typing import List, Dict, Any

logger = logging.getLogger(__name__)

def evaluate_policy_chain(policies: List[Any], context: Dict[str, Any]) -> Dict[str, Any]:
    """
    Evaluates policy chain with DENY > REQUIRE_APPROVAL > ALLOW precedence.
    """
    requested_entitlement = context.get("action", "*")
    policies_matched = []
    for p in policies:
        if isinstance(p, dict):
            policies_matched.append(p)
        else:
            policies_matched.append({
                "name": getattr(p, "name", "Policy"),
                "denied_permissions": json.loads(p.denied_permissions_json) if getattr(p, "denied_permissions_json", None) else [],
                "allowed_permissions": json.loads(p.allowed_permissions_json) if getattr(p, "allowed_permissions_json", None) else ["*"],
                "requires_approval": getattr(p, "requires_approval", False)
            })

    return evaluate_policy_precedence(policies_matched, requested_entitlement)

def evaluate_policy_precedence(policies_matched: List[Dict[str, Any]], requested_entitlement: str) -> Dict[str, Any]:
    """
    Deterministic Policy Evaluation Engine:
    Precedence order: DENY > REQUIRE_APPROVAL > ALLOW
    """
    explanation_steps = []
    
    # 1. Check explicit DENY rules first
    for pol in policies_matched:
        denied_perms = pol.get("denied_permissions", [])
        if requested_entitlement in denied_perms or "*" in denied_perms:
            explanation_steps.append(f"Explicit DENY matched by policy '{pol.get('name')}' for entitlement '{requested_entitlement}'.")
            return {
                "decision": "DENY",
                "reason_code": "POLICY_DENY_MATCH",
                "explanation": " ".join(explanation_steps),
                "policy_name": pol.get("name")
            }

    # 2. Check REQUIRE_APPROVAL rules
    for pol in policies_matched:
        if pol.get("requires_approval", False):
            explanation_steps.append(f"REQUIRE_APPROVAL matched by policy '{pol.get('name')}'.")
            return {
                "decision": "REQUIRE_APPROVAL",
                "reason_code": "POLICY_APPROVAL_REQUIRED",
                "explanation": " ".join(explanation_steps),
                "policy_name": pol.get("name")
            }

    # 3. Check ALLOW rules
    for pol in policies_matched:
        allowed_perms = pol.get("allowed_permissions", [])
        if requested_entitlement in allowed_perms or "*" in allowed_perms or not allowed_perms:
            explanation_steps.append(f"ALLOW matched by policy '{pol.get('name')}'.")
            return {
                "decision": "ALLOW",
                "reason_code": "POLICY_ALLOW_MATCH",
                "explanation": " ".join(explanation_steps),
                "policy_name": pol.get("name")
            }

    # Default fallback: DENY
    return {
        "decision": "DENY",
        "reason_code": "DEFAULT_DENY_FALLBACK",
        "explanation": f"No explicit ALLOW policy matched for entitlement '{requested_entitlement}'. Default DENY applied.",
        "policy_name": "Default_Policy"
    }

def validate_privilege_containment(parent_permissions: List[str], child_permissions: List[str]) -> Dict[str, Any]:
    """
    Privilege Non-Amplification Validator:
    Enforces Child Permissions ⊆ Parent Permissions.
    Calculates granted (intersection) and dropped (violations) permissions.
    """
    if "*" in parent_permissions:
        return {
            "valid": True,
            "violations": [],
            "granted_permissions": child_permissions,
            "dropped_permissions": []
        }

    parent_set = set(parent_permissions)
    violations = [p for p in child_permissions if p not in parent_set]
    granted = [p for p in child_permissions if p in parent_set]

    if violations:
        return {
            "valid": False,
            "violations": violations,
            "granted_permissions": granted,
            "dropped_permissions": violations,
            "message": f"Privilege non-amplification violation: Child requested permissions {violations} exceeding parent permissions {parent_permissions}."
        }
    
    return {
        "valid": True,
        "violations": [],
        "granted_permissions": granted,
        "dropped_permissions": []
    }

def evaluate_delegation_governance(
    parent_permissions: List[str],
    child_permissions: List[str],
    delegation_depth: int = 0,
    max_depth: int = 2,
    can_redelegate: bool = True,
    allow_scope_reduction: bool = False
) -> Dict[str, Any]:
    """
    Evaluates structural delegation constraints: depth limits, re-delegation rules, and privilege containment.
    """
    # 1. Depth limit check
    if delegation_depth >= max_depth:
        return {
            "decision": "DENY",
            "reason_code": "MAX_DELEGATION_DEPTH_EXCEEDED",
            "explanation": f"Delegation depth {delegation_depth} reaches or exceeds max depth {max_depth}."
        }

    # 2. Sub-delegation permission check
    if delegation_depth > 0 and not can_redelegate:
        return {
            "decision": "DENY",
            "reason_code": "REDELEGATION_PROHIBITED",
            "explanation": "Principal policy has can_redelegate=False. Sub-delegation is prohibited."
        }

    # 3. Privilege containment check
    containment = validate_privilege_containment(parent_permissions, child_permissions)
    if not containment["valid"]:
        if allow_scope_reduction and containment["granted_permissions"]:
            return {
                "decision": "ALLOW_REDUCED_SCOPE",
                "reason_code": "SCOPE_TRUNCATED_TO_PARENT",
                "granted_permissions": containment["granted_permissions"],
                "dropped_permissions": containment["dropped_permissions"],
                "explanation": f"Child requested permissions {containment['dropped_permissions']} exceeding parent authority. Scope truncated to parent granted permissions {containment['granted_permissions']}."
            }
        else:
            return {
                "decision": "DENY",
                "reason_code": "PRIVILEGE_AMPLIFICATION_DENIED",
                "granted_permissions": [],
                "dropped_permissions": containment["violations"],
                "explanation": containment["message"]
            }

    return {
        "decision": "ALLOW",
        "reason_code": "PRIVILEGE_CONTAINED",
        "granted_permissions": containment["granted_permissions"],
        "dropped_permissions": [],
        "explanation": "Child permissions are fully contained within parent authority."
    }
