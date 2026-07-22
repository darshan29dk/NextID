from sqlalchemy import Column, Integer, String, DateTime, Text, Boolean, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime
from app.database import Base


class ApprovalWorkflowConfig(Base):
    """
    ApprovalWorkflowConfig stores the metadata and execution policy for approval workflows
    (e.g., Default all applications, Application-specific, or Workgroup-specific workflows).
    """
    __tablename__ = "approval_workflow_configs"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(150), nullable=False, index=True)
    scope = Column(String(100), default="Default — all applications", nullable=False, index=True)
    risk_level = Column(String(50), default="ALL", nullable=False, index=True)  # LOW, MEDIUM, HIGH, CRITICAL, ALL
    workflow_mode = Column(String(50), default="Unified", nullable=False)  # Unified, Lane
    description = Column(String(255), nullable=True)

    is_active = Column(Boolean, default=True, nullable=False, index=True)
    is_default = Column(Boolean, default=False, nullable=False)

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    created_by = Column(String(100), default="System", nullable=False)
    modified_by = Column(String(100), default="System", nullable=False)

    # Relationship to ordered levels
    levels = relationship("ApprovalWorkflowLevel", back_populates="workflow", cascade="all, delete-orphan", order_by="ApprovalWorkflowLevel.level_number")


class ApprovalWorkflowLevel(Base):
    """
    ApprovalWorkflowLevel represents a sequential level (L1, L2, L3...) inside an ApprovalWorkflowConfig.
    """
    __tablename__ = "approval_workflow_levels"

    id = Column(Integer, primary_key=True, index=True)
    workflow_id = Column(Integer, ForeignKey("approval_workflow_configs.id", ondelete="CASCADE"), index=True, nullable=False)

    level_number = Column(Integer, nullable=False, default=1)
    approver_type = Column(String(100), nullable=False, default="Manager of the user")
    # Options: "Manager of the user", "Application owner", "Role owner", "Specific Person", "Specific Group", "Workgroup Admin", "Security Admin", "Governance Admin"

    specific_approver_id = Column(Integer, nullable=True)
    specific_approver_name = Column(String(200), nullable=True)
    specific_approver_email = Column(String(200), nullable=True)

    timeout_hours = Column(Integer, default=48, nullable=False)
    quorum = Column(String(100), default="ALL — every resolved approver must approve", nullable=False)
    # Options: "ALL — every resolved approver must approve", "ANY — any single approver can approve"

    fallback_action = Column(String(150), default="No fallback — remind approver & alert admins", nullable=False)
    # Options: "No fallback — remind approver & alert admins", "Escalate to manager", "Auto-approve", "Auto-reject"

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    workflow = relationship("ApprovalWorkflowConfig", back_populates="levels")
