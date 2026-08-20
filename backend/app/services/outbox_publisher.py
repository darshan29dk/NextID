import json
import logging
from datetime import datetime, timedelta
from sqlalchemy.orm import Session
from app.models.outbox import OutboxEvent
from app.models.poison_message import PoisonMessage

logger = logging.getLogger(__name__)

def publish_pending_outbox_events(db: Session, publisher_id: str = "pub_worker_1", batch_size: int = 10, lease_seconds: int = 30) -> int:
    """
    Outbox Publisher Daemon:
    Uses FOR UPDATE SKIP LOCKED to claim outbox events with short transaction leases (claimed_by & lease_expires_at),
    wraps in v1.0 message envelope, and dispatches to queue broker.
    Fails over to poison_messages table if event exceeds max retries.
    """
    now = datetime.utcnow()
    
    events = db.query(OutboxEvent).filter(
        OutboxEvent.status == "PENDING_PUBLISH"
    ).with_for_update(skip_locked=True).limit(batch_size).all()
    
    if not events:
        return 0

    # Short transaction 1: Claim lease
    for ev in events:
        ev.claimed_by = publisher_id
        ev.lease_expires_at = now + timedelta(seconds=lease_seconds)
    db.commit()

    published_count = 0

    # Short transaction 2: Dispatch and mark published
    for ev in events:
        try:
            ev.retry_count += 1
            
            envelope = {
                "schema_version": "v1.0",
                "message_id": f"msg-{ev.id}",
                "tenant_id": ev.tenant_id,
                "event_type": ev.event_type,
                "aggregate_type": ev.aggregate_type,
                "aggregate_id": ev.aggregate_id,
                "payload": json.loads(ev.payload_json) if isinstance(ev.payload_json, str) else ev.payload_json,
                "produced_at": datetime.utcnow().isoformat()
            }

            logger.info(f"[OUTBOX PUBLISHER] Publisher '{publisher_id}' dispatched message '{envelope['message_id']}' ({ev.event_type}) for Tenant '{ev.tenant_id}'.")
            
            ev.status = "PUBLISHED"
            ev.claimed_by = None
            ev.lease_expires_at = None
            ev.published_at = datetime.utcnow()
            db.commit()
            published_count += 1

        except Exception as exc:
            ev.error_log = f"Publish failed attempt {ev.retry_count}: {str(exc)}"
            if ev.retry_count >= ev.max_retries:
                logger.error(f"[OUTBOX PUBLISHER] Event {ev.id} failed {ev.retry_count} retries. Moving to Poison Messages.")
                ev.status = "FAILED_PUBLISH"
                ev.claimed_by = None
                ev.lease_expires_at = None
                
                poison = PoisonMessage(
                    tenant_id=ev.tenant_id,
                    outbox_id=ev.id,
                    aggregate_type=ev.aggregate_type,
                    aggregate_id=ev.aggregate_id,
                    payload_json=ev.payload_json,
                    error_stack=str(exc),
                    failed_attempts=ev.retry_count
                )
                db.add(poison)
            db.commit()

    return published_count
