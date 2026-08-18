import logging
from typing import Optional
from sqlalchemy.orm import Session

from app.models.identity import Identity
from app.models.cascade_revocation import RevocationEvent
from app.services.audit_chain import append_audit_log

logger = logging.getLogger(__name__)

OFFBOARDING_STATUSES = {"Terminated", "Inactive", "Offboarded"}

def maybe_trigger_offboarding_cascade(
    identity_id: int,
    old_status: Optional[str],
    new_status: Optional[str],
    initiated_by: str,
    background_tasks,
    db: Optional[Session] = None
) -> bool:
    """
    Checks if an identity status transition represents a transition INTO an offboarding state
    for a Human identity, and if so, auto-creates a RevocationEvent and dispatches run_cascade
    in the background.
    """
    if not identity_id or not new_status:
        return False

    old_norm = (old_status or "").strip().title()
    new_norm = (new_status or "").strip().title()

    # Rule 1: Must be a transition INTO an offboarding status from a non-offboarding status
    if old_norm in OFFBOARDING_STATUSES or new_norm not in OFFBOARDING_STATUSES:
        return False

    if not db or not background_tasks:
        logger.warning("maybe_trigger_offboarding_cascade missing db session or background_tasks.")
        return False

    try:
        identity = db.query(Identity).filter(Identity.id == identity_id).first()
        if not identity:
            return False

        # Rule 2: Only trigger for Human identities (prevent recursive/unintended NHI cascades)
        identity_type = getattr(identity, "identity_type", None)
        if identity_type and identity_type.strip().lower() not in ["human", "human account"]:
            return False

        # Create RevocationEvent
        event = RevocationEvent(
            source_identity_id=identity.id,
            reason=f"Automatic trigger: identity status changed to '{new_status}'",
            status="Pending"
        )
        db.add(event)
        db.commit()
        db.refresh(event)

        # Deferred import to avoid circular imports
        from app.routes.cascade_revocation import run_cascade
        background_tasks.add_task(run_cascade, event.id)

        # Record tamper-evident audit log entry
        append_audit_log(
            db=db,
            module="Cascade Revocation",
            action="Auto-triggered by offboarding status change",
            performed_by=initiated_by or "System",
            old_value=f"Status: {old_status}",
            new_value=f"RevocationEvent #{event.id} auto-created for identity #{identity.id} ({identity.display_name or identity.email}) due to status transition '{old_status}' -> '{new_status}'."
        )

        logger.info(f"Auto-triggered offboarding cascade event #{event.id} for identity #{identity.id} ('{old_status}' -> '{new_status}')")
        return True

    except Exception as exc:
        logger.exception(f"Error in maybe_trigger_offboarding_cascade for identity #{identity_id}: {exc}")
        return False
