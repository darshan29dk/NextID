from sqlalchemy import Column, Integer, String, DateTime, Text, ForeignKey
from datetime import datetime
from app.database import Base


class ApprovalComment(Base):
    """
    ApprovalComment stores discussion/remarks posted against an ApprovalRequest,
    separate from the mandatory step remarks (approve/reject/return reasons).
    Lets submitters, owners, and security reviewers converse on a request (APR-004).
    """
    __tablename__ = "approval_comments"

    id = Column(Integer, primary_key=True, index=True)
    approval_request_id = Column(Integer, ForeignKey("approval_requests.id"), index=True, nullable=False)

    comment_text = Column(Text, nullable=False)
    commented_by = Column(String(200), nullable=False)
    commented_by_role = Column(String(50), nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
