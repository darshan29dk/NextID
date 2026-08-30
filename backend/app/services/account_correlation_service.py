"""
Phase 12 — Deterministic Account Correlation Service
Maps external accounts to Principals using deterministic evidence rules.
Ambiguous high-risk accounts go to MANUAL_REVIEW — never auto-correlated.
NO ML confidence scoring.
"""
import uuid
import json
from datetime import datetime
from typing import List, Dict, Any, Optional
from sqlalchemy.orm import Session

from app.models.account_correlation import AccountCorrelationRecord
from app.models.principal import Principal
from app.models.identity import Identity
from app.models.account import Account


class AccountCorrelationService:

    @staticmethod
    def correlate_account(
        db: Session,
        tenant_id: str,
        external_account_id: str,
        external_system: str,
        username: Optional[str] = None,
        email: Optional[str] = None,
        employee_id: Optional[str] = None,
        risk_level: str = "LOW",
        authority_epoch: Optional[int] = None,
        trace_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Deterministically correlate an external account to a Canonical Principal.
        Rules:
        1. Exact employee_id match -> MATCHED (confidence: 1.0)
        2. Exact email match -> MATCHED (confidence: 1.0)
        3. Exact username to principal email/display_name match -> MATCHED (confidence: 0.9)
        4. Multiple matches -> AMBIGUOUS -> MANUAL_REVIEW
        5. High/Critical risk with confidence < 1.0 -> MANUAL_REVIEW (fail-safe)
        6. No matches -> UNMATCHED
        """
        candidates: List[Principal] = []
        rule_name = "NONE"
        rule_confidence = 0.0
        evidence_dict = {
            "external_account_id": external_account_id,
            "external_system": external_system,
            "username": username,
            "email": email,
            "employee_id": employee_id
        }

        # Rule 1: Match on employee_id / Principal ID
        if employee_id:
            p = db.query(Principal).filter(
                Principal.tenant_id == tenant_id,
                Principal.id == employee_id
            ).first()
            if p:
                candidates.append(p)
                rule_name = "EXACT_EMPLOYEE_ID"
                rule_confidence = 1.0

        # Rule 2: Match on Email
        if not candidates and email:
            ps = db.query(Principal).filter(
                Principal.tenant_id == tenant_id,
                Principal.email == email
            ).all()
            if ps:
                candidates = ps
                rule_name = "EXACT_EMAIL"
                rule_confidence = 1.0 if len(ps) == 1 else 0.5

        # Rule 3: Match on Username
        if not candidates and username:
            ps = db.query(Principal).filter(
                Principal.tenant_id == tenant_id,
                (Principal.display_name == username) | (Principal.email.like(f"{username}@%"))
            ).all()
            if ps:
                candidates = ps
                rule_name = "USERNAME_MATCH"
                rule_confidence = 0.85 if len(ps) == 1 else 0.4

        matched_principal_id = None
        candidate_ids = [c.id for c in candidates]
        status = "UNMATCHED"
        requires_manual_review = False

        if len(candidates) == 1:
            matched_principal = candidates[0]
            # Safety rule: If high/critical risk and confidence < 1.0, require manual review
            if risk_level.upper() in ["HIGH", "CRITICAL"] and rule_confidence < 1.0:
                status = "MANUAL_REVIEW"
                requires_manual_review = True
            else:
                status = "MATCHED"
                matched_principal_id = matched_principal.id
        elif len(candidates) > 1:
            status = "AMBIGUOUS"
            requires_manual_review = True
        else:
            status = "UNMATCHED"

        evidence_dict["matched_rule"] = rule_name
        explanation = f"Evaluated deterministic rule '{rule_name}' with confidence {rule_confidence} (Found {len(candidates)} candidate(s))."

        record = AccountCorrelationRecord(
            id=str(uuid.uuid4()),
            tenant_id=tenant_id,
            external_account_id=external_account_id,
            external_system=external_system,
            username=username,
            matched_principal_id=matched_principal_id,
            candidate_principal_ids=json.dumps(candidate_ids),
            status=status,
            correlation_evidence=json.dumps(evidence_dict),
            rule_confidence=rule_confidence,
            confidence_explanation=explanation,
            risk_level=risk_level.upper(),
            requires_manual_review=requires_manual_review,
            authority_epoch=authority_epoch,
            trace_id=trace_id,
            correlation_rule_version="1.0.0",
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow()
        )
        db.add(record)
        db.commit()
        db.refresh(record)

        return {
            "record_id": record.id,
            "status": record.status,
            "matched_principal_id": record.matched_principal_id,
            "candidate_count": len(candidates),
            "rule_confidence": record.rule_confidence,
            "requires_manual_review": record.requires_manual_review,
            "explanation": explanation
        }

    @staticmethod
    def manual_review_decision(
        db: Session,
        tenant_id: str,
        record_id: str,
        decision: str,  # CONFIRM | REJECT | ESCALATE
        principal_id_override: Optional[str],
        reviewed_by: str
    ) -> Dict[str, Any]:
        """
        Record a human manual review decision on an ambiguous or high-risk correlation.
        """
        record = db.query(AccountCorrelationRecord).filter(
            AccountCorrelationRecord.tenant_id == tenant_id,
            AccountCorrelationRecord.id == record_id
        ).first()

        if not record:
            raise ValueError(f"Correlation record '{record_id}' not found.")

        if decision == "CONFIRM":
            if not principal_id_override:
                raise ValueError("Principal ID override is required to confirm correlation.")
            # Verify principal exists
            p = db.query(Principal).filter(
                Principal.tenant_id == tenant_id,
                Principal.id == principal_id_override
            ).first()
            if not p:
                raise ValueError(f"Principal '{principal_id_override}' does not exist.")
            record.matched_principal_id = principal_id_override
            record.status = "MATCHED"
        elif decision == "REJECT":
            record.matched_principal_id = None
            record.status = "UNMATCHED"
        elif decision == "ESCALATE":
            record.status = "MANUAL_REVIEW"
        else:
            raise ValueError(f"Invalid decision: {decision}")

        record.review_decision = decision
        record.reviewed_by = reviewed_by
        record.reviewed_at = datetime.utcnow()
        record.updated_at = datetime.utcnow()
        db.commit()

        return {
            "record_id": record.id,
            "status": record.status,
            "matched_principal_id": record.matched_principal_id,
            "review_decision": decision,
            "reviewed_by": reviewed_by
        }
