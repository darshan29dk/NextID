from sqlalchemy import Column, Integer, String, DateTime
from datetime import datetime
from app.database import Base

class DashboardStats(Base):
    __tablename__ = "dashboard_stats"

    id = Column(Integer, primary_key=True, index=True)
    total_users = Column(Integer, default=0) # Identities
    accounts = Column(Integer, default=0)
    applications = Column(Integer, default=0)
    entitlements = Column(Integer, default=0)
    candidate_roles = Column(Integer, default=0)
    published_roles = Column(Integer, default=0)
    birthright_roles = Column(Integer, default=0)
    sod_conflicts = Column(Integer, default=0) # SoD Violations
    pending_approvals = Column(Integer, default=0)

class RecentActivity(Base):
    __tablename__ = "recent_activity"

    id = Column(Integer, primary_key=True, index=True)
    user = Column(String(100), nullable=False)
    action = Column(String(255), nullable=False)
    status = Column(String(50), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

class IdentityRecord(Base):
    __tablename__ = "identity_records"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(100), nullable=False)
    email = Column(String(100), nullable=False)
    department = Column(String(100), nullable=False)
    role = Column(String(100), nullable=True)
    applications = Column(String(255), nullable=False)  # Comma-separated list
    entitlements_count = Column(Integer, default=0)
    risk_level = Column(String(50), default="Low")  # Low, Medium, High, Critical
    sod_conflict = Column(Integer, default=0)  # 0 = False, 1 = True

class ApprovalQueueItem(Base):
    __tablename__ = "approval_queue"

    id = Column(Integer, primary_key=True, index=True)
    role_name = Column(String(100), nullable=False)
    requester = Column(String(100), nullable=False)
    due_in_days = Column(Integer, nullable=False)
    risk_level = Column(String(50), nullable=False)  # low, medium, high, critical

