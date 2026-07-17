import json
from datetime import datetime
from sqlalchemy.orm import Session
from sqlalchemy import or_, and_
from typing import List, Optional

from app.models.sod_policy import SodPolicy, SodPolicyRule
from app.models.sod_violation import SodViolation, SodScanHistory, SodViolationAudit, SodViolationComment
from app.models.identity import Identity
from app.models.application import Application
from app.models.application_account import ApplicationAccount
from app.models.application_account_entitlement import ApplicationAccountEntitlement
from app.models.audit_log import AuditLog

# Global lock to prevent parallel background scan executions
_scan_running = False

def is_scan_running() -> bool:
    global _scan_running
    return _scan_running

def calculate_risk_score(risk_level: str) -> int:
    """Calculates risk score based on policy risk level."""
    lvl = risk_level.upper()
    if lvl == "CRITICAL":
        return 95
    elif lvl == "HIGH":
        return 75
    elif lvl == "MEDIUM":
        return 50
    return 25

def write_violation_audit(db: Session, violation_id: str, action: str, performed_by: str, old_val: dict = None, new_val: dict = None):
    """Writes an audit entry to sod_violation_audit and global audit_logs."""
    old_str = json.dumps(old_val) if old_val else None
    new_str = json.dumps(new_val) if new_val else None
    
    # 1. Specialized audit
    audit = SodViolationAudit(
        violation_id=violation_id,
        action=action,
        performed_by=performed_by,
        old_value=old_str,
        new_value=new_str,
        timestamp=datetime.utcnow()
    )
    db.add(audit)
    
    # 2. Global audit log
    global_audit = AuditLog(
        module="Governance",
        action=f"SoD Violation {action}",
        performed_by=performed_by,
        old_value=old_str,
        new_value=new_str,
        timestamp=datetime.utcnow()
    )
    db.add(global_audit)
    db.commit()

def run_violation_scan_job(db: Session, scan_history_id: int, scan_type: str, started_by: str):
    """Core violation scanner job executed in the background."""
    global _scan_running
    _scan_running = True
    
    scan = db.query(SodScanHistory).filter(SodScanHistory.id == scan_history_id).first()
    if not scan:
        _scan_running = False
        return
        
    try:
        scan.status = "RUNNING"
        scan.progress_pct = 0
        db.commit()
        
        # 1. Load active policies
        active_policies = db.query(SodPolicy).filter(SodPolicy.status == "ACTIVE").all()
        if not active_policies:
            scan.status = "COMPLETED"
            scan.end_time = datetime.utcnow()
            scan.progress_pct = 100
            db.commit()
            _scan_running = False
            return
            
        # 2. Scope identities
        if scan_type == "INCREMENTAL":
            # Incremental: query users updated after the last completed scan
            last_completed = db.query(SodScanHistory).filter(
                SodScanHistory.status == "COMPLETED",
                SodScanHistory.id != scan_history_id
            ).order_by(SodScanHistory.end_time.desc()).first()
            
            if last_completed and last_completed.end_time:
                identities = db.query(Identity).filter(
                    Identity.is_deleted == False,
                    Identity.updated_at >= last_completed.end_time
                ).all()
            else:
                identities = db.query(Identity).filter(Identity.is_deleted == False).all()
        else:
            # Full scan
            identities = db.query(Identity).filter(Identity.is_deleted == False).all()
            
        scan.total_users = len(identities)
        db.commit()
        
        if not identities:
            scan.status = "COMPLETED"
            scan.end_time = datetime.utcnow()
            scan.progress_pct = 100
            db.commit()
            _scan_running = False
            return
            
        users_scanned_count = 0
        violations_found_count = 0
        detected_keys = set()  # set of (user_id, policy_id) that generated violations
        
        for idx, user in enumerate(identities):
            # Load user entitlement assignments
            accounts = db.query(ApplicationAccount).filter(
                ApplicationAccount.identity_id == user.id,
                ApplicationAccount.is_deleted == False
            ).all()
            
            held_ents = {}
            for acc in accounts:
                app = db.query(Application).filter(Application.id == acc.application_id).first()
                if not app:
                    continue
                app_name = app.application_name
                if app_name not in held_ents:
                    held_ents[app_name] = set()
                    
                links = db.query(ApplicationAccountEntitlement).filter(
                    ApplicationAccountEntitlement.account_id == acc.id
                ).all()
                for lnk in links:
                    held_ents[app_name].add(lnk.entitlement_name_raw.strip().lower())
                    
            # Check policies
            for policy in active_policies:
                is_violating = False
                violating_evidence = []
                
                # Evaluate policy rules
                for rule in policy.rules:
                    app = rule.application_name
                    ent1 = rule.entitlement_one.strip().lower()
                    ent2 = rule.entitlement_two.strip().lower()
                    op = rule.condition_type
                    
                    user_app_ents = held_ents.get(app, set())
                    has_ent1 = ent1 in user_app_ents
                    has_ent2 = ent2 in user_app_ents
                    
                    rule_matched = False
                    if op == "AND":
                        rule_matched = has_ent1 and has_ent2
                    elif op == "OR":
                        rule_matched = has_ent1 or has_ent2
                    elif op == "NOT":
                        rule_matched = has_ent1 and not has_ent2
                        
                    if rule_matched:
                        is_violating = True
                        violating_evidence.append({
                            "application": app,
                            "entitlement_one": rule.entitlement_one,
                            "entitlement_two": rule.entitlement_two,
                            "operator": op,
                            "detected_entitlements": list(user_app_ents)
                        })
                        
                if is_violating:
                    # Record violation
                    detected_keys.add((user.id, policy.id))
                    
                    # Check for active SoD Exception
                    from app.models.sod_exception import SodException
                    active_exc = db.query(SodException).filter(
                        SodException.user_id == user.id,
                        SodException.policy_id == policy.id,
                        SodException.status == "ACTIVE"
                    ).first()
                    target_status = "EXCEPTION_APPROVED" if active_exc else "OPEN"

                    # 14. Duplicate Merge: Check if violation already exists for user+policy
                    violation = db.query(SodViolation).filter(
                        SodViolation.user_id == user.id,
                        SodViolation.policy_id == policy.id
                    ).first()
                    
                    evidence_payload = {
                        "policy_code": policy.policy_code,
                        "policy_name": policy.policy_name,
                        "matches": violating_evidence
                    }
                    
                    if violation:
                        # Update and merge evidence
                        old_status = violation.status
                        
                        # Reopen if closed/mitigated/exception changed
                        if violation.status in ["CLOSED", "MITIGATED", "EXCEPTION_APPROVED", "OPEN"] and violation.status != target_status:
                            violation.status = target_status
                            
                        violation.scan_id = scan_history_id
                        violation.evidence = json.dumps(evidence_payload)
                        violation.updated_at = datetime.utcnow()
                        db.commit()
                        
                        if old_status != violation.status:
                            write_violation_audit(
                                db, violation.id, "Status Update (Auto-Scan)", "System (Auto-Scan)",
                                old_val={"status": old_status}, new_val={"status": violation.status}
                            )
                    else:
                        # Create new violation
                        risk_score = calculate_risk_score(policy.risk_level)
                        violation = SodViolation(
                            policy_id=policy.id,
                            policy_code=policy.policy_code,
                            policy_name=policy.policy_name,
                            user_id=user.id,
                            username=user.email or f"user_{user.id}",
                            display_name=user.display_name or f"{user.first_name or ''} {user.last_name or ''}".strip(),
                            department=user.department,
                            manager=user.manager,
                            application_name=violating_evidence[0]["application"],
                            entitlement_one=violating_evidence[0]["entitlement_one"],
                            entitlement_two=violating_evidence[0]["entitlement_two"],
                            risk_level=policy.risk_level,
                            severity=policy.risk_level,
                            status=target_status,
                            scan_id=scan_history_id,
                            risk_score=risk_score,
                            evidence=json.dumps(evidence_payload)
                        )
                        db.add(violation)
                        db.flush()
                        
                        write_violation_audit(db, violation.id, "Detection", "System (Auto-Scan)", new_val=evidence_payload)
                        
                    violations_found_count += 1
                    
            users_scanned_count += 1
            
            # Periodically update progress percentage
            if idx % 10 == 0 or idx == len(identities) - 1:
                scan.users_scanned = users_scanned_count
                scan.progress_pct = int((users_scanned_count / len(identities)) * 100)
                db.commit()
                
        # 6. Auto-Resolution for resolved conflicts
        # For all scanned users, check if they have open violations that weren't detected in this run
        scanned_user_ids = [u.id for u in identities]
        previous_open_violations = db.query(SodViolation).filter(
            SodViolation.user_id.in_(scanned_user_ids),
            SodViolation.status.in_(["OPEN", "UNDER_REVIEW"])
        ).all()
        
        for v in previous_open_violations:
            if (v.user_id, v.policy_id) not in detected_keys:
                # Auto-resolve
                old_status = v.status
                v.status = "CLOSED"
                v.resolved_date = datetime.utcnow()
                v.resolved_by = "System (Auto-Scan)"
                v.remarks = "Auto-resolved: Conflicting entitlements are no longer assigned to user."
                db.commit()
                
                write_violation_audit(
                    db, v.id, "Auto-Resolution", "System (Auto-Scan)",
                    old_val={"status": old_status},
                    new_val={"status": "CLOSED", "remarks": v.remarks}
                )
                
        scan.status = "COMPLETED"
        scan.end_time = datetime.utcnow()
        scan.violations_found = violations_found_count
        scan.progress_pct = 100
        db.commit()
        
    except Exception as e:
        db.rollback()
        scan.status = "FAILED"
        scan.end_time = datetime.utcnow()
        db.commit()
        print(f"Violation scan job failed: {e}")
    finally:
        _scan_running = False
        db.close()

def evaluate_single_user_violations(db: Session, user_id: int) -> int:
    """Evaluates SoD violations for a single user immediately."""
    user = db.query(Identity).filter(Identity.id == user_id, Identity.is_deleted == False).first()
    if not user:
        return 0
        
    active_policies = db.query(SodPolicy).filter(SodPolicy.status == "ACTIVE").all()
    if not active_policies:
        return 0
        
    # Load user entitlements
    accounts = db.query(ApplicationAccount).filter(
        ApplicationAccount.identity_id == user.id,
        ApplicationAccount.is_deleted == False
    ).all()
    
    held_ents = {}
    for acc in accounts:
        app = db.query(Application).filter(Application.id == acc.application_id).first()
        if not app:
            continue
        app_name = app.application_name
        if app_name not in held_ents:
            held_ents[app_name] = set()
            
        links = db.query(ApplicationAccountEntitlement).filter(
            ApplicationAccountEntitlement.account_id == acc.id
        ).all()
        for lnk in links:
            held_ents[app_name].add(lnk.entitlement_name_raw.strip().lower())
            
    violations_found = 0
    detected_policies = set()
    
    for policy in active_policies:
        is_violating = False
        violating_evidence = []
        
        for rule in policy.rules:
            app = rule.application_name
            ent1 = rule.entitlement_one.strip().lower()
            ent2 = rule.entitlement_two.strip().lower()
            op = rule.condition_type
            
            user_app_ents = held_ents.get(app, set())
            has_ent1 = ent1 in user_app_ents
            has_ent2 = ent2 in user_app_ents
            
            rule_matched = False
            if op == "AND":
                rule_matched = has_ent1 and has_ent2
            elif op == "OR":
                rule_matched = has_ent1 or has_ent2
            elif op == "NOT":
                rule_matched = has_ent1 and not has_ent2
                
            if rule_matched:
                is_violating = True
                violating_evidence.append({
                    "application": app,
                    "entitlement_one": rule.entitlement_one,
                    "entitlement_two": rule.entitlement_two,
                    "operator": op,
                    "detected_entitlements": list(user_app_ents)
                })
                
        if is_violating:
            detected_policies.add(policy.id)
            violations_found += 1
            
            # Check for active SoD Exception
            from app.models.sod_exception import SodException
            active_exc = db.query(SodException).filter(
                SodException.user_id == user.id,
                SodException.policy_id == policy.id,
                SodException.status == "ACTIVE"
            ).first()
            target_status = "EXCEPTION_APPROVED" if active_exc else "OPEN"

            violation = db.query(SodViolation).filter(
                SodViolation.user_id == user.id,
                SodViolation.policy_id == policy.id
            ).first()
            
            evidence_payload = {
                "policy_code": policy.policy_code,
                "policy_name": policy.policy_name,
                "matches": violating_evidence
            }
            
            if violation:
                old_status = violation.status
                if violation.status in ["CLOSED", "MITIGATED", "EXCEPTION_APPROVED", "OPEN"] and violation.status != target_status:
                    violation.status = target_status
                violation.evidence = json.dumps(evidence_payload)
                violation.updated_at = datetime.utcnow()
                db.commit()
                
                if old_status != violation.status:
                    write_violation_audit(
                        db, violation.id, "Status Update (User Rescan)", "System (Manual-Rescan)",
                        old_val={"status": old_status}, new_val={"status": violation.status}
                    )
            else:
                risk_score = calculate_risk_score(policy.risk_level)
                violation = SodViolation(
                    policy_id=policy.id,
                    policy_code=policy.policy_code,
                    policy_name=policy.policy_name,
                    user_id=user.id,
                    username=user.email or f"user_{user.id}",
                    display_name=user.display_name or f"{user.first_name or ''} {user.last_name or ''}".strip(),
                    department=user.department,
                    manager=user.manager,
                    application_name=violating_evidence[0]["application"],
                    entitlement_one=violating_evidence[0]["entitlement_one"],
                    entitlement_two=violating_evidence[0]["entitlement_two"],
                    risk_level=policy.risk_level,
                    severity=policy.risk_level,
                    status=target_status,
                    risk_score=risk_score,
                    evidence=json.dumps(evidence_payload)
                )
                db.add(violation)
                db.flush()
                
                write_violation_audit(db, violation.id, "Detection (User Rescan)", "System (Manual-Rescan)", new_val=evidence_payload)
                
    # Auto-resolve violations for this user that did not trigger in this rescan
    open_violations = db.query(SodViolation).filter(
        SodViolation.user_id == user.id,
        SodViolation.status.in_(["OPEN", "UNDER_REVIEW"])
    ).all()
    
    for v in open_violations:
        if v.policy_id not in detected_policies:
            old_status = v.status
            v.status = "CLOSED"
            v.resolved_date = datetime.utcnow()
            v.resolved_by = "System (User Rescan)"
            v.remarks = "Auto-resolved during individual user rescan: Conflict no longer present."
            db.commit()
            
            write_violation_audit(
                db, v.id, "Auto-Resolution (User Rescan)", "System (Manual-Rescan)",
                old_val={"status": old_status}, new_val={"status": "CLOSED"}
            )
            
    return violations_found
