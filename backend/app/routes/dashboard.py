from fastapi import APIRouter, Depends, UploadFile, File, HTTPException, Header
from sqlalchemy.orm import Session
from typing import List
from app.database import get_db
from app.models.dashboard import DashboardStats, RecentActivity, IdentityRecord, ApprovalQueueItem, RoleMiningTrendPoint
from app.models.notification import Notification
from app.models.audit_log import AuditLog
from app.schemas.dashboard import (
    DashboardStatsResponse, RecentActivityResponse, ApprovalQueueResponse, SyncApiRequest,
    DepartmentCoverageData, ApplicationDistributionData, RoleLifecycleData
)
from datetime import datetime, timedelta
import csv
import json
import io
import re
import random

router = APIRouter()

@router.get("/dashboard", response_model=DashboardStatsResponse)
def get_dashboard_stats(db: Session = Depends(get_db)):
    records = db.query(
        IdentityRecord.applications,
        IdentityRecord.entitlements_count,
        IdentityRecord.sod_conflict,
        IdentityRecord.department
    ).all()
    
    # Calculate base KPI statistics dynamically from the Identity records
    total_users = len(records)
    
    accounts = 0
    apps_set = set()
    entitlements = 0
    sod_conflicts = 0
    
    app_counts = {}
    
    for r in records:
        # Accounts (sum of applications assigned to users)
        if r.applications:
            user_apps = [a.strip() for a in r.applications.split(",") if a.strip()]
            accounts += len(user_apps)
            for app in user_apps:
                apps_set.add(app)
                app_counts[app] = app_counts.get(app, 0) + 1
        
        # Entitlements sum
        entitlements += r.entitlements_count
        
        # SoD Conflicts count
        if r.sod_conflict == 1:
            sod_conflicts += 1
            
    applications = len(apps_set)
    
    # Scaling factor for administrative/discovered roles based on user count
    candidate_roles = max(5, int(total_users * 0.064))
    published_roles = max(3, int(total_users * 0.036))
    birthright_roles = max(1, int(total_users * 0.006))
    pending_approvals = db.query(ApprovalQueueItem).count()
    
    # 1. Department Coverage (target vs covered)
    depts = ["Engineering", "Finance", "Sales", "HR", "Operations", "IT", "Security", "Marketing"]
    department_coverage = []
    for dept in depts:
        dept_users = [r for r in records if r.department == dept]
        total = len(dept_users)
        
        # Coverage target vs dynamic ratio
        if dept == "Engineering": covered = int(total * 0.75)
        elif dept == "Finance": covered = int(total * 0.7)
        elif dept == "Sales": covered = int(total * 0.85)
        elif dept == "HR": covered = int(total * 0.8)
        elif dept == "Operations": covered = int(total * 0.65)
        elif dept == "IT": covered = int(total * 0.85)
        elif dept == "Security": covered = int(total * 0.95)
        else: covered = int(total * 0.6)  # Marketing
        
        department_coverage.append(DepartmentCoverageData(
            department=dept,
            coverage=max(covered, 1) if total > 0 else 0,
            target=total if total > 0 else 10
        ))
        
    # 2. Risk Distribution (counts by low/medium/high/critical)
    # We count them dynamically, scaling down to represent distinct roles by risk level
    low_val = max(1, int(total_users * 0.018))
    med_val = max(1, int(total_users * 0.010))
    high_val = max(1, int(total_users * 0.006))
    crit_val = max(1, int(total_users * 0.002))
    
    risk_distribution = {
        "Low": low_val,
        "Medium": med_val,
        "High": high_val,
        "Critical": crit_val
    }
    
    # 3. Application Distribution (top 6 apps by account count)
    sorted_apps = sorted(app_counts.items(), key=lambda x: x[1], reverse=True)[:6]

    if not sorted_apps:
        application_distribution = []
    else:
        colors = ['#3b82f6', '#38bdf8', '#0ea5e9', '#0284c7', '#0369a1', '#1e3a8a']
        max_val = max(count for name, count in sorted_apps)
        application_distribution = [
            ApplicationDistributionData(
                name=name,
                accounts=count,
                max=int(max_val * 1.25),
                color=colors[i % len(colors)]
            )
            for i, (name, count) in enumerate(sorted_apps)
        ]
        
    # 4. Role Lifecycle (Draft, Under Review, Active, Deprecated)
    draft_val = max(1, int(total_users * 0.004))
    review_val = max(1, int(total_users * 0.006))
    active_val = max(1, int(total_users * 0.036))
    deprecated_val = max(1, int(total_users * 0.002))
    total_roles = draft_val + review_val + active_val + deprecated_val
    
    role_lifecycle = [
        RoleLifecycleData(label="Draft", count=draft_val, total=total_roles, color="#64748b"),
        RoleLifecycleData(label="Under Review", count=review_val, total=total_roles, color="#f59e0b"),
        RoleLifecycleData(label="Active", count=active_val, total=total_roles, color="#10b981"),
        RoleLifecycleData(label="Deprecated", count=deprecated_val, total=total_roles, color="#ef4444")
    ]
    
    trend_points = db.query(RoleMiningTrendPoint).order_by(RoleMiningTrendPoint.id.asc()).all()
    
    return DashboardStatsResponse(
        totalUsers=total_users,
        accounts=accounts,
        applications=applications,
        entitlements=entitlements,
        candidateRoles=candidate_roles,
        publishedRoles=published_roles,
        birthrightRoles=birthright_roles,
        sodConflicts=sod_conflicts,
        pendingApprovals=pending_approvals,
        departmentCoverage=department_coverage,
        riskDistribution=risk_distribution,
        applicationDistribution=application_distribution,
        roleLifecycle=role_lifecycle,
        miningTrend=trend_points
    )

@router.get("/recent-activities", response_model=List[RecentActivityResponse])
def get_recent_activities(db: Session = Depends(get_db)):
    activities = db.query(RecentActivity).order_by(RecentActivity.id.desc()).limit(15).all()
    return activities

@router.get("/approval-queue", response_model=List[ApprovalQueueResponse])
def get_approval_queue(db: Session = Depends(get_db)):
    queue = db.query(ApprovalQueueItem).order_by(ApprovalQueueItem.due_in_days.asc()).all()
    return queue

@router.post("/upload-data", response_model=DashboardStatsResponse)
async def upload_identity_data(file: UploadFile = File(...), db: Session = Depends(get_db), x_user_name: str = Header(default="System")):
    content = await file.read()
    filename = file.filename.lower()
    parsed_records = []

    try:
        if filename.endswith(".json"):
            try:
                decoded = content.decode("utf-8")
            except UnicodeDecodeError:
                decoded = content.decode("latin-1")
            data = json.loads(decoded)
            if not isinstance(data, list):
                raise HTTPException(status_code=400, detail="JSON must be a list of identities")
            parsed_records = data

        elif filename.endswith(".csv"):
            try:
                decoded = content.decode("utf-8")
            except UnicodeDecodeError:
                decoded = content.decode("latin-1")
            f = io.StringIO(decoded)
            reader = csv.DictReader(f)
            parsed_records = list(reader)

        elif filename.endswith(".xlsx"):
            import openpyxl
            wb = openpyxl.load_workbook(io.BytesIO(content), read_only=True, data_only=True)
            ws = wb.active
            rows = list(ws.iter_rows(values_only=True))
            if not rows:
                raise HTTPException(status_code=400, detail="Excel file is empty")
            headers = [str(h).strip() if h is not None else f"col_{i}" for i, h in enumerate(rows[0])]
            for row in rows[1:]:
                if any(cell is not None for cell in row):
                    parsed_records.append(dict(zip(headers, [str(v) if v is not None else "" for v in row])))

        elif filename.endswith(".ldif"):
            try:
                decoded = content.decode("utf-8")
            except UnicodeDecodeError:
                decoded = content.decode("latin-1")
            # Parse LDIF blocks separated by blank lines
            blocks = re.split(r"\n\s*\n", decoded.strip())
            for block in blocks:
                entry = {}
                for line in block.splitlines():
                    line = line.strip()
                    if ":" in line:
                        key, _, value = line.partition(":")
                        key = key.strip().lower().lstrip(":")
                        value = value.strip().lstrip(":" ).strip()
                        if key == "uid":         entry["username"] = value
                        elif key == "mail":      entry["email"] = value
                        elif key == "ou":        entry["department"] = value
                        elif key == "title":     entry["role"] = value
                        elif key == "cn":        entry.setdefault("username", value)
                        elif key == "memberof":  
                            apps = entry.get("applications", "")
                            entry["applications"] = (apps + "," + value).strip(",")
                if entry.get("username") or entry.get("email"):
                    parsed_records.append(entry)

        elif filename.endswith(".sql"):
            try:
                decoded = content.decode("utf-8")
            except UnicodeDecodeError:
                decoded = content.decode("latin-1")
            # Extract INSERT INTO ... VALUES (...) statements
            insert_pattern = re.compile(
                r"INSERT\s+INTO\s+\w+\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)",
                re.IGNORECASE
            )
            for match in insert_pattern.finditer(decoded):
                cols = [c.strip().strip('`"[]') for c in match.group(1).split(",")]
                vals = [v.strip().strip("'\"" ) for v in match.group(2).split(",")]
                parsed_records.append(dict(zip(cols, vals)))

        else:
            raise HTTPException(status_code=400, detail="Unsupported file type. Use CSV, Excel (.xlsx), LDIF (.ldif) or SQL (.sql)")

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to parse file: {str(e)}")
        
    if not parsed_records:
        raise HTTPException(status_code=400, detail="No records found in the uploaded file")
        
    # Clear existing identities
    db.query(IdentityRecord).delete()
    
    # Save the new records
    for item in parsed_records:
        username = item.get("username", item.get("Username", "unknown"))
        email = item.get("email", item.get("Email", f"{username}@ranalyzer.io"))
        dept = item.get("department", item.get("Department", "General"))
        role = item.get("role", item.get("Role", f"{dept} Member"))
        apps = item.get("applications", item.get("Applications", "Active Directory"))
        entitlements_val = int(item.get("entitlements_count", item.get("EntitlementsCount", 5)))
        risk = item.get("risk_level", item.get("RiskLevel", "Low"))
        sod = int(item.get("sod_conflict", item.get("SoDConflict", 0)))
        
        record = IdentityRecord(
            username=username,
            email=email,
            department=dept,
            role=role,
            applications=apps,
            entitlements_count=entitlements_val,
            risk_level=risk,
            sod_conflict=sod
        )
        db.add(record)
        
    # Add a recent activity
    activity = RecentActivity(
        user="Darshan Kumar",
        action=f"Data Import - {file.filename} - {len(parsed_records)} identities uploaded",
        status="success",
        created_at=datetime.utcnow()
    )
    db.add(activity)
    
    # Add a notification
    notification = Notification(
        title="Identity Upload Succeeded",
        message=f"Analyzed {len(parsed_records)} identities and synchronized dashboard charts.",
        status="unread",
        created_at=datetime.utcnow()
    )
    db.add(notification)

    # This bulk-replaces every dashboard identity record but previously left
    # no audit trail at all - only a notification.
    db.add(AuditLog(
        module="Dashboard",
        action="Data Upload",
        performed_by=x_user_name,
        new_value=json.dumps({"filename": file.filename, "records_imported": len(parsed_records)}, default=str),
        timestamp=datetime.utcnow()
    ))

    db.commit()

    return get_dashboard_stats(db)

@router.post("/sync-api", response_model=DashboardStatsResponse)
def sync_api_integration(payload: SyncApiRequest, db: Session = Depends(get_db), x_user_name: str = Header(default="System")):
    if not payload.apiKey.strip():
        raise HTTPException(status_code=400, detail="API Key cannot be empty")
        
    # Wipe existing identities and seed a randomized set based on provider
    db.query(IdentityRecord).delete()
    
    # Determine size and parameters based on provider
    provider = payload.provider.upper()
    if provider == "OKTA":
        num_identities = 750
        num_sod = 12
        app_list = ["Okta", "Active Directory", "Slack", "Jira", "Zoom", "AWS"]
    elif provider == "SAILPOINT":
        num_identities = 980
        num_sod = 15
        app_list = ["SailPoint", "Workday", "Okta", "Salesforce", "ServiceNow", "GitHub"]
    elif provider == "CYBERARK":
        num_identities = 350
        num_sod = 4
        app_list = ["CyberArk", "Active Directory", "AWS", "Azure Portal", "Linux Servers"]
    else: # ENTRA_ID or default
        num_identities = 620
        num_sod = 9
        app_list = ["Entra ID", "SharePoint", "Office 365", "Teams", "Salesforce", "Active Directory"]
        
    departments = ["Engineering", "Finance", "Sales", "HR", "Operations", "IT", "Security", "Marketing"]
    
    identities = []
    for i in range(1, num_identities + 1):
        username = f"sync_user{i}"
        email = f"{username}@enterprise-sync.com"
        dept = random.choice(departments)
        
        # Random apps
        user_apps = random.sample(app_list, random.randint(2, len(app_list)))
        
        # SoD distribution
        has_sod = 1 if i <= num_sod else 0
        
        # Risk levels
        risk = "Low"
        if i <= int(num_identities * 0.01):
            risk = "Critical"
        elif i <= int(num_identities * 0.05):
            risk = "High"
        elif i <= int(num_identities * 0.20):
            risk = "Medium"
            
        ent_count = random.randint(8, 20)
        
        identities.append(IdentityRecord(
            username=username,
            email=email,
            department=dept,
            role=f"Synced {dept} Specialist",
            applications=",".join(user_apps),
            entitlements_count=ent_count,
            risk_level=risk,
            sod_conflict=has_sod
        ))
        
    db.add_all(identities)
    
    # Add activity
    activity = RecentActivity(
        user="Darshan Kumar",
        action=f"API Sync - {payload.provider} integration - {num_identities} identities synced",
        status="info",
        created_at=datetime.utcnow()
    )
    db.add(activity)
    
    # Add notification
    notification = Notification(
        title="API Sync Complete",
        message=f"Successfully imported {num_identities} identities from {payload.provider}.",
        status="unread",
        created_at=datetime.utcnow()
    )
    db.add(notification)

    db.add(AuditLog(
        module="Dashboard",
        action="API Sync",
        performed_by=x_user_name,
        new_value=json.dumps({"provider": payload.provider, "records_imported": num_identities}, default=str),
        timestamp=datetime.utcnow()
    ))

    db.commit()

    return get_dashboard_stats(db)

