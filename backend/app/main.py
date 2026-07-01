from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.database import engine, Base, SessionLocal
from app.routes import dashboard, notification, profile, theme
from app.models.user import User
from app.models.notification import Notification
from app.models.dashboard import RecentActivity, IdentityRecord, ApprovalQueueItem
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

@app.get("/")
def read_root():
    return {"message": "Welcome to rAnalyzer backend API"}
