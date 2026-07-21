from sqlalchemy.orm import Session
from datetime import datetime
from typing import List, Dict
import json

from app.models.candidate_role import CandidateRole
from app.models.candidate_role_entitlement import CandidateRoleEntitlement
from app.models.audit_log import AuditLog
from app.models.dashboard import RecentActivity


class ClassificationService:
    @staticmethod
    def validate_sod_policies(entitlements: List[str]) -> List[Dict[str, str]]:
        """
        Scans a candidate role's core entitlements for Segregation of Duties (SoD) conflicts.
        Checks for conflicting patterns (e.g. Write & Approve) in critical modules.
        """
        violations = []
        prefixes = ["billing", "payroll", "finance", "hr", "admin", "payment", "user", "order", "invoice", "purchase"]
        
        for i, ent1 in enumerate(entitlements):
            name1 = ent1.lower()
            for j, ent2 in enumerate(entitlements):
                if i >= j:
                    continue
                name2 = ent2.lower()
                
                # Check if they share a common system module context
                for prefix in prefixes:
                    if prefix in name1 and prefix in name2:
                        has_write = any(w in name1 for w in ["write", "create", "edit", "admin", "delete"])
                        has_approve = any(a in name2 for a in ["approve", "verify", "audit", "approver", "auditor"])
                        if has_write and has_approve:
                            violations.append({
                                "entitlement_1": ent1,
                                "entitlement_2": ent2,
                                "description": f"Conflict in {prefix.upper()} module: Segregation of Duties violation between '{ent1}' (Write/Admin) and '{ent2}' (Approve/Audit)."
                            })
                            break
                        
                        has_write2 = any(w in name2 for w in ["write", "create", "edit", "admin", "delete"])
                        has_approve2 = any(a in name1 for a in ["approve", "verify", "audit", "approver", "auditor"])
                        if has_write2 and has_approve2:
                            violations.append({
                                "entitlement_1": ent1,
                                "entitlement_2": ent2,
                                "description": f"Conflict in {prefix.upper()} module: Segregation of Duties violation between '{ent2}' (Write/Admin) and '{ent1}' (Approve/Audit)."
                            })
                            break
        return violations

    @staticmethod
    def update_role_classification(db: Session, role_id: int, classification: str, user: str) -> CandidateRole:
        role = db.query(CandidateRole).filter(CandidateRole.id == role_id, CandidateRole.is_deleted == False).first()
        if not role:
            raise ValueError("Candidate role not found")

        allowed_classifications = ["Birthright", "Request-Based"]
        if classification not in allowed_classifications:
            raise ValueError(f"Invalid classification. Must be one of {allowed_classifications}")

        old_classification = role.classification
        if old_classification == classification:
            return role

        role.classification = classification
        role.modified_by = user
        role.updated_at = datetime.utcnow()

        # Write Audit Log
        audit = AuditLog(
            module="Role Engineering",
            action="Classification Changed",
            performed_by=user,
            old_value=json.dumps({"id": role.id, "role_name": role.role_name, "classification": old_classification}, default=str),
            new_value=json.dumps({"id": role.id, "role_name": role.role_name, "classification": classification}, default=str),
            timestamp=datetime.utcnow()
        )
        db.add(audit)

        # Write Recent Activity
        activity = RecentActivity(
            user=user,
            action=f"Classified role '{role.role_name}' as '{classification}'",
            status="success",
            created_at=datetime.utcnow()
        )
        db.add(activity)
        db.commit()
        db.refresh(role)
        return role

    @staticmethod
    def bulk_classify_roles(db: Session, role_ids: List[int], classification: str, user: str) -> int:
        allowed_classifications = ["Birthright", "Request-Based"]
        if classification not in allowed_classifications:
            raise ValueError(f"Invalid classification. Must be one of {allowed_classifications}")

        roles = db.query(CandidateRole).filter(
            CandidateRole.id.in_(role_ids),
            CandidateRole.is_deleted == False
        ).all()

        count = 0
        for role in roles:
            old_classification = role.classification
            if old_classification != classification:
                role.classification = classification
                role.modified_by = user
                role.updated_at = datetime.utcnow()

                # Audit Log
                audit = AuditLog(
                    module="Role Engineering",
                    action="Classification Changed (Bulk)",
                    performed_by=user,
                    old_value=json.dumps({"id": role.id, "role_name": role.role_name, "classification": old_classification}, default=str),
                    new_value=json.dumps({"id": role.id, "role_name": role.role_name, "classification": classification}, default=str),
                    timestamp=datetime.utcnow()
                )
                db.add(audit)
                count += 1

        if count > 0:
            # Recent Activity for the batch
            activity = RecentActivity(
                user=user,
                action=f"Bulk classified {count} roles as '{classification}'",
                status="success",
                created_at=datetime.utcnow()
            )
            db.add(activity)
            db.commit()
        return count
