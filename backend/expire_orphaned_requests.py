"""
One-off cleanup: finds any ApprovalRequest stuck in "Business Review" that
has NO active owner left on its role (the exact situation the new
remove_owner() auto-expire logic now prevents going forward, but this
fixes rows that were already stuck before that fix existed - e.g. request
#818 for "Marketing Analyst - Variant B").

For each such request:
  - status -> "Expired", current_stage -> "Owner Review Expired"
  - its pending ApprovalStep -> "Expired"
  - role.status -> "Draft" (if not already)
  - audit log entry

Run from the backend/ directory:
  python3 expire_orphaned_requests.py
"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import app.main  # populate the full SQLAlchemy mapper registry
from app.database import SessionLocal
from app.models.approval_request import ApprovalRequest
from app.models.approval_step import ApprovalStep
from app.models.candidate_role import CandidateRole
from app.models.role_owner_history import RoleOwnerHistory
from app.models.audit_log import AuditLog
from app.models.notification import Notification
from datetime import datetime

db = SessionLocal()
try:
    now = datetime.utcnow()
    pending = db.query(ApprovalRequest).filter(ApprovalRequest.status == "Business Review").all()

    fixed = 0
    for req in pending:
        role = db.query(CandidateRole).filter(CandidateRole.id == req.candidate_role_id).first()
        if not role:
            continue

        active_owner_count = db.query(RoleOwnerHistory).filter(
            RoleOwnerHistory.candidate_role_id == role.id,
            RoleOwnerHistory.is_active == True
        ).count()

        if active_owner_count > 0:
            continue  # still has an owner, leave it alone

        print(f"Expiring request #{req.id} for role '{role.role_name}' (id={role.id}) - no active owner.")

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
            pending_step.remarks = "Owner was removed before action was taken; no owner remains assigned (retroactive cleanup)."

        role.status = "Draft"
        role.modified_by = "System (Cleanup - Owner Removed)"
        role.updated_at = now

        db.add(AuditLog(
            module="Approval Workflow",
            action="Request Auto-Expired (Owner Removed - Retroactive Cleanup)",
            performed_by="System",
            old_value=f"Role '{role.role_name}' was stuck in Business Review with no owner assigned",
            new_value="Request expired; role returned to Draft for resubmission.",
            timestamp=now
        ))
        db.add(Notification(
            title=f"Approval Withdrawn: {role.role_name}",
            message=(
                f"The pending approval request for role '{role.role_name}' was withdrawn "
                f"because no owner remains assigned. Please assign a new owner and resubmit for approval."
            ),
            status="unread",
            created_at=now
        ))

        fixed += 1

    if fixed:
        db.commit()
    print(f"Done. {fixed} orphaned request(s) expired.")
finally:
    db.close()
