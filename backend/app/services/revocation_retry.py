import logging
from datetime import datetime
from typing import Dict, Any
from sqlalchemy.orm import Session

from app.models.cascade_revocation import CascadeAction
from app.services.revocation_hooks import (
    revoke_service_account,
    revoke_api_key,
    revoke_agent_session,
    disable_human_account
)

logger = logging.getLogger(__name__)

def retry_failed_cascade_actions(db: Session, max_retries: int = 3) -> Dict[str, Any]:
    """
    Sweeps the database for failed CascadeAction rows with retry_count < max_retries
    and attempts to re-execute their revocation hooks.
    """
    failed_actions = db.query(CascadeAction).filter(
        CascadeAction.status == "Failed",
        CascadeAction.retry_count < max_retries
    ).all()

    retried_count = len(failed_actions)
    successful_count = 0
    failed_count = 0

    for action in failed_actions:
        action.retry_count += 1
        db.commit()

        target_type = (action.target_type or "").upper()
        identifier = action.target_identifier

        if target_type == "SERVICE_ACCOUNT":
            res = revoke_service_account(identifier, db=db)
        elif target_type == "API_KEY":
            res = revoke_api_key(identifier, db=db)
        elif target_type == "AGENT_SESSION":
            res = revoke_agent_session(identifier, db=db)
        else:
            res = disable_human_account(identifier, db=db)

        if res.get("success"):
            action.status = "Confirmed"
            action.confirmed_at = datetime.utcnow()
            action.error_message = None
            successful_count += 1
        else:
            action.status = "Failed"
            action.error_message = res.get("message", "Retry hook call failed.")
            failed_count += 1

        db.commit()

    return {
        "retried_count": retried_count,
        "successful_count": successful_count,
        "failed_count": failed_count
    }
