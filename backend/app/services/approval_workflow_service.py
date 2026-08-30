"""
Phase 7 — Deterministic Approval Workflow Service
Routes access request approval steps using deterministic policy rules.
NO AI/ML. All routing is rule-based.
"""
import uuid
import hashlib
from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional
from sqlalchemy.orm import Session

from app.models.access_request import AccessRequest
from app.models.access_request_approval_step import AccessRequestApprovalStep
from app.models.catalog_item import CatalogItem


# Valid approver types (deterministic routing targets)
APPROVER_TYPES = {
    "MANAGER", "APPLICATION_OWNER", "ENTITLEMENT_OWNER",
    "SECURITY_ADMIN", "COMPLIANCE", "CUSTOM_ROLE"
}

# Deterministic state transitions — no arbitrary mutations
APPROVAL_STEP_TRANSITIONS = {
    "PENDING": {"APPROVED", "DENIED", "ESCALATED", "TIMED_OUT"},
    "ESCALATED": {"APPROVED", "DENIED", "TIMED_OUT"},
    "APPROVED": set(),  # terminal
    "DENIED": set(),    # terminal
    "TIMED_OUT": set(), # terminal
    "SKIPPED": set(),   # terminal
}


class ApprovalWorkflowService:

    @staticmethod
    def create_approval_steps(
        db: Session,
        tenant_id: str,
        access_request_id: str,
        catalog_item: CatalogItem,
        requester_principal_id: str,
        trace_id: str
    ) -> List[AccessRequestApprovalStep]:
        """
        Deterministically create approval steps based on catalog item's approval_policy_id
        and risk level. Returns the ordered list of steps.
        """
        steps = []
        policy_decision_id = f"pdec_{hashlib.sha256(f'{tenant_id}:{access_request_id}'.encode()).hexdigest()[:16]}"

        # Step 1: Always require APPLICATION_OWNER for HIGH/CRITICAL risk
        if catalog_item.risk_level in ("HIGH", "CRITICAL"):
            step1 = AccessRequestApprovalStep(
                id=str(uuid.uuid4()),
                tenant_id=tenant_id,
                access_request_id=access_request_id,
                step_order=1,
                approver_type="APPLICATION_OWNER",
                approver_principal_id=catalog_item.owner_principal_id,
                status="PENDING",
                due_at=datetime.utcnow() + timedelta(hours=48),
                timeout_hours=48,
                policy_decision_id=policy_decision_id,
                trace_id=trace_id,
                created_at=datetime.utcnow(),
                updated_at=datetime.utcnow()
            )
            steps.append(step1)

        # Step 2: CRITICAL always requires SECURITY_ADMIN
        if catalog_item.risk_level == "CRITICAL":
            step2 = AccessRequestApprovalStep(
                id=str(uuid.uuid4()),
                tenant_id=tenant_id,
                access_request_id=access_request_id,
                step_order=2,
                approver_type="SECURITY_ADMIN",
                status="PENDING",
                due_at=datetime.utcnow() + timedelta(hours=24),
                timeout_hours=24,
                policy_decision_id=policy_decision_id,
                trace_id=trace_id,
                created_at=datetime.utcnow(),
                updated_at=datetime.utcnow()
            )
            steps.append(step2)

        # LOW/MEDIUM risk: single MANAGER approval
        if not steps:
            step_default = AccessRequestApprovalStep(
                id=str(uuid.uuid4()),
                tenant_id=tenant_id,
                access_request_id=access_request_id,
                step_order=1,
                approver_type="MANAGER",
                status="PENDING",
                due_at=datetime.utcnow() + timedelta(hours=48),
                timeout_hours=48,
                policy_decision_id=policy_decision_id,
                trace_id=trace_id,
                created_at=datetime.utcnow(),
                updated_at=datetime.utcnow()
            )
            steps.append(step_default)

        for step in steps:
            db.add(step)

        db.commit()
        return steps

    @staticmethod
    def decide_step(
        db: Session,
        tenant_id: str,
        step_id: str,
        decision: str,
        decided_by: str,
        reason: str = None
    ) -> Dict[str, Any]:
        """
        Apply a deterministic decision to an approval step.
        Enforces maker != checker on high risk, expiration guards, replay prevention,
        and strict tenant isolation.
        """
        step = db.query(AccessRequestApprovalStep).filter(
            AccessRequestApprovalStep.tenant_id == tenant_id,
            AccessRequestApprovalStep.id == step_id
        ).first()

        if not step:
            raise ValueError(f"Step '{step_id}' not found.")

        # Check expiration guard
        if step.due_at and datetime.utcnow() > step.due_at and step.status == "PENDING":
            step.status = "TIMED_OUT"
            step.updated_at = datetime.utcnow()
            db.commit()
            raise ValueError(f"Approval step '{step_id}' has expired (due_at: {step.due_at.isoformat()}).")

        allowed = APPROVAL_STEP_TRANSITIONS.get(step.status, set())
        if decision not in allowed:
            raise ValueError(
                f"Invalid transition: {step.status} → {decision}. "
                f"Allowed: {allowed}"
            )

        # Check maker-checker constraint via access request
        req = db.query(AccessRequest).filter(
            AccessRequest.tenant_id == tenant_id,
            AccessRequest.id == step.access_request_id
        ).first()

        if req and req.requester_principal_id == decided_by:
            # Check catalog item risk level
            cat = db.query(CatalogItem).filter(
                CatalogItem.tenant_id == tenant_id,
                CatalogItem.id == req.catalog_item_id
            ).first()
            if cat and cat.risk_level in ("HIGH", "CRITICAL"):
                raise ValueError("Maker-checker violation: Requester cannot approve their own high-risk access request.")

        step.decision = decision
        step.status = decision
        step.decided_by_principal_id = decided_by
        step.decision_reason = reason
        step.decided_at = datetime.utcnow()
        step.updated_at = datetime.utcnow()
        db.commit()

        return {
            "step_id": step.id,
            "access_request_id": step.access_request_id,
            "decision": decision,
            "decided_by": decided_by,
            "decided_at": step.decided_at.isoformat()
        }

    @staticmethod
    def get_pending_steps(db: Session, tenant_id: str, approver_principal_id: str) -> List[Dict]:
        """Returns all pending steps for an approver (approval inbox)."""
        steps = db.query(AccessRequestApprovalStep).filter(
            AccessRequestApprovalStep.tenant_id == tenant_id,
            AccessRequestApprovalStep.approver_principal_id == approver_principal_id,
            AccessRequestApprovalStep.status == "PENDING"
        ).all()
        return [
            {
                "step_id": s.id,
                "access_request_id": s.access_request_id,
                "approver_type": s.approver_type,
                "step_order": s.step_order,
                "due_at": s.due_at.isoformat() if s.due_at else None
            }
            for s in steps
        ]
