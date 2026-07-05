from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.database import engine, Base, SessionLocal
from app.routes import dashboard, notification, profile, theme, platform_user, platform_role, auth, audit_log, platform_settings
from app.routes import license as license_routes
from app.models.user import User
from app.models.notification import Notification
from app.models.dashboard import RecentActivity, IdentityRecord, ApprovalQueueItem, RoleRecord, RoleMiningTrendPoint
from app.models.platform_role import PlatformRole
from app.models.platform_user import PlatformUser
from app.models.audit_log import AuditLog
from app.models.license import License
from datetime import datetime

# Create database tables if they do not exist
Base.metadata.create_all(bind=engine)

# Seed only essential system data on first startup
db = SessionLocal()
try:
    # 1. Seed default login user if none exists
    if db.query(User).count() == 0:
        default_user = User(
            name="Darshan Kumar",
            email="darshan.kumar@ranalyzer.io",
            role="Platform Administrator",
            profile_image=None,
            theme="light"
        )
        db.add(default_user)
        db.commit()
        print("Seeded default user.")

    # 2. Seed platform roles if empty, or update descriptions if they differ
    default_platform_roles = [
        ("PLAT_ADMIN", "Platform Administrator", "Full access to the application", "System", "Critical", True, True),
        ("SEC_ADMIN", "Security Administrator", "Manages users, roles, and security settings", "System", "High", True, True),
        ("COMP_OFFICER", "Compliance Officer", "Reviews governance and compliance", "Business", "Medium", False, True),
        ("SEC_AUDITOR", "Security Auditor", "Read-only access to reports and audit logs", "System", "Low", False, True),
        ("READ_ONLY", "Read Only User", "Can only view dashboards", "Shared", "Low", False, True)
    ]

    if db.query(PlatformRole).count() == 0:
        p_roles = []
        for code, name, desc, r_type, risk, approval, is_sys in default_platform_roles:
            p_roles.append(PlatformRole(
                role_code=code,
                role_name=name,
                description=desc,
                role_type=r_type,
                risk_level=risk,
                status="Active",
                approval_required=approval,
                is_system_role=is_sys,
                created_by="System",
                modified_by="System"
            ))
        db.add_all(p_roles)
        db.commit()
        print("Seeded default platform roles.")
    else:
        for code, name, desc, r_type, risk, approval, is_sys in default_platform_roles:
            role = db.query(PlatformRole).filter(PlatformRole.role_code == code).first()
            if role:
                if role.description != desc or role.role_name != name:
                    role.role_name = name
                    role.description = desc
                    role.role_type = r_type
                    role.risk_level = risk
                    role.approval_required = approval
                    role.is_system_role = is_sys
                    db.commit()
                    print(f"Updated default platform role: {code}")

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
app.include_router(auth.router, prefix="/api")
app.include_router(platform_settings.router, prefix="/api")
app.include_router(audit_log.router, prefix="/api")
app.include_router(license_routes.router, prefix="/api")

@app.get("/")
def read_root():
    return {"message": "Welcome to rAnalyzer backend API"}