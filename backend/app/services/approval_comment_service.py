from sqlalchemy.orm import Session
from datetime import datetime
from typing import Dict, List

from app.models.approval_request import ApprovalRequest
from app.models.approval_comment import ApprovalComment
from app.models.dashboard import RecentActivity
from app.models.notification import Notification
from app.models.audit_log import AuditLog


class ApprovalCommentService:

    @staticmethod
    def add_comment(db: Session, request_id: int, user: str, user_role: str, comment_text: str) -> Dict:
        """
        Adds a comment to an approval request's discussion thread (APR-004).
        Any authenticated user can comment — there's no reviewer-only gate here,
        since comments are meant to be an open discussion channel (unlike the
        mandatory approve/reject/return remarks, which stay reviewer-gated).
        """
        if not comment_text or not comment_text.strip():
            raise ValueError("Comment text cannot be empty")

        request = db.query(ApprovalRequest).filter(ApprovalRequest.id == request_id).first()
        if not request:
            raise ValueError(f"Approval request {request_id} not found")

        now = datetime.utcnow()
        comment = ApprovalComment(
            approval_request_id=request_id,
            comment_text=comment_text.strip(),
            commented_by=user,
            commented_by_role=user_role,
            created_at=now
        )
        db.add(comment)

        db.add(RecentActivity(
            user=user,
            action=f"Commented on approval request #{request_id}",
            status="info",
            created_at=now
        ))

        # Notify — anyone watching the request should hear about new discussion activity.
        db.add(Notification(
            title=f"New Comment on Request #{request_id}",
            message=f"{user} commented: \"{comment_text.strip()[:120]}\"",
            status="unread",
            created_at=now
        ))

        try:
            db.commit()
        except Exception:
            db.rollback()
            raise
        db.refresh(comment)

        return {
            "id": comment.id,
            "approval_request_id": comment.approval_request_id,
            "comment_text": comment.comment_text,
            "commented_by": comment.commented_by,
            "commented_by_role": comment.commented_by_role,
            "created_at": comment.created_at.isoformat() if comment.created_at else None
        }

    @staticmethod
    def get_comments(db: Session, request_id: int) -> List[Dict]:
        """Returns all comments for a request, oldest first (chat-thread order)."""
        request = db.query(ApprovalRequest).filter(ApprovalRequest.id == request_id).first()
        if not request:
            raise ValueError(f"Approval request {request_id} not found")

        comments = db.query(ApprovalComment).filter(
            ApprovalComment.approval_request_id == request_id
        ).order_by(ApprovalComment.created_at.asc()).all()

        return [
            {
                "id": c.id,
                "approval_request_id": c.approval_request_id,
                "comment_text": c.comment_text,
                "commented_by": c.commented_by,
                "commented_by_role": c.commented_by_role,
                "created_at": c.created_at.isoformat() if c.created_at else None
            }
            for c in comments
        ]

    @staticmethod
    def delete_comment(db: Session, comment_id: int, user: str, user_role: str) -> Dict:
        """Deletes a comment. Only the original author or a Platform Admin can delete."""
        comment = db.query(ApprovalComment).filter(ApprovalComment.id == comment_id).first()
        if not comment:
            raise ValueError(f"Comment {comment_id} not found")

        if user_role != "Platform Administrator" and comment.commented_by != user:
            raise ValueError("Only the comment author or a Platform Admin can delete this comment")

        request_id = comment.approval_request_id
        comment_text = comment.comment_text
        db.delete(comment)

        # Deleting a comment previously left no trail at all - adding one
        # left one (RecentActivity + Notification), which was inconsistent.
        import json
        db.add(AuditLog(
            module="Approval Workflow",
            action="Delete Comment",
            performed_by=user,
            old_value=json.dumps({"approval_request_id": request_id, "comment_text": comment_text})
        ))

        db.commit()
        return {"status": "success", "message": "Comment deleted"}
