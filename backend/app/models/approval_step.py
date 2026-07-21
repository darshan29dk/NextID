from sqlalchemy import Column, Integer, String, DateTime, Text, ForeignKey
from datetime import datetime
from app.database import Base


class ApprovalStep(Base):
    """
    ApprovalStep tracks the detailed steps (e.g., Business Review) of an ApprovalRequest.
    """
    __tablename__ = "approval_steps"

    id = Column(Integer, primary_key=True, index=True)
    approval_request_id = Column(Integer, ForeignKey("approval_requests.id"), index=True, nullable=False)
    
    step_order = Column(Integer, default=1, nullable=False)
    step_name = Column(String(100), default="Business Review", nullable=False)
    
    approver_type = Column(String(50), default="Role Owner", nullable=False)
    approver_id = Column(Integer, nullable=True)  # PlatformUser.id
    approver_name = Column(String(200), nullable=True)  # PlatformUser.full_name
    
    status = Column(String(50), default="Pending", nullable=False, index=True)
    
    assigned_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    action_at = Column(DateTime, nullable=True)
    remarks = Column(Text, nullable=True)
