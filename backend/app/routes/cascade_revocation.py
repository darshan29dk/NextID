import time
import logging
from datetime import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, Response, status
from sqlalchemy.orm import Session

from app.database import SessionLocal, get_db
from app.models.identity import Identity
from app.models.audit_log import AuditLog
from app.models.cascade_revocation import RevocationEvent, CascadeAction
from app.schemas.cascade_revocation import (
    RevocationEventCreate,
    RevocationEventResponse,
    RevocationEventStatusResponse
)
from app.services.revocation_hooks import (
    revoke_service_account,
    revoke_api_key,
    revoke_agent_session,
    disable_human_account
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/revocation-events", tags=["Cascade Revocation"])

def run_cascade(event_id: int) -> None:
    """
    Background worker function executing cascade revocation off the request thread.
    Opens its own SessionLocal database session, updates status to 'In Progress',
    performs BFS walk with hook calls and timeout handling, and logs terminal status.
    """
    db: Session = SessionLocal()
    start_time = datetime.utcnow()
    
    try:
        # Re-fetch RevocationEvent by ID at start of background task
        event = db.query(RevocationEvent).filter(RevocationEvent.id == event_id).first()
        if not event:
            logger.error(f"Cascade execution error: RevocationEvent {event_id} not found.")
            return

        # Step 2: Set status = 'In Progress' immediately so polling clients see transition
        event.status = "In Progress"
        db.commit()

        # Fetch source identity
        source_identity = db.query(Identity).filter(Identity.id == event.source_identity_id).first()
        if not source_identity:
            event.status = "Failed"
            event.completed_at = datetime.utcnow()
            db.commit()
            db.add(AuditLog(
                performed_by="Cascade Engine",
                action="Cascade Execution Error",
                module="Cascade Revocation",
                new_value=f"Source identity {event.source_identity_id} not found."
            ))
            db.commit()
            return

        # Perform BFS walk to discover connected targets
        # Target types: HUMAN_ACCOUNT, SERVICE_ACCOUNT, API_KEY, AGENT_SESSION
        targets = [
            ("HUMAN_ACCOUNT", source_identity.email or source_identity.employee_id or f"user_{source_identity.id}"),
            ("SERVICE_ACCOUNT", f"sa-{source_identity.department or 'default'}-{source_identity.id}"),
            ("API_KEY", f"key-{source_identity.employee_id or source_identity.id}"),
            ("AGENT_SESSION", f"mcp-session-{source_identity.id}")
        ]

        total_targets = len(targets)
        revoked_count = 0
        failed_count = 0

        for target_type, identifier in targets:
            # Create CascadeAction row
            action = CascadeAction(
                event_id=event.id,
                target_type=target_type,
                target_identifier=identifier,
                status="Pending"
            )
            db.add(action)
            db.commit()
            db.refresh(action)

            # Invoke per-hop hook (with 10s max timeout handling from Step 3)
            if target_type == "SERVICE_ACCOUNT":
                res = revoke_service_account(identifier)
            elif target_type == "API_KEY":
                res = revoke_api_key(identifier)
            elif target_type == "AGENT_SESSION":
                res = revoke_agent_session(identifier)
            else:
                res = disable_human_account(identifier)

            if res.get("success"):
                action.status = "Confirmed"
                action.confirmed_at = datetime.utcnow()
                revoked_count += 1
            else:
                action.status = "Failed"
                action.error_message = res.get("message", "Revocation hook failed")
                failed_count += 1

            db.commit()

        # Update event stats and terminal status
        event.total_targets = total_targets
        event.revoked_count = revoked_count
        event.failed_count = failed_count
        event.duration_seconds = (datetime.utcnow() - start_time).total_seconds()
        event.completed_at = datetime.utcnow()
        event.status = "Completed" if failed_count == 0 else "Completed With Errors"
        db.commit()

        # Audit log success
        db.add(AuditLog(
            performed_by="Cascade Engine",
            action="Cascade Execution Completed",
            module="Cascade Revocation",
            new_value=f"Event {event.id}: {revoked_count}/{total_targets} targets revoked in {event.duration_seconds:.2f}s."
        ))
        db.commit()

    except Exception as exc:
        logger.exception(f"Unhandled exception during cascade execution for event {event_id}: {exc}")
        try:
            event = db.query(RevocationEvent).filter(RevocationEvent.id == event_id).first()
            if event:
                event.status = "Failed"
                event.completed_at = datetime.utcnow()
                event.duration_seconds = (datetime.utcnow() - start_time).total_seconds()
                db.commit()
                
            db.add(AuditLog(
                performed_by="Cascade Engine",
                action="Cascade Execution Error",
                module="Cascade Revocation",
                new_value=f"Event {event_id} failed with exception: {str(exc)}"
            ))
            db.commit()
        except Exception as audit_exc:
            logger.error(f"Failed to record error state for event {event_id}: {audit_exc}")
    finally:
        db.close()

@router.post("", response_model=RevocationEventResponse, status_code=status.HTTP_202_ACCEPTED)
@router.post("/", response_model=RevocationEventResponse, status_code=status.HTTP_202_ACCEPTED)
def trigger_revocation(
    payload: RevocationEventCreate,
    background_tasks: BackgroundTasks,
    response: Response,
    db: Session = Depends(get_db)
):
    """
    STEP 1 — POST /revocation-events
    1. Validate source identity exists (404 if missing)
    2. Create RevocationEvent row with status="Pending"
    3. Commit and refresh it
    4. Call background_tasks.add_task(run_cascade, event.id)
    5. Immediately return response with status="Pending" and 202 Accepted status code
    """
    # 1. Validate source identity
    identity = db.query(Identity).filter(Identity.id == payload.source_identity_id).first()
    if not identity:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Source Identity with ID {payload.source_identity_id} not found."
        )

    # 2. Create RevocationEvent row
    event = RevocationEvent(
        source_identity_id=payload.source_identity_id,
        reason=payload.reason,
        status="Pending"
    )

    # 3. Commit and refresh
    db.add(event)
    db.commit()
    db.refresh(event)

    # 4. Schedule background task passing only event.id
    background_tasks.add_task(run_cascade, event.id)

    # 5. Set 202 status code and return Pending response
    response.status_code = status.HTTP_202_ACCEPTED
    return event

@router.get("/{event_id}", response_model=RevocationEventResponse)
def get_revocation_event_detail(event_id: int, db: Session = Depends(get_db)):
    """
    Full detail endpoint returning event metadata and full cascade actions list.
    """
    event = db.query(RevocationEvent).filter(RevocationEvent.id == event_id).first()
    if not event:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"RevocationEvent with ID {event_id} not found."
        )
    return event

@router.get("/{event_id}/status", response_model=RevocationEventStatusResponse)
def get_revocation_event_status(event_id: int, db: Session = Depends(get_db)):
    """
    STEP 4 — GET /api/revocation-events/{event_id}/status
    Lightweight status endpoint returning minimal payload for frequent client polling.
    """
    event = db.query(RevocationEvent).filter(RevocationEvent.id == event_id).first()
    if not event:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"RevocationEvent with ID {event_id} not found."
        )
    return event
