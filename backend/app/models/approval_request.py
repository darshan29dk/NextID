from sqlalchemy import Column, Integer, String, DateTime, Text, Boolean, ForeignKey
from datetime import datetime
from app.database import Base


class ApprovalRequest(Base):
    """
    ApprovalRequest tracks the overall workflow of a submitted candidate role.
    It contains SLA due dates, escalation status, and current request state.

    Workflow stages:
    Draft → Submitted → Business Review → Business Approved →
    Security Review → Security Approved | Security Rejected | Returned For Rework →
    Ready For Publish
    """
    __tablename__ = "approval_requests"

    id = Column(Integer, primary_key=True, index=True)
    candidate_role_id = Column(Integer, ForeignKey("candidate_roles.id"), index=True, nullable=False)

    workflow_name = Column(String(150), default="Role Approval Workflow", nullable=False)
    current_stage = Column(String(100), default="Business Review", nullable=False)
    status = Column(String(100), default="Draft", nullable=False, index=True)

    submitted_by = Column(String(100), nullable=False)
    submitted_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)

    # SLA & Escalation
    due_date = Column(DateTime, nullable=True)
    is_escalated = Column(Boolean, default=False, nullable=False, index=True)
    escalated_at = Column(DateTime, nullable=True)

    priority = Column(String(50), default="Medium", nullable=False)
    remarks = Column(Text, nullable=True)

    # ── APR-003 Security Review fields ──────────────────────────────────────
    # These columns are added via check_and_add_columns() in main.py so that
    # existing deployments are upgraded safely without manual ALTER TABLE.
    security_review_started_at = Column(DateTime, nullable=True)
    security_review_completed_at = Column(DateTime, nullable=True)
    security_reviewer_id = Column(Integer, nullable=True)
    security_reviewer_name = Column(String(200), nullable=True)
    security_decision = Column(String(50), nullable=True)   # Approved | Rejected | Returned
    security_remarks = Column(Text, nullable=True)
    # ────────────────────────────────────────────────────────────────────────

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

