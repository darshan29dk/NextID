from sqlalchemy.orm import Session
from sqlalchemy import or_, desc, asc, func
from datetime import datetime
import json

from app.models.candidate_role import CandidateRole
from app.models.candidate_role_entitlement import CandidateRoleEntitlement
from app.models.candidate_role_member import CandidateRoleMember
from app.models.audit_log import AuditLog
from app.models.dashboard import RecentActivity


class CandidateRoleService:
    @staticmethod
    def get_stats(db: Session) -> dict:
        """
        KPI counts + filter-dropdown option lists for the Role Engineering
        workbench, computed with DB-side aggregation (COUNT/DISTINCT) instead
        of pulling up to 1000 full CandidateRole rows and counting in Python.
        """
        base = db.query(CandidateRole).filter(CandidateRole.is_deleted == False)

        total = base.count()

        classification_counts = dict(
            base.with_entities(CandidateRole.classification, func.count(CandidateRole.id))
            .group_by(CandidateRole.classification).all()
        )
        status_counts = dict(
            base.with_entities(CandidateRole.status, func.count(CandidateRole.id))
            .group_by(CandidateRole.status).all()
        )

        departments = [
            d for (d,) in base.with_entities(CandidateRole.department).distinct().all() if d
        ]
        business_units = [
            b for (b,) in base.with_entities(CandidateRole.business_unit).distinct().all() if b
        ]

        return {
            "total": total,
            "birthright": classification_counts.get("Birthright", 0),
            "requestable": classification_counts.get("Requestable", 0),
            "business": classification_counts.get("Business", 0),
            "technical": classification_counts.get("Technical", 0),
            "draft": status_counts.get("Draft", 0),
            "departments": sorted(departments),
            "business_units": sorted(business_units)
        }

    @staticmethod
    def get_candidate_roles(
        db: Session,
        page: int = 1,
        limit: int = 10,
        search: str = None,
        sort_by: str = None,
        sort_order: str = "desc",
        classification: str = None,
        status: str = None,
        risk_level: str = None,
        department: str = None,
        business_unit: str = None,
        role_type: str = None
    ) -> dict:
        """
        Retrieves candidate roles with search, sorting, filtering, and pagination.
        """
        if page < 1:
            page = 1
        if limit < 1:
            limit = 10

        query = db.query(CandidateRole).filter(CandidateRole.is_deleted == False)

        # Filters
        if classification:
            query = query.filter(CandidateRole.classification == classification)
        if status:
            query = query.filter(CandidateRole.status == status)
        if risk_level:
            query = query.filter(CandidateRole.risk_level == risk_level)
        if department:
            query = query.filter(CandidateRole.department == department)
        if business_unit:
            query = query.filter(CandidateRole.business_unit == business_unit)
        if role_type:
            query = query.filter(CandidateRole.role_type == role_type)

        # Global Search
        if search:
            search_like = f"%{search}%"
            # Join with entitlements to support searching by application/entitlement name
            query = query.outerjoin(
                CandidateRoleEntitlement,
                CandidateRole.id == CandidateRoleEntitlement.candidate_role_id
            ).filter(
                or_(
                    CandidateRole.role_name.like(search_like),
                    CandidateRole.department.like(search_like),
                    CandidateRole.business_unit.like(search_like),
                    CandidateRoleEntitlement.application_name.like(search_like),
                    CandidateRoleEntitlement.entitlement_name.like(search_like)
                )
            ).distinct()

        # Sorting
        if sort_by:
            col = getattr(CandidateRole, sort_by, None)
            if col:
                if sort_order == "desc":
                    query = query.order_by(col.desc())
                else:
                    query = query.order_by(col.asc())
        else:
            query = query.order_by(CandidateRole.created_at.desc())

        total = query.count()
        total_pages = (total + limit - 1) // limit if total > 0 else 0
        roles = query.offset((page - 1) * limit).limit(limit).all()

        return {
            "total": total,
            "page": page,
            "limit": limit,
            "total_pages": total_pages,
            "roles": roles
        }

    @staticmethod
    def get_candidate_role_by_id(db: Session, role_id: int) -> dict:
        """
        Fetches full candidate role details including members and entitlements.
        """
        role = db.query(CandidateRole).filter(CandidateRole.id == role_id, CandidateRole.is_deleted == False).first()
        if not role:
            return None

        entitlements = db.query(CandidateRoleEntitlement).filter(
            CandidateRoleEntitlement.candidate_role_id == role_id
        ).all()

        members = db.query(CandidateRoleMember).filter(
            CandidateRoleMember.candidate_role_id == role_id
        ).all()

        # Gather distinct applications from core entitlements
        applications = list({ent.application_name for ent in entitlements if ent.application_name})

        # Calculate SoD violations dynamically
        from app.services.classification_service import ClassificationService
        ent_names = [e.entitlement_name for e in entitlements]
        sod_violations = ClassificationService.validate_sod_policies(ent_names)
        
        # Sync with database column if count differs
        if role.sod_violation_count != len(sod_violations):
            role.sod_violation_count = len(sod_violations)
            db.commit()
            db.refresh(role)

        # Load campaign account results to support role discovery view compatibility
        from app.models.campaign_account_result import CampaignAccountResult
        from app.models.application_account import ApplicationAccount
        from app.models.application import Application
        camp_members = db.query(CampaignAccountResult, ApplicationAccount, Application).join(
            ApplicationAccount, CampaignAccountResult.account_id == ApplicationAccount.id
        ).join(
            Application, ApplicationAccount.application_id == Application.id
        ).filter(CampaignAccountResult.candidate_role_id == role_id).all()

        # Load audit logs for this role
        audit_logs = db.query(AuditLog).filter(
            or_(
                AuditLog.old_value.like(f'%"id": {role_id}%'),
                AuditLog.new_value.like(f'%"id": {role_id}%'),
                AuditLog.old_value.like(f'%"role_name": "{role.role_name}"%'),
                AuditLog.new_value.like(f'%"role_name": "{role.role_name}"%')
            )
        ).order_by(AuditLog.timestamp.desc()).all()

        return {
            "id": role.id,
            "role_name": role.role_name,
            "role_description": role.role_description,
            "role_type": role.role_type,
            "risk_level": role.risk_level,
            "classification": role.classification,
            "status": role.status,
            "confidence_score": role.confidence_score,
            "campaign_id": role.campaign_id,
            "job_function": role.job_function,
            "member_count": role.member_count,
            "user_count": role.user_count,
            "entitlement_count": role.entitlement_count,
            "application_count": role.application_count,
            "department": role.department,
            "business_unit": role.business_unit,
            "source": role.source,
            "generated_by": role.generated_by,
            "generated_on": role.generated_on.isoformat() if role.generated_on else None,
            "sod_violation_count": role.sod_violation_count,
            "created_at": role.created_at.isoformat() if role.created_at else None,
            "primary_owner_id": role.primary_owner_id,
            "primary_owner_name": role.primary_owner_name,
            "primary_owner_email": role.primary_owner_email,
            "backup_owner_id": role.backup_owner_id,
            "backup_owner_name": role.backup_owner_name,
            "backup_owner_email": role.backup_owner_email,
            "entitlements": [
                {
                    "id": e.id,
                    "entitlement_name": e.entitlement_name,
                    "application_name": e.application_name,
                    "risk": e.risk,
                    "member_coverage_pct": e.member_coverage_pct,
                    "is_core": e.is_core
                } for e in entitlements
            ],
            "members": [
                {
                    "id": m.id,
                    "identity_id": m.identity_id,
                    "employee_id": m.employee_id,
                    "employee_name": m.employee_name,
                    "department": m.department
                } for m in members
            ],
            "legacy_members": [
                {
                    "account_id": acc.id,
                    "account_name": acc.account_name,
                    "application_name": app.application_name,
                    "similarity_score": res.similarity_score
                } for res, acc, app in camp_members
            ],
            "applications": applications,
            "sod_violations": sod_violations,
            "audit_timeline": [
                {
                    "id": a.id,
                    "action": a.action,
                    "performed_by": a.performed_by,
                    "timestamp": a.timestamp.isoformat() if a.timestamp else None,
                    "old_value": a.old_value,
                    "new_value": a.new_value
                } for a in audit_logs
            ]
        }

    @staticmethod
    def create_candidate_role(db: Session, payload: dict, user: str) -> CandidateRole:
        """
        Creates a custom candidate role and logs audits.
        """
        role = CandidateRole(
            role_name=payload.get("role_name"),
            role_description=payload.get("role_description"),
            role_type=payload.get("role_type", "Business"),
            risk_level=payload.get("risk_level", "Low"),
            classification=payload.get("classification"),
            status=payload.get("status", "Draft"),
            department=payload.get("department"),
            business_unit=payload.get("business_unit"),
            source="Manual",
            generated_by=user,
            generated_on=datetime.utcnow(),
            created_by=user,
            modified_by=user,
            is_deleted=False
        )
        db.add(role)
        db.commit()
        db.refresh(role)

        # Write Audit Log
        audit = AuditLog(
            module="Role Engineering",
            action="Candidate Role Created",
            performed_by=user,
            new_value=json.dumps({
                "id": role.id,
                "role_name": role.role_name,
                "role_type": role.role_type,
                "status": role.status
            }, default=str),
            timestamp=datetime.utcnow()
        )
        db.add(audit)

        # Write Recent Activity
        activity = RecentActivity(
            user=user,
            action=f"Created custom candidate role '{role.role_name}'",
            status="info",
            created_at=datetime.utcnow()
        )
        db.add(activity)
        db.commit()

        return role

    @staticmethod
    def update_candidate_role(db: Session, role_id: int, payload: dict, user: str) -> CandidateRole:
        """
        Updates an existing candidate role and logs audits.
        """
        role = db.query(CandidateRole).filter(CandidateRole.id == role_id, CandidateRole.is_deleted == False).first()
        if not role:
            return None

        old_state = {
            "role_name": role.role_name,
            "role_description": role.role_description,
            "role_type": role.role_type,
            "risk_level": role.risk_level,
            "status": role.status,
            "department": role.department,
            "business_unit": role.business_unit
        }

        # Apply updates
        role.role_name = payload.get("role_name", role.role_name)
        role.role_description = payload.get("role_description", role.role_description)
        role.role_type = payload.get("role_type", role.role_type)
        role.risk_level = payload.get("risk_level", role.risk_level)
        role.status = payload.get("status", role.status)
        role.department = payload.get("department", role.department)
        role.business_unit = payload.get("business_unit", role.business_unit)
        role.modified_by = user
        role.updated_at = datetime.utcnow()

        new_state = {
            "role_name": role.role_name,
            "role_description": role.role_description,
            "role_type": role.role_type,
            "risk_level": role.risk_level,
            "status": role.status,
            "department": role.department,
            "business_unit": role.business_unit
        }

        # Write Audit Log
        audit = AuditLog(
            module="Role Engineering",
            action="Candidate Role Updated",
            performed_by=user,
            old_value=json.dumps(old_state, default=str),
            new_value=json.dumps(new_state, default=str),
            timestamp=datetime.utcnow()
        )
        db.add(audit)

        # Write Recent Activity
        activity = RecentActivity(
            user=user,
            action=f"Updated candidate role '{role.role_name}'",
            status="info",
            created_at=datetime.utcnow()
        )
        db.add(activity)
        db.commit()
        db.refresh(role)

        return role

    @staticmethod
    def delete_candidate_role(db: Session, role_id: int, user: str) -> bool:
        """
        Soft deletes a candidate role.
        """
        role = db.query(CandidateRole).filter(CandidateRole.id == role_id, CandidateRole.is_deleted == False).first()
        if not role:
            return False

        role.is_deleted = True
        role.modified_by = user
        role.updated_at = datetime.utcnow()

        # Write Audit Log
        audit = AuditLog(
            module="Role Engineering",
            action="Candidate Role Deleted",
            performed_by=user,
            old_value=json.dumps({"id": role.id, "role_name": role.role_name}, default=str),
            timestamp=datetime.utcnow()
        )
        db.add(audit)

        # Write Recent Activity
        activity = RecentActivity(
            user=user,
            action=f"Deleted candidate role '{role.role_name}'",
            status="warning",
            created_at=datetime.utcnow()
        )
        db.add(activity)
        db.commit()

        return True
