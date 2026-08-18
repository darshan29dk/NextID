import time
import math
import logging
from datetime import datetime
from typing import List, Optional, Set, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, Response, status
from sqlalchemy.orm import Session

from app.database import SessionLocal, get_db
from app.models.identity import Identity
from app.models.notification import Notification
from app.models.cascade_revocation import RevocationEvent, CascadeAction, DelegationLink
from app.schemas.cascade_revocation import (
    RevocationEventCreate,
    RevocationEventResponse,
    RevocationEventStatusResponse,
    RevocationStatsResponse,
    RevocationSimulationResponse,
    SimulationAffectedIdentity,
    DelegationLinkCreate,
    DelegationLinkResponse
)
from app.services.revocation_hooks import (
    revoke_service_account,
    revoke_api_key,
    revoke_agent_session,
    disable_human_account
)
from app.services.orphaned_authority_report import find_orphaned_delegations, notify_if_orphaned_found
from app.services.audit_chain import append_audit_log
from app.utils.permissions import require_permission

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Cascade Revocation Engine"])

# --- SHARED GRAPH TRAVERSAL HELPER FOR SIMULATION & RUN_CASCADE ---

def walk_delegation_graph(source_identity_id: int, db: Session) -> Dict[str, Any]:
    """
    Shared read-only delegation graph traversal logic used by both the simulation endpoint
    and background cascade worker.
    """
    source_identity = db.query(Identity).filter(Identity.id == source_identity_id).first()
    if not source_identity:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Source Identity with ID {source_identity_id} not found."
        )

    frontier: List[int] = [source_identity_id]
    visited: Set[int] = set()
    affected_identities: List[Dict[str, Any]] = []
    warnings: List[str] = []
    
    depth = 0
    max_depth_limit = 25
    source_org = source_identity.org or "Default"

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

            display_name = curr_identity.display_name or curr_identity.email or f"Identity {curr_identity.id}"
            identity_type = "Human Account" if curr_identity.email else "System / Agent"

            affected_identities.append({
                "identity_id": curr_identity.id,
                "display_name": display_name,
                "identity_type": identity_type,
                "hop_depth": depth
            })

            child_links = db.query(DelegationLink).filter(
                DelegationLink.parent_identity_id == current_id,
                DelegationLink.status == "Active"
            ).all()

            for link in child_links:
                child_id = link.child_identity_id
                if link.origin_org and link.origin_org.strip().lower() != source_org.strip().lower():
                    warnings.append(f"Cross-org delegation detected at hop {depth}: Origin Org '{link.origin_org}' vs Source Org '{source_org}'")

                if child_id not in visited:
                    frontier.append(child_id)

    max_hop_depth = depth if affected_identities else 0

    return {
        "source_identity_id": source_identity_id,
        "would_affect_count": len(affected_identities),
        "max_hop_depth": max_hop_depth,
        "affected_identities": affected_identities,
        "warnings": warnings
    }

# --- BACKGROUND RUN_CASCADE WORKER WITH TAMPER-EVIDENT AUDIT LOGGING ---

def run_cascade(event_id: int) -> None:
    """
    Background worker function executing cascade revocation off the request thread.
    Uses append_audit_log() for tamper-evident SHA-256 record hashing.
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
            
            append_audit_log(
                db=db,
                module="Cascade Revocation",
                action="Cascade Execution Error",
                performed_by="Cascade Engine",
                new_value=f"Source identity {event.source_identity_id} not found."
            )
            return

        total_targets = 0
        revoked_count = 0
        failed_count = 0

        source_org = (source_identity.org or "Default").strip().lower()

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

                targets = [
                    ("HUMAN_ACCOUNT", curr_identity.email or curr_identity.employee_id or f"user_{curr_identity.id}"),
                    ("SERVICE_ACCOUNT", f"sa-{curr_identity.department or 'default'}-{curr_identity.id}"),
                    ("API_KEY", f"key-{curr_identity.employee_id or curr_identity.id}"),
                    ("AGENT_SESSION", f"mcp-session-{curr_identity.id}")
                ]

                incoming_link = db.query(DelegationLink).filter(
                    DelegationLink.child_identity_id == current_id,
                    DelegationLink.status == "Active"
                ).first()

                is_cross_org = False
                if incoming_link and incoming_link.origin_org:
                    if incoming_link.origin_org.strip().lower() != source_org:
                        is_cross_org = True

                for target_type, identifier in targets:
                    total_targets += 1
                    action_type_val = "Token Invalidated (Cross-Org — Not Confirmed)" if is_cross_org else "REVOCATION"
                    
                    action = CascadeAction(
                        event_id=event.id,
                        target_type=target_type,
                        target_identifier=identifier,
                        action_type=action_type_val,
                        status="Pending",
                        hop_depth=depth
                    )
                    db.add(action)
                    db.commit()
                    db.refresh(action)

                    attrs = curr_identity.attributes or {}
                    if target_type == "SERVICE_ACCOUNT":
                        res = revoke_service_account(identifier, attrs, db)
                    elif target_type == "API_KEY":
                        res = revoke_api_key(identifier, attrs, db)
                    elif target_type == "AGENT_SESSION":
                        res = revoke_agent_session(identifier, attrs, db)
                    else:
                        res = disable_human_account(identifier, attrs, db)

                    if res.get("success"):
                        action.status = "Confirmed"
                        action.confirmed_at = datetime.utcnow()
                        if is_cross_org:
                            action.error_message = "Local revocation recorded. Downstream vendor/org system not confirmed."
                        revoked_count += 1
                    else:
                        action.status = "Failed"
                        action.error_message = res.get("message", "Revocation hook failed")
                        failed_count += 1

                    db.commit()

                child_links = db.query(DelegationLink).filter(
                    DelegationLink.parent_identity_id == current_id,
                    DelegationLink.status == "Active"
                ).all()

                for link in child_links:
                    child_id = link.child_identity_id
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

        event.total_targets = total_targets
        event.revoked_count = revoked_count
        event.failed_count = failed_count
        event.duration_seconds = (datetime.utcnow() - start_time).total_seconds()
        event.completed_at = datetime.utcnow()
        event.status = "Completed" if failed_count == 0 else "Completed With Failures"
        db.commit()

        # Step 2: Tamper-Evident SHA-256 Audit Log Entry
        append_audit_log(
            db=db,
            module="Cascade Revocation",
            action="Cascade Execution Completed",
            performed_by="Cascade Engine",
            new_value=f"Event {event.id}: {revoked_count}/{total_targets} targets revoked, {failed_count} failures in {event.duration_seconds:.2f}s."
        )

    except Exception as exc:
        logger.exception(f"Unhandled exception during cascade execution for event {event_id}: {exc}")
        try:
            event = db.query(RevocationEvent).filter(RevocationEvent.id == event_id).first()
            if event:
                event.status = "Failed"
                event.completed_at = datetime.utcnow()
                event.duration_seconds = (datetime.utcnow() - start_time).total_seconds()
                db.commit()
                
            append_audit_log(
                db=db,
                module="Cascade Revocation",
                action="Cascade Execution Error",
                performed_by="Cascade Engine",
                new_value=f"Event {event_id} failed with exception: {str(exc)}"
            )
        except Exception as audit_exc:
            logger.error(f"Failed to record error state for event {event_id}: {audit_exc}")
    finally:
        db.close()

# --- STEP 1: REVOCATION PROPAGATION LAG STATS ENDPOINT ---

@router.get("/api/revocation-events/stats", response_model=RevocationStatsResponse)
def get_revocation_stats(
    date_from: Optional[datetime] = None,
    date_to: Optional[datetime] = None,
    _perm: bool = Depends(require_permission("Cascade Revocation", "view")),
    db: Session = Depends(get_db)
):
    query = db.query(RevocationEvent).filter(RevocationEvent.duration_seconds.isnot(None))
    
    if date_from:
        query = query.filter(RevocationEvent.created_at >= date_from)
    if date_to:
        query = query.filter(RevocationEvent.created_at <= date_to)

    events = query.all()
    total_events = len(events)
    
    if total_events == 0:
        return RevocationStatsResponse(
            total_events=0,
            avg_seconds=0.0,
            p95_seconds=0.0,
            worst_case_seconds=0.0,
            events_with_failures=0
        )

    durations = [e.duration_seconds for e in events if e.duration_seconds is not None]
    avg_seconds = float(sum(durations) / len(durations)) if durations else 0.0
    worst_case_seconds = float(max(durations)) if durations else 0.0

    s_dur = sorted(durations)
    k = math.ceil(0.95 * len(s_dur)) - 1
    p95_seconds = float(s_dur[max(0, k)]) if s_dur else 0.0

    events_with_failures = sum(1 for e in events if e.failed_count > 0)

    return RevocationStatsResponse(
        total_events=total_events,
        avg_seconds=round(avg_seconds, 2),
        p95_seconds=round(p95_seconds, 2),
        worst_case_seconds=round(worst_case_seconds, 2),
        events_with_failures=events_with_failures
    )

# --- STEP 3: COMPLIANCE EXPORT ENDPOINT ---

@router.get("/api/revocation-events/compliance-export")
def export_compliance_report(
    date_from: Optional[datetime] = None,
    date_to: Optional[datetime] = None,
    _perm: bool = Depends(require_permission("Cascade Revocation", "export")),
    db: Session = Depends(get_db)
):
    """
    STEP 3 — Returns a structured JSON compliance package for SOC2 / ISO audit evidence.
    Combines summary stats, full events list with per-hop actions, and orphaned authority report.
    """
    stats_data = get_revocation_stats(date_from=date_from, date_to=date_to, _perm=True, db=db)

    events_query = db.query(RevocationEvent)
    if date_from:
        events_query = events_query.filter(RevocationEvent.created_at >= date_from)
    if date_to:
        events_query = events_query.filter(RevocationEvent.created_at <= date_to)
    
    events = events_query.all()
    events_list = []
    for evt in events:
        events_list.append({
            "id": evt.id,
            "source_identity_id": evt.source_identity_id,
            "reason": evt.reason,
            "status": evt.status,
            "total_targets": evt.total_targets,
            "revoked_count": evt.revoked_count,
            "failed_count": evt.failed_count,
            "duration_seconds": evt.duration_seconds,
            "created_at": evt.created_at.isoformat() if evt.created_at else None,
            "completed_at": evt.completed_at.isoformat() if evt.completed_at else None,
            "actions": [
                {
                    "id": act.id,
                    "target_type": act.target_type,
                    "target_identifier": act.target_identifier,
                    "action_type": act.action_type,
                    "status": act.status,
                    "hop_depth": act.hop_depth,
                    "error_message": act.error_message,
                    "confirmed_at": act.confirmed_at.isoformat() if act.confirmed_at else None,
                    "created_at": act.created_at.isoformat() if act.created_at else None,
                }
                for act in evt.actions
            ]
        })

    orphaned_report = find_orphaned_delegations(db)

    return {
        "export_metadata": {
            "title": "SOC2 / ISO Cascade Revocation Evidence Package",
            "generated_at": datetime.utcnow().isoformat(),
            "scope_date_from": date_from.isoformat() if date_from else None,
            "scope_date_to": date_to.isoformat() if date_to else None,
        },
        "summary_stats": stats_data.dict(),
        "events": events_list,
        "orphaned_authority": {
            "count": len(orphaned_report),
            "orphaned": orphaned_report
        }
    }

# --- PRE-REVOKE SIMULATION ENDPOINT ---

@router.post("/api/revocation-events/simulate", response_model=RevocationSimulationResponse)
def simulate_revocation(
    payload: RevocationEventCreate,
    _perm: bool = Depends(require_permission("Cascade Revocation", "view")),
    db: Session = Depends(get_db)
):
    result = walk_delegation_graph(payload.source_identity_id, db)
    return result

# --- STEP 1: CREATE DELEGATION LINK (REQUIRING EDIT PERMISSION) ---

@router.post("/api/delegation-links", response_model=DelegationLinkResponse, status_code=status.HTTP_201_CREATED)
def create_delegation_link(
    payload: DelegationLinkCreate,
    _perm: bool = Depends(require_permission("Cascade Revocation", "edit")),
    db: Session = Depends(get_db)
):
    parent_ident = db.query(Identity).filter(Identity.id == payload.parent_identity_id).first()
    child_ident = db.query(Identity).filter(Identity.id == payload.child_identity_id).first()
    if not parent_ident or not child_ident:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Parent or child identity not found.")

    current_parent_id = payload.parent_identity_id
    current_depth_from_root = 1
    root_identity = parent_ident
    visited_ancestors = {current_parent_id}
    max_walk = 25

    while current_parent_id:
        in_progress_event = db.query(RevocationEvent).filter(
            RevocationEvent.source_identity_id == current_parent_id,
            RevocationEvent.status.in_(["Pending", "In Progress"])
        ).first()

        if in_progress_event:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Cannot create a new delegation: an ancestor identity has a revocation cascade currently in progress."
            )

        parent_link = db.query(DelegationLink).filter(
            DelegationLink.child_identity_id == current_parent_id,
            DelegationLink.status == "Active"
        ).first()

        if not parent_link or parent_link.parent_identity_id in visited_ancestors:
            break

        current_parent_id = parent_link.parent_identity_id
        visited_ancestors.add(current_parent_id)
        current_depth_from_root += 1

        next_parent_ident = db.query(Identity).filter(Identity.id == current_parent_id).first()
        if next_parent_ident:
            root_identity = next_parent_ident

    if root_identity and root_identity.max_delegation_depth is not None:
        if current_depth_from_root > root_identity.max_delegation_depth:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Delegation would exceed max_delegation_depth ({root_identity.max_delegation_depth}) set on root identity {root_identity.id}."
            )

    link = DelegationLink(
        parent_identity_id=payload.parent_identity_id,
        child_identity_id=payload.child_identity_id,
        delegation_type=payload.delegation_type or "DELEGATE",
        origin_org=payload.origin_org or parent_ident.org or "Default",
        status="Active"
    )
    db.add(link)
    db.commit()
    db.refresh(link)
    return link

# --- ORPHANED AUTHORITY REPORT ENDPOINT ---

@router.get("/api/revocation-events/orphaned-authority-report")
def get_orphaned_authority_report(
    _perm: bool = Depends(require_permission("Cascade Revocation", "view")),
    db: Session = Depends(get_db)
):
    orphaned_list = find_orphaned_delegations(db)
    notify_if_orphaned_found(db, orphaned_list)

    return {
        "count": len(orphaned_list),
        "orphaned": orphaned_list
    }

# --- STEP 1: TRIGGER REVOCATION (REQUIRING APPROVE PERMISSION) ---

@router.post("/api/revocation-events", response_model=RevocationEventResponse, status_code=status.HTTP_202_ACCEPTED)
@router.post("/api/revocation-events/", response_model=RevocationEventResponse, status_code=status.HTTP_202_ACCEPTED)
def trigger_revocation(
    payload: RevocationEventCreate,
    background_tasks: BackgroundTasks,
    response: Response,
    _perm: bool = Depends(require_permission("Cascade Revocation", "approve")),
    db: Session = Depends(get_db)
):
    """
    STEP 1 — Requires 'approve' permission for 'Cascade Revocation' menu.
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
def get_revocation_event_detail(
    event_id: int,
    _perm: bool = Depends(require_permission("Cascade Revocation", "view")),
    db: Session = Depends(get_db)
):
    event = db.query(RevocationEvent).filter(RevocationEvent.id == event_id).first()
    if not event:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"RevocationEvent with ID {event_id} not found."
        )
    return event

@router.get("/api/revocation-events/{event_id}/status", response_model=RevocationEventStatusResponse)
def get_revocation_event_status(
    event_id: int,
    _perm: bool = Depends(require_permission("Cascade Revocation", "view")),
    db: Session = Depends(get_db)
):
    event = db.query(RevocationEvent).filter(RevocationEvent.id == event_id).first()
    if not event:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"RevocationEvent with ID {event_id} not found."
        )
    return event

# --- STEP 5: MANUAL SCHEDULER OVERRIDE ENDPOINTS ---

@router.post("/api/revocation-events/jobs/run-retry-now")
def run_cascade_retry_now(
    _perm: bool = Depends(require_permission("Cascade Revocation", "approve")),
    db: Session = Depends(get_db)
):
    """
    Manual trigger override to immediately execute failed cascade action retry sweep.
    """
    from app.services.revocation_retry import retry_failed_cascade_actions
    summary = retry_failed_cascade_actions(db)
    return {
        "status": "Success",
        "message": "Manual cascade retry job executed successfully.",
        "summary": summary
    }

@router.post("/api/revocation-events/jobs/run-orphaned-sweep-now")
def run_orphaned_sweep_now(
    _perm: bool = Depends(require_permission("Cascade Revocation", "approve")),
    db: Session = Depends(get_db)
):
    """
    Manual trigger override to immediately execute orphaned authority safety net sweep.
    """
    orphaned_list = find_orphaned_delegations(db)
    notified = notify_if_orphaned_found(db, orphaned_list)
    return {
        "status": "Success",
        "message": f"Manual orphaned authority sweep completed ({len(orphaned_list)} orphaned links found).",
        "count": len(orphaned_list),
        "notification_created": notified,
        "orphaned": orphaned_list
    }
