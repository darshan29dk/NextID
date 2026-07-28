from fastapi import APIRouter, Depends, UploadFile, File, HTTPException, Header
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List
from app.database import get_db
from app.models.dashboard import DashboardStats, RecentActivity, IdentityRecord, ApprovalQueueItem, RoleMiningTrendPoint
from app.models.notification import Notification
from app.models.audit_log import AuditLog
from app.models.identity import Identity
from app.models.application import Application
from app.models.application_account import ApplicationAccount
from app.models.application_account_entitlement import ApplicationAccountEntitlement
from app.models.candidate_role import CandidateRole
from app.models.candidate_role_member import CandidateRoleMember
from app.models.approval_request import ApprovalRequest
from app.models.sod_violation import SodViolation
from app.models.sod_exception import SodException
from sqlalchemy import or_
from app.cache import cache_get, cache_set, cache_delete_prefix
from app.schemas.dashboard import (
    DashboardStatsResponse, RecentActivityResponse, ApprovalQueueResponse, SyncApiRequest,
    DepartmentCoverageData, ApplicationDistributionData, RoleLifecycleData, MiningTrendPoint
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
    """
    Real, live platform KPIs - reads the same tables (Identity,
    ApplicationAccount, Application, ApplicationAccountEntitlement,
    CandidateRole, ApprovalRequest, SodViolation) that Role Discovery, Role
    Engineering, Approval Workflow, and Governance already use, so these
    numbers agree with the rest of the app instead of a separate synthetic
    "identity_records" demo table scaled by arbitrary formulas.
    """
    cached = cache_get("dashboard_stats")
    if cached:
        return cached

    total_users = db.query(Identity).filter(Identity.is_deleted == False).count()
    accounts = db.query(ApplicationAccount).filter(ApplicationAccount.is_deleted == False).count()
    applications = db.query(Application).filter(Application.is_deleted == False).count()

    # Only count entitlement links whose parent Application/account still
    # exist and which actually matched a catalog entitlement - mirrors
    # analytics_service.get_executive_kpis so this tile agrees with the
    # Analytics module.
    entitlements = db.query(ApplicationAccountEntitlement).join(
        Application, ApplicationAccountEntitlement.application_id == Application.id
    ).join(
        ApplicationAccount, ApplicationAccountEntitlement.account_id == ApplicationAccount.id
    ).filter(
        ApplicationAccountEntitlement.matched == True,
        Application.is_deleted == False,
        ApplicationAccount.is_deleted == False
    ).count()

    role_base = db.query(CandidateRole).filter(CandidateRole.is_deleted == False)
    candidate_roles = role_base.count()
    published_roles = role_base.filter(CandidateRole.status == "Published").count()
    birthright_roles = role_base.filter(CandidateRole.classification == "Birthright").count()

    sod_conflicts = db.query(SodViolation).join(
        Identity, SodViolation.user_id == Identity.id
    ).filter(
        SodViolation.status.in_(["OPEN", "UNDER_REVIEW"]),
        Identity.is_deleted == False
    ).count()

    # In-flight anywhere in the approval pipeline - matches the status set
    # BusinessApproval/SecurityApproval treat as "still pending".
    pending_approvals = db.query(ApprovalRequest).filter(
        ApprovalRequest.status.in_(["Submitted", "Business Review", "Security Review"])
    ).count()

    # Quick-action counts: roles sitting in Role Engineering with no
    # classification yet, and SoD exceptions still waiting on a decision -
    # both feed the "Needs Your Attention" links on the Dashboard so a user
    # can jump straight to the page that needs work instead of hunting for it.
    not_classified_roles = role_base.filter(
        or_(CandidateRole.classification.is_(None), CandidateRole.classification == "")
    ).count()
    pending_exceptions = db.query(SodException).filter(
        SodException.status.in_(["PENDING", "UNDER_REVIEW"])
    ).count()

    # 1. Department Coverage: real headcount per department (from Identity)
    # vs. how many of those identities are a member of at least one
    # Published role, grouped off CandidateRoleMember's own department
    # snapshot.
    identities_by_dept = dict(
        db.query(Identity.department, func.count(Identity.id))
        .filter(Identity.is_deleted == False)
        .group_by(Identity.department).all()
    )
    covered_by_dept = dict(
        db.query(CandidateRoleMember.department, func.count(func.distinct(CandidateRoleMember.identity_id)))
        .join(CandidateRole, CandidateRoleMember.candidate_role_id == CandidateRole.id)
        .filter(CandidateRole.is_deleted == False, CandidateRole.status == "Published")
        .group_by(CandidateRoleMember.department).all()
    )
    department_coverage = [
        DepartmentCoverageData(
            department=dept,
            coverage=covered_by_dept.get(dept, 0),
            target=total
        )
        for dept, total in sorted(identities_by_dept.items()) if dept
    ]

    # 2. Risk Distribution: real Published roles grouped by their actual
    # risk_level, not a synthetic split.
    risk_counts = dict(
        role_base.filter(CandidateRole.status == "Published")
        .with_entities(CandidateRole.risk_level, func.count(CandidateRole.id))
        .group_by(CandidateRole.risk_level).all()
    )
    risk_distribution = {
        "Low": risk_counts.get("Low", 0),
        "Medium": risk_counts.get("Medium", 0),
        "High": risk_counts.get("High", 0),
        "Critical": risk_counts.get("Critical", 0),
    }

    # 3. Application Distribution: top 6 real applications by real account
    # count (ApplicationAccount rows), not a count of comma-separated names
    # typed into an upload file.
    app_counts_q = (
        db.query(Application.application_name, func.count(ApplicationAccount.id))
        .join(ApplicationAccount, ApplicationAccount.application_id == Application.id)
        .filter(Application.is_deleted == False, ApplicationAccount.is_deleted == False)
        .group_by(Application.application_name)
        .order_by(func.count(ApplicationAccount.id).desc())
        .limit(6)
        .all()
    )
    if not app_counts_q:
        application_distribution = []
    else:
        colors = ['#3b82f6', '#38bdf8', '#0ea5e9', '#0284c7', '#0369a1', '#1e3a8a']
        max_val = max(count for name, count in app_counts_q) or 1
        application_distribution = [
            ApplicationDistributionData(
                name=name,
                accounts=count,
                max=int(max_val * 1.25),
                color=colors[i % len(colors)]
            )
            for i, (name, count) in enumerate(app_counts_q)
        ]

    # 4. Role Lifecycle: real CandidateRole.status breakdown, rolled up onto
    # the widget's existing 4-bucket legend (Draft / Under Review / Active /
    # Deprecated) rather than growing the legend for every workflow status.
    status_counts = dict(
        role_base.with_entities(CandidateRole.status, func.count(CandidateRole.id))
        .group_by(CandidateRole.status).all()
    )
    draft_val = status_counts.get("Draft", 0)
    review_val = (
        status_counts.get("Under Review", 0)
        + status_counts.get("Reviewed", 0)
        + status_counts.get("Ready For Publish", 0)
    )
    active_val = status_counts.get("Published", 0) + status_counts.get("Approved", 0)
    deprecated_val = status_counts.get("Rejected", 0) + status_counts.get("Security Rejected", 0)
    total_roles = draft_val + review_val + active_val + deprecated_val

    role_lifecycle = [
        RoleLifecycleData(label="Draft", count=draft_val, total=total_roles, color="#64748b"),
        RoleLifecycleData(label="Under Review", count=review_val, total=total_roles, color="#f59e0b"),
        RoleLifecycleData(label="Active", count=active_val, total=total_roles, color="#10b981"),
        RoleLifecycleData(label="Deprecated", count=deprecated_val, total=total_roles, color="#ef4444")
    ]

    # 5. Mining Trend: last 6 real calendar months, counted straight from
    # CandidateRole.generated_on / published_at instead of a separate
    # role_mining_trend table nothing else in the app writes to.
    now = datetime.utcnow()
    year, month = now.year, now.month
    trend_points = []
    for i in range(5, -1, -1):
        y, m = year, month - i
        while m <= 0:
            m += 12
            y -= 1
        start = datetime(y, m, 1)
        end = datetime(y + 1, 1, 1) if m == 12 else datetime(y, m + 1, 1)
        candidates_count = role_base.filter(
            CandidateRole.generated_on >= start, CandidateRole.generated_on < end
        ).count()
        published_count = role_base.filter(
            CandidateRole.published_at.isnot(None),
            CandidateRole.published_at >= start, CandidateRole.published_at < end
        ).count()
        trend_points.append(MiningTrendPoint(
            month=start.strftime("%b"), candidates=candidates_count, published=published_count
        ))

    res = DashboardStatsResponse(
        totalUsers=total_users,
        accounts=accounts,
        applications=applications,
        entitlements=entitlements,
        candidateRoles=candidate_roles,
        publishedRoles=published_roles,
        birthrightRoles=birthright_roles,
        sodConflicts=sod_conflicts,
        pendingApprovals=pending_approvals,
        notClassifiedRoles=not_classified_roles,
        pendingExceptions=pending_exceptions,
        departmentCoverage=department_coverage,
        riskDistribution=risk_distribution,
        applicationDistribution=application_distribution,
        roleLifecycle=role_lifecycle,
        miningTrend=trend_points
    )
    cache_set("dashboard_stats", res, ttl_seconds=120)
    return res

@router.get("/recent-activities", response_model=List[RecentActivityResponse])
def get_recent_activities(db: Session = Depends(get_db)):
    # Real audit trail (the same table Audit Logs reads) instead of the
    # separate "recent_activity" table that only the legacy upload endpoint
    # below ever wrote to.
    cached = cache_get("recent_activities")
    if cached:
        return cached

    logs = db.query(AuditLog).order_by(AuditLog.timestamp.desc()).limit(15).all()
    activities = [
        RecentActivityResponse(
            id=log.id,
            user=log.performed_by,
            action=f"{log.module} - {log.action}" if log.module else log.action,
            status="success",
            created_at=log.timestamp
        )
        for log in logs
    ]
    cache_set("recent_activities", activities, ttl_seconds=60)
    return activities

@router.get("/approval-queue", response_model=List[ApprovalQueueResponse])
def get_approval_queue(db: Session = Depends(get_db)):
    # Real, in-flight approval requests (same pipeline Business/Security
    # Approval act on) instead of the separate "approval_queue" table that
    # nothing in the actual workflow ever populates.
    cached = cache_get("approval_queue")
    if cached:
        return cached

    now = datetime.utcnow()
    rows = db.query(ApprovalRequest, CandidateRole).join(
        CandidateRole, ApprovalRequest.candidate_role_id == CandidateRole.id
    ).filter(
        ApprovalRequest.status.in_(["Submitted", "Business Review", "Security Review"])
    ).all()

    queue = [
        ApprovalQueueResponse(
            id=req.id,
            role_name=role.role_name,
            requester=req.submitted_by,
            due_in_days=(req.due_date - now).days if req.due_date else 0,
            risk_level=(role.risk_level or "Low").lower()
        )
        for req, role in rows
    ]
    queue.sort(key=lambda item: item.due_in_days)
    cache_set("approval_queue", queue, ttl_seconds=60)
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
    from app.cache import cache_clear
    cache_clear()

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

