import logging
from datetime import datetime, timedelta
from sqlalchemy.orm import Session
from app.models.inbox import InboxMessage

logger = logging.getLogger(__name__)

def claim_and_process_inbox_message(db: Session, tenant_id: str, message_id: str, consumer_id: str = "revocation_worker", lease_seconds: int = 60) -> bool:
    """
    Consumer Inbox Lifecycle Engine:
    Claims message in PROCESSING state with a lease expiration.
    Supports crash recovery: If a message is stuck in PROCESSING but its lease has expired, it can be reclaimed safely.
    """
    now = datetime.utcnow()
    existing = db.query(InboxMessage).filter(
        InboxMessage.tenant_id == tenant_id,
        InboxMessage.message_id == message_id
    ).first()

    if existing:
        if existing.status == "PROCESSED":
            logger.warning(f"[INBOX CONSUMER] Message '{message_id}' is already PROCESSED. Skipping execution.")
            return False
        elif existing.status == "PROCESSING":
            if existing.lease_expires_at and existing.lease_expires_at > now:
                logger.warning(f"[INBOX CONSUMER] Message '{message_id}' is actively being processed by '{existing.consumer_id}' (Lease valid until {existing.lease_expires_at}). Rejection.")
                return False
            else:
                logger.warning(f"[INBOX CONSUMER] Message '{message_id}' processing lease EXPIRED. Reclaiming message for worker '{consumer_id}'.")
                existing.consumer_id = consumer_id
                existing.lease_expires_at = now + timedelta(seconds=lease_seconds)
                existing.processed_at = now
                db.commit()
                return True

    try:
        inbox_entry = InboxMessage(
            tenant_id=tenant_id,
            message_id=message_id,
            consumer_id=consumer_id,
            status="PROCESSING",
            lease_expires_at=now + timedelta(seconds=lease_seconds),
            processed_at=now
        )
        db.add(inbox_entry)
        db.commit()
        return True
    except Exception as exc:
        db.rollback()
        logger.warning(f"[INBOX CONSUMER] Race condition claiming message '{message_id}': {exc}")
        return False

def finalize_inbox_message(db: Session, tenant_id: str, message_id: str, success: bool = True):
    """
    Finalizes inbox message status to PROCESSED or FAILED after execution completes.
    """
    msg = db.query(InboxMessage).filter(
        InboxMessage.tenant_id == tenant_id,
        InboxMessage.message_id == message_id
    ).first()

    if msg:
        msg.status = "PROCESSED" if success else "FAILED"
        msg.lease_expires_at = None
        msg.processed_at = datetime.utcnow()
        db.commit()
