from collections import defaultdict
from datetime import datetime
from fastapi import HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import or_, and_

from app.models.candidate_role import CandidateRole
from app.models.candidate_role_member import CandidateRoleMember
from app.models.candidate_role_entitlement import CandidateRoleEntitlement
from app.models.role_split_history import RoleSplitHistory
from app.models.role_split_destination_roles import RoleSplitDestinationRole
from app.models.application_account import ApplicationAccount
from app.models.application_account_entitlement import ApplicationAccountEntitlement
from app.models.application_entitlement import ApplicationEntitlement
from app.models.application import Application
from app.models.identity import Identity
from app.models.campaign_account_result import CampaignAccountResult
from app.models.audit_log import AuditLog
from app.models.dashboard import RecentActivity


class SplitRoleService:
    @staticmethod
    def preview_split(db: Session, role_id: int, split_method: str) -> dict:
        """
        Generates a preview of the candidate role split based on the chosen grouping method.
        """
        role = db.query(CandidateRole).filter(
            CandidateRole.id == role_id,
            CandidateRole.is_deleted == False
        ).first()

        if not role:
            raise HTTPException(status_code=404, detail="Candidate role not found.")

        # Validation: Only Draft or Reviewed roles can be split
        if role.status not in ["Draft", "Reviewed"]:
            raise HTTPException(status_code=400, detail=f"Role '{role.role_name}' cannot be split because its status is '{role.status}'. Only Draft or Reviewed roles can be split.")

        # Load members and entitlements
        members = db.query(CandidateRoleMember).filter(CandidateRoleMember.candidate_role_id == role_id).all()
        entitlements = db.query(CandidateRoleEntitlement).filter(CandidateRoleEntitlement.candidate_role_id == role_id).all()

        # Prevent splitting roles with zero users or zero entitlements
        if len(members) == 0:
            raise HTTPException(status_code=400, detail="Cannot split a role with zero users.")
        if len(entitlements) == 0:
            raise HTTPException(status_code=400, detail="Cannot split a role with zero entitlements.")

        identity_ids = [m.identity_id for m in members]

        # Fetch accounts & entitlements link map to support auto grouping
        accounts = db.query(ApplicationAccount).filter(
            ApplicationAccount.identity_id.in_(identity_ids),
            ApplicationAccount.is_deleted == False
        ).all()
        acc_ids = [acc.id for acc in accounts]
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
            ApplicationAccountEntitlement.account_id.in_(acc_ids)
        ).all()

        identity_held = defaultdict(set)
        for acc_id, ent_name, app_name in held_links:
            ident_id = acc_to_identity.get(acc_id)
            if ident_id:
                identity_held[ident_id].add((app_name, ent_name))

        # Core split options
        splits = []

        if split_method == "application":
            # Group entitlements by application_name
            app_groups = defaultdict(list)
            for e in entitlements:
                app_groups[e.application_name or "System Default"].append(e)

            for app_name, ents in app_groups.items():
                split_members = []
                for m in members:
                    # Check if user holds any entitlement in this application group
                    holds_any = any((app_name, e.entitlement_name) in identity_held[m.identity_id] for e in ents)
                    if holds_any:
                        split_members.append(m)
                
                if not split_members:
                    # Fallback to copy all users if none hold them specifically
                    split_members = list(members)

                splits.append({
                    "role_name": f"{role.role_name} - {app_name}",
                    "role_description": f"Split role containing entitlements for {app_name}.",
                    "entitlements": [{"application_name": e.application_name, "entitlement_name": e.entitlement_name, "risk": e.risk} for e in ents],
                    "members": [{"identity_id": m.identity_id, "employee_name": m.employee_name} for m in split_members]
                })

        elif split_method == "department":
            # Group members by department
            dept_groups = defaultdict(list)
            for m in members:
                dept_groups[m.department or "General"].append(m)

            for dept_name, m_list in dept_groups.items():
                # Filter entitlements held by at least one member in this department
                split_ents = []
                m_ident_ids = {m.identity_id for m in m_list}
                for e in entitlements:
                    has_holder = any((e.application_name, e.entitlement_name) in identity_held[ident_id] for ident_id in m_ident_ids)
                    if has_holder:
                        split_ents.append(e)
                
                if not split_ents:
                    split_ents = list(entitlements)

                splits.append({
                    "role_name": f"{role.role_name} - {dept_name}",
                    "role_description": f"Split role for {dept_name} department.",
                    "entitlements": [{"application_name": e.application_name, "entitlement_name": e.entitlement_name, "risk": e.risk} for e in split_ents],
                    "members": [{"identity_id": m.identity_id, "employee_name": m.employee_name} for m in m_list]
                })

        elif split_method == "business_unit":
            # Group members by business unit (from Identity database)
            identities = db.query(Identity).filter(Identity.id.in_(identity_ids)).all()
            identity_bu = {ident.id: ident.business_unit for ident in identities}
            
            bu_groups = defaultdict(list)
            for m in members:
                bu = identity_bu.get(m.identity_id) or role.business_unit or "Corporate"
                bu_groups[bu].append(m)

            for bu_name, m_list in bu_groups.items():
                split_ents = []
                m_ident_ids = {m.identity_id for m in m_list}
                for e in entitlements:
                    has_holder = any((e.application_name, e.entitlement_name) in identity_held[ident_id] for ident_id in m_ident_ids)
                    if has_holder:
                        split_ents.append(e)
                
                if not split_ents:
                    split_ents = list(entitlements)

                splits.append({
                    "role_name": f"{role.role_name} - {bu_name}",
                    "role_description": f"Split role for business unit {bu_name}.",
                    "entitlements": [{"application_name": e.application_name, "entitlement_name": e.entitlement_name, "risk": e.risk} for e in split_ents],
                    "members": [{"identity_id": m.identity_id, "employee_name": m.employee_name} for m in m_list]
                })

        elif split_method == "entitlement_group":
            # Group entitlements by their risk level
            risk_groups = defaultdict(list)
            for e in entitlements:
                risk_groups[e.risk or "Low"].append(e)

            for risk_level, ents in risk_groups.items():
                split_members = []
                for m in members:
                    holds_any = any((e.application_name, e.entitlement_name) in identity_held[m.identity_id] for e in ents)
                    if holds_any:
                        split_members.append(m)
                
                if not split_members:
                    split_members = list(members)

                splits.append({
                    "role_name": f"{role.role_name} - {risk_level} Risk",
                    "role_description": f"Split role holding {risk_level} risk entitlements.",
                    "entitlements": [{"application_name": e.application_name, "entitlement_name": e.entitlement_name, "risk": e.risk} for e in ents],
                    "members": [{"identity_id": m.identity_id, "employee_name": m.employee_name} for m in split_members]
                })

        else: # Default/Manual fallback (Split in two halves)
            half = len(entitlements) // 2
            if half == 0:
                half = 1
            e1 = entitlements[:half]
            e2 = entitlements[half:]

            splits = [
                {
                    "role_name": f"{role.role_name} - Part A",
                    "role_description": "First half of the split role.",
                    "entitlements": [{"application_name": e.application_name, "entitlement_name": e.entitlement_name, "risk": e.risk} for e in e1],
                    "members": [{"identity_id": m.identity_id, "employee_name": m.employee_name} for m in members]
                },
                {
                    "role_name": f"{role.role_name} - Part B",
                    "role_description": "Second half of the split role.",
                    "entitlements": [{"application_name": e.application_name, "entitlement_name": e.entitlement_name, "risk": e.risk} for e in e2],
                    "members": [{"identity_id": m.identity_id, "employee_name": m.employee_name} for m in members]
                }
            ]

        # Recalculate dynamic statistics and confidence scores for each preview split
        for s in splits:
            s_member_ids = [m["identity_id"] for m in s["members"]]
            s_ents_list = [(e["application_name"], e["entitlement_name"]) for e in s["entitlements"]]
            s_total_members = len(s_member_ids)
            
            s["user_count"] = s_total_members
            s["entitlement_count"] = len(s_ents_list)
            s["application_count"] = len(set(e["application_name"] for e in s["entitlements"]))
            
            # Confidence score calculation
            if s_total_members > 0 and len(s_ents_list) > 0:
                coverage_pcts = []
                for app_name, ent_name in s_ents_list:
                    holders = sum(1 for ident_id in s_member_ids if (app_name, ent_name) in identity_held[ident_id])
                    coverage_pcts.append((holders / s_total_members) * 100.0)
                s["estimated_confidence_score"] = round(sum(coverage_pcts) / len(coverage_pcts), 1) if coverage_pcts else 0.0
            else:
                s["estimated_confidence_score"] = 0.0

            # SoD violation calculation
            from app.services.classification_service import ClassificationService
            sod_violations = ClassificationService.validate_sod_policies([e[1] for e in s_ents_list])
            s["sod_violations"] = sod_violations
            s["sod_violation_count"] = len(sod_violations)

        return {
            "original_role": {"id": role.id, "role_name": role.role_name, "status": role.status},
            "split_method": split_method,
            "splits": splits
        }

    @staticmethod
    def execute_split(db: Session, role_id: int, split_method: str, splits_payload: list[dict], split_reason: str, user: str) -> dict:
        """
        Executes the candidate role splitting into multiple destination roles.
        """
        role = db.query(CandidateRole).filter(
            CandidateRole.id == role_id,
            CandidateRole.is_deleted == False
        ).first()

        if not role:
            raise HTTPException(status_code=404, detail="Candidate role not found.")

        # Ensure splits_payload has at least 2 roles
        if len(splits_payload) < 2:
            raise HTTPException(status_code=400, detail="A role must be split into at least two target roles.")

        # Fetch original items for verification
        all_original_members = db.query(CandidateRoleMember).filter(CandidateRoleMember.candidate_role_id == role_id).all()
        member_by_id = {m.identity_id: m for m in all_original_members}

        all_original_ents = db.query(CandidateRoleEntitlement).filter(CandidateRoleEntitlement.candidate_role_id == role_id).all()
        ent_by_key = {(e.application_name, e.entitlement_name): e for e in all_original_ents}

        # Create split history header
        history = RoleSplitHistory(
            original_role_id=role_id,
            split_by=user,
            split_reason=split_reason
        )
        db.add(history)
        db.commit()
        db.refresh(history)

        created_role_ids = []

        for s in splits_payload:
            # Recalculate stats on splits data
            s_member_ids = [m["identity_id"] for m in s["members"]]
            s_ents_list = [(e["application_name"], e["entitlement_name"]) for e in s["entitlements"]]
            s_total_members = len(s_member_ids)

            # Confidence score calculation
            estimated_confidence = 0.0
            if s_total_members > 0 and len(s_ents_list) > 0:
                accounts = db.query(ApplicationAccount).filter(
                    ApplicationAccount.identity_id.in_(s_member_ids),
                    ApplicationAccount.is_deleted == False
                ).all()
                acc_ids = [acc.id for acc in accounts]
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
                    ApplicationAccountEntitlement.account_id.in_(acc_ids)
                ).all()

                identity_held = defaultdict(set)
                for acc_id, ent_name, app_name in held_links:
                    ident_id = acc_to_identity.get(acc_id)
                    if ident_id:
                        identity_held[ident_id].add((app_name, ent_name))

                coverage_pcts = []
                for app_name, ent_name in s_ents_list:
                    holders = sum(1 for ident_id in s_member_ids if (app_name, ent_name) in identity_held[ident_id])
                    coverage_pcts.append((holders / s_total_members) * 100.0)
                estimated_confidence = round(sum(coverage_pcts) / len(coverage_pcts), 1) if coverage_pcts else 0.0

            # Calculate potential SoD violations
            from app.services.classification_service import ClassificationService
            sod_violations = ClassificationService.validate_sod_policies([e[1] for e in s_ents_list])

            # Create destination candidate role
            dest_role = CandidateRole(
                role_name=s["role_name"],
                role_description=s.get("role_description", f"Split from {role.role_name}"),
                role_type=role.role_type,
                risk_level=role.risk_level,
                status="Draft",
                confidence_score=estimated_confidence,
                user_count=s_total_members,
                entitlement_count=len(s_ents_list),
                application_count=len(set(e["application_name"] for e in s["entitlements"])),
                department=role.department,
                business_unit=role.business_unit,
                source="Split",
                generated_by=user,
                sod_violation_count=len(sod_violations),
                created_by=user,
                modified_by=user
            )
            db.add(dest_role)
            db.commit()
            db.refresh(dest_role)
            created_role_ids.append(dest_role.id)

            # Write members
            for m in s["members"]:
                orig_m = member_by_id.get(m["identity_id"])
                if orig_m:
                    db.add(CandidateRoleMember(
                        candidate_role_id=dest_role.id,
                        identity_id=m["identity_id"],
                        employee_id=orig_m.employee_id,
                        employee_name=orig_m.employee_name,
                        department=orig_m.department
                    ))

            # Write entitlements
            for e in s["entitlements"]:
                orig_e = ent_by_key.get((e["application_name"], e["entitlement_name"]))
                if orig_e:
                    db.add(CandidateRoleEntitlement(
                        candidate_role_id=dest_role.id,
                        entitlement_id=orig_e.entitlement_id,
                        application_name=e["application_name"],
                        entitlement_name=e["entitlement_name"],
                        risk=orig_e.risk,
                        member_coverage_pct=orig_e.member_coverage_pct,
                        is_core=orig_e.is_core
                    ))

            # Write junction split mapping
            db.add(RoleSplitDestinationRole(
                split_history_id=history.id,
                destination_role_id=dest_role.id
            ))

        # Mark original role as Split
        role.status = "Split"
        role.modified_by = user
        role.updated_at = datetime.utcnow()

        # Add Audit log
        db.add(AuditLog(
            module="Role Engineering",
            action="Role Split Completed",
            performed_by=user,
            old_value=f"Original role {role.role_name}",
            new_value=f"Split role into new roles {created_role_ids}."
        ))

        # Add Recent Activity
        db.add(RecentActivity(
            user=user,
            action=f"Split candidate role '{role.role_name}'",
            status="info",
            created_at=datetime.utcnow()
        ))

        db.commit()
        return {"original_role_id": role_id, "split_history_id": history.id, "created_role_ids": created_role_ids}

    @staticmethod
    def undo_split(db: Session, history_id: int, user: str) -> dict:
        """
        Reverses a split operation, restoring the original candidate role and deleting all generated sub-roles.
        """
        history = db.query(RoleSplitHistory).filter(RoleSplitHistory.id == history_id).first()
        if not history:
            raise HTTPException(status_code=404, detail="Split history record not found.")

        # Find original/source role
        orig_role = db.query(CandidateRole).filter(CandidateRole.id == history.original_role_id).first()
        if orig_role:
            orig_role.status = "Draft"
            orig_role.modified_by = user
            orig_role.updated_at = datetime.utcnow()

        # Find destination split roles
        dests = db.query(RoleSplitDestinationRole).filter(RoleSplitDestinationRole.split_history_id == history_id).all()
        dest_ids = [d.destination_role_id for d in dests]

        # Soft delete split destination roles
        roles = db.query(CandidateRole).filter(CandidateRole.id.in_(dest_ids)).all()
        for r in roles:
            r.is_deleted = True
            r.modified_by = user
            r.updated_at = datetime.utcnow()

        # Same reasoning as undo_merge: soft-deleting the destination roles
        # alone left their member/entitlement rows orphaned — is_deleted
        # hides them from list queries but not from anything counting
        # CandidateRoleMember/CandidateRoleEntitlement directly. Clean these
        # up since they have no audit-trail value once the split is undone.
        if dest_ids:
            db.query(CandidateRoleMember).filter(
                CandidateRoleMember.candidate_role_id.in_(dest_ids)
            ).delete(synchronize_session=False)
            db.query(CandidateRoleEntitlement).filter(
                CandidateRoleEntitlement.candidate_role_id.in_(dest_ids)
            ).delete(synchronize_session=False)

        # Delete history mapping (cascade handles junction)
        db.delete(history)

        # Log Audits
        db.add(AuditLog(
            module="Role Engineering",
            action="Role Split Undone",
            performed_by=user,
            old_value=f"Split roles {dest_ids}",
            new_value="Restored original candidate role back to Draft."
        ))

        db.add(RecentActivity(
            user=user,
            action=f"Undid candidate role split for {history.original_role_id}",
            status="info",
            created_at=datetime.utcnow()
        ))

        db.commit()
        return {"status": "success", "restored_role_id": history.original_role_id}
