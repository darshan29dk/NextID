import uuid
from sqlalchemy import Column, String, Text, DateTime, ForeignKey, Integer, Boolean
from sqlalchemy.orm import relationship
from datetime import datetime
from app.database import Base

class SodViolation(Base):
    __tablename__ = "sod_violations"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()), index=True)
    policy_id = Column(String(36), ForeignKey("sod_policies.id"), nullable=False, index=True)
    policy_code = Column(String(50), nullable=False)
    policy_name = Column(String(200), nullable=False)
    
    user_id = Column(Integer, ForeignKey("identities.id"), nullable=False, index=True)
    username = Column(String(150), nullable=False)
    display_name = Column(String(150), nullable=True)
    department = Column(String(100), nullable=True)
    manager = Column(String(150), nullable=True)
    
    application_name = Column(String(100), nullable=False)
    entitlement_one = Column(String(100), nullable=False)
    entitlement_two = Column(String(100), nullable=False)
    
    risk_level = Column(String(20), nullable=False, default="LOW")  # LOW, MEDIUM, HIGH, CRITICAL
    severity = Column(String(20), nullable=False, default="LOW")  # LOW, MEDIUM, HIGH, CRITICAL
    status = Column(String(30), nullable=False, default="OPEN")  # OPEN, UNDER_REVIEW, MITIGATED, EXCEPTION_APPROVED, CLOSED
    
    detected_date = Column(DateTime, default=datetime.utcnow, nullable=False)
    resolved_date = Column(DateTime, nullable=True)
    resolved_by = Column(String(100), nullable=True)
    remarks = Column(Text, nullable=True)
    scan_id = Column(Integer, nullable=True)
    
    # 15 Improvements specific fields
    assigned_to = Column(String(100), nullable=True)
    risk_score = Column(Integer, default=0, nullable=False)
    is_false_positive = Column(Boolean, default=False, nullable=False)
    false_positive_reason = Column(Text, nullable=True)
    evidence = Column(Text, nullable=True)  # Stores JSON structures of conflict details
    
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    policy = relationship("SodPolicy", backref="violations")
    user = relationship("Identity", backref="sod_violations")
    comments = relationship("SodViolationComment", back_populates="violation", cascade="all, delete-orphan")
    attachments = relationship("SodViolationAttachment", back_populates="violation", cascade="all, delete-orphan")

class SodViolationComment(Base):
    __tablename__ = "sod_violation_comments"

    id = Column(Integer, primary_key=True, index=True)
    violation_id = Column(String(36), ForeignKey("sod_violations.id"), nullable=False)
    comment_text = Column(Text, nullable=False)
    created_by = Column(String(100), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    violation = relationship("SodViolation", back_populates="comments")

class SodViolationAttachment(Base):
    __tablename__ = "sod_violation_attachments"

    id = Column(Integer, primary_key=True, index=True)
    violation_id = Column(String(36), ForeignKey("sod_violations.id"), nullable=False)
    filename = Column(String(255), nullable=False)
    file_size = Column(Integer, nullable=False)
    uploaded_by = Column(String(100), nullable=False)
    uploaded_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    violation = relationship("SodViolation", back_populates="attachments")

class SodScanHistory(Base):
    __tablename__ = "sod_scan_history"

    id = Column(Integer, primary_key=True, index=True)
    scan_name = Column(String(150), nullable=False)
    scan_type = Column(String(20), nullable=False, default="FULL")  # FULL, INCREMENTAL
    started_by = Column(String(100), nullable=False, default="System")
    start_time = Column(DateTime, default=datetime.utcnow, nullable=False)
    end_time = Column(DateTime, nullable=True)
    
    total_users = Column(Integer, default=0, nullable=False)
    users_scanned = Column(Integer, default=0, nullable=False)
    violations_found = Column(Integer, default=0, nullable=False)
    status = Column(String(20), nullable=False, default="RUNNING")  # RUNNING, COMPLETED, FAILED
    
    # Progress tracking
    progress_pct = Column(Integer, default=0, nullable=False)

class SodViolationAudit(Base):
    __tablename__ = "sod_violation_audit"

    id = Column(Integer, primary_key=True, index=True)
    violation_id = Column(String(36), ForeignKey("sod_violations.id", ondelete="CASCADE"), nullable=False)
    action = Column(String(100), nullable=False)  # Detection, Status Change, Comment Added, etc.
    performed_by = Column(String(100), nullable=False)
    old_value = Column(Text, nullable=True)
    new_value = Column(Text, nullable=True)
    timestamp = Column(DateTime, default=datetime.utcnow, nullable=False)

    violation = relationship("SodViolation", backref="audit_trail")
