import json
import csv
import io
from fastapi import APIRouter, HTTPException, Depends, Header, status, UploadFile, File
from fastapi.responses import StreamingResponse, Response
from sqlalchemy.orm import Session
from sqlalchemy import or_, and_
from typing import List, Optional
from datetime import datetime
import openpyxl

from app.database import get_db
from app.utils.permissions import require_permission
from app.models.sod_policy import SodPolicy, SodPolicyRule, SodPolicyAudit
from app.models.application import Application
from app.models.application_entitlement import ApplicationEntitlement
from app.models.identity import Identity
from app.models.application_account import ApplicationAccount
from app.models.application_account_entitlement import ApplicationAccountEntitlement
from app.models.audit_log import AuditLog
from app.schemas.sod_policy import (
    SodPolicyCreate,
    SodPolicyUpdate,
    SodPolicyResponse,
    SodPolicyAuditResponse,
    SodPolicyListResponse
)

router = APIRouter()

def write_sod_audit(db: Session, policy_id: str, action: str, performed_by: str, old_val: dict = None, new_val: dict = None):
    """Writes an audit entry to both the specialized sod_policy_audit and global platform audit_logs."""
    old_str = json.dumps(old_val) if old_val else None
    new_str = json.dumps(new_val) if new_val else None
    
    # 1. Sod-specific audit
    sod_audit = SodPolicyAudit(
        policy_id=policy_id,
        action=action,
        performed_by=performed_by,
        old_value=old_str,
        new_value=new_str,
        timestamp=datetime.utcnow()
    )
    db.add(sod_audit)
    
    # 2. Global platform audit
    global_audit = AuditLog(
        module="Governance",
        action=f"SoD Policy {action}",
        performed_by=performed_by,
        old_value=old_str,
        new_value=new_str,
        timestamp=datetime.utcnow()
    )
    db.add(global_audit)
    db.commit()

def check_duplicate_rules(db: Session, rules_data: list, exclude_policy_id: str = None) -> Optional[str]:
    """Checks if there is another policy that has the exact same set of entitlement rules."""
    # Convert incoming rules to a canonical sorted tuple representation
    incoming_rules = sorted([
        (r.application_name, r.entitlement_one, r.entitlement_two, r.condition_type)
        for r in rules_data
    ])
    
    # Query all active policies
    policies = db.query(SodPolicy).filter(SodPolicy.status != "DEPRECATED").all()
    for p in policies:
        if exclude_policy_id and p.id == exclude_policy_id:
            continue
        p_rules = sorted([
            (r.application_name, r.entitlement_one, r.entitlement_two, r.condition_type)
            for r in p.rules
        ])
        if incoming_rules == p_rules:
            return p.policy_code
            
    return None

def get_next_policy_code(db: Session) -> str:
    """Generates the next logical policy code like SOD-001, SOD-002, etc."""
    count = db.query(SodPolicy).count()
    return f"SOD-{str(count + 1).zfill(3)}"

@router.get("/governance/sod-policies/lookup/applications", response_model=List[str])
def get_lookup_applications(db: Session = Depends(get_db)):
    """Returns a list of all configured application names."""
    apps = db.query(Application.application_name).filter(Application.is_deleted == False).all()
    return [a[0] for a in apps]

@router.get("/governance/sod-policies/lookup/entitlements", response_model=List[str])
def get_lookup_entitlements(application_name: str, db: Session = Depends(get_db)):
    """Returns a list of entitlement names for a specific application."""
    app = db.query(Application).filter(Application.application_name == application_name, Application.is_deleted == False).first()
    if not app:
        return []
    ents = db.query(ApplicationEntitlement.entitlement_name).filter(
        ApplicationEntitlement.application_id == app.id,
        ApplicationEntitlement.is_deleted == False
    ).all()
    return [e[0] for e in ents]

@router.post("/governance/sod-policies", response_model=SodPolicyResponse, dependencies=[Depends(require_permission("SoD Policies", "create"))])
def create_sod_policy(
    payload: SodPolicyCreate,
    x_user_name: str = Header(default="System"),
    db: Session = Depends(get_db)
):
    # Validate rules count
    if not payload.rules:
        raise HTTPException(status_code=400, detail="SoD policy must contain at least one rule row.")
        
    # Check duplicate rule definition
    duplicate_code = check_duplicate_rules(db, payload.rules)
    if duplicate_code:
        raise HTTPException(
            status_code=400, 
            detail=f"Duplicate policy rule detected. An identical set of rules already exists in policy '{duplicate_code}'."
        )
        
    # Generate next code
    code = get_next_policy_code(db)
    
    # Create policy
    policy = SodPolicy(
        policy_code=code,
        policy_name=payload.policy_name,
        description=payload.description,
        risk_level=payload.risk_level,
        policy_type=payload.policy_type,
        status=payload.status,
        business_owner=payload.business_owner,
        approver=payload.approver,
        created_by=x_user_name,
        version=1
    )
    db.add(policy)
    db.flush()
    
    # Add rules
    for r in payload.rules:
        rule = SodPolicyRule(
            policy_id=policy.id,
            application_name=r.application_name,
            entitlement_one=r.entitlement_one,
            entitlement_two=r.entitlement_two,
            condition_type=r.condition_type
        )
        db.add(rule)
        
    db.commit()
    db.refresh(policy)
    
    # Audit log
    new_val = {
        "policy_code": policy.policy_code,
        "policy_name": policy.policy_name,
        "rules": [{"app": r.application_name, "ent1": r.entitlement_one, "ent2": r.entitlement_two, "op": r.condition_type} for r in policy.rules]
    }
    write_sod_audit(db, policy.id, "Create", x_user_name, new_val=new_val)
    
    return policy

@router.get("/governance/sod-policies", response_model=SodPolicyListResponse)
def get_sod_policies(
    search: Optional[str] = None,
    risk_level: Optional[str] = None,
    status: Optional[str] = None,
    policy_type: Optional[str] = None,
    page: int = 1,
    limit: int = 10,
    db: Session = Depends(get_db)
):
    query = db.query(SodPolicy)
    
    # Apply search filter
    if search:
        search_term = f"%{search}%"
        query = query.filter(
            or_(
                SodPolicy.policy_name.like(search_term),
                SodPolicy.policy_code.like(search_term),
                SodPolicy.business_owner.like(search_term)
            )
        )
        
    # Apply advanced filters
    if risk_level:
        query = query.filter(SodPolicy.risk_level == risk_level)
    if status:
        query = query.filter(SodPolicy.status == status)
    if policy_type:
        query = query.filter(SodPolicy.policy_type == policy_type)
        
    total = query.count()
    
    # Paginate
    policies = query.order_by(SodPolicy.created_date.desc()).offset((page - 1) * limit).limit(limit).all()
    
    # Aggregate KPIs for dashboard
    kpis = {
        "total": db.query(SodPolicy).count(),
        "active": db.query(SodPolicy).filter(SodPolicy.status == "ACTIVE").count(),
        "inactive": db.query(SodPolicy).filter(SodPolicy.status == "INACTIVE").count(),
        "critical": db.query(SodPolicy).filter(SodPolicy.risk_level == "CRITICAL").count(),
        "high": db.query(SodPolicy).filter(SodPolicy.risk_level == "HIGH").count(),
        "draft": db.query(SodPolicy).filter(SodPolicy.status == "DRAFT").count()
    }
    
    return {
        "policies": policies,
        "total": total,
        "page": page,
        "limit": limit,
        "kpis": kpis
    }

@router.get("/governance/sod-policies/{id}", response_model=SodPolicyResponse)
def get_sod_policy(id: str, db: Session = Depends(get_db)):
    policy = db.query(SodPolicy).filter(SodPolicy.id == id).first()
    if not policy:
        raise HTTPException(status_code=404, detail="SoD policy not found.")
    return policy

@router.get("/governance/sod-policies/{id}/audit", response_model=List[SodPolicyAuditResponse])
def get_sod_policy_audit(id: str, db: Session = Depends(get_db)):
    audits = db.query(SodPolicyAudit).filter(SodPolicyAudit.policy_id == id).order_by(SodPolicyAudit.timestamp.desc()).all()
    return audits

@router.put("/governance/sod-policies/{id}", response_model=SodPolicyResponse, dependencies=[Depends(require_permission("SoD Policies", "edit"))])
def update_sod_policy(
    id: str,
    payload: SodPolicyUpdate,
    x_user_name: str = Header(default="System"),
    db: Session = Depends(get_db)
):
    policy = db.query(SodPolicy).filter(SodPolicy.id == id).first()
    if not policy:
        raise HTTPException(status_code=404, detail="SoD policy not found.")
        
    # Validate rules count
    if not payload.rules:
        raise HTTPException(status_code=400, detail="SoD policy must contain at least one rule row.")
        
    # Check duplicate rule definition
    duplicate_code = check_duplicate_rules(db, payload.rules, exclude_policy_id=id)
    if duplicate_code:
        raise HTTPException(
            status_code=400, 
            detail=f"Duplicate policy rule detected. An identical set of rules already exists in policy '{duplicate_code}'."
        )
        
    # Capture old value for audit logging
    old_val = {
        "policy_name": policy.policy_name,
        "description": policy.description,
        "risk_level": policy.risk_level,
        "policy_type": policy.policy_type,
        "status": policy.status,
        "rules": [{"app": r.application_name, "ent1": r.entitlement_one, "ent2": r.entitlement_two, "op": r.condition_type} for r in policy.rules]
    }
    
    # Update policy attributes
    policy.policy_name = payload.policy_name
    policy.description = payload.description
    policy.risk_level = payload.risk_level
    policy.policy_type = payload.policy_type
    policy.status = payload.status
    policy.business_owner = payload.business_owner
    policy.approver = payload.approver
    policy.updated_by = x_user_name
    policy.updated_date = datetime.utcnow()
    policy.version += 1
    
    # Recreate rules list
    db.query(SodPolicyRule).filter(SodPolicyRule.policy_id == id).delete()
    for r in payload.rules:
        rule = SodPolicyRule(
            policy_id=policy.id,
            application_name=r.application_name,
            entitlement_one=r.entitlement_one,
            entitlement_two=r.entitlement_two,
            condition_type=r.condition_type
        )
        db.add(rule)
        
    db.commit()
    db.refresh(policy)
    
    # Audit log
    new_val = {
        "policy_name": policy.policy_name,
        "description": policy.description,
        "risk_level": policy.risk_level,
        "policy_type": policy.policy_type,
        "status": policy.status,
        "rules": [{"app": r.application_name, "ent1": r.entitlement_one, "ent2": r.entitlement_two, "op": r.condition_type} for r in policy.rules]
    }
    write_sod_audit(db, policy.id, "Update", x_user_name, old_val=old_val, new_val=new_val)
    
    return policy

@router.delete("/governance/sod-policies/{id}", response_model=dict, dependencies=[Depends(require_permission("SoD Policies", "delete"))])
def delete_sod_policy(id: str, x_user_name: str = Header(default="System"), db: Session = Depends(get_db)):
    policy = db.query(SodPolicy).filter(SodPolicy.id == id).first()
    if not policy:
        raise HTTPException(status_code=404, detail="SoD policy not found.")
        
    # Capture old state for audit logging
    old_val = {"policy_code": policy.policy_code, "policy_name": policy.policy_name}
    
    db.delete(policy)
    db.commit()
    
    write_sod_audit(db, id, "Delete", x_user_name, old_val=old_val)
    
    return {"message": "SoD Policy deleted successfully"}

@router.post("/governance/sod-policies/{id}/clone", response_model=SodPolicyResponse, dependencies=[Depends(require_permission("SoD Policies", "create"))])
def clone_sod_policy(id: str, x_user_name: str = Header(default="System"), db: Session = Depends(get_db)):
    policy = db.query(SodPolicy).filter(SodPolicy.id == id).first()
    if not policy:
        raise HTTPException(status_code=404, detail="SoD policy not found.")
        
    # Generate new code
    code = get_next_policy_code(db)
    
    # Create duplicate
    cloned = SodPolicy(
        policy_code=code,
        policy_name=f"Copy of {policy.policy_name}",
        description=policy.description,
        risk_level=policy.risk_level,
        policy_type=policy.policy_type,
        status="DRAFT",
        business_owner=policy.business_owner,
        approver=policy.approver,
        created_by=x_user_name,
        version=1
    )
    db.add(cloned)
    db.flush()
    
    # Clone rules
    for r in policy.rules:
        rule = SodPolicyRule(
            policy_id=cloned.id,
            application_name=r.application_name,
            entitlement_one=r.entitlement_one,
            entitlement_two=r.entitlement_two,
            condition_type=r.condition_type
        )
        db.add(rule)
        
    db.commit()
    db.refresh(cloned)
    
    new_val = {"policy_code": cloned.policy_code, "policy_name": cloned.policy_name}
    write_sod_audit(db, cloned.id, "Clone", x_user_name, new_val=new_val)
    
    return cloned

@router.patch("/governance/sod-policies/{id}/activate", response_model=SodPolicyResponse, dependencies=[Depends(require_permission("SoD Policies", "edit"))])
def activate_sod_policy(id: str, x_user_name: str = Header(default="System"), db: Session = Depends(get_db)):
    policy = db.query(SodPolicy).filter(SodPolicy.id == id).first()
    if not policy:
        raise HTTPException(status_code=404, detail="SoD policy not found.")
        
    old_status = policy.status
    policy.status = "ACTIVE"
    policy.updated_by = x_user_name
    policy.updated_date = datetime.utcnow()
    db.commit()
    
    write_sod_audit(
        db, 
        policy.id, 
        "Activate", 
        x_user_name, 
        old_val={"status": old_status}, 
        new_val={"status": "ACTIVE"}
    )
    
    return policy

@router.patch("/governance/sod-policies/{id}/deactivate", response_model=SodPolicyResponse, dependencies=[Depends(require_permission("SoD Policies", "edit"))])
def deactivate_sod_policy(id: str, x_user_name: str = Header(default="System"), db: Session = Depends(get_db)):
    policy = db.query(SodPolicy).filter(SodPolicy.id == id).first()
    if not policy:
        raise HTTPException(status_code=404, detail="SoD policy not found.")
        
    old_status = policy.status
    policy.status = "INACTIVE"
    policy.updated_by = x_user_name
    policy.updated_date = datetime.utcnow()
    db.commit()
    
    write_sod_audit(
        db, 
        policy.id, 
        "Deactivate", 
        x_user_name, 
        old_val={"status": old_status}, 
        new_val={"status": "INACTIVE"}
    )
    
    return policy

# ── Bulk Actions ──
@router.post("/governance/sod-policies/bulk-delete", dependencies=[Depends(require_permission("SoD Policies", "delete"))])
def bulk_delete_sod_policies(ids: List[str], x_user_name: str = Header(default="System"), db: Session = Depends(get_db)):
    policies = db.query(SodPolicy).filter(SodPolicy.id.in_(ids)).all()
    count = len(policies)
    for p in policies:
        db.delete(p)
        write_sod_audit(db, p.id, "Delete (Bulk)", x_user_name, old_val={"policy_code": p.policy_code})
    db.commit()
    return {"message": f"Successfully deleted {count} policies."}

@router.post("/governance/sod-policies/bulk-activate", dependencies=[Depends(require_permission("SoD Policies", "edit"))])
def bulk_activate_sod_policies(ids: List[str], x_user_name: str = Header(default="System"), db: Session = Depends(get_db)):
    policies = db.query(SodPolicy).filter(SodPolicy.id.in_(ids)).all()
    count = len(policies)
    for p in policies:
        old_status = p.status
        p.status = "ACTIVE"
        p.updated_by = x_user_name
        p.updated_date = datetime.utcnow()
        write_sod_audit(db, p.id, "Activate (Bulk)", x_user_name, old_val={"status": old_status}, new_val={"status": "ACTIVE"})
    db.commit()
    return {"message": f"Successfully activated {count} policies."}

@router.post("/governance/sod-policies/bulk-deactivate", dependencies=[Depends(require_permission("SoD Policies", "edit"))])
def bulk_deactivate_sod_policies(ids: List[str], x_user_name: str = Header(default="System"), db: Session = Depends(get_db)):
    policies = db.query(SodPolicy).filter(SodPolicy.id.in_(ids)).all()
    count = len(policies)
    for p in policies:
        old_status = p.status
        p.status = "INACTIVE"
        p.updated_by = x_user_name
        p.updated_date = datetime.utcnow()
        write_sod_audit(db, p.id, "Deactivate (Bulk)", x_user_name, old_val={"status": old_status}, new_val={"status": "INACTIVE"})
    db.commit()
    return {"message": f"Successfully deactivated {count} policies."}

# ── Simulation & Impact Analysis Engine ──
def compute_violations(db: Session, rules: List[SodPolicyRule]) -> List[dict]:
    """Simulates policies and calculates violating identities from active entitlements."""
    if not rules:
        return []
        
    # Group rules by Application
    # Rule holds entitlement_one and entitlement_two with condition_type (AND, OR, NOT)
    violations = []
    
    # Query all active identities
    identities = db.query(Identity).filter(Identity.is_deleted == False).all()
    for ident in identities:
        # Load all entitlements held by this identity
        # identity -> accounts -> entitlements
        accounts = db.query(ApplicationAccount).filter(
            ApplicationAccount.identity_id == ident.id,
            ApplicationAccount.is_deleted == False
        ).all()
        
        # Build dictionary of application name -> set of entitlement names
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
                
        # Evaluate rules
        is_violator = False
        violating_details = []
        
        for rule in rules:
            app = rule.application_name
            ent1 = rule.entitlement_one.strip().lower()
            ent2 = rule.entitlement_two.strip().lower()
            op = rule.condition_type
            
            # Check if this application has entitlements for the user
            user_app_ents = held_ents.get(app, set())
            
            has_ent1 = ent1 in user_app_ents
            has_ent2 = ent2 in user_app_ents
            
            violated_rule = False
            if op == "AND":
                violated_rule = has_ent1 and has_ent2
            elif op == "OR":
                violated_rule = has_ent1 or has_ent2
            elif op == "NOT":
                # User has entitlement_one but NOT entitlement_two
                violated_rule = has_ent1 and not has_ent2
                
            if violated_rule:
                is_violator = True
                violating_details.append({
                    "application": app,
                    "entitlement_one": rule.entitlement_one,
                    "entitlement_two": rule.entitlement_two,
                    "operator": op
                })
                
        if is_violator:
            violations.append({
                "id": ident.id,
                "employee_id": ident.employee_id,
                "name": ident.display_name or f"{ident.first_name or ''} {ident.last_name or ''}".strip(),
                "email": ident.email,
                "department": ident.department,
                "violations": violating_details
            })
            
    return violations

@router.post("/governance/sod-policies/simulate")
def simulate_sod_policy(payload: SodPolicyCreate, db: Session = Depends(get_db)):
    """Simulates a brand new unsaved policy and returns projected violations list."""
    rules = [
        SodPolicyRule(
            application_name=r.application_name,
            entitlement_one=r.entitlement_one,
            entitlement_two=r.entitlement_two,
            condition_type=r.condition_type
        )
        for r in payload.rules
    ]
    violators = compute_violations(db, rules)
    return {
        "violators_count": len(violators),
        "violators": violators
    }

@router.get("/governance/sod-policies/{id}/simulate")
def simulate_existing_policy(id: str, db: Session = Depends(get_db)):
    """Runs simulation on an existing saved policy."""
    policy = db.query(SodPolicy).filter(SodPolicy.id == id).first()
    if not policy:
        raise HTTPException(status_code=404, detail="SoD policy not found.")
    violators = compute_violations(db, policy.rules)
    return {
        "violators_count": len(violators),
        "violators": violators
    }

# ── Bulk Imports ──
@router.post("/governance/sod-policies/import", dependencies=[Depends(require_permission("SoD Policies", "create"))])
def import_sod_policies(file: UploadFile = File(...), x_user_name: str = Header(default="System"), db: Session = Depends(get_db)):
    """Imports policies from an uploaded JSON file."""
    if not file.filename.endswith(".json"):
        raise HTTPException(status_code=400, detail="Only JSON file uploads are supported for policy imports.")
        
    try:
        content = file.file.read()
        policies_list = json.loads(content)
        
        imported_count = 0
        skipped_count = 0
        
        for item in policies_list:
            # Check unique code or name
            name = item.get("policy_name")
            rules_data = item.get("rules", [])
            
            if not name or not rules_data:
                skipped_count += 1
                continue
                
            # Create policy
            code = get_next_policy_code(db)
            policy = SodPolicy(
                policy_code=code,
                policy_name=name,
                description=item.get("description", ""),
                risk_level=item.get("risk_level", "LOW"),
                policy_type=item.get("policy_type", "STATIC"),
                status=item.get("status", "DRAFT"),
                business_owner=item.get("business_owner", "System"),
                approver=item.get("approver", "System"),
                created_by=x_user_name,
                version=1
            )
            db.add(policy)
            db.flush()
            
            # Create rules
            for r in rules_data:
                rule = SodPolicyRule(
                    policy_id=policy.id,
                    application_name=r.get("application_name"),
                    entitlement_one=r.get("entitlement_one"),
                    entitlement_two=r.get("entitlement_two"),
                    condition_type=r.get("condition_type", "AND")
                )
                db.add(rule)
            
            db.commit()
            imported_count += 1
            
            # Audit log
            write_sod_audit(db, policy.id, "Import", x_user_name, new_val={"policy_code": code, "policy_name": name})
            
        return {"imported": imported_count, "skipped": skipped_count}
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to parse or save imported file: {e}")

# ── CSV & Excel Exports ──
@router.get("/governance/sod-policies/export/csv")
def export_csv(db: Session = Depends(get_db)):
    """Exports all policies to a CSV file."""
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "Policy Code", "Policy Name", "Description", "Risk Level", 
        "Policy Type", "Status", "Business Owner", "Approver", "Created Date", "Rules Count"
    ])
    
    policies = db.query(SodPolicy).all()
    for p in policies:
        writer.writerow([
            p.policy_code,
            p.policy_name,
            p.description or "",
            p.risk_level,
            p.policy_type,
            p.status,
            p.business_owner,
            p.approver,
            p.created_date.strftime("%Y-%m-%d %H:%M:%S"),
            len(p.rules)
        ])
        
    output.seek(0)
    return StreamingResponse(
        io.BytesIO(output.getvalue().encode("utf-8")),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=sod_policies_export.csv"}
    )

@router.get("/governance/sod-policies/export/excel")
def export_excel(db: Session = Depends(get_db)):
    """Exports all policies to an Excel spreadsheet using openpyxl."""
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "SoD Policies"
    
    # Headers
    ws.append([
        "Policy Code", "Policy Name", "Description", "Risk Level", 
        "Policy Type", "Status", "Business Owner", "Approver", "Created Date", "Rules"
    ])
    
    policies = db.query(SodPolicy).all()
    for p in policies:
        rules_desc = "; ".join([
            f"[{r.application_name}]: {r.entitlement_one} {r.condition_type} {r.entitlement_two}"
            for r in p.rules
        ])
        ws.append([
            p.policy_code,
            p.policy_name,
            p.description or "",
            p.risk_level,
            p.policy_type,
            p.status,
            p.business_owner,
            p.approver,
            p.created_date.strftime("%Y-%m-%d %H:%M:%S"),
            rules_desc
        ])
        
    out = io.BytesIO()
    wb.save(out)
    out.seek(0)
    
    return StreamingResponse(
        out,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=sod_policies_export.xlsx"}
    )
