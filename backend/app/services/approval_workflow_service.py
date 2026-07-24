from sqlalchemy.orm import Session
from sqlalchemy import or_, desc, asc
from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any

from app.models.candidate_role import CandidateRole
from app.models.approval_request import ApprovalRequest
from app.models.approval_step import ApprovalStep
from app.models.approval_workflow_config import ApprovalWorkflowConfig, ApprovalWorkflowLevel
from app.models.audit_log import AuditLog
from app.models.dashboard import RecentActivity
from app.models.notification import Notification


class ApprovalWorkflowService:

    @staticmethod
    def submit_role(
        db: Session,
        role_id: int,
        priority: str,
        remarks: Optional[str],
        user: str
    ) -> Dict:
        """
        Validates submission requirements and creates an approval request for a candidate role.
        Evaluates dynamic Approval Workflow policies (ApprovalWorkflowConfig) and triggers auto-approvals.
        """
        role = db.query(CandidateRole).filter(
            CandidateRole.id == role_id,
            CandidateRole.is_deleted == False
        ).first()

        if not role:
            raise ValueError(f"Candidate role {role_id} not found")

        # --- Validation Rules ---
        if not role.classification:
            raise ValueError("Role must have a classification before submission")
        if not role.primary_owner_name:
            raise ValueError("Role must have a Primary Owner assigned before submission")
        if not role.role_description or not role.role_description.strip():
            raise ValueError("Role must have a description before submission")
        if role.application_count == 0:
            raise ValueError("Role must have at least one application mapped before submission")
        if role.entitlement_count == 0:
            raise ValueError("Role must have at least one entitlement mapped before submission")
        if role.user_count == 0:
            raise ValueError("Role must have at least one user member assigned before submission")
        
        # Role status validation
        if role.status not in ["Draft", "Reviewed"]:
            raise ValueError(f"Role status must be 'Draft' or 'Reviewed' (current: {role.status})")

        # --- Prevent Duplicate Submissions ---
        active_statuses = ["Draft", "Submitted", "Business Review"]
        existing_active = db.query(ApprovalRequest).filter(
            ApprovalRequest.candidate_role_id == role_id,
            ApprovalRequest.status.in_(active_statuses)
        ).first()
        if existing_active:
            raise ValueError("An active approval request already exists for this candidate role")

        # --- Resolve Approval Workflow Policy ---
        wf_config = db.query(ApprovalWorkflowConfig).filter(
            ApprovalWorkflowConfig.is_active == True
        ).order_by(ApprovalWorkflowConfig.is_default.desc()).first()

        workflow_title = wf_config.name if wf_config else "Role Approval Workflow"

        # --- Create Approval Request ---
        now = datetime.utcnow()
        due = now + timedelta(days=7)  # SLA: 7 days
        
        request = ApprovalRequest(
            candidate_role_id=role_id,
            workflow_name=workflow_title,
            current_stage="Business Review",
            status="Business Review",
            submitted_by=user,
            submitted_at=now,
            due_date=due,
            priority=priority or "Medium",
            remarks=remarks,
            created_at=now,
            updated_at=now
        )
        db.add(request)
        db.flush()

        # --- Evaluate Workflow Levels & Auto-Approval ---
        all_auto_approved = True
        if wf_config and wf_config.levels and len(wf_config.levels) > 0:
            for idx, lvl in enumerate(sorted(wf_config.levels, key=lambda x: x.level_number)):
                is_auto = (lvl.fallback_action == "Auto-approve" or lvl.approver_type == "Auto-approve")
                step_status = "Approved" if is_auto else ("Pending" if idx == 0 else "Pending")
                if not is_auto:
                    all_auto_approved = False

                step = ApprovalStep(
                    approval_request_id=request.id,
                    step_order=lvl.level_number,
                    step_name=f"L{lvl.level_number}: {lvl.approver_type}",
                    approver_type=lvl.approver_type,
                    approver_id=lvl.specific_approver_id or role.primary_owner_id,
                    approver_name=lvl.specific_approver_name or role.primary_owner_name,
                    status=step_status,
                    assigned_at=now,
                    action_at=now if is_auto else None,
                    remarks="Auto-approved by policy rule" if is_auto else None
                )
                db.add(step)
        else:
            all_auto_approved = False
            step = ApprovalStep(
                approval_request_id=request.id,
                step_order=1,
                step_name="Business Review",
                approver_type="Role Owner",
                approver_id=role.primary_owner_id,
                approver_name=role.primary_owner_name,
                status="Pending",
                assigned_at=now,
                remarks=None
            )
            db.add(step)

        # --- Update Candidate Role Status & Auto-approve Handling ---
        if all_auto_approved:
            request.status = "Security Approved"
            request.current_stage = "Completed"
            role.status = "Approved"
        else:
            role.status = "Under Review"
        role.modified_by = user
        role.updated_at = now

        # --- Audit Logging & Recent Activity ---
        db.add(AuditLog(
            module="Approval Workflow",
            action="Role Submitted",
            performed_by=user,
            new_value=f"Submitted role '{role.role_name}' (ID: {role_id}) with priority '{priority}'",
            timestamp=now
        ))
        db.add(AuditLog(
            module="Approval Workflow",
            action="Business Approval Started",
            performed_by=user,
            new_value=f"Step assigned to Primary Owner '{role.primary_owner_name}'",
            timestamp=now
        ))
        db.add(RecentActivity(
            user=user,
            action=f"Submitted role '{role.role_name}' for Business Review",
            status="success",
            created_at=now
        ))
        db.add(Notification(
            title=f"Approval Needed: {role.role_name}",
            message=(
                f"{user} submitted role '{role.role_name}' for approval. "
                f"Business Review is pending from '{role.primary_owner_name}'. "
                f"Due by {due.strftime('%d %b %Y')}."
            ),
            status="unread",
            created_at=now
        ))

        db.commit()
        db.refresh(request)

        return {
            "id": request.id,
            "candidate_role_id": role_id,
            "role_name": role.role_name,
            "status": request.status,
            "priority": request.priority,
            "due_date": request.due_date.isoformat() if request.due_date else None,
            "submitted_by": request.submitted_by,
            "submitted_at": request.submitted_at.isoformat() if request.submitted_at else None
        }

    @staticmethod
    def check_and_expire_owner_reviews(db: Session) -> int:
        """
        A role's assigned owner is only authorized to act on it while their
        review date hasn't lapsed (see BusinessApprovalService._validate_
        reviewer_auth). Blocking the stale owner from clicking Approve isn't
        enough on its own - a request can otherwise sit in "Business Review"
        forever with nobody able to act on it. This scans for exactly that
        situation and auto-withdraws the request: role goes back to Draft in
        Role Engineering, the request is marked "Expired" (so it drops out
        of the Business Approval queue, which filters on status="Business
        Review"), and both the lapsed owner and a Platform Administrator are
        notified that a fresh owner assignment + re-submission is needed.

        Only expires a request when EVERY currently-active owner (Primary
        and Backup, if both are assigned) has a lapsed review date - if a
        Backup Owner is still within their review window, they can still
        act, so the request stays live.
        """
        from app.models.role_owner_history import RoleOwnerHistory

        now = datetime.utcnow()
        pending = db.query(ApprovalRequest).filter(ApprovalRequest.status == "Business Review").all()

        count = 0
        for req in pending:
            role = db.query(CandidateRole).filter(CandidateRole.id == req.candidate_role_id).first()
            if not role:
                continue

            owner_records = db.query(RoleOwnerHistory).filter(
                RoleOwnerHistory.candidate_role_id == role.id,
                RoleOwnerHistory.is_active == True
            ).all()
            if not owner_records:
                continue

            all_expired = all(o.review_date and o.review_date < now for o in owner_records)
            if not all_expired:
                continue

            primary = next((o for o in owner_records if o.owner_type == "Primary"), owner_records[0])

            req.status = "Expired"
            req.current_stage = "Owner Review Expired"
            req.completed_at = now
            req.updated_at = now

            pending_step = db.query(ApprovalStep).filter(
                ApprovalStep.approval_request_id == req.id,
                ApprovalStep.status == "Pending"
            ).first()
            if pending_step:
                pending_step.status = "Expired"
                pending_step.action_at = now
                pending_step.remarks = "Owner review date expired before action was taken."

            role.status = "Draft"
            role.modified_by = "System (Owner Review Expired)"
            role.updated_at = now

            for o in owner_records:
                if not o.is_expired:
                    o.is_expired = True

            db.add(AuditLog(
                module="Approval Workflow",
                action="Request Auto-Expired (Owner Review Lapsed)",
                performed_by="System",
                old_value=f"Role '{role.role_name}' was pending Business Review from '{primary.owner_name}'",
                new_value=(
                    f"Review date expired on {primary.review_date.strftime('%d %b %Y')}. "
                    f"Request expired; role returned to Draft for resubmission."
                ),
                timestamp=now
            ))
            db.add(Notification(
                title=f"Owner Review Expired: {role.role_name}",
                message=(
                    f"Your review date for role '{role.role_name}' has expired, so the pending approval "
                    f"request has been withdrawn. You are no longer authorized to approve it."
                ),
                status="unread",
                created_at=now
            ))
            db.add(Notification(
                title=f"Owner Reassignment Needed: {role.role_name}",
                message=(
                    f"The approval request for role '{role.role_name}' was auto-expired because owner "
                    f"'{primary.owner_name}' passed their review date. The role has returned to Role "
                    f"Engineering - please assign a new owner and resubmit for approval."
                ),
                status="unread",
                created_at=now
            ))
            count += 1

        if count > 0:
            db.commit()
        return count

    @staticmethod
    def get_approval_requests(
        db: Session,
        page: int = 1,
        limit: int = 10,
        search: Optional[str] = None,
        status: Optional[str] = None,
        priority: Optional[str] = None,
        submitted_by: Optional[str] = None,
        sort_by: Optional[str] = None,
        sort_order: Optional[str] = "desc"
    ) -> Dict:
        """
        Retrieves paginated approval requests with search and filter attributes.
        Also automatically detects SLA breaches and flags them.
        """
        if page < 1:
            page = 1
        if limit < 1:
            limit = 10

        # Auto-check SLA breach across all non-completed requests before fetching
        now = datetime.utcnow()
        overdue_reqs = db.query(ApprovalRequest).filter(
            ApprovalRequest.status.in_(["Submitted", "Business Review"]),
            ApprovalRequest.is_escalated == False,
            ApprovalRequest.due_date != None,
            ApprovalRequest.due_date < now
        ).all()
        for r in overdue_reqs:
            r.is_escalated = True
            r.escalated_at = now
        if overdue_reqs:
            db.commit()

        # Auto-expire Business Review requests whose owner's review date has
        # lapsed - same lazy-check-on-read pattern as the SLA breach check
        # above, so it's caught the moment anyone loads this list rather than
        # needing a separate scheduled job.
        ApprovalWorkflowService.check_and_expire_owner_reviews(db)

        # Build query
        query = db.query(ApprovalRequest)

        # Filters
        if status:
            query = query.filter(ApprovalRequest.status == status)
        else:
            # An "Expired" request (owner review lapsed, or the assigned
            # owner was removed with nobody left to act on it) has already
            # been withdrawn back to Role Engineering - it should not
            # clutter the default Approval Requests view. It's still
            # reachable by explicitly filtering status="Expired" if ever
            # needed for audit purposes.
            query = query.filter(ApprovalRequest.status != "Expired")
        if priority:
            query = query.filter(ApprovalRequest.priority == priority)
        if submitted_by:
            query = query.filter(ApprovalRequest.submitted_by == submitted_by)

        # Search by role name or submitter
        if search:
            search_like = f"%{search}%"
            query = query.join(CandidateRole, ApprovalRequest.candidate_role_id == CandidateRole.id).filter(
                or_(
                    CandidateRole.role_name.like(search_like),
                    ApprovalRequest.submitted_by.like(search_like)
                )
            )

        # Sorting
        if sort_by:
            # Handle sorting on joined table (role_name)
            if sort_by == "role_name":
                query = query.join(CandidateRole, ApprovalRequest.candidate_role_id == CandidateRole.id)
                col = CandidateRole.role_name
            else:
                col = getattr(ApprovalRequest, sort_by, None)
            
            if col:
                if sort_order == "desc":
                    query = query.order_by(col.desc())
                else:
                    query = query.order_by(col.asc())
        else:
            query = query.order_by(ApprovalRequest.created_at.desc())

        total = query.count()
        total_pages = (total + limit - 1) // limit if total > 0 else 0
        requests = query.offset((page - 1) * limit).limit(limit).all()

        results = []
        for r in requests:
            role = db.query(CandidateRole).filter(CandidateRole.id == r.candidate_role_id).first()
            results.append({
                "id": r.id,
                "candidate_role_id": r.candidate_role_id,
                "role_name": role.role_name if role else "Unknown Role",
                "classification": role.classification if role else None,
                "primary_owner_name": role.primary_owner_name if role else None,
                "workflow_name": r.workflow_name,
                "current_stage": r.current_stage,
                "status": r.status,
                "submitted_by": r.submitted_by,
                "submitted_at": r.submitted_at.isoformat() if r.submitted_at else None,
                "completed_at": r.completed_at.isoformat() if r.completed_at else None,
                "due_date": r.due_date.isoformat() if r.due_date else None,
                "is_escalated": r.is_escalated,
                "priority": r.priority,
                "remarks": r.remarks
            })

        return {
            "total": total,
            "page": page,
            "limit": limit,
            "total_pages": total_pages,
            "requests": results
        }

    @staticmethod
    def get_approval_request_by_id(db: Session, request_id: int) -> Dict:
        """
        Retrieves detailed information of a single approval request.
        """
        r = db.query(ApprovalRequest).filter(ApprovalRequest.id == request_id).first()
        if not r:
            raise ValueError(f"Approval request {request_id} not found")

        role = db.query(CandidateRole).filter(CandidateRole.id == r.candidate_role_id).first()
        steps = db.query(ApprovalStep).filter(
            ApprovalStep.approval_request_id == request_id
        ).order_by(ApprovalStep.step_order.asc()).all()

        return {
            "id": r.id,
            "candidate_role_id": r.candidate_role_id,
            "role_name": role.role_name if role else "Unknown Role",
            "role_description": role.role_description if role else None,
            "role_type": role.role_type if role else None,
            "primary_owner_name": role.primary_owner_name if role else None,
            "backup_owner_name": role.backup_owner_name if role else None,
            "classification": role.classification if role else None,
            "workflow_name": r.workflow_name,
            "current_stage": r.current_stage,
            "status": r.status,
            "submitted_by": r.submitted_by,
            "submitted_at": r.submitted_at.isoformat() if r.submitted_at else None,
            "completed_at": r.completed_at.isoformat() if r.completed_at else None,
            "due_date": r.due_date.isoformat() if r.due_date else None,
            "is_escalated": r.is_escalated,
            "priority": r.priority,
            "remarks": r.remarks,
            "steps": [
                {
                    "id": s.id,
                    "step_order": s.step_order,
                    "step_name": s.step_name,
                    "approver_type": s.approver_type,
                    "approver_name": s.approver_name,
                    "status": s.status,
                    "assigned_at": s.assigned_at.isoformat() if s.assigned_at else None,
                    "action_at": s.action_at.isoformat() if s.action_at else None,
                    "remarks": s.remarks
                }
                for s in steps
            ]
        }
