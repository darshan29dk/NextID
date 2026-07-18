from sqlalchemy.orm import Session
from sqlalchemy import or_
from datetime import datetime, date
from typing import Optional, List, Dict, Any
import json

from app.models.candidate_role import CandidateRole
from app.models.role_owner_history import RoleOwnerHistory
from app.models.platform_user import PlatformUser
from app.models.notification import Notification
from app.models.audit_log import AuditLog
from app.models.dashboard import RecentActivity


class RoleOwnerService:

    # -------------------------------------------------------------------------
    # Owner Search / Lookup
    # -------------------------------------------------------------------------
    @staticmethod
    def search_platform_users(db: Session, query: str, limit: int = 20) -> List[Dict]:
        """
        Full-text search on platform users (name, email, employee_id, department).
        Returns lightweight list for owner picker autocomplete.
        """
        q = db.query(PlatformUser).filter(
            PlatformUser.is_deleted == False,
            PlatformUser.status == "Active"
        )
        if query:
            like = f"%{query}%"
            full_name = (PlatformUser.first_name + " " + PlatformUser.last_name)
            q = q.filter(
                or_(
                    PlatformUser.first_name.like(like),
                    PlatformUser.last_name.like(like),
                    PlatformUser.email.like(like),
                    PlatformUser.employee_id.like(like),
                    PlatformUser.department.like(like)
                )
            )
        users = q.limit(limit).all()
        return [
            {
                "id": u.id,
                "employee_id": u.employee_id,
                "full_name": f"{u.first_name} {u.last_name}".strip(),
                "email": u.email,
                "department": u.department,
                "job_title": u.job_title
            }
            for u in users
        ]

    # -------------------------------------------------------------------------
    # Assign Owner
    # -------------------------------------------------------------------------
    @staticmethod
    def assign_owner(
        db: Session,
        role_id: int,
        owner_type: str,          # "Primary" or "Backup"
        owner_name: str,
        owner_email: Optional[str],
        owner_user_id: Optional[int],
        review_date: str,  # required; "YYYY-MM-DD" or "YYYY-MM-DDTHH:MM"
        change_reason: Optional[str],
        assigned_by: str
    ) -> Dict:
        """
        Assigns a primary or backup owner to a candidate role.
        Validates no duplicate owner and deactivates any previous assignment of the same type.
        Sends an in-platform notification to the assigned user.
        """
        role = db.query(CandidateRole).filter(
            CandidateRole.id == role_id,
            CandidateRole.is_deleted == False
        ).first()
        if not role:
            raise ValueError(f"Candidate role {role_id} not found")

        allowed_types = ["Primary", "Backup"]
        if owner_type not in allowed_types:
            raise ValueError(f"owner_type must be one of {allowed_types}")

        # --- Duplicate Owner Validation ---
        # Check if this specific user is already an active owner of this role (either type)
        if owner_user_id:
            existing = db.query(RoleOwnerHistory).filter(
                RoleOwnerHistory.candidate_role_id == role_id,
                RoleOwnerHistory.owner_user_id == owner_user_id,
                RoleOwnerHistory.is_active == True
            ).first()
            if existing:
                raise ValueError(
                    f"User '{owner_name}' is already assigned as {existing.owner_type} owner of this role. "
                    "Cannot assign the same user as both Primary and Backup."
                )
        else:
            # Duplicate by name if no user_id
            existing = db.query(RoleOwnerHistory).filter(
                RoleOwnerHistory.candidate_role_id == role_id,
                RoleOwnerHistory.owner_name == owner_name,
                RoleOwnerHistory.is_active == True
            ).first()
            if existing:
                raise ValueError(
                    f"Owner '{owner_name}' is already an active {existing.owner_type} owner of this role."
                )

        # --- Deactivate old owner of same type ---
        old_owners = db.query(RoleOwnerHistory).filter(
            RoleOwnerHistory.candidate_role_id == role_id,
            RoleOwnerHistory.owner_type == owner_type,
            RoleOwnerHistory.is_active == True
        ).all()
        for old in old_owners:
            old.is_active = False
            old.removed_at = datetime.utcnow()

        # --- Parse review_date (required) ---
        if not review_date or not review_date.strip():
            raise ValueError("review_date is required")
        review_dt = None
        for fmt in ("%Y-%m-%dT%H:%M", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d %H:%M", "%Y-%m-%d"):
            try:
                review_dt = datetime.strptime(review_date, fmt)
                break
            except ValueError:
                continue
        if review_dt is None:
            raise ValueError("review_date must be in format YYYY-MM-DDTHH:MM (date and time required)")

        # --- Create new history record ---
        new_entry = RoleOwnerHistory(
            candidate_role_id=role_id,
            owner_user_id=owner_user_id,
            owner_name=owner_name,
            owner_email=owner_email,
            owner_type=owner_type,
            review_date=review_dt,
            is_expired=False,
            assigned_by=assigned_by,
            assigned_at=datetime.utcnow(),
            is_active=True,
            change_reason=change_reason,
            notification_sent=False
        )
        db.add(new_entry)
        db.flush()

        # --- Update denormalized fields on CandidateRole ---
        if owner_type == "Primary":
            role.primary_owner_name = owner_name
            role.primary_owner_email = owner_email
            role.primary_owner_id = owner_user_id
            role.owner_review_date = review_dt
        else:
            role.backup_owner_name = owner_name
            role.backup_owner_email = owner_email
            role.backup_owner_id = owner_user_id

        role.modified_by = assigned_by
        role.updated_at = datetime.utcnow()

        # --- In-Platform Notification to Assigned Owner ---
        notif_title = f"Role Ownership Assigned: {role.role_name}"
        notif_msg = (
            f"You have been assigned as {owner_type} Owner of the role "
            f"'{role.role_name}' (ID: {role_id}) by {assigned_by}."
        )
        if review_dt:
            notif_msg += f" Your review is due by {review_dt.strftime('%d %b %Y')}."

        notification = Notification(
            title=notif_title,
            message=notif_msg,
            status="unread",
            created_at=datetime.utcnow()
        )
        db.add(notification)

        # Mark notification sent on history record
        new_entry.notification_sent = True
        new_entry.notification_sent_at = datetime.utcnow()

        # --- Audit Log ---
        audit = AuditLog(
            module="Role Engineering",
            action=f"{owner_type} Owner Assigned",
            performed_by=assigned_by,
            new_value=json.dumps({
                "role_id": role_id,
                "role_name": role.role_name,
                "owner_type": owner_type,
                "owner_name": owner_name,
                "owner_email": owner_email,
                "review_date": review_date
            }, default=str),
            timestamp=datetime.utcnow()
        )
        db.add(audit)

        # --- Recent Activity ---
        activity = RecentActivity(
            user=assigned_by,
            action=f"Assigned {owner_type} Owner '{owner_name}' to role '{role.role_name}'",
            status="success",
            created_at=datetime.utcnow()
        )
        db.add(activity)

        db.commit()
        db.refresh(new_entry)

        return {
            "id": new_entry.id,
            "role_id": role_id,
            "owner_type": owner_type,
            "owner_name": owner_name,
            "owner_email": owner_email,
            "owner_user_id": owner_user_id,
            "review_date": review_date,
            "assigned_by": assigned_by,
            "assigned_at": new_entry.assigned_at.isoformat(),
            "notification_sent": new_entry.notification_sent,
            "message": f"{owner_type} owner assigned successfully"
        }

    # -------------------------------------------------------------------------
    # Remove Owner
    # -------------------------------------------------------------------------
    @staticmethod
    def remove_owner(
        db: Session,
        role_id: int,
        owner_type: str,
        removed_by: str,
        reason: Optional[str] = None
    ) -> Dict:
        """Deactivates the current active owner of a given type."""
        role = db.query(CandidateRole).filter(
            CandidateRole.id == role_id,
            CandidateRole.is_deleted == False
        ).first()
        if not role:
            raise ValueError("Candidate role not found")

        active_owners = db.query(RoleOwnerHistory).filter(
            RoleOwnerHistory.candidate_role_id == role_id,
            RoleOwnerHistory.owner_type == owner_type,
            RoleOwnerHistory.is_active == True
        ).all()

        if not active_owners:
            raise ValueError(f"No active {owner_type} owner to remove")

        for o in active_owners:
            o.is_active = False
            o.removed_at = datetime.utcnow()
            o.change_reason = reason or "Manually removed"

        # Clear denormalized fields
        if owner_type == "Primary":
            role.primary_owner_name = None
            role.primary_owner_email = None
            role.primary_owner_id = None
            role.owner_review_date = None
        else:
            role.backup_owner_name = None
            role.backup_owner_email = None
            role.backup_owner_id = None

        role.modified_by = removed_by
        role.updated_at = datetime.utcnow()

        audit = AuditLog(
            module="Role Engineering",
            action=f"{owner_type} Owner Removed",
            performed_by=removed_by,
            old_value=json.dumps({
                "role_id": role_id,
                "role_name": role.role_name,
                "owner_type": owner_type,
                "reason": reason
            }, default=str),
            timestamp=datetime.utcnow()
        )
        db.add(audit)

        activity = RecentActivity(
            user=removed_by,
            action=f"Removed {owner_type} Owner from role '{role.role_name}'",
            status="warning",
            created_at=datetime.utcnow()
        )
        db.add(activity)

        db.commit()
        return {"message": f"{owner_type} owner removed successfully"}

    # -------------------------------------------------------------------------
    # Get Current Owners
    # -------------------------------------------------------------------------
    @staticmethod
    def get_current_owners(db: Session, role_id: int) -> Dict:
        """Returns the current active Primary and Backup owners for a role."""
        role = db.query(CandidateRole).filter(
            CandidateRole.id == role_id,
            CandidateRole.is_deleted == False
        ).first()
        if not role:
            raise ValueError("Candidate role not found")

        active_owners = db.query(RoleOwnerHistory).filter(
            RoleOwnerHistory.candidate_role_id == role_id,
            RoleOwnerHistory.is_active == True
        ).all()

        primary = None
        backup = None
        for o in active_owners:
            is_exp = False
            if o.review_date and o.review_date < datetime.utcnow():
                is_exp = True
                if not o.is_expired:
                    o.is_expired = True
                    db.commit()
            entry = {
                "id": o.id,
                "owner_name": o.owner_name,
                "owner_email": o.owner_email,
                "owner_user_id": o.owner_user_id,
                "owner_type": o.owner_type,
                "review_date": o.review_date.isoformat() if o.review_date else None,
                "is_expired": is_exp,
                "assigned_by": o.assigned_by,
                "assigned_at": o.assigned_at.isoformat() if o.assigned_at else None,
                "notification_sent": o.notification_sent,
                "change_reason": o.change_reason
            }
            if o.owner_type == "Primary":
                primary = entry
            else:
                backup = entry

        return {
            "role_id": role_id,
            "role_name": role.role_name,
            "primary": primary,
            "backup": backup
        }

    # -------------------------------------------------------------------------
    # Get Owner History (all records, including inactive)
    # -------------------------------------------------------------------------
    @staticmethod
    def get_owner_history(db: Session, role_id: int) -> List[Dict]:
        """Returns full owner history (active + removed) for a role."""
        records = db.query(RoleOwnerHistory).filter(
            RoleOwnerHistory.candidate_role_id == role_id
        ).order_by(RoleOwnerHistory.assigned_at.desc()).all()

        return [
            {
                "id": r.id,
                "owner_name": r.owner_name,
                "owner_email": r.owner_email,
                "owner_type": r.owner_type,
                "review_date": r.review_date.isoformat() if r.review_date else None,
                "is_expired": r.is_expired,
                "is_active": r.is_active,
                "assigned_by": r.assigned_by,
                "assigned_at": r.assigned_at.isoformat() if r.assigned_at else None,
                "removed_at": r.removed_at.isoformat() if r.removed_at else None,
                "change_reason": r.change_reason,
                "notification_sent": r.notification_sent
            }
            for r in records
        ]

    # -------------------------------------------------------------------------
    # Enforce Expiry – Check & flag expired owners across all roles
    # -------------------------------------------------------------------------
    @staticmethod
    def enforce_review_date_expiry(db: Session) -> int:
        """
        Scans all active owner records and marks those past their review_date
        as expired. Also creates an in-platform notification for each expired record.
        Returns the count of newly-expired records.
        """
        now = datetime.utcnow()
        expired_records = db.query(RoleOwnerHistory).filter(
            RoleOwnerHistory.is_active == True,
            RoleOwnerHistory.is_expired == False,
            RoleOwnerHistory.review_date != None,
            RoleOwnerHistory.review_date < now
        ).all()

        count = 0
        for rec in expired_records:
            rec.is_expired = True
            role = db.query(CandidateRole).filter(CandidateRole.id == rec.candidate_role_id).first()
            role_name = role.role_name if role else f"Role #{rec.candidate_role_id}"

            notification = Notification(
                title=f"Owner Review Overdue: {role_name}",
                message=(
                    f"{rec.owner_type} Owner '{rec.owner_name}' for role '{role_name}' "
                    f"has passed their review date of "
                    f"{rec.review_date.strftime('%d %b %Y')}. Please reassign or renew."
                ),
                status="unread",
                created_at=now
            )
            db.add(notification)
            count += 1

        if count > 0:
            db.commit()
        return count
