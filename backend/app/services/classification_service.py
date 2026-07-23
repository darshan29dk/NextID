from sqlalchemy.orm import Session
from datetime import datetime, timedelta
from typing import List, Dict
import json

from app.models.candidate_role import CandidateRole
from app.models.candidate_role_entitlement import CandidateRoleEntitlement
from app.models.audit_log import AuditLog
from app.models.dashboard import RecentActivity
from app.models.approval_request import ApprovalRequest
from app.models.approval_step import ApprovalStep
from app.models.notification import Notification


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
        return {
            "success": True,
            "message": f"Classification ranges saved successfully: Birthright >= {birthright_min}%, Request-Based {request_based_min}% - {round(float(birthright_min) - 0.1, 1)}%.",
            "ranges": cls._classification_ranges.copy()
        }

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
        Evaluates candidate roles' confidence_score against configured ranges:
        - Classified (Birthright / Request-Based) -> Status: Published -> Direct to Role Catalog
        - Unclassified / Not Published -> Status: Business Review -> Routed to Approval Workflow
        Optimized with bulk set lookups & batch SQL inserts for sub-second execution.
        """
        cls.save_classification_ranges(birthright_min, request_based_min)

        roles = db.query(CandidateRole).filter(CandidateRole.is_deleted == False).all()

        birthright_count = 0
        request_based_count = 0
        unclassified_count = 0
        total_processed = 0
        published_count = 0
        approval_submitted_count = 0
        now = datetime.utcnow()
        due_date = now + timedelta(days=7)

        active_statuses = ["Draft", "Submitted", "Business Review", "Security Review", "Pending Approval"]

        # Bulk pre-fetch existing active ApprovalRequests to eliminate N+1 SQL queries
        active_req_role_ids = set(
            r[0] for r in db.query(ApprovalRequest.candidate_role_id).filter(
                ApprovalRequest.status.in_(active_statuses)
            ).all()
        )

        new_requests = []
        new_steps = []

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

            if new_class is not None:
                # ── Path 1: Classified Roles -> Direct to Role Catalog (Status: Published) ──
                if old_classification != new_class or role.status != "Published":
                    role.classification = new_class
                    role.status = "Published"
                    role.published_at = now
                    role.published_by = user
                    role.current_version = (role.current_version or 0) + 1
                    role.modified_by = user
                    role.updated_at = now
                    published_count += 1
                    total_processed += 1
            else:
                # ── Path 2: Unclassified / Low Confidence -> Routed to Approval Workflow ──
                role.classification = None
                if role.status != "Business Review":
                    role.status = "Business Review"
                    role.modified_by = user
                    role.updated_at = now
                    total_processed += 1

                # Bulk check using set lookup
                if role.id not in active_req_role_ids:
                    req = ApprovalRequest(
                        candidate_role_id=role.id,
                        workflow_name="Unclassified Role Governance Review",
                        current_stage="Business Review",
                        status="Business Review",
                        submitted_by=user,
                        submitted_at=now,
                        due_date=due_date,
                        priority="High",
                        remarks="Auto-submitted to Approval Workflow due to unclassified / low confidence score.",
                        created_at=now,
                        updated_at=now
                    )
                    new_requests.append(req)
                    active_req_role_ids.add(role.id)
                    approval_submitted_count += 1

        if new_requests:
            db.add_all(new_requests)
            db.flush()
            for req in new_requests:
                step = ApprovalStep(
                    approval_request_id=req.id,
                    step_order=1,
                    step_name="L1: Unclassified Governance Review",
                    approver_type="Security Administrator",
                    approver_id=None,
                    approver_name="Security Lead",
                    status="Pending",
                    assigned_at=now
                )
                new_steps.append(step)
            if new_steps:
                db.add_all(new_steps)

        if total_processed > 0 or approval_submitted_count > 0:
            audit = AuditLog(
                module="Role Engineering",
                action="Auto-Classification, Catalog Publish & Approval Routing",
                performed_by=user,
                new_value=json.dumps({
                    "birthright_min": birthright_min,
                    "request_based_min": request_based_min,
                    "processed": total_processed,
                    "published_count": published_count,
                    "approval_submitted_count": approval_submitted_count,
                    "birthright_count": birthright_count,
                    "request_based_count": request_based_count,
                    "unclassified_count": unclassified_count
                }),
                timestamp=now
            )
            db.add(audit)
            db.commit()

        return {
            "total_roles": len(roles),
            "total_updated": total_processed,
            "published_count": published_count,
            "approval_submitted_count": approval_submitted_count,
            "birthright_count": birthright_count,
            "request_based_count": request_based_count,
            "unclassified_count": unclassified_count,
            "ranges": cls._classification_ranges.copy(),
            "message": f"Auto-classification complete! Published {published_count} classified roles directly to Role Catalog. Routed {unclassified_count} unclassified roles to Approval Workflow."
        }

