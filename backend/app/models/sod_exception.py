import uuid
from sqlalchemy import Column, String, Text, DateTime, ForeignKey, Integer, Boolean
from sqlalchemy.orm import relationship
from datetime import datetime
from app.database import Base

class SodException(Base):
    __tablename__ = "sod_exceptions"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()), index=True)
    exception_number = Column(String(50), unique=True, nullable=False, index=True)
    violation_id = Column(String(36), ForeignKey("sod_violations.id", ondelete="SET NULL"), nullable=True, index=True)
    policy_id = Column(String(36), ForeignKey("sod_policies.id"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("identities.id"), nullable=False, index=True)
    
    employee_id = Column(String(100), nullable=False)
    username = Column(String(150), nullable=False)
    department = Column(String(100), nullable=True)
    application_name = Column(String(100), nullable=False)
    exception_type = Column(String(20), nullable=False, default="TEMPORARY")  # TEMPORARY, PERMANENT
    
    business_justification = Column(Text, nullable=False)
    requested_by = Column(String(100), nullable=False)
    requested_date = Column(DateTime, default=datetime.utcnow, nullable=False)
    
    approved_by = Column(String(100), nullable=True)
    approved_date = Column(DateTime, nullable=True)
    reviewed_by = Column(String(100), nullable=True)
    review_date = Column(DateTime, nullable=True)
    
    status = Column(String(30), nullable=False, default="PENDING")  # PENDING, UNDER_REVIEW, APPROVED, REJECTED, EXPIRED, REVOKED, ACTIVE
    expiry_date = Column(DateTime, nullable=True)
    renewal_count = Column(Integer, default=0, nullable=False)
    risk_acceptance = Column(Boolean, default=False, nullable=False)
    compensating_controls = Column(Text, nullable=True)
    
    # SLA Tracking
    sla_due_date = Column(DateTime, nullable=True)
    is_sla_overdue = Column(Boolean, default=False, nullable=False)
    
    # Future AI Readiness
    ai_risk_score = Column(Integer, default=0, nullable=False)
    ai_recommendation = Column(Text, nullable=True)
    
    # Recertification Integration
    needs_recertification = Column(Boolean, default=False, nullable=False)
    next_recertification_date = Column(DateTime, nullable=True)
    
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    policy = relationship("SodPolicy", backref="exceptions")
    user = relationship("Identity", backref="exceptions")
    violation = relationship("SodViolation", backref="exceptions")
    approvals = relationship("SodExceptionApproval", back_populates="exception", cascade="all, delete-orphan")
    comments = relationship("SodExceptionComment", back_populates="exception", cascade="all, delete-orphan")
    attachments = relationship("SodExceptionAttachment", back_populates="exception", cascade="all, delete-orphan")

class SodExceptionApproval(Base):
    __tablename__ = "sod_exception_approvals"

    id = Column(Integer, primary_key=True, index=True)
    exception_id = Column(String(36), ForeignKey("sod_exceptions.id"), nullable=False)
    approver_name = Column(String(100), nullable=False)
    approval_level = Column(String(50), nullable=False)  # Manager Review, Governance Review, Security Approval
    approval_status = Column(String(30), nullable=False, default="PENDING")  # APPROVED, REJECTED, PENDING
    comments = Column(Text, nullable=True)
    approved_date = Column(DateTime, nullable=True)

    exception = relationship("SodException", back_populates="approvals")

class SodExceptionComment(Base):
    __tablename__ = "sod_exception_comments"

    id = Column(Integer, primary_key=True, index=True)
    exception_id = Column(String(36), ForeignKey("sod_exceptions.id"), nullable=False)
    comment = Column(Text, nullable=False)
    created_by = Column(String(100), nullable=False)
    created_date = Column(DateTime, default=datetime.utcnow, nullable=False)
    is_internal = Column(Boolean, default=False, nullable=False)

    exception = relationship("SodException", back_populates="comments")

class SodExceptionAttachment(Base):
    __tablename__ = "sod_exception_attachments"

    id = Column(Integer, primary_key=True, index=True)
    exception_id = Column(String(36), ForeignKey("sod_exceptions.id"), nullable=False)
    filename = Column(String(255), nullable=False)
    file_size = Column(Integer, nullable=False)
    uploaded_by = Column(String(100), nullable=False)
    uploaded_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    # Relative path under backend/uploads/ where the file bytes are actually
    # stored on disk. Added via check_and_add_columns() in main.py so that
    # existing deployments are upgraded safely without manual ALTER TABLE.
    file_path = Column(String(500), nullable=True)

    exception = relationship("SodException", back_populates="attachments")

class SodExceptionAudit(Base):
    __tablename__ = "sod_exception_audit"

    id = Column(Integer, primary_key=True, index=True)
    exception_id = Column(String(36), ForeignKey("sod_exceptions.id", ondelete="CASCADE"), nullable=False)
    action = Column(String(100), nullable=False)  # Request, Approval, Rejection, Renewal, Extension, Revocation, Expiry
    performed_by = Column(String(100), nullable=False)
    old_value = Column(Text, nullable=True)
    new_value = Column(Text, nullable=True)
    timestamp = Column(DateTime, default=datetime.utcnow, nullable=False)

    exception = relationship("SodException", backref="audit_trail")
