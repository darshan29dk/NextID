import logging
from typing import Dict, Any
from sqlalchemy.orm import Session

from app.models.cascade_revocation import CascadeAction
from app.models.revocation import RevocationJob
from app.services.revocation_service import process_revocation_job

logger = logging.getLogger(__name__)

def retry_failed_cascade_actions(db: Session, max_retries: int = 3) -> Dict[str, Any]:
    """
    Sweeps the database for failed CascadeAction rows that have a linked RevocationJob
    with status FAILED and retry_count < max_retries. Calls process_revocation_job on the
    underlying RevocationJob and syncs the CascadeAction status and attributes afterward.
    """
    failed_actions = db.query(CascadeAction).join(
        RevocationJob, CascadeAction.revocation_job_id == RevocationJob.id
    ).filter(
        CascadeAction.status == "Failed",
        RevocationJob.status == "FAILED",
        RevocationJob.retry_count < max_retries
    ).all()

    retried_count = len(failed_actions)
    successful_count = 0
    failed_count = 0

    for action in failed_actions:
        job = action.revocation_job
        if not job:
            continue

        # Process the RevocationJob via system 1 retry engine
        processed_job = process_revocation_job(db, job)

        # Sync CascadeAction attributes from the processed RevocationJob
        if processed_job.status == "CONFIRMED":
            action.status = "Confirmed"
            action.confirmed_at = processed_job.confirmed_at
            action.error_message = None
            successful_count += 1
        elif processed_job.status == "ESCALATED":
            action.status = "Escalated"
            action.error_message = processed_job.error_log
            failed_count += 1
        else:
            action.status = "Failed"
            action.error_message = processed_job.error_log
            failed_count += 1

        action.retry_count = processed_job.retry_count
        db.commit()

    return {
        "retried_count": retried_count,
        "successful_count": successful_count,
        "failed_count": failed_count
    }

