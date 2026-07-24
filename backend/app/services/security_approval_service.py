from sqlalchemy.orm import Session
from sqlalchemy import or_
from datetime import datetime
from typing import Optional, Dict, List

from app.models.candidate_role import CandidateRole
from app.models.approval_request import ApprovalRequest
from app.models.approval_step import ApprovalStep
from app.models.audit_log import AuditLog
from app.models.dashboard import RecentActivity
from app.models.notification import Notification

# Roles allowed to take action on Security Review
_SECURITY_ACTION_ROLES = {"Platform Administrator", "Security Administrator"}


class SecurityApprovalService:

    @staticmethod
    def _authorize(user_role: str) -> None:
        """Raises PermissionError if the caller is not in the allowed security roles."""
        if user_role not in _SECURITY_ACTION_ROLES:
            raise PermissionError(
                f"Role '{user_role}' is not authorized to perform Security Approval actions. "
                f"Required: Platform Administrator or Security Administrator."
            )

    @staticmethod
    def _get_security_step(db: Session, request_id: int) -> Optional[ApprovalStep]:
        """Returns the existing Security Review step (prevents duplicate creation)."""
        return db.query(ApprovalStep).filter(
            ApprovalStep.approval_request_id == request_id,
            ApprovalStep.step_name == "Security Review"
        ).first()

    # ── Read ──────────────────────────────────────────────────────────────────

    @staticmethod
    def get_security_requests(
        db: Session,
        page: int = 1,
        limit: int = 10,
        search: Optional[str] = None,
        status: Optional[str] = None,
        priority: Optional[str] = None,
    ) -> Dict:
        """Returns paginated requests in the Security Review stage or completed from it."""
        if page < 1:
            page = 1
        if limit < 1:
            limit = 10

        security_statuses = [
            "Security Review", "Security Approved",
            "Security Rejected", "Returned For Rework", "Ready For Publish",
        ]

        query = db.query(ApprovalRequest)

        if status:
            query = query.filter(ApprovalRequest.status == status)
        else:
            query = query.filter(ApprovalRequest.status.in_(security_statuses))

        if priority:
            query = query.filter(ApprovalRequest.priority == priority)

        if search:
            like = f"%{search}%"
            query = query.join(
                CandidateRole, ApprovalRequest.candidate_role_id == CandidateRole.id
            ).filter(or_(
                CandidateRole.role_name.like(like),
                ApprovalRequest.submitted_by.like(like),
            ))

        query = query.order_by(ApprovalRequest.updated_at.desc())
        total = query.count()
        total_pages = (total + limit - 1) // limit if total > 0 else 0
        records = query.offset((page - 1) * limit).limit(limit).all()

        results = []
        for r in records:
            role = db.query(CandidateRole).filter(CandidateRole.id == r.candidate_role_id).first()
            biz_step = db.query(ApprovalStep).filter(
                ApprovalStep.approval_request_id == r.id,
                ApprovalStep.step_name == "Business Review"
            ).first()
            sec_step = SecurityApprovalService._get_security_step(db, r.id)

            results.append({
                "id": r.id,
                "candidate_role_id": r.candidate_role_id,
                "role_name": role.role_name if role else "Unknown Role",
                "classification": role.classification if role else None,
                "primary_owner_name": role.primary_owner_name if role else None,
                "workflow_name": r.workflow_name,
                "current_stage": r.current_stage,
                "status": r.status,
                "priority": r.priority,
                "submitted_by": r.submitted_by,
                "submitted_at": r.submitted_at.isoformat() if r.submitted_at else None,
                "due_date": r.due_date.isoformat() if r.due_date else None,
                "is_escalated": r.is_escalated,
                "business_approved_at": biz_step.action_at.isoformat() if biz_step and biz_step.action_at else None,
                "business_reviewer": biz_step.approver_name if biz_step else None,
                "security_reviewer_name": r.security_reviewer_name,
                "security_decision": r.security_decision,
                "security_review_started_at": r.security_review_started_at.isoformat() if r.security_review_started_at else None,
                "security_review_completed_at": r.security_review_completed_at.isoformat() if r.security_review_completed_at else None,
                "security_step_status": sec_step.status if sec_step else None,
            })

        return {"total": total, "page": page, "limit": limit, "total_pages": total_pages, "requests": results}

    @staticmethod
    def get_kpi_counts(db: Session) -> Dict:
        """Returns KPI counts for the Security Approval dashboard."""
        def cnt(statuses):
            return db.query(ApprovalRequest).filter(ApprovalRequest.status.in_(statuses)).count()
        return {
            "pending_review": cnt(["Security Review"]),
            "approved": cnt(["Security Approved", "Ready For Publish"]),
            "rejected": cnt(["Security Rejected"]),
            "returned": cnt(["Returned For Rework"]),
            "ready_for_publish": cnt(["Ready For Publish"]),
        }

    @staticmethod
    def get_security_request_by_id(db: Session, request_id: int) -> Dict:
        """Returns full detail for a single approval request."""
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
            "role_name": role.role_name if role else "Unknown",
            "role_description": role.role_description if role else None,
            "role_type": role.role_type if role else None,
            "classification": role.classification if role else None,
            "primary_owner_name": role.primary_owner_name if role else None,
            "backup_owner_name": role.backup_owner_name if role else None,
            "workflow_name": r.workflow_name,
            "current_stage": r.current_stage,
            "status": r.status,
            "priority": r.priority,
            "submitted_by": r.submitted_by,
            "submitted_at": r.submitted_at.isoformat() if r.submitted_at else None,
            "completed_at": r.completed_at.isoformat() if r.completed_at else None,
            "due_date": r.due_date.isoformat() if r.due_date else None,
            "is_escalated": r.is_escalated,
            "remarks": r.remarks,
            "security_reviewer_name": r.security_reviewer_name,
            "security_decision": r.security_decision,
            "security_remarks": r.security_remarks,
            "security_review_started_at": r.security_review_started_at.isoformat() if r.security_review_started_at else None,
            "security_review_completed_at": r.security_review_completed_at.isoformat() if r.security_review_completed_at else None,
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
                    "remarks": s.remarks,
                }
                for s in steps
            ],
        }

    # ── Action APIs ───────────────────────────────────────────────────────────

    @staticmethod
    def approve_request(db: Session, request_id: int, user: str, user_role: str, remarks: Optional[str]) -> Dict:
        """
        Approves the Security Review. Sets status=Security Approved, role=Ready For Publish.
        Remarks are optional for approval.
        """
        SecurityApprovalService._authorize(user_role)

        request = db.query(ApprovalRequest).filter(ApprovalRequest.id == request_id).first()
        if not request:
            raise ValueError(f"Approval request {request_id} not found")
        if request.status != "Security Review":
            raise ValueError(
                f"Security Approval requires status 'Security Review' (current: '{request.status}'). "
                "Ensure Business Approval has been completed first."
            )

        now = datetime.utcnow()

        # Stamp request
        request.status = "Security Approved"
        request.current_stage = "Security Approved"
        request.completed_at = now
        request.updated_at = now
        request.security_reviewer_name = user
        request.security_decision = "Approved"
        request.security_remarks = remarks
        request.security_review_completed_at = now
        if not request.security_review_started_at:
            request.security_review_started_at = now

        # Update Security Review step (idempotent — update existing, create if defensive fallback)
        sec_step = SecurityApprovalService._get_security_step(db, request_id)
        if sec_step:
            sec_step.status = "Approved"
            sec_step.action_at = now
            sec_step.approver_name = user
            sec_step.remarks = remarks
        else:
            db.add(ApprovalStep(
                approval_request_id=request_id, step_order=2, step_name="Security Review",
                approver_type="Security Administrator", approver_name=user,
                status="Approved", assigned_at=now, action_at=now, remarks=remarks,
            ))

        # Role becomes "Ready For Publish" - NOT published automatically.
        # Publishing to the Role Catalog stays a deliberate, separate manual
        # action (RoleCatalogService.publish_role, triggered by clicking
        # Publish) even after Security Approval completes. A prior change
        # here auto-published directly on Security Approval, which collapsed
        # the last manual checkpoint in the pipeline - reverted per explicit
        # requirement: classification is the only thing that should ever be
        # set automatically; owner assignment, Submit for Approval, and
        # Publish all remain human actions.
        cand_role = db.query(CandidateRole).filter(CandidateRole.id == request.candidate_role_id).first()
        if cand_role:
            cand_role.status = "Ready For Publish"
            cand_role.modified_by = user
            cand_role.updated_at = now

        role_name = cand_role.role_name if cand_role else ""
        db.add(AuditLog(module="Approval Workflow", action="Security Approved", performed_by=user,
                        new_value=f"Security-approved role '{role_name}'. Now Ready For Publish.", timestamp=now))
        db.add(RecentActivity(user=user, action=f"Security-approved '{role_name}' -- Ready For Publish.",
                              status="success", created_at=now))
        db.add(Notification(
            title=f"Role Approved: {role_name}",
            message=f"{user} security-approved role '{role_name}'. It is now Ready For Publish.",
            status="unread",
            created_at=now
        ))

        try:
            db.commit()
        except Exception:
            db.rollback()
            raise

        return {"status": "success", "message": f"Role '{role_name}' is now Ready For Publish.",
                "request_status": "Security Approved", "role_status": "Ready For Publish"}

    @staticmethod
    def reject_request(db: Session, request_id: int, user: str, user_role: str, remarks: Optional[str]) -> Dict:
        """
        Rejects the Security Review. Remarks MANDATORY.
        Sets status=Security Rejected, role=Security Rejected.
        """
        SecurityApprovalService._authorize(user_role)
        if not remarks or not remarks.strip():
            raise ValueError("Rejection remarks are required. Please provide a reason for rejection.")

        request = db.query(ApprovalRequest).filter(ApprovalRequest.id == request_id).first()
        if not request:
            raise ValueError(f"Approval request {request_id} not found")
        if request.status != "Security Review":
            raise ValueError(f"Cannot reject: request is not in 'Security Review' status (current: '{request.status}').")

        now = datetime.utcnow()

        request.status = "Security Rejected"
        request.current_stage = "Security Rejected"
        request.completed_at = now
        request.updated_at = now
        request.security_reviewer_name = user
        request.security_decision = "Rejected"
        request.security_remarks = remarks
        request.security_review_completed_at = now
        if not request.security_review_started_at:
            request.security_review_started_at = now

        sec_step = SecurityApprovalService._get_security_step(db, request_id)
        if sec_step:
            sec_step.status = "Rejected"
            sec_step.action_at = now
            sec_step.approver_name = user
            sec_step.remarks = remarks
        else:
            db.add(ApprovalStep(
                approval_request_id=request_id, step_order=2, step_name="Security Review",
                approver_type="Security Administrator", approver_name=user,
                status="Rejected", assigned_at=now, action_at=now, remarks=remarks,
            ))

        cand_role = db.query(CandidateRole).filter(CandidateRole.id == request.candidate_role_id).first()
        if cand_role:
            cand_role.status = "Security Rejected"
            cand_role.modified_by = user
            cand_role.updated_at = now

        role_name = cand_role.role_name if cand_role else ""
        db.add(AuditLog(module="Approval Workflow", action="Security Rejected", performed_by=user,
                        new_value=f"Rejected role '{role_name}' at Security Review. Remarks: '{remarks}'", timestamp=now))
        db.add(RecentActivity(user=user, action=f"Security-rejected role '{role_name}'.",
                              status="danger", created_at=now))
        db.add(Notification(
            title=f"Role Rejected: {role_name}",
            message=f"{user} rejected role '{role_name}' at Security Review. Remarks: '{remarks}'.",
            status="unread",
            created_at=now
        ))

        try:
            db.commit()
        except Exception:
            db.rollback()
            raise

        return {"status": "success", "message": f"Security review rejected for role '{role_name}'.",
                "request_status": "Security Rejected", "role_status": "Security Rejected"}

    @staticmethod
    def return_request(db: Session, request_id: int, user: str, user_role: str, remarks: Optional[str]) -> Dict:
        """
        Returns request for rework. Remarks MANDATORY.
        Sets status=Returned For Rework, role=Draft (allows resubmission).
        """
        SecurityApprovalService._authorize(user_role)
        if not remarks or not remarks.strip():
            raise ValueError("Return remarks are required. Please provide the reason for returning this request.")

        request = db.query(ApprovalRequest).filter(ApprovalRequest.id == request_id).first()
        if not request:
            raise ValueError(f"Approval request {request_id} not found")
        if request.status != "Security Review":
            raise ValueError(f"Cannot return: request is not in 'Security Review' status (current: '{request.status}').")

        now = datetime.utcnow()

        request.status = "Returned For Rework"
        request.current_stage = "Returned For Rework"
        request.completed_at = now
        request.updated_at = now
        request.security_reviewer_name = user
        request.security_decision = "Returned"
        request.security_remarks = remarks
        request.security_review_completed_at = now
        if not request.security_review_started_at:
            request.security_review_started_at = now

        sec_step = SecurityApprovalService._get_security_step(db, request_id)
        if sec_step:
            sec_step.status = "Returned"
            sec_step.action_at = now
            sec_step.approver_name = user
            sec_step.remarks = remarks
        else:
            db.add(ApprovalStep(
                approval_request_id=request_id, step_order=2, step_name="Security Review",
                approver_type="Security Administrator", approver_name=user,
                status="Returned", assigned_at=now, action_at=now, remarks=remarks,
            ))

        cand_role = db.query(CandidateRole).filter(CandidateRole.id == request.candidate_role_id).first()
        if cand_role:
            cand_role.status = "Draft"
            cand_role.modified_by = user
            cand_role.updated_at = now

        role_name = cand_role.role_name if cand_role else ""
        db.add(AuditLog(module="Approval Workflow", action="Returned By Security", performed_by=user,
                        new_value=f"Returned role '{role_name}' from Security Review. Remarks: '{remarks}'", timestamp=now))
        db.add(RecentActivity(user=user, action=f"Returned '{role_name}' from Security Review for rework.",
                              status="warning", created_at=now))
        db.add(Notification(
            title=f"Returned For Rework: {role_name}",
            message=f"{user} returned role '{role_name}' from Security Review for rework. Remarks: '{remarks}'.",
            status="unread",
            created_at=now
        ))

        try:
            db.commit()
        except Exception:
            db.rollback()
            raise

        return {"status": "success", "message": f"Request returned for rework. Role '{role_name}' reverted to Draft.",
                "request_status": "Returned For Rework", "role_status": "Draft"}
