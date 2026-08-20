import json
import logging
from datetime import datetime
from typing import Dict, Any
from sqlalchemy.orm import Session
from app.models.revocation_dlq import RevocationDLQ
from app.models.revocation import RevocationJob
from app.services.revocation_service import process_revocation_job

logger = logging.getLogger(__name__)

def replay_dlq_item(db: Session, tenant_id: str, dlq_id: str, replayed_by: str, replay_reason: str) -> Dict[str, Any]:
    """
    DLQ Replay Service:
    Triggers an immutable replay of a failed job from the Dead-Letter Queue with full lineage metadata.
    """
    dlq_item = db.query(RevocationDLQ).filter(
        RevocationDLQ.tenant_id == tenant_id,
        RevocationDLQ.id == dlq_id
    ).first()

    if not dlq_item:
        raise Exception(f"DLQ item '{dlq_id}' not found for tenant '{tenant_id}'.")

    if dlq_item.status == "REPLAYED":
        return {"status": "ALREADY_REPLAYED", "message": f"DLQ item '{dlq_id}' has already been replayed."}

    original_payload = json.loads(dlq_item.payload_json) if isinstance(dlq_item.payload_json, str) else dlq_item.payload_json

    # Spawn new RevocationJob representing the replayed attempt
    new_job = RevocationJob(
        tenant_id=tenant_id,
        target_type=original_payload.get("target_type", "GENERIC"),
        target_identity=original_payload.get("target_identity", "unknown"),
        target_entitlement=original_payload.get("target_entitlement", "replayed_job"),
        status="PENDING",
        created_by=f"DLQ Replay ({replayed_by})"
    )
    db.add(new_job)
    db.commit()
    db.refresh(new_job)

    # Process newly replayed job
    processed_job = process_revocation_job(db, new_job)

    # Update DLQ item lineage
    dlq_item.status = "REPLAYED"
    dlq_item.replayed_at = datetime.utcnow()
    dlq_item.replayed_by = replayed_by
    db.commit()

    logger.info(f"[DLQ REPLAY] Replayed DLQ item '{dlq_id}'. New Job ID: '{processed_job.id}'. Status: '{processed_job.status}'.")

    return {
        "dlq_id": dlq_id,
        "original_job_id": dlq_item.job_id,
        "replayed_job_id": processed_job.id,
        "status": processed_job.status,
        "replayed_by": replayed_by,
        "replay_reason": replay_reason
    }
