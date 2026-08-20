from datetime import datetime
from typing import Dict, Any, List, Optional, Set
from fastapi import HTTPException

class InvalidStateTransitionError(ValueError):
    """Raised when an invalid state transition is attempted."""
    pass

# Formal RevocationJob State Transition Table
REVOCATION_JOB_TRANSITIONS: Dict[str, Set[str]] = {
    "PENDING": {"QUEUED", "IN_PROGRESS", "FAILED", "ESCALATED", "CONFIRMED"},
    "QUEUED": {"IN_PROGRESS", "FAILED", "ESCALATED"},
    "IN_PROGRESS": {"VERIFYING", "CONFIRMED", "FAILED", "ESCALATED", "UNVERIFIABLE"},
    "VERIFYING": {"CONFIRMED", "MANUALLY_VERIFIED", "FAILED", "ESCALATED", "UNVERIFIABLE", "VERIFYING_DELAYED"},
    "VERIFYING_DELAYED": {"VERIFYING", "CONFIRMED", "FAILED", "ESCALATED", "UNVERIFIABLE"},
    "CONFIRMED": set(),  # Terminal state
    "MANUALLY_VERIFIED": set(),  # Terminal state
    "FAILED": {"PENDING", "QUEUED", "ESCALATED"},  # Allows retry reset
    "ESCALATED": {"PENDING", "MANUALLY_VERIFIED"},
    "UNVERIFIABLE": {"PENDING", "MANUALLY_VERIFIED", "ESCALATED"}
}

# Formal Cascade Event State Transition Table
CASCADE_EVENT_TRANSITIONS: Dict[str, Set[str]] = {
    "PENDING": {"IN_PROGRESS", "In Progress", "FAILED", "CONFIRMED", "PARTIALLY_REVOKED"},
    "Pending": {"IN_PROGRESS", "In Progress", "FAILED", "CONFIRMED", "PARTIALLY_REVOKED"},
    "IN_PROGRESS": {"CONFIRMED", "PARTIALLY_REVOKED", "FAILED"},
    "In Progress": {"CONFIRMED", "PARTIALLY_REVOKED", "FAILED"},
    "CONFIRMED": set(),
    "PARTIALLY_REVOKED": {"IN_PROGRESS", "In Progress", "CONFIRMED"},
    "FAILED": {"IN_PROGRESS", "In Progress", "PENDING", "Pending"}
}

# Formal JIT Lease State Transition Table
JIT_LEASE_TRANSITIONS: Dict[str, Set[str]] = {
    "PENDING": {"ISSUING", "ACTIVE", "COMPENSATION_FAILED"},
    "ISSUING": {"ACTIVE", "ISSUANCE_UNCERTAIN", "COMPENSATION_REQUIRED", "COMPENSATION_FAILED"},
    "ACTIVE": {"REVOKING", "EXPIRING", "EXPIRED", "REVOKED"},
    "ISSUANCE_UNCERTAIN": {"ACTIVE", "COMPENSATION_REQUIRED", "COMPENSATION_FAILED"},
    "COMPENSATION_REQUIRED": {"COMPENSATING", "COMPENSATION_FAILED"},
    "COMPENSATING": {"REVOKED", "COMPENSATION_FAILED"},
    "COMPENSATION_FAILED": {"REVOKING", "COMPENSATING"},
    "EXPIRING": {"EXPIRED", "REVOKED", "EXPIRY_UNVERIFIED"},
    "REVOKING": {"VERIFYING", "REVOKED", "UNVERIFIABLE", "COMPENSATION_FAILED"},
    "VERIFYING": {"REVOKED", "UNVERIFIABLE", "REVOKING"},
    "REVOKED": set(),
    "EXPIRED": set(),
    "EXPIRY_UNVERIFIED": {"EXPIRED", "UNVERIFIABLE"},
    "UNVERIFIABLE": {"REVOKING", "REVOKED"}
}

class StateMachineService:
    """
    Centralized Security Transition Engine (Phase 1):
    Enforces valid state machine transitions across RevocationJobs, CascadeEvents, and JitLeases.
    Records transition trace, timestamp, actor, reason code, and evidence validation.
    """

    @staticmethod
    def transition_revocation_job(
        job,
        target_state: str,
        actor: str = "System",
        reason_code: Optional[str] = None,
        trace_id: Optional[str] = None,
        authority_epoch: Optional[int] = None,
        evidence: Optional[str] = None
    ) -> Dict[str, Any]:
        current_state = job.status
        allowed = REVOCATION_JOB_TRANSITIONS.get(current_state, set())

        if target_state not in allowed:
            raise InvalidStateTransitionError(
                f"Invalid RevocationJob state transition from '{current_state}' to '{target_state}'. Allowed: {allowed}"
            )

        # CONFIRMED requires acceptable verification evidence
        if target_state == "CONFIRMED":
            ev = evidence or getattr(job, "verification_evidence", None) or getattr(job, "confirmation_payload", None)
            if not ev:
                raise InvalidStateTransitionError(
                    "Transition to 'CONFIRMED' requires acceptable external provider verification evidence."
                )

        job.status = target_state
        job.updated_at = datetime.utcnow()
        if target_state == "CONFIRMED":
            job.confirmed_at = datetime.utcnow()

        return {
            "entity": "RevocationJob",
            "entity_id": str(job.id),
            "previous_state": current_state,
            "new_state": target_state,
            "timestamp": datetime.utcnow().isoformat(),
            "actor": actor,
            "reason_code": reason_code or "STATE_TRANSITION",
            "trace_id": trace_id or getattr(job, "trace_id", None),
            "authority_epoch": authority_epoch or 1,
            "evidence_reference": evidence or getattr(job, "verification_evidence", None)
        }

    @staticmethod
    def transition_cascade_event(
        event,
        target_state: str,
        actor: str = "System",
        reason_code: Optional[str] = None,
        trace_id: Optional[str] = None,
        authority_epoch: Optional[int] = None
    ) -> Dict[str, Any]:
        current_state = event.status
        allowed = CASCADE_EVENT_TRANSITIONS.get(current_state, set())

        if target_state not in allowed:
            raise InvalidStateTransitionError(
                f"Invalid CascadeEvent state transition from '{current_state}' to '{target_state}'. Allowed: {allowed}"
            )

        event.status = target_state
        if target_state in ("CONFIRMED", "PARTIALLY_REVOKED"):
            event.completed_at = datetime.utcnow()

        return {
            "entity": "CascadeEvent",
            "entity_id": str(event.id),
            "previous_state": current_state,
            "new_state": target_state,
            "timestamp": datetime.utcnow().isoformat(),
            "actor": actor,
            "reason_code": reason_code or "CASCADE_TRANSITION",
            "trace_id": trace_id,
            "authority_epoch": authority_epoch or 1
        }

    @staticmethod
    def transition_jit_lease(
        lease,
        target_state: str,
        actor: str = "System",
        reason_code: Optional[str] = None,
        trace_id: Optional[str] = None,
        authority_epoch: Optional[int] = None
    ) -> Dict[str, Any]:
        current_state = lease.status
        allowed = JIT_LEASE_TRANSITIONS.get(current_state, set())

        if target_state not in allowed:
            raise InvalidStateTransitionError(
                f"Invalid JitLease state transition from '{current_state}' to '{target_state}'. Allowed: {allowed}"
            )

        lease.status = target_state
        lease.updated_at = datetime.utcnow()
        if target_state in ("REVOKED", "EXPIRED"):
            lease.revoked_at = datetime.utcnow()

        return {
            "entity": "JitLease",
            "entity_id": str(lease.id),
            "previous_state": current_state,
            "new_state": target_state,
            "timestamp": datetime.utcnow().isoformat(),
            "actor": actor,
            "reason_code": reason_code or "LEASE_TRANSITION",
            "trace_id": trace_id or getattr(lease, "trace_id", None),
            "authority_epoch": authority_epoch or 1
        }
