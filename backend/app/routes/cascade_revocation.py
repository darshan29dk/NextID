import time
import logging
from datetime import datetime
from typing import List, Optional, Set
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, Response, status
from sqlalchemy.orm import Session

from app.database import SessionLocal, get_db
from app.models.identity import Identity
from app.models.notification import Notification
from app.models.audit_log import AuditLog
from app.models.cascade_revocation import RevocationEvent, CascadeAction, DelegationLink
from app.schemas.cascade_revocation import (
    RevocationEventCreate,
    RevocationEventResponse,
    RevocationEventStatusResponse,
    DelegationLinkCreate,
    DelegationLinkResponse
)
from app.services.revocation_hooks import (
    revoke_service_account,
    revoke_api_key,
    revoke_agent_session,
    disable_human_account
)
from app.services.orphaned_authority_report import find_orphaned_delegations

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Cascade Revocation Engine"])

# --- STEP 2: RUN_CASCADE WITH EXPLICT DEPTH & CYCLE CUTOFF ACTION LOGS ---

def run_cascade(event_id: int) -> None:
    """
    Background worker function executing cascade revocation off the request thread.
    Walks delegation graph via BFS, logs explicit CascadeAction rows for max depth limits
    and detected cycles, calls per-hop revocation hooks with 10s timeouts, and records
    terminal execution status.
    """
    db: Session = SessionLocal()
    start_time = datetime.utcnow()
    
    try:
        event = db.query(RevocationEvent).filter(RevocationEvent.id == event_id).first()
        if not event:
            logger.error(f"Cascade execution error: RevocationEvent {event_id} not found.")
            return

        event.status = "In Progress"
        db.commit()

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

        total_targets = 0
        revoked_count = 0
        failed_count = 0

        # BFS state initialization
        frontier: List[int] = [source_identity.id]
        visited: Set[int] = set()
        depth = 0
        max_depth_limit = 25

        while frontier and depth < max_depth_limit:
            current_level = list(frontier)
            frontier = []
            depth += 1

            for current_id in current_level:
                if current_id in visited:
                    continue
                visited.add(current_id)

                curr_identity = db.query(Identity).filter(Identity.id == current_id).first()
                if not curr_identity:
                    continue

                # Target hooks for current identity in chain
                targets = [
                    ("HUMAN_ACCOUNT", curr_identity.email or curr_identity.employee_id or f"user_{curr_identity.id}"),
                    ("SERVICE_ACCOUNT", f"sa-{curr_identity.department or 'default'}-{curr_identity.id}"),
                    ("API_KEY", f"key-{curr_identity.employee_id or curr_identity.id}"),
                    ("AGENT_SESSION", f"mcp-session-{curr_identity.id}")
                ]

                for target_type, identifier in targets:
                    total_targets += 1
                    action = CascadeAction(
                        event_id=event.id,
                        target_type=target_type,
                        target_identifier=identifier,
                        action_type="REVOCATION",
                        status="Pending",
                        hop_depth=depth
                    )
                    db.add(action)
                    db.commit()
                    db.refresh(action)

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

                # Expand child delegation links
                child_links = db.query(DelegationLink).filter(
                    DelegationLink.parent_identity_id == current_id,
                    DelegationLink.status == "Active"
                ).all()

                for link in child_links:
                    child_id = link.child_identity_id
                    # Step 2: Explicit Cycle Detection
                    if child_id in visited:
                        total_targets += 1
                        failed_count += 1
                        cycle_action = CascadeAction(
                            event_id=event.id,
                            target_type="DELEGATION",
                            target_identifier=f"DelegationLink#{link.id} (Child ID: {child_id})",
                            action_type="Cycle Detected",
                            status="Failed",
                            hop_depth=depth,
                            error_message=f"Delegation cycle detected involving identity {child_id}; hop skipped to prevent infinite loop."
                        )
                        db.add(cycle_action)
                        db.commit()
                    else:
                        frontier.append(child_id)

        # Step 2: Explicit Max Depth Exceeded handling
        if depth >= max_depth_limit and frontier:
            for cutoff_id in frontier:
                total_targets += 1
                failed_count += 1
                depth_action = CascadeAction(
                    event_id=event.id,
                    target_type="DELEGATION",
                    target_identifier=f"Identity#{cutoff_id}",
                    action_type="Max Depth Exceeded",
                    status="Failed",
                    hop_depth=depth,
                    error_message="Delegation chain exceeds maximum traversal depth (25 hops); cascade may be incomplete."
                )
                db.add(depth_action)
                db.commit()

        # Update event terminal state
        event.total_targets = total_targets
        event.revoked_count = revoked_count
        event.failed_count = failed_count
        event.duration_seconds = (datetime.utcnow() - start_time).total_seconds()
        event.completed_at = datetime.utcnow()
        event.status = "Completed" if failed_count == 0 else "Completed With Failures"
        db.commit()

        # Audit log completion
        db.add(AuditLog(
            performed_by="Cascade Engine",
            action="Cascade Execution Completed",
            module="Cascade Revocation",
            new_value=f"Event {event.id}: {revoked_count}/{total_targets} targets revoked, {failed_count} failures in {event.duration_seconds:.2f}s."
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

# --- STEP 1: BLOCK DELEGATION CREATION DURING IN-PROGRESS CASCADE ---

@router.post("/api/delegation-links", response_model=DelegationLinkResponse, status_code=status.HTTP_201_CREATED)
def create_delegation_link(payload: DelegationLinkCreate, db: Session = Depends(get_db)):
    """
    STEP 1 — Creates a new DelegationLink between parent_identity_id and child_identity_id.
    Blocks creation (409 Conflict) if any ancestor up to depth 25 has an in-progress cascade event.
    """
    # Check identities exist
    parent_ident = db.query(Identity).filter(Identity.id == payload.parent_identity_id).first()
    child_ident = db.query(Identity).filter(Identity.id == payload.child_identity_id).first()
    if not parent_ident or not child_ident:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Parent or child identity not found.")

    # Walk UP from parent_identity_id (up to depth 25)
    current_parent_id = payload.parent_identity_id
    depth = 0
    max_walk = 25
    visited_ancestors = set()

    while current_parent_id and depth < max_walk:
        if current_parent_id in visited_ancestors:
            break
        visited_ancestors.add(current_parent_id)

        # Check if current_parent_id is the source of an in-progress event
        in_progress_event = db.query(RevocationEvent).filter(
            RevocationEvent.source_identity_id == current_parent_id,
            RevocationEvent.status.in_(["Pending", "In Progress"])
        ).first()

        # Check if current_parent_id appears in an action for an in-progress event
        if not in_progress_event:
            in_progress_action_event = db.query(RevocationEvent).join(
                CascadeAction, RevocationEvent.id == CascadeAction.event_id
            ).filter(
                RevocationEvent.status.in_(["Pending", "In Progress"]),
                CascadeAction.target_identifier.like(f"%{current_parent_id}%")
            ).first()
            if in_progress_action_event:
                in_progress_event = in_progress_action_event

        if in_progress_event:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Cannot create a new delegation: an ancestor identity has a revocation cascade currently in progress."
            )

        # Walk up to next parent
        parent_link = db.query(DelegationLink).filter(
            DelegationLink.child_identity_id == current_parent_id,
            DelegationLink.status == "Active"
        ).first()

        current_parent_id = parent_link.parent_identity_id if parent_link else None
        depth += 1

    link = DelegationLink(
        parent_identity_id=payload.parent_identity_id,
        child_identity_id=payload.child_identity_id,
        delegation_type=payload.delegation_type or "DELEGATE",
        status="Active"
    )
    db.add(link)
    db.commit()
    db.refresh(link)
    return link

# --- STEP 4 & 5: EXPOSE ORPHANED AUTHORITY REPORT & SEND NOTIFICATIONS ---

@router.get("/api/revocation-events/orphaned-authority-report")
def get_orphaned_authority_report(db: Session = Depends(get_db)):
    """
    STEP 4 & 5 — Read-only safety net report querying for active delegations where root ancestor is Inactive.
    Sends a system Notification if orphaned links are found.
    """
    orphaned_list = find_orphaned_delegations(db)
    count = len(orphaned_list)

    if count > 0:
        # STEP 5: Create notification matching existing Notification model pattern
        db.add(Notification(
            title="Orphaned Authority Alert",
            message=f"{count} orphaned AI agent/authority link(s) detected — review required.",
            status="unread"
        ))
        db.commit()

    return {
        "count": count,
        "orphaned": orphaned_list
    }

# --- REVOCATION EVENTS ENDPOINTS ---

@router.post("/api/revocation-events", response_model=RevocationEventResponse, status_code=status.HTTP_202_ACCEPTED)
@router.post("/api/revocation-events/", response_model=RevocationEventResponse, status_code=status.HTTP_202_ACCEPTED)
def trigger_revocation(
    payload: RevocationEventCreate,
    background_tasks: BackgroundTasks,
    response: Response,
    db: Session = Depends(get_db)
):
    """
    POST /api/revocation-events
    Validates identity, creates event with status="Pending", dispatches run_cascade in background,
    and returns 202 Accepted response.
    """
    identity = db.query(Identity).filter(Identity.id == payload.source_identity_id).first()
    if not identity:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Source Identity with ID {payload.source_identity_id} not found."
        )

    event = RevocationEvent(
        source_identity_id=payload.source_identity_id,
        reason=payload.reason,
        status="Pending"
    )
    db.add(event)
    db.commit()
    db.refresh(event)

    background_tasks.add_task(run_cascade, event.id)
    response.status_code = status.HTTP_202_ACCEPTED
    return event

@router.get("/api/revocation-events/{event_id}", response_model=RevocationEventResponse)
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

@router.get("/api/revocation-events/{event_id}/status", response_model=RevocationEventStatusResponse)
def get_revocation_event_status(event_id: int, db: Session = Depends(get_db)):
    """
    Lightweight status endpoint returning minimal payload for client polling.
    """
    event = db.query(RevocationEvent).filter(RevocationEvent.id == event_id).first()
    if not event:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"RevocationEvent with ID {event_id} not found."
        )
    return event
