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

    # In-memory range configurations fallback
    _classification_ranges = {
        "birthright_min": 80.0,
        "birthright_max": 100.0,
        "request_based_min": 50.0,
        "request_based_max": 79.9,
        "unclassified_max": 49.9
    }

    @classmethod
    def get_classification_ranges(cls) -> dict:
        return cls._classification_ranges.copy()

    @classmethod
    def save_classification_ranges(cls, birthright_min: float, request_based_min: float) -> dict:
        cls._classification_ranges["birthright_min"] = float(birthright_min)
        cls._classification_ranges["birthright_max"] = 100.0
        cls._classification_ranges["request_based_min"] = float(request_based_min)
        cls._classification_ranges["request_based_max"] = round(float(birthright_min) - 0.1, 1)
        cls._classification_ranges["unclassified_max"] = round(float(request_based_min) - 0.1, 1)
        return cls._classification_ranges.copy()

    @classmethod
    def auto_classify_by_confidence(
        cls,
        db: Session,
        birthright_min: float = 80.0,
        request_based_min: float = 50.0,
        overwrite_existing: bool = True,
        user: str = "System"
    ) -> dict:
        """
        Evaluates candidate roles' confidence_score against configured ranges and updates classification.
        - confidence_score >= birthright_min -> 'Birthright'
        - confidence_score >= request_based_min and < birthright_min -> 'Request-Based'
        - confidence_score < request_based_min -> None / Unclassified
        """
        cls.save_classification_ranges(birthright_min, request_based_min)

        roles = db.query(CandidateRole).filter(CandidateRole.is_deleted == False).all()

        birthright_count = 0
        request_based_count = 0
        unclassified_count = 0
        total_processed = 0

        for role in roles:
            # If overwrite_existing is False and role already has a classification, skip
            if not overwrite_existing and role.classification:
                continue

            score = role.confidence_score or 0.0
            old_classification = role.classification

            if score >= birthright_min:
                new_class = "Birthright"
                birthright_count += 1
            elif score >= request_based_min:
                new_class = "Request-Based"
                request_based_count += 1
            else:
                new_class = None
                unclassified_count += 1

            if old_classification != new_class:
                role.classification = new_class
                role.modified_by = user
                role.updated_at = datetime.utcnow()
                total_processed += 1

        if total_processed > 0:
            audit = AuditLog(
                module="Role Engineering",
                action="Auto-Classification Execution",
                performed_by=user,
                new_value=json.dumps({
                    "birthright_min": birthright_min,
                    "request_based_min": request_based_min,
                    "processed": total_processed,
                    "birthright_count": birthright_count,
                    "request_based_count": request_based_count,
                    "unclassified_count": unclassified_count
                }),
                timestamp=datetime.utcnow()
            )
            db.add(audit)
            db.commit()

        return {
            "total_roles": len(roles),
            "total_updated": total_processed,
            "birthright_count": birthright_count,
            "request_based_count": request_based_count,
            "unclassified_count": unclassified_count,
            "ranges": cls._classification_ranges.copy(),
            "message": f"Auto-classification completed. Classified {birthright_count} Birthright roles, {request_based_count} Request-Based roles, and {unclassified_count} Unclassified roles."
        }

