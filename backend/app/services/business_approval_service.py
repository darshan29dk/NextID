from sqlalchemy.orm import Session
from datetime import datetime
from typing import Optional, List, Dict

from app.models.candidate_role import CandidateRole
from app.models.approval_request import ApprovalRequest
from app.models.approval_step import ApprovalStep
from app.models.audit_log import AuditLog
from app.models.dashboard import RecentActivity
from app.models.notification import Notification


class BusinessApprovalService:

    @staticmethod
    def _validate_reviewer_auth(db: Session, request: ApprovalRequest, user: str, role: str):
        """
        Ensures the calling user is the specifically assigned Primary or
        Backup owner of the role - and only that. Being a Platform
        Administrator no longer grants an automatic bypass here: a blanket
        "any admin can approve anything" override made the whole point of
        assigning a named, review-dated owner meaningless, and it also
        silently defeated the review-date expiry enforcement below (an admin
        could approve a role whose owner had already lapsed). A deliberate,
        clearly-logged override path for a genuinely unavailable owner is a
        separate feature to add later, not a silent role-based bypass.

        Also enforces owner review-date expiry: an owner's certification to
        act on a role lapses along with their review date, even for a request
        already in flight. Blocking silently would just leave the request
        stuck with nobody able to see why, so this fires two notifications -
        one telling the expired owner they can no longer approve, one telling
        Platform Administrators a new owner needs to be assigned so the
        request can be unblocked.
        """
        cand_role = db.query(CandidateRole).filter(CandidateRole.id == request.candidate_role_id).first()
        if not cand_role:
            raise ValueError("Associated candidate role not found")

        # Match by full name, case/whitespace-insensitive - the owner picker
        # and the logged-in display name aren't guaranteed to match exactly
        # in case (e.g. "sania gupta" vs "Sania Gupta"), and a strict ==
        # here would lock out the very owner the request is assigned to.
        user_norm = (user or "").strip().lower()
        owner_type = None
        if user_norm and user_norm == (cand_role.primary_owner_name or "").strip().lower():
            owner_type = "Primary"
        elif user_norm and user_norm == (cand_role.backup_owner_name or "").strip().lower():
            owner_type = "Backup"

        if owner_type is None:
            raise ValueError(f"User '{user}' is not authorized to action this request. Only the assigned Primary or Backup Owner can review.")

        from app.models.role_owner_history import RoleOwnerHistory
        owner_record = db.query(RoleOwnerHistory).filter(
            RoleOwnerHistory.candidate_role_id == cand_role.id,
            RoleOwnerHistory.owner_type == owner_type,
            RoleOwnerHistory.is_active == True
        ).first()

        now = datetime.utcnow()
        if owner_record and owner_record.review_date and owner_record.review_date < now:
            if not owner_record.is_expired:
                owner_record.is_expired = True

            db.add(Notification(
                title=f"Review Expired - Approval Blocked: {cand_role.role_name}",
                message=(
                    f"Your review date for '{cand_role.role_name}' has expired, so you can no longer "
                    f"approve this request. Please contact your Platform Administrator to renew your "
                    f"review or reassign ownership."
                ),
                status="unread",
                created_at=now
            ))
            db.add(Notification(
                title=f"Owner Reassignment Needed: {cand_role.role_name}",
                message=(
                    f"{owner_type} Owner '{user}' attempted to approve role '{cand_role.role_name}' "
                    f"but their review date expired on {owner_record.review_date.strftime('%d %b %Y')}. "
                    f"Please assign a new owner so this approval request can proceed."
                ),
                status="unread",
                created_at=now
            ))
            db.commit()

            raise ValueError(
                f"Your review date expired on {owner_record.review_date.strftime('%d %b %Y')} - you are no "
                f"longer authorized to approve this request. The Platform Administrator has been notified "
                f"to reassign ownership."
            )

        return True

    @staticmethod
    def approve_request(db: Session, request_id: int, user: str, role: str, remarks: Optional[str]) -> Dict:
        """
        Approves the business review step. Automatically transitions the request
        to Security Review (step_order=2). Candidate role status becomes 'Business Approved'.
        """
        request = db.query(ApprovalRequest).filter(ApprovalRequest.id == request_id).first()
        if not request:
            raise ValueError(f"Approval request {request_id} not found")

        if request.status not in ["Submitted", "Business Review"]:
            raise ValueError(f"Request cannot be approved from status: '{request.status}'")

        BusinessApprovalService._validate_reviewer_auth(db, request, user, role)

        now = datetime.utcnow()

        # Update business-review step
        step = db.query(ApprovalStep).filter(
            ApprovalStep.approval_request_id == request_id,
            ApprovalStep.step_name == "Business Review",
            ApprovalStep.status == "Pending"
        ).first()
        if step:
            step.status = "Approved"
            step.action_at = now
            step.remarks = remarks
            step.approver_name = user

        # Transition request to Security Review
        request.status = "Security Review"
        request.current_stage = "Security Review"
        request.updated_at = now
        # completed_at stays None — the overall request isn't done yet

        # Update candidate role status
        cand_role = db.query(CandidateRole).filter(CandidateRole.id == request.candidate_role_id).first()
        if cand_role:
            cand_role.status = "Business Approved"
            cand_role.modified_by = user
            cand_role.updated_at = now

        # Prevent duplicate Security Review step (idempotent)
        existing_sec_step = db.query(ApprovalStep).filter(
            ApprovalStep.approval_request_id == request_id,
            ApprovalStep.step_name == "Security Review"
        ).first()
        if not existing_sec_step:
            db.add(ApprovalStep(
                approval_request_id=request_id,
                step_order=2,
                step_name="Security Review",
                approver_type="Security Administrator",
                approver_name=None,
                status="Pending",
                assigned_at=now,
                remarks=None
            ))

        # Write logs
        role_name = cand_role.role_name if cand_role else ""
        db.add(AuditLog(
            module="Approval Workflow",
            action="Business Approved",
            performed_by=user,
            new_value=f"Approved role '{role_name}' — remarks: '{remarks}'",
            timestamp=now
        ))
        db.add(AuditLog(
            module="Approval Workflow",
            action="Security Review Started",
            performed_by="System",
            new_value=f"Request #{request_id} automatically transitioned to Security Review",
            timestamp=now
        ))
        db.add(RecentActivity(
            user=user,
            action=f"Business-approved role '{role_name}' → now in Security Review",
            status="success",
            created_at=now
        ))
        db.add(Notification(
            title=f"Security Review Needed: {role_name}",
            message=(
                f"{user} approved role '{role_name}' at Business Review. "
                f"It is now pending Security Review."
            ),
            status="unread",
            created_at=now
        ))

        try:
            db.commit()
        except Exception:
            db.rollback()
            raise

        return {"status": "success", "message": "Business approval completed. Request moved to Security Review."}


    @staticmethod
    def reject_request(db: Session, request_id: int, user: str, role: str, remarks: Optional[str]) -> Dict:
        """
        Rejects the business review step. Candidate role status becomes 'Rejected'.
        """
        request = db.query(ApprovalRequest).filter(ApprovalRequest.id == request_id).first()
        if not request:
            raise ValueError(f"Approval request {request_id} not found")

        if request.status not in ["Submitted", "Business Review"]:
            raise ValueError(f"Request cannot be rejected from status: {request.status}")

        BusinessApprovalService._validate_reviewer_auth(db, request, user, role)

        now = datetime.utcnow()
        # Update step
        step = db.query(ApprovalStep).filter(
            ApprovalStep.approval_request_id == request_id,
            ApprovalStep.step_name == "Business Review",
            ApprovalStep.status == "Pending"
        ).first()
        if step:
            step.status = "Rejected"
            step.action_at = now
            step.remarks = remarks
            step.approver_name = user

        # Update request
        request.status = "Business Rejected"
        request.completed_at = now
        request.updated_at = now

        # Update candidate role status to Rejected
        cand_role = db.query(CandidateRole).filter(CandidateRole.id == request.candidate_role_id).first()
        if cand_role:
            cand_role.status = "Rejected"
            cand_role.modified_by = user
            cand_role.updated_at = now

        role_name = cand_role.role_name if cand_role else ""
        db.add(AuditLog(
            module="Approval Workflow",
            action="Business Rejected",
            performed_by=user,
            new_value=f"Rejected role '{role_name}' — remarks: '{remarks}'",
            timestamp=now
        ))
        db.add(RecentActivity(
            user=user,
            action=f"Rejected role '{role_name}'.",
            status="danger",
            created_at=now
        ))
        db.add(Notification(
            title=f"Role Rejected: {role_name}",
            message=(
                f"{user} rejected role '{role_name}' at Business Review. "
                f"Remarks: '{remarks or 'None'}'."
            ),
            status="unread",
            created_at=now
        ))

        try:
            db.commit()
        except Exception:
            db.rollback()
            raise

        return {"status": "success", "message": "Business approval rejected"}

    @staticmethod
    def return_request(db: Session, request_id: int, user: str, role: str, remarks: Optional[str]) -> Dict:
        """
        Returns request to draft state for rework. Candidate role status becomes 'Draft'.
        """
        request = db.query(ApprovalRequest).filter(ApprovalRequest.id == request_id).first()
        if not request:
            raise ValueError(f"Approval request {request_id} not found")

        if request.status not in ["Submitted", "Business Review"]:
            raise ValueError(f"Request cannot be returned from status: {request.status}")

        BusinessApprovalService._validate_reviewer_auth(db, request, user, role)

        now = datetime.utcnow()
        # Update step
        step = db.query(ApprovalStep).filter(
            ApprovalStep.approval_request_id == request_id,
            ApprovalStep.step_name == "Business Review",
            ApprovalStep.status == "Pending"
        ).first()
        if step:
            step.status = "Returned"
            step.action_at = now
            step.remarks = remarks
            step.approver_name = user

        # Update request
        request.status = "Returned For Rework"
        request.completed_at = now
        request.updated_at = now

        # Revert candidate role status to Draft
        cand_role = db.query(CandidateRole).filter(CandidateRole.id == request.candidate_role_id).first()
        if cand_role:
            cand_role.status = "Draft"
            cand_role.modified_by = user
            cand_role.updated_at = now

        role_name = cand_role.role_name if cand_role else ""
        db.add(AuditLog(
            module="Approval Workflow",
            action="Returned For Rework",
            performed_by=user,
            new_value=f"Returned role '{role_name}' for rework. Remarks: '{remarks}'",
            timestamp=now
        ))
        db.add(RecentActivity(
            user=user,
            action=f"Returned role '{role_name}' for rework",
            status="warning",
            created_at=now
        ))
        db.add(Notification(
            title=f"Returned For Rework: {role_name}",
            message=(
                f"{user} returned role '{role_name}' for rework. "
                f"Remarks: '{remarks or 'None'}'."
            ),
            status="unread",
            created_at=now
        ))

        try:
            db.commit()
        except Exception:
            db.rollback()
            raise
        return {"status": "success", "message": "Request returned for rework"}

    @staticmethod
    def cancel_submission(db: Session, request_id: int, user: str, role: str) -> Dict:
        """
        Cancels a pending approval request. Reverts candidate role status to Draft.
        """
        request = db.query(ApprovalRequest).filter(ApprovalRequest.id == request_id).first()
        if not request:
            raise ValueError(f"Approval request {request_id} not found")

        if request.status not in ["Submitted", "Business Review"]:
            raise ValueError(f"Cannot cancel a request that is not pending")

        # Submitter or Admin can cancel
        if role != "Platform Administrator" and request.submitted_by != user:
            raise ValueError("Only the original submitter or a Platform Admin can cancel this request")

        now = datetime.utcnow()
        # Cancel pending steps
        steps = db.query(ApprovalStep).filter(
            ApprovalStep.approval_request_id == request_id,
            ApprovalStep.status == "Pending"
        ).all()
        for s in steps:
            s.status = "Returned"
            s.action_at = now
            s.remarks = "Submission cancelled by submitter"

        request.status = "Returned For Rework"
        request.completed_at = now
        request.updated_at = now

        # Revert candidate role status to Draft
        cand_role = db.query(CandidateRole).filter(CandidateRole.id == request.candidate_role_id).first()
        if cand_role:
            cand_role.status = "Draft"
            cand_role.modified_by = user
            cand_role.updated_at = now

        db.add(AuditLog(
            module="Approval Workflow",
            action="Submission Cancelled",
            performed_by=user,
            new_value=f"Cancelled submission for role '{cand_role.role_name if cand_role else ''}'",
            timestamp=now
        ))

        db.commit()
        return {"status": "success", "message": "Submission cancelled successfully"}

    @staticmethod
    def bulk_approve(db: Session, request_ids: List[int], user: str, role: str, remarks: Optional[str]) -> Dict:
        """Processes approval for multiple requests in bulk."""
        success_count = 0
        errors = []
        for rid in request_ids:
            try:
                BusinessApprovalService.approve_request(db, rid, user, role, remarks)
                success_count += 1
            except Exception as e:
                errors.append(f"Request #{rid}: {str(e)}")
        return {"success_count": success_count, "failed_count": len(errors), "errors": errors}

    @staticmethod
    def bulk_reject(db: Session, request_ids: List[int], user: str, role: str, remarks: Optional[str]) -> Dict:
        """Processes rejection for multiple requests in bulk."""
        success_count = 0
        errors = []
        for rid in request_ids:
            try:
                BusinessApprovalService.reject_request(db, rid, user, role, remarks)
                success_count += 1
            except Exception as e:
                errors.append(f"Request #{rid}: {str(e)}")
        return {"success_count": success_count, "failed_count": len(errors), "errors": errors}

    @staticmethod
    def bulk_return(db: Session, request_ids: List[int], user: str, role: str, remarks: Optional[str]) -> Dict:
        """Processes return for multiple requests in bulk."""
        success_count = 0
        errors = []
        for rid in request_ids:
            try:
                BusinessApprovalService.return_request(db, rid, user, role, remarks)
                success_count += 1
            except Exception as e:
                errors.append(f"Request #{rid}: {str(e)}")
        return {"success_count": success_count, "failed_count": len(errors), "errors": errors}
