"""
Phase 8 — Deterministic SoD Engine
Evaluates SoD conflicts using existing SodPolicy / SodPolicyRule models.
Never silently overrides. NO AI/ML.
"""
import uuid
import json
from datetime import datetime
from typing import List, Dict, Any, Optional
from sqlalchemy.orm import Session

from app.models.sod_policy import SodPolicy, SodPolicyRule
from app.models.sod_exception import SodException
from app.models.sod_conflict_check import SoDConflictCheck
from app.models.account import Account
from app.models.account_entitlement import AccountEntitlement


class SoDEngine:

    @staticmethod
    def evaluate(
        db: Session,
        tenant_id: str,
        principal_id: str,
        requested_entitlement_id: str,
        requested_entitlement_name: str,
        trigger_type: str,
        trigger_id: str,
        authority_epoch: int = None,
        trace_id: str = None
    ) -> Dict[str, Any]:
        """
        Deterministic SoD check. Returns result: CLEAR | CONFLICT | EXCEPTION_REQUIRED.
        Never silently overrides a conflict.
        """
        # Get all active entitlements held by this principal via their accounts
        held = db.query(AccountEntitlement).join(
            Account, AccountEntitlement.account_id == Account.id
        ).filter(
            AccountEntitlement.tenant_id == tenant_id,
            Account.principal_id == principal_id,
            AccountEntitlement.status == "ACTIVE"
        ).all()
        held_entitlement_ids = {ae.entitlement_id for ae in held}

        # Load active SoD rules for this tenant
        active_policies = db.query(SodPolicy).filter(
            SodPolicy.status == "ACTIVE"
        ).all()

        conflicts = []
        for policy in active_policies:
            for rule in policy.rules:
                conflict_ent = None
                if rule.entitlement_one == requested_entitlement_id and rule.entitlement_two in held_entitlement_ids:
                    conflict_ent = rule.entitlement_two
                elif rule.entitlement_two == requested_entitlement_id and rule.entitlement_one in held_entitlement_ids:
                    conflict_ent = rule.entitlement_one

                if conflict_ent:
                    conflicts.append({
                        "policy_id": policy.id,
                        "policy_code": policy.policy_code,
                        "risk_level": policy.risk_level,
                        "conflicting_entitlement_id": conflict_ent
                    })

        if not conflicts:
            result = "CLEAR"
            risk_level = None
            exception_required = False
        else:
            # Check for valid exception
            exception = db.query(SodException).filter(
                (SodException.employee_id == principal_id) | (SodException.requested_by == principal_id),
                SodException.status.in_(["APPROVED", "ACTIVE"])
            ).first()

            has_valid_exception = (
                exception is not None
                and (exception.expiry_date is None or exception.expiry_date > datetime.utcnow())
            )

            if has_valid_exception:
                result = "EXCEPTION_REQUIRED"
                exception_required = True
            else:
                result = "CONFLICT"
                exception_required = False

            risk_level = max((c["risk_level"] for c in conflicts), default="LOW",
                           key=lambda x: {"LOW": 0, "MEDIUM": 1, "HIGH": 2, "CRITICAL": 3}.get(x, 0))

        # Persist check
        check = SoDConflictCheck(
            id=str(uuid.uuid4()),
            tenant_id=tenant_id,
            trigger_type=trigger_type,
            trigger_id=trigger_id,
            principal_id=principal_id,
            requested_entitlement_id=requested_entitlement_id,
            requested_entitlement_name=requested_entitlement_name,
            conflicting_entitlement_ids=json.dumps([c["conflicting_entitlement_id"] for c in conflicts]),
            conflicting_policy_ids=json.dumps([c["policy_id"] for c in conflicts]),
            result=result,
            risk_level=risk_level,
            exception_valid=exception_required,
            evaluated_at=datetime.utcnow(),
            authority_epoch=authority_epoch,
            trace_id=trace_id
        )
        db.add(check)
        db.commit()

        return {
            "result": result,
            "conflicts": conflicts,
            "risk_level": risk_level,
            "exception_required": exception_required,
            "check_id": check.id
        }
