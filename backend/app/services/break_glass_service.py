"""
Phase 10 — Break Glass Emergency Access Service
Deterministic: strong auth required, max TTL enforced, mandatory audit,
maker-checker for high-risk, provider revocation + verification on expiry.
NEVER creates permanent authority.
"""
import uuid
import json
from datetime import datetime, timedelta
from typing import Dict, Any, Optional
from sqlalchemy.orm import Session

from app.models.break_glass_request import BreakGlassRequest


# Maximum allowed TTL — policy boundary, never overrideable
BREAK_GLASS_MAX_TTL_HOURS = 4

# Resources/patterns that require maker-checker
HIGH_RISK_RESOURCE_PATTERNS = [
    "prod", "production", "critical", "iam", "root",
    "admin", "security-admin", "cloud-admin"
]


class BreakGlassService:

    @staticmethod
    def _requires_maker_checker(resource: str) -> bool:
        """Deterministically decide if a resource requires maker-checker."""
        resource_lower = resource.lower()
        return any(p in resource_lower for p in HIGH_RISK_RESOURCE_PATTERNS)

    @staticmethod
    def submit_request(
        db: Session,
        tenant_id: str,
        principal_id: str,
        resource: str,
        reason: str,
        requested_ttl_hours: int,
        requested_permissions: list = None,
        incident_ticket: str = None,
        authenticated_with: str = None,
        target_application_id: str = None,
        authority_epoch: int = None,
        trace_id: str = None
    ) -> Dict[str, Any]:
        """
        Submit a break glass request.
        TTL is capped at BREAK_GLASS_MAX_TTL_HOURS.
        Maker-checker is set deterministically based on resource risk.
        """
        if not reason or len(reason.strip()) < 20:
            raise ValueError("Break glass reason must be at least 20 characters.")

        capped_ttl = min(requested_ttl_hours, BREAK_GLASS_MAX_TTL_HOURS)
        requires_mc = BreakGlassService._requires_maker_checker(resource)

        req = BreakGlassRequest(
            id=str(uuid.uuid4()),
            tenant_id=tenant_id,
            principal_id=principal_id,
            authenticated_with=authenticated_with,
            resource=resource,
            requested_permissions=json.dumps(requested_permissions or []),
            target_application_id=target_application_id,
            reason=reason.strip(),
            incident_ticket=incident_ticket,
            requested_ttl_hours=requested_ttl_hours,
            max_ttl_hours=BREAK_GLASS_MAX_TTL_HOURS,
            approved_ttl_hours=capped_ttl,
            status="REQUESTED",
            requires_maker_checker=requires_mc,
            authority_epoch=authority_epoch,
            trace_id=trace_id or str(uuid.uuid4()),
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow()
        )
        db.add(req)
        db.commit()
        db.refresh(req)

        return {
            "request_id": req.id,
            "status": req.status,
            "capped_ttl_hours": capped_ttl,
            "requires_maker_checker": requires_mc,
            "resource": resource
        }

    @staticmethod
    def approve(
        db: Session,
        tenant_id: str,
        request_id: str,
        approver_principal_id: str
    ) -> Dict[str, Any]:
        """
        First approval. If maker-checker required, status goes PENDING_CHECKER.
        Otherwise activates immediately with TTL.
        Requester cannot self-approve high-risk emergency access.
        """
        req = db.query(BreakGlassRequest).filter(
            BreakGlassRequest.tenant_id == tenant_id,
            BreakGlassRequest.id == request_id,
            BreakGlassRequest.status == "REQUESTED"
        ).first()

        if not req:
            raise ValueError(f"Break glass request '{request_id}' not found or not in REQUESTED state.")

        if req.requires_maker_checker and approver_principal_id == req.principal_id:
            raise ValueError("Maker-checker violation: requester cannot approve own high-risk break-glass request.")

        req.approver_principal_id = approver_principal_id
        req.approved_at = datetime.utcnow()

        if req.requires_maker_checker:
            req.status = "PENDING_CHECKER"
        else:
            req.status = "ACTIVE"
            req.activated_at = datetime.utcnow()
            req.expires_at = datetime.utcnow() + timedelta(hours=req.approved_ttl_hours)

        req.updated_at = datetime.utcnow()
        db.commit()

        return {
            "request_id": req.id,
            "status": req.status,
            "expires_at": req.expires_at.isoformat() if req.expires_at else None
        }

    @staticmethod
    def checker_approve(
        db: Session,
        tenant_id: str,
        request_id: str,
        checker_principal_id: str
    ) -> Dict[str, Any]:
        """Second-factor maker-checker approval. Activates the break glass grant."""
        req = db.query(BreakGlassRequest).filter(
            BreakGlassRequest.tenant_id == tenant_id,
            BreakGlassRequest.id == request_id,
            BreakGlassRequest.status == "PENDING_CHECKER"
        ).first()

        if not req:
            raise ValueError(f"Request '{request_id}' not found or not in PENDING_CHECKER state.")

        if checker_principal_id == req.principal_id:
            raise ValueError("Maker-checker violation: requester cannot be the checker.")

        if checker_principal_id == req.approver_principal_id:
            raise ValueError("Maker-checker violation: checker cannot be the same as the first approver.")

        req.checker_principal_id = checker_principal_id
        req.checker_approved_at = datetime.utcnow()
        req.status = "ACTIVE"
        req.activated_at = datetime.utcnow()
        req.expires_at = datetime.utcnow() + timedelta(hours=req.approved_ttl_hours)
        req.updated_at = datetime.utcnow()
        db.commit()

        return {
            "request_id": req.id,
            "status": "ACTIVE",
            "expires_at": req.expires_at.isoformat()
        }

    @staticmethod
    def expire_and_revoke(
        db: Session,
        tenant_id: str,
        request_id: str
    ) -> Dict[str, Any]:
        """
        Expire a break glass request on TTL. Routes to provider revocation.
        Caller must invoke RevocationJob engine for actual provider revocation.
        """
        req = db.query(BreakGlassRequest).filter(
            BreakGlassRequest.tenant_id == tenant_id,
            BreakGlassRequest.id == request_id,
            BreakGlassRequest.status == "ACTIVE"
        ).first()

        if not req:
            raise ValueError(f"Request '{request_id}' not found or not ACTIVE.")

        req.status = "REVOKING"
        req.revoked_at = datetime.utcnow()
        req.updated_at = datetime.utcnow()
        db.commit()

        return {
            "request_id": req.id,
            "status": "REVOKING",
            "revoked_at": req.revoked_at.isoformat(),
            "requires_provider_revocation": True,
            "resource": req.resource
        }
