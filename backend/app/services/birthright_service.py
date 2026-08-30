"""
Phase 11 — Birthright Access Service
Evaluates BirthrightPolicy conditions against identity attributes.
Re-evaluated on JOINER and MOVER. Deterministic — no AI prediction.
"""
import uuid
import json
import hashlib
from datetime import datetime
from typing import List, Dict, Any, Optional
from sqlalchemy.orm import Session

from app.models.birthright_policy import BirthrightPolicy, BirthrightEvaluation
from app.models.account import Account
from app.models.account_entitlement import AccountEntitlement


class BirthrightService:

    @staticmethod
    def create_policy(
        db: Session,
        tenant_id: str,
        name: str,
        conditions: Dict[str, Any],
        entitlement_id: str,
        entitlement_name: str,
        created_by: str,
        description: str = None
    ) -> BirthrightPolicy:
        """
        Create a new birthright policy (starts in DRAFT).
        Must be explicitly activated. Conditions are stored as a JSON dict.
        Policy hash is computed for tamper detection.
        """
        conditions_str = json.dumps(conditions, sort_keys=True)
        policy_hash = hashlib.sha256(
            f"{tenant_id}:{entitlement_id}:{conditions_str}".encode()
        ).hexdigest()

        policy = BirthrightPolicy(
            id=str(uuid.uuid4()),
            tenant_id=tenant_id,
            name=name,
            description=description,
            conditions=conditions_str,
            entitlement_id=entitlement_id,
            entitlement_name=entitlement_name,
            version=1,
            status="DRAFT",
            created_by=created_by,
            policy_hash=policy_hash,
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow()
        )
        db.add(policy)
        db.commit()
        db.refresh(policy)
        return policy

    @staticmethod
    def _conditions_match(conditions: Dict[str, Any], attributes: Dict[str, Any]) -> bool:
        """Deterministic condition evaluation: ALL conditions must match (AND logic)."""
        for key, expected_value in conditions.items():
            actual_value = attributes.get(key)
            if actual_value is None:
                return False
            if isinstance(expected_value, list):
                if actual_value not in expected_value:
                    return False
            elif str(actual_value).upper() != str(expected_value).upper():
                return False
        return True

    @staticmethod
    def evaluate_for_principal(
        db: Session,
        tenant_id: str,
        principal_id: str,
        attributes: Dict[str, Any],
        trigger_type: str,
        trigger_event_id: str = None,
        authority_epoch: int = None,
        trace_id: str = None
    ) -> Dict[str, Any]:
        """
        Evaluate all active birthright policies for a principal's attributes.
        Returns: granted and removed entitlement IDs.
        """
        active_policies = db.query(BirthrightPolicy).filter(
            BirthrightPolicy.tenant_id == tenant_id,
            BirthrightPolicy.status == "ACTIVE"
        ).all()

        matched_policy_ids = []
        entitled_ids = set()

        for policy in active_policies:
            try:
                conditions = json.loads(policy.conditions)
            except Exception:
                continue
            if BirthrightService._conditions_match(conditions, attributes):
                matched_policy_ids.append(policy.id)
                entitled_ids.add(policy.entitlement_id)

        # Get currently held birthright entitlements
        held = db.query(AccountEntitlement).join(
            Account, AccountEntitlement.account_id == Account.id
        ).filter(
            AccountEntitlement.tenant_id == tenant_id,
            Account.principal_id == principal_id,
            AccountEntitlement.source == "BIRTHRIGHT",
            AccountEntitlement.status == "ACTIVE"
        ).all()
        held_ids = {ae.entitlement_id for ae in held}

        to_grant = entitled_ids - held_ids
        to_remove = held_ids - entitled_ids

        # Persist evaluation record
        eval_record = BirthrightEvaluation(
            id=str(uuid.uuid4()),
            tenant_id=tenant_id,
            principal_id=principal_id,
            trigger_type=trigger_type,
            trigger_event_id=trigger_event_id,
            evaluated_attributes=json.dumps(attributes),
            matched_policy_ids=json.dumps(matched_policy_ids),
            granted_entitlement_ids=json.dumps(list(to_grant)),
            removed_entitlement_ids=json.dumps(list(to_remove)),
            authority_epoch=authority_epoch,
            evaluated_at=datetime.utcnow(),
            trace_id=trace_id
        )
        db.add(eval_record)
        db.commit()

        return {
            "evaluation_id": eval_record.id,
            "principal_id": principal_id,
            "matched_policies": len(matched_policy_ids),
            "granted": list(to_grant),
            "removed": list(to_remove),
            "trigger_type": trigger_type
        }
