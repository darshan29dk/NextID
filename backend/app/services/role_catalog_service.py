from sqlalchemy.orm import Session
from sqlalchemy import or_, desc, asc
from datetime import datetime
from typing import Optional, Dict, List

from app.models.candidate_role import CandidateRole
from app.models.candidate_role_entitlement import CandidateRoleEntitlement
from app.models.candidate_role_member import CandidateRoleMember
from app.models.role_version_history import RoleVersionHistory
from app.models.audit_log import AuditLog
from app.models.dashboard import RecentActivity
from app.models.notification import Notification
from app.models.mining_campaign import MiningCampaign


class RoleCatalogService:

    # ── RC-001: Publish ─────────────────────────────────────────────────────

    @staticmethod
    def publish_role(db: Session, role_id: int, user: str, change_summary: Optional[str] = None) -> Dict:
        """
        Publishes a candidate role to the Role Catalog. A role must have completed
        the Approval Workflow (status == "Ready For Publish", set by
        SecurityApprovalService.approve_request) before it can be published.
        Writes a RoleVersionHistory snapshot every time this is called, so
        re-publishing an already-published role (e.g. after an edit) creates a
        new version rather than overwriting the last one.
        """
        role = db.query(CandidateRole).filter(
            CandidateRole.id == role_id,
            CandidateRole.is_deleted == False
        ).first()
        if not role:
            raise ValueError(f"Candidate role {role_id} not found")

        if role.status not in ["Ready For Publish", "Published"]:
            raise ValueError(
                f"Role must complete Security Approval before publishing (current status: '{role.status}')"
            )

        now = datetime.utcnow()
        is_republish = role.status == "Published"

        role.status = "Published"
        role.published_at = now
        role.published_by = user
        role.current_version = (role.current_version or 0) + 1
        role.modified_by = user
        role.updated_at = now

        db.add(RoleVersionHistory(
            candidate_role_id=role.id,
            version_number=role.current_version,
            change_summary=change_summary or ("Re-published to catalog" if is_republish else "Initial publish to catalog"),
            role_name=role.role_name,
            role_description=role.role_description,
            role_type=role.role_type,
            classification=role.classification,
            risk_level=role.risk_level,
            status=role.status,
            entitlement_count=role.entitlement_count,
            user_count=role.user_count,
            application_count=role.application_count,
            primary_owner_name=role.primary_owner_name,
            changed_by=user,
            created_at=now
        ))

        db.add(AuditLog(
            module="Role Catalog",
            action="Republished" if is_republish else "Published",
            performed_by=user,
            new_value=f"{'Re-published' if is_republish else 'Published'} role '{role.role_name}' to catalog (version {role.current_version})",
            timestamp=now
        ))
        db.add(RecentActivity(
            user=user,
            action=f"{'Re-published' if is_republish else 'Published'} role '{role.role_name}' to the Role Catalog",
            status="success",
            created_at=now
        ))
        db.add(Notification(
            title=f"Role Published: {role.role_name}",
            message=f"{user} published role '{role.role_name}' to the Role Catalog (version {role.current_version}).",
            status="unread",
            created_at=now
        ))

        try:
            db.commit()
        except Exception:
            db.rollback()
            raise
        db.refresh(role)

        return {
            "status": "success",
            "message": f"Role '{role.role_name}' published to catalog (version {role.current_version}).",
            "role_id": role.id,
            "version": role.current_version
        }

    # ── RC-001/RC-002/RC-003: Listing (optionally filtered by role_type) ───

    @staticmethod
    def get_published_roles(
        db: Session,
        page: int = 1,
        limit: int = 10,
        search: Optional[str] = None,
        role_type: Optional[str] = None,
        classification: Optional[str] = None,
        sort_by: Optional[str] = None,
        sort_order: Optional[str] = "desc",
        status: str = "Published"
    ) -> Dict:
        """
        Returns paginated roles. status filter allows querying either 'Published' (default)
        or 'Ready For Publish' (pending publish) roles.
        """
        if page < 1:
            page = 1
        if limit < 1:
            limit = 10

        query = db.query(CandidateRole).filter(
            CandidateRole.status == status,
            CandidateRole.is_deleted == False
        )

        if role_type:
            query = query.filter(CandidateRole.role_type == role_type)
        if classification:
            query = query.filter(CandidateRole.classification == classification)
        if search:
            like = f"%{search}%"
            query = query.filter(or_(
                CandidateRole.role_name.like(like),
                CandidateRole.department.like(like),
                CandidateRole.business_unit.like(like)
            ))

        if sort_by:
            col = getattr(CandidateRole, sort_by, None)
            if col is not None:
                query = query.order_by(col.desc() if sort_order == "desc" else col.asc())
        else:
            if status == "Published":
                query = query.order_by(CandidateRole.published_at.desc())
            else:
                query = query.order_by(CandidateRole.updated_at.desc())

        total = query.count()
        total_pages = (total + limit - 1) // limit if total > 0 else 0
        roles = query.offset((page - 1) * limit).limit(limit).all()

        return {
            "total": total,
            "page": page,
            "limit": limit,
            "total_pages": total_pages,
            "roles": [
                {
                    "id": r.id,
                    "role_name": r.role_name,
                    "role_description": r.role_description,
                    "role_type": r.role_type,
                    "classification": r.classification,
                    "risk_level": r.risk_level,
                    "status": r.status,
                    "department": r.department,
                    "business_unit": r.business_unit,
                    "user_count": r.user_count,
                    "entitlement_count": r.entitlement_count,
                    "application_count": r.application_count,
                    "primary_owner_name": r.primary_owner_name,
                    "current_version": r.current_version,
                    "published_at": (r.published_at.isoformat() + "Z") if r.published_at else None,
                    "published_by": r.published_by
                }
                for r in roles
            ]
        }

    @staticmethod
    def get_catalog_kpi(db: Session) -> Dict:
        """KPI counts for the Role Catalog dashboard header."""
        base = db.query(CandidateRole).filter(
            CandidateRole.status == "Published",
            CandidateRole.is_deleted == False
        )
        return {
            "total_published": base.count(),
            "business_roles": base.filter(CandidateRole.role_type == "Business").count(),
            "technical_roles": base.filter(CandidateRole.role_type == "Technical").count(),
            "pending_publish": db.query(CandidateRole).filter(
                CandidateRole.status == "Ready For Publish",
                CandidateRole.is_deleted == False
            ).count()
        }

    # ── RC-004: Role Details / workspace ────────────────────────────────────

    @staticmethod
    def get_role_catalog_detail(db: Session, role_id: int) -> Dict:
        """Full detail view for a published role, for the Role Catalog workspace page."""
        role = db.query(CandidateRole).filter(
            CandidateRole.id == role_id,
            CandidateRole.is_deleted == False
        ).first()
        if not role:
            raise ValueError(f"Candidate role {role_id} not found")

        entitlements = db.query(CandidateRoleEntitlement).filter(
            CandidateRoleEntitlement.candidate_role_id == role_id
        ).all()
        members = db.query(CandidateRoleMember).filter(
            CandidateRoleMember.candidate_role_id == role_id
        ).all()

        return {
            "id": role.id,
            "role_name": role.role_name,
            "role_description": role.role_description,
            "role_type": role.role_type,
            "risk_level": role.risk_level,
            "classification": role.classification,
            "status": role.status,
            "confidence_score": role.confidence_score,
            "department": role.department,
            "business_unit": role.business_unit,
            "user_count": role.user_count,
            "entitlement_count": role.entitlement_count,
            "application_count": role.application_count,
            "primary_owner_name": role.primary_owner_name,
            "backup_owner_name": role.backup_owner_name,
            "current_version": role.current_version,
            "published_at": (role.published_at.isoformat() + "Z") if role.published_at else None,
            "published_by": role.published_by,
            "entitlements": [
                {
                    "id": e.id,
                    "entitlement_name": e.entitlement_name,
                    "application_name": e.application_name,
                    "risk": e.risk,
                    "is_core": e.is_core
                } for e in entitlements
            ],
            "members": [
                {
                    "id": m.id,
                    "employee_id": m.employee_id,
                    "employee_name": m.employee_name,
                    "department": m.department
                } for m in members
            ]
        }

    # ── RC-005: Version History ─────────────────────────────────────────────

    @staticmethod
    def get_version_history(db: Session, role_id: int) -> List[Dict]:
        """Returns all recorded versions for a role, newest first."""
        role = db.query(CandidateRole).filter(CandidateRole.id == role_id).first()
        if not role:
            raise ValueError(f"Candidate role {role_id} not found")

        versions = db.query(RoleVersionHistory).filter(
            RoleVersionHistory.candidate_role_id == role_id
        ).order_by(RoleVersionHistory.version_number.desc()).all()

        return [
            {
                "id": v.id,
                "version_number": v.version_number,
                "change_summary": v.change_summary,
                "role_name": v.role_name,
                "role_description": v.role_description,
                "role_type": v.role_type,
                "classification": v.classification,
                "risk_level": v.risk_level,
                "status": v.status,
                "entitlement_count": v.entitlement_count,
                "user_count": v.user_count,
                "application_count": v.application_count,
                "primary_owner_name": v.primary_owner_name,
                "changed_by": v.changed_by,
                "created_at": (v.created_at.isoformat() + "Z") if v.created_at else None
            }
            for v in versions
        ]
