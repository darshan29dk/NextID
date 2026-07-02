from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.database import engine, Base, SessionLocal
from app.routes import dashboard, notification, profile, theme, platform_user, platform_role
from app.models.user import User
from app.models.notification import Notification
from app.models.dashboard import RecentActivity, IdentityRecord, ApprovalQueueItem, RoleRecord, RoleMiningTrendPoint
from app.models.platform_role import PlatformRole
from app.models.platform_user import PlatformUser
from app.models.audit_log import AuditLog
from datetime import datetime, timedelta

# Create database tables if they do not exist
Base.metadata.create_all(bind=engine)

# Seed database with sample data if tables are empty
db = SessionLocal()
try:
    # 1. Seed user if empty
    if db.query(User).count() == 0:
        default_user = User(
            name="Darshan Kumar",
            email="darshan.kumar@ranalyzer.io",
            role="Platform Administrator",
            profile_image=None,  # Initial setup falls back to initials
            theme="light"
        )
        db.add(default_user)
        db.commit()
        print("Seeded default user.")



    # 2c. Seed approval queue if empty
    if db.query(ApprovalQueueItem).count() == 0:
        approvals = [
            ApprovalQueueItem(role_name="Finance Controller v3", requester="David K.", due_in_days=3, risk_level="high"),
            ApprovalQueueItem(role_name="IT Admin - Add CyberArk", requester="Mike T.", due_in_days=1, risk_level="critical"),
            ApprovalQueueItem(role_name="SoD Exception: AP/AR - Emily", requester="David K.", due_in_days=2, risk_level="critical"),
            ApprovalQueueItem(role_name="Annual IT Admin Cert.", requester="Mike T.", due_in_days=7, risk_level="critical")
        ]
        db.add_all(approvals)
        db.commit()
        print("Seeded approval queue items.")

    # 3. Seed recent activity if empty
    if db.query(RecentActivity).count() == 0:
        activities = [
            RecentActivity(
                user="System",
                action="Role Published - Software Developer - Standard v3",
                status="success",
                created_at=datetime.utcnow() - timedelta(hours=2)
            ),
            RecentActivity(
                user="System",
                action="SoD Violation - AP/AR Conflict - John Smith",
                status="danger",
                created_at=datetime.utcnow() - timedelta(hours=6)
            ),
            RecentActivity(
                user="System",
                action="Mining Complete - Mining Run #47 - 5 candidates",
                status="info",
                created_at=datetime.utcnow() - timedelta(hours=12)
            ),
            RecentActivity(
                user="System",
                action="Approval Pending - Finance Controller v3",
                status="warning",
                created_at=datetime.utcnow() - timedelta(hours=8)
            ),
            RecentActivity(
                user="System",
                action="Certification Started - Q4 Finance Role Cert.",
                status="info",
                created_at=datetime.utcnow() - timedelta(days=1)
            )
        ]
        db.add_all(activities)
        db.commit()
        print("Seeded recent activities.")

    # 4. Seed notifications if empty
    if db.query(Notification).count() == 0:
        notifications = [
            Notification(
                title="Critical SoD Conflict",
                message="Accounts Payable and Accounts Receivable conflict detected for user John Smith.",
                status="unread",
                created_at=datetime.utcnow() - timedelta(hours=6)
            ),
            Notification(
                title="New Candidate Roles",
                message="Mining Run #47 generated 5 new candidate roles for review.",
                status="unread",
                created_at=datetime.utcnow() - timedelta(hours=12)
            ),
            Notification(
                title="Pending Approval",
                message="Role promotion 'Finance Controller v3' requires your approval.",
                status="unread",
                created_at=datetime.utcnow() - timedelta(hours=8)
            )
        ]
        db.add_all(notifications)
        db.commit()
        print("Seeded notifications.")

    # 5. Seed identity records if empty
    if db.query(IdentityRecord).count() == 0:
        identities = [
            IdentityRecord(username="john.smith", email="john.smith@ranalyzer.io", department="Finance", role="Finance Specialist", applications="Active Directory,Workday,Slack", entitlements_count=15, risk_level="High", sod_conflict=1),
            IdentityRecord(username="jane.doe", email="jane.doe@ranalyzer.io", department="Engineering", role="Software Engineer", applications="Active Directory,GitHub,Slack", entitlements_count=8, risk_level="Low", sod_conflict=0),
            IdentityRecord(username="bob.johnson", email="bob.johnson@ranalyzer.io", department="Sales", role="Sales Specialist", applications="Active Directory,Salesforce,Slack", entitlements_count=10, risk_level="Medium", sod_conflict=0),
            IdentityRecord(username="alice.williams", email="alice.williams@ranalyzer.io", department="HR", role="HR Specialist", applications="Active Directory,Workday,Slack", entitlements_count=6, risk_level="Low", sod_conflict=0),
            IdentityRecord(username="charlie.brown", email="charlie.brown@ranalyzer.io", department="Operations", role="Ops Specialist", applications="Active Directory,Workday,Slack", entitlements_count=7, risk_level="Medium", sod_conflict=0),
            IdentityRecord(username="david.miller", email="david.miller@ranalyzer.io", department="IT", role="IT Support", applications="Active Directory,Okta,Slack,Jira", entitlements_count=18, risk_level="High", sod_conflict=0),
            IdentityRecord(username="emily.davis", email="emily.davis@ranalyzer.io", department="Security", role="Security Analyst", applications="Active Directory,Okta,Slack,Splunk", entitlements_count=22, risk_level="Critical", sod_conflict=1),
            IdentityRecord(username="frank.wilson", email="frank.wilson@ranalyzer.io", department="Marketing", role="Marketer", applications="Active Directory,Slack,Google Analytics", entitlements_count=5, risk_level="Low", sod_conflict=0),
            IdentityRecord(username="grace.lee", email="grace.lee@ranalyzer.io", department="Engineering", role="DevOps Engineer", applications="Active Directory,GitHub,AWS,Slack", entitlements_count=14, risk_level="High", sod_conflict=0),
            IdentityRecord(username="henry.jones", email="henry.jones@ranalyzer.io", department="Finance", role="Accountant", applications="Active Directory,Workday,Slack", entitlements_count=12, risk_level="Medium", sod_conflict=0),
            IdentityRecord(username="ian.taylor", email="ian.taylor@ranalyzer.io", department="Engineering", role="Software Engineer", applications="Active Directory,GitHub,Slack", entitlements_count=9, risk_level="Low", sod_conflict=0),
            IdentityRecord(username="julia.moore", email="julia.moore@ranalyzer.io", department="Sales", role="Sales Specialist", applications="Active Directory,Salesforce,Slack", entitlements_count=11, risk_level="Medium", sod_conflict=0),
            IdentityRecord(username="kevin.thomas", email="kevin.thomas@ranalyzer.io", department="IT", role="Sysadmin", applications="Active Directory,Okta,AWS,Slack", entitlements_count=25, risk_level="Critical", sod_conflict=1),
            IdentityRecord(username="laura.jackson", email="laura.jackson@ranalyzer.io", department="HR", role="HR Specialist", applications="Active Directory,Workday,Slack", entitlements_count=5, risk_level="Low", sod_conflict=0),
            IdentityRecord(username="michael.white", email="michael.white@ranalyzer.io", department="Operations", role="Ops Manager", applications="Active Directory,Workday,Slack", entitlements_count=14, risk_level="High", sod_conflict=0),
            IdentityRecord(username="sarah.harris", email="sarah.harris@ranalyzer.io", department="Security", role="Security Engineer", applications="Active Directory,Okta,AWS,Slack,Splunk", entitlements_count=20, risk_level="High", sod_conflict=0),
        ]
        db.add_all(identities)
        db.commit()
        print("Seeded identities.")

    # 6. Seed roles if empty
    if db.query(RoleRecord).count() == 0:
        roles = [
            RoleRecord(name="Candidate: Jr. DevOps Developer", type="candidate", status="Draft", risk_level="Medium", department="Engineering"),
            RoleRecord(name="Candidate: Senior Accountant", type="candidate", status="Under Review", risk_level="High", department="Finance"),
            RoleRecord(name="Candidate: Inside Sales Lead", type="candidate", status="Draft", risk_level="Low", department="Sales"),
            RoleRecord(name="Candidate: Remote IT Analyst", type="candidate", status="Under Review", risk_level="Medium", department="IT"),
            RoleRecord(name="Candidate: Lead Security Auditor", type="candidate", status="Draft", risk_level="High", department="Security"),
            RoleRecord(name="Software Engineer", type="published", status="Active", risk_level="Low", department="Engineering"),
            RoleRecord(name="Finance Specialist", type="published", status="Active", risk_level="High", department="Finance"),
            RoleRecord(name="Sales Specialist", type="published", status="Active", risk_level="Medium", department="Sales"),
            RoleRecord(name="HR Specialist", type="published", status="Active", risk_level="Low", department="HR"),
            RoleRecord(name="Ops Specialist", type="published", status="Active", risk_level="Medium", department="Operations"),
            RoleRecord(name="IT Support", type="published", status="Active", risk_level="High", department="IT"),
            RoleRecord(name="Security Analyst", type="published", status="Active", risk_level="Critical", department="Security"),
            RoleRecord(name="Marketer", type="published", status="Active", risk_level="Low", department="Marketing"),
            RoleRecord(name="DevOps Engineer", type="published", status="Active", risk_level="High", department="Engineering"),
            RoleRecord(name="Accountant", type="published", status="Active", risk_level="Medium", department="Finance"),
            RoleRecord(name="Sysadmin", type="published", status="Active", risk_level="Critical", department="IT"),
            RoleRecord(name="Ops Manager", type="published", status="Active", risk_level="High", department="Operations"),
            RoleRecord(name="Security Engineer", type="published", status="Active", risk_level="High", department="Security"),
            RoleRecord(name="Old Software Engineer v1", type="published", status="Deprecated", risk_level="Low", department="Engineering"),
            RoleRecord(name="Default Domain User", type="birthright", status="Active", risk_level="Low", department="All"),
            RoleRecord(name="Basic Slack Access", type="birthright", status="Active", risk_level="Low", department="All")
        ]
        db.add_all(roles)
        db.commit()
        print("Seeded roles.")

    # 7. Seed trend points if empty
    if db.query(RoleMiningTrendPoint).count() == 0:
        trends = [
            RoleMiningTrendPoint(month="Jul", candidates=10, published=5),
            RoleMiningTrendPoint(month="Aug", candidates=15, published=7),
            RoleMiningTrendPoint(month="Sep", candidates=12, published=9),
            RoleMiningTrendPoint(month="Oct", candidates=22, published=12),
            RoleMiningTrendPoint(month="Nov", candidates=28, published=15),
            RoleMiningTrendPoint(month="Dec", candidates=32, published=18)
        ]
        db.add_all(trends)
        db.commit()
        print("Seeded mining trend points.")

    # 8. Seed platform roles if empty
    if db.query(PlatformRole).count() == 0:
        p_roles = [
            PlatformRole(
                role_code="PLAT_ADMIN",
                role_name="Platform Administrator",
                description="Full administrative control over all rAnalyzer settings and data.",
                role_type="System",
                risk_level="Critical",
                status="Active",
                approval_required=True,
                is_system_role=True,
                created_by="System",
                modified_by="System"
            ),
            PlatformRole(
                role_code="SEC_ADMIN",
                role_name="Security Administrator",
                description="Manage all system security configs, users, roles, and authorization policies.",
                role_type="System",
                risk_level="High",
                status="Active",
                approval_required=True,
                is_system_role=True,
                created_by="System",
                modified_by="System"
            ),
            PlatformRole(
                role_code="COMP_OFFICER",
                role_name="Compliance Officer",
                description="Perform SoD checks, view risk assessments, and publish candidate roles.",
                role_type="Business",
                risk_level="Medium",
                status="Active",
                approval_required=False,
                is_system_role=True,
                created_by="System",
                modified_by="System"
            ),
            PlatformRole(
                role_code="SEC_AUDITOR",
                role_name="Security Auditor",
                description="Read-only access to system configurations, logs, identity catalog, and reports.",
                role_type="System",
                risk_level="Low",
                status="Active",
                approval_required=False,
                is_system_role=True,
                created_by="System",
                modified_by="System"
            ),
            PlatformRole(
                role_code="READ_ONLY",
                role_name="Read Only User",
                description="Basic compliance metrics dashboard viewer access. No edits allowed.",
                role_type="Shared",
                risk_level="Low",
                status="Active",
                approval_required=False,
                is_system_role=True,
                created_by="System",
                modified_by="System"
            )
        ]
        db.add_all(p_roles)
        db.commit()
        print("Seeded default platform roles.")

except Exception as e:
    print(f"Error seeding database: {e}")
finally:
    db.close()

app = FastAPI(title="rAnalyzer API", version="1.0.0")

# Setup CORS to allow cross-origin requests from the React frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register endpoints
app.include_router(dashboard.router, prefix="/api")
app.include_router(notification.router, prefix="/api")
app.include_router(profile.router, prefix="/api")
app.include_router(theme.router, prefix="/api")
app.include_router(platform_user.router, prefix="/api")
app.include_router(platform_role.router, prefix="/api")

@app.get("/")
def read_root():
    return {"message": "Welcome to rAnalyzer backend API"}
