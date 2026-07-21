from collections import defaultdict
from datetime import datetime
from fastapi import HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import or_, and_

from app.models.candidate_role import CandidateRole
from app.models.candidate_role_member import CandidateRoleMember
from app.models.candidate_role_entitlement import CandidateRoleEntitlement
from app.models.role_merge_history import RoleMergeHistory
from app.models.role_merge_source_roles import RoleMergeSourceRole
from app.models.application_account import ApplicationAccount
from app.models.application_account_entitlement import ApplicationAccountEntitlement
from app.models.application_entitlement import ApplicationEntitlement
from app.models.application import Application
from app.models.campaign_account_result import CampaignAccountResult
from app.models.audit_log import AuditLog
from app.models.dashboard import RecentActivity


class MergeRoleService:
    @staticmethod
    def preview_merge(db: Session, role_ids: list[int]) -> dict:
        """
        Generates a detailed preview of what a merge of the specified role IDs would look like.
        """
        if len(role_ids) < 2:
            raise HTTPException(status_code=400, detail="At least two candidate roles must be selected to merge.")

        # Load roles
        roles = db.query(CandidateRole).filter(
            CandidateRole.id.in_(role_ids),
            CandidateRole.is_deleted == False
        ).all()

        if len(roles) != len(role_ids):
            raise HTTPException(status_code=400, detail="One or more selected candidate roles do not exist.")

        # Validation: Only Draft or Reviewed roles can be merged
        for r in roles:
            if r.status not in ["Draft", "Reviewed"]:
                raise HTTPException(status_code=400, detail=f"Role '{r.role_name}' cannot be merged because its status is '{r.status}'. Only Draft or Reviewed roles can be merged.")

        # Load members
        all_members = db.query(CandidateRoleMember).filter(CandidateRoleMember.candidate_role_id.in_(role_ids)).all()
        # Group to find duplicates
        member_counts = defaultdict(list)
        for m in all_members:
            key = (m.identity_id, m.employee_name or m.employee_id)
            member_counts[key].append(m.candidate_role_id)
        
        duplicate_members = [
            {"identity_id": k[0], "employee_name": k[1], "roles": list(set(r_ids))}
            for k, r_ids in member_counts.items() if len(set(r_ids)) > 1
        ]
        unique_members_list = [
            {"identity_id": k[0], "employee_name": k[1]}
            for k in member_counts.keys()
        ]

        # Load entitlements
        all_entitlements = db.query(CandidateRoleEntitlement).filter(CandidateRoleEntitlement.candidate_role_id.in_(role_ids)).all()
        ent_counts = defaultdict(list)
        for e in all_entitlements:
            key = (e.application_name, e.entitlement_name)
            ent_counts[key].append(e.candidate_role_id)

        duplicate_entitlements = [
            {"application_name": k[0], "entitlement_name": k[1], "roles": list(set(r_ids))}
            for k, r_ids in ent_counts.items() if len(set(r_ids)) > 1
        ]
        unique_entitlements_list = [
            {"application_name": k[0], "entitlement_name": k[1]}
            for k in ent_counts.keys()
        ]

        # Recalculate confidence score based on members held coverage
        identity_ids = list({k[0] for k in member_counts.keys()})
        total_unique_members = len(identity_ids)
        estimated_confidence = 0.0

        if total_unique_members > 0 and len(unique_entitlements_list) > 0:
            accounts = db.query(ApplicationAccount).filter(
                ApplicationAccount.identity_id.in_(identity_ids),
                ApplicationAccount.is_deleted == False
            ).all()
            account_ids = [acc.id for acc in accounts]
            acc_to_identity = {acc.id: acc.identity_id for acc in accounts}

            held_links = db.query(
                ApplicationAccountEntitlement.account_id,
                ApplicationEntitlement.entitlement_name,
                Application.application_name
            ).join(
                ApplicationEntitlement, ApplicationAccountEntitlement.entitlement_id == ApplicationEntitlement.id
            ).join(
                Application, ApplicationEntitlement.application_id == Application.id
            ).filter(
                ApplicationAccountEntitlement.account_id.in_(account_ids)
            ).all()

            identity_held = defaultdict(set)
            for acc_id, ent_name, app_name in held_links:
                ident_id = acc_to_identity.get(acc_id)
                if ident_id:
                    identity_held[ident_id].add((app_name, ent_name))

            coverage_pcts = []
            for ent_item in unique_entitlements_list:
                app_name = ent_item["application_name"]
                ent_name = ent_item["entitlement_name"]
                holders = sum(1 for ident_id in identity_ids if (app_name, ent_name) in identity_held[ident_id])
                coverage_pcts.append((holders / total_unique_members) * 100.0)

            estimated_confidence = round(sum(coverage_pcts) / len(coverage_pcts), 1) if coverage_pcts else 0.0

        unique_apps = list({e.application_name for e in all_entitlements if e.application_name})

        # Calculate potential SoD violations
        from app.services.classification_service import ClassificationService
        sod_violations = ClassificationService.validate_sod_policies([e["entitlement_name"] for e in unique_entitlements_list])

        return {
            "source_roles": [{"id": r.id, "role_name": r.role_name, "status": r.status} for r in roles],
            "combined_user_count": total_unique_members,
            "combined_entitlement_count": len(unique_entitlements_list),
            "combined_application_count": len(unique_apps),
            "duplicate_user_count": len(duplicate_members),
            "duplicate_entitlement_count": len(duplicate_entitlements),
            "duplicate_members": duplicate_members,
            "duplicate_entitlements": duplicate_entitlements,
            "sod_violations": sod_violations,
            "sod_violation_count": len(sod_violations),
            "estimated_confidence_score": estimated_confidence
        }

    @staticmethod
    def execute_merge(db: Session, role_ids: list[int], destination_name: str, description: str, merge_reason: str, user: str) -> dict:
        """
        Executes the merge of multiple candidate roles into a single destination role.
        """
        # Run preview first to gather validations and dynamic values
        preview = MergeRoleService.preview_merge(db, role_ids)

        # Create destination candidate role
        roles = db.query(CandidateRole).filter(CandidateRole.id.in_(role_ids)).all()
        
        # Determine department/business unit if matching, or default to general
        depts = list({r.department for r in roles if r.department})
        bus = list({r.business_unit for r in roles if r.business_unit})
        dept = depts[0] if len(depts) == 1 else "Cross-Department"
        bu = bus[0] if len(bus) == 1 else "Corporate"
        
        # Max risk level of source roles
        risks = {"High": 3, "Medium": 2, "Low": 1}
        max_risk_val = max(risks.get(r.risk_level, 1) for r in roles)
        dest_risk = [k for k, v in risks.items() if v == max_risk_val][0]

        dest_role = CandidateRole(
            role_name=destination_name,
            role_description=description,
            role_type="Composite" if len(set(r.role_type for r in roles)) > 1 else roles[0].role_type,
            risk_level=dest_risk,
            status="Draft",
            confidence_score=preview["estimated_confidence_score"],
            user_count=preview["combined_user_count"],
            entitlement_count=preview["combined_entitlement_count"],
            application_count=preview["combined_application_count"],
            department=dept,
            business_unit=bu,
            source="Merged",
            generated_by=user,
            sod_violation_count=preview["sod_violation_count"],
            created_by=user,
            modified_by=user
        )
        db.add(dest_role)
        db.commit()
        db.refresh(dest_role)

        # Copy members
        unique_identity_ids = set()
        all_members = db.query(CandidateRoleMember).filter(CandidateRoleMember.candidate_role_id.in_(role_ids)).all()
        for m in all_members:
            if m.identity_id not in unique_identity_ids:
                unique_identity_ids.add(m.identity_id)
                db.add(CandidateRoleMember(
                    candidate_role_id=dest_role.id,
                    identity_id=m.identity_id,
                    employee_id=m.employee_id,
                    employee_name=m.employee_name,
                    department=m.department
                ))

        # Copy entitlements
        unique_ents = set()
        all_ents = db.query(CandidateRoleEntitlement).filter(CandidateRoleEntitlement.candidate_role_id.in_(role_ids)).all()
        for e in all_ents:
            key = (e.application_name, e.entitlement_name)
            if key not in unique_ents:
                unique_ents.add(key)
                db.add(CandidateRoleEntitlement(
                    candidate_role_id=dest_role.id,
                    entitlement_id=e.entitlement_id,
                    application_name=e.application_name,
                    entitlement_name=e.entitlement_name,
                    risk=e.risk,
                    member_coverage_pct=e.member_coverage_pct,
                    is_core=e.is_core
                ))

        # Also copy campaign account results mapping for role discovery compatibility
        unique_account_ids = set()
        all_results = db.query(CampaignAccountResult).filter(CampaignAccountResult.candidate_role_id.in_(role_ids)).all()
        for r in all_results:
            if r.account_id not in unique_account_ids:
                unique_account_ids.add(r.account_id)
                db.add(CampaignAccountResult(
                    campaign_id=r.campaign_id,
                    account_id=r.account_id,
                    identity_id=r.identity_id,
                    job_function=r.job_function,
                    candidate_role_id=dest_role.id,
                    similarity_score=r.similarity_score
                ))

        # Mark source roles Merged
        for r in roles:
            r.status = "Merged"
            r.modified_by = user
            r.updated_at = datetime.utcnow()

        # Create history logs
        history = RoleMergeHistory(
            parent_role_id=dest_role.id,
            merged_by=user,
            merge_reason=merge_reason
        )
        db.add(history)
        db.commit()
        db.refresh(history)

        for r in roles:
            db.add(RoleMergeSourceRole(
                merge_history_id=history.id,
                source_role_id=r.id,
                source_role_name=r.role_name
            ))

        # Add Audit log
        db.add(AuditLog(
            module="Role Engineering",
            action="Role Merge Completed",
            performed_by=user,
            old_value=None,
            new_value=f"Merged source roles {role_ids} into destination role '{destination_name}'."
        ))

        # Add Recent Activity
        db.add(RecentActivity(
            user=user,
            action=f"Merged candidate roles into '{destination_name}'",
            status="info",
            created_at=datetime.utcnow()
        ))

        db.commit()
        return {"destination_role_id": dest_role.id, "merge_history_id": history.id}

    @staticmethod
    def undo_merge(db: Session, history_id: int, user: str) -> dict:
        """
        Reverses a merge operation, restoring source roles and soft-deleting the destination role.
        """
        history = db.query(RoleMergeHistory).filter(RoleMergeHistory.id == history_id).first()
        if not history:
            raise HTTPException(status_code=404, detail="Merge history record not found.")

        # Find destination/parent role
        dest_role = db.query(CandidateRole).filter(CandidateRole.id == history.parent_role_id).first()
        if dest_role:
            dest_role.is_deleted = True
            dest_role.modified_by = user
            dest_role.updated_at = datetime.utcnow()

            # Soft-deleting the role alone left its member/entitlement rows
            # behind as orphaned data — is_deleted=True hides the role from
            # normal list queries, but anything counting CandidateRoleMember/
            # CandidateRoleEntitlement directly (without joining back to
            # CandidateRole and filtering is_deleted) would still pick these
            # up, e.g. an Analytics coverage calculation. These rows have no
            # audit-trail value once the role itself is undone, so delete
            # them outright rather than leaving them attached to a dead role.
            db.query(CandidateRoleMember).filter(
                CandidateRoleMember.candidate_role_id == dest_role.id
            ).delete(synchronize_session=False)
            db.query(CandidateRoleEntitlement).filter(
                CandidateRoleEntitlement.candidate_role_id == dest_role.id
            ).delete(synchronize_session=False)

        # Find source roles
        sources = db.query(RoleMergeSourceRole).filter(RoleMergeSourceRole.merge_history_id == history_id).all()
        source_ids = [s.source_role_id for s in sources]
        
        roles = db.query(CandidateRole).filter(CandidateRole.id.in_(source_ids)).all()
        for r in roles:
            r.status = "Draft"  # Restore to Draft status
            r.modified_by = user
            r.updated_at = datetime.utcnow()

        # Delete history mapping (ondelete cascade handles junction rows)
        db.delete(history)

        # Log Audits
        db.add(AuditLog(
            module="Role Engineering",
            action="Role Merge Undone",
            performed_by=user,
            old_value=f"Merged role {history.parent_role_id}",
            new_value="Restored source candidate roles back to Draft."
        ))

        db.add(RecentActivity(
            user=user,
            action=f"Undid candidate role merge {history.parent_role_id}",
            status="info",
            created_at=datetime.utcnow()
        ))

        db.commit()
        return {"status": "success", "restored_role_ids": source_ids}
