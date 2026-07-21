from fastapi import APIRouter, Depends, HTTPException, Header, Query, status as http_status
from sqlalchemy.orm import Session
from typing import Optional, List
from pydantic import BaseModel

from app.database import get_db
from app.utils.permissions import require_permission
from app.services.approval_workflow_service import ApprovalWorkflowService
from app.services.business_approval_service import BusinessApprovalService
from app.services.security_approval_service import SecurityApprovalService
from app.services.approval_comment_service import ApprovalCommentService

router = APIRouter(prefix="/approval")


class SubmitRoleRequest(BaseModel):
    candidate_role_id: int
    priority: Optional[str] = "Medium"
    remarks: Optional[str] = None


class ActionRequest(BaseModel):
    remarks: Optional[str] = None


class BulkActionRequest(BaseModel):
    request_ids: List[int]
    remarks: Optional[str] = None


class CommentRequest(BaseModel):
    comment_text: str


# ─────────────────────────────────────────────────────────────────────────────
# APR-001 Submit Role API
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/submit", status_code=201)
def submit_role(
    payload: SubmitRoleRequest,
    db: Session = Depends(get_db),
    x_user_name: str = Header(default="System"),
    _perm: bool = Depends(require_permission("Role Engineering", "edit"))
):
    """
    Submits a candidate role for Business Owner approval review.
    """
    try:
        return ApprovalWorkflowService.submit_role(
            db=db,
            role_id=payload.candidate_role_id,
            priority=payload.priority,
            remarks=payload.remarks,
            user=x_user_name
        )
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ─────────────────────────────────────────────────────────────────────────────
# Retrieval APIs
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/requests")
def get_approval_requests(
    page: int = 1,
    limit: int = 10,
    search: Optional[str] = None,
    status: Optional[str] = None,
    priority: Optional[str] = None,
    submitted_by: Optional[str] = None,
    sort_by: Optional[str] = None,
    sort_order: Optional[str] = "desc",
    db: Session = Depends(get_db),
    _perm: bool = Depends(require_permission("Role Engineering", "view"))
):
    """
    Fetches list of all approval requests with search, pagination, and sorting.
    """
    try:
        return ApprovalWorkflowService.get_approval_requests(
            db=db,
            page=page,
            limit=limit,
            search=search,
            status=status,
            priority=priority,
            submitted_by=submitted_by,
            sort_by=sort_by,
            sort_order=sort_order
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/requests/{request_id}")
def get_approval_request_by_id(
    request_id: int,
    db: Session = Depends(get_db),
    _perm: bool = Depends(require_permission("Role Engineering", "view"))
):
    """
    Retrieves full detail configuration and steps timeline for a request.
    """
    try:
        return ApprovalWorkflowService.get_approval_request_by_id(db, request_id)
    except ValueError as ve:
        raise HTTPException(status_code=404, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ─────────────────────────────────────────────────────────────────────────────
# APR-002 Business Review Approval APIs
# ─────────────────────────────────────────────────────────────────────────────

@router.put("/business/{request_id}/approve")
def approve_request(
    request_id: int,
    payload: ActionRequest,
    db: Session = Depends(get_db),
    x_user_name: str = Header(default="System"),
    x_user_role: str = Header(default="Business Owner"),
    _perm: bool = Depends(require_permission("Role Engineering", "edit"))
):
    """Business owner approves the candidate role request."""
    try:
        return BusinessApprovalService.approve_request(
            db=db,
            request_id=request_id,
            user=x_user_name,
            role=x_user_role,
            remarks=payload.remarks
        )
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/business/{request_id}/reject")
def reject_request(
    request_id: int,
    payload: ActionRequest,
    db: Session = Depends(get_db),
    x_user_name: str = Header(default="System"),
    x_user_role: str = Header(default="Business Owner"),
    _perm: bool = Depends(require_permission("Role Engineering", "edit"))
):
    """Business owner rejects the candidate role request."""
    try:
        return BusinessApprovalService.reject_request(
            db=db,
            request_id=request_id,
            user=x_user_name,
            role=x_user_role,
            remarks=payload.remarks
        )
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/business/{request_id}/return")
def return_request(
    request_id: int,
    payload: ActionRequest,
    db: Session = Depends(get_db),
    x_user_name: str = Header(default="System"),
    x_user_role: str = Header(default="Business Owner"),
    _perm: bool = Depends(require_permission("Role Engineering", "edit"))
):
    """Business owner returns the request for draft rework."""
    try:
        return BusinessApprovalService.return_request(
            db=db,
            request_id=request_id,
            user=x_user_name,
            role=x_user_role,
            remarks=payload.remarks
        )
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/requests/{request_id}/cancel")
def cancel_submission(
    request_id: int,
    db: Session = Depends(get_db),
    x_user_name: str = Header(default="System"),
    x_user_role: str = Header(default="Role Engineer"),
    _perm: bool = Depends(require_permission("Role Engineering", "edit"))
):
    """Cancels a pending approval request."""
    try:
        return BusinessApprovalService.cancel_submission(
            db=db,
            request_id=request_id,
            user=x_user_name,
            role=x_user_role
        )
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ─────────────────────────────────────────────────────────────────────────────
# Bulk Action APIs
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/business/bulk/approve")
def bulk_approve(
    payload: BulkActionRequest,
    db: Session = Depends(get_db),
    x_user_name: str = Header(default="System"),
    x_user_role: str = Header(default="Business Owner"),
    _perm: bool = Depends(require_permission("Role Engineering", "edit"))
):
    try:
        return BusinessApprovalService.bulk_approve(
            db=db,
            request_ids=payload.request_ids,
            user=x_user_name,
            role=x_user_role,
            remarks=payload.remarks
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/business/bulk/reject")
def bulk_reject(
    payload: BulkActionRequest,
    db: Session = Depends(get_db),
    x_user_name: str = Header(default="System"),
    x_user_role: str = Header(default="Business Owner"),
    _perm: bool = Depends(require_permission("Role Engineering", "edit"))
):
    try:
        return BusinessApprovalService.bulk_reject(
            db=db,
            request_ids=payload.request_ids,
            user=x_user_name,
            role=x_user_role,
            remarks=payload.remarks
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/business/bulk/return")
def bulk_return(
    payload: BulkActionRequest,
    db: Session = Depends(get_db),
    x_user_name: str = Header(default="System"),
    x_user_role: str = Header(default="Business Owner"),
    _perm: bool = Depends(require_permission("Role Engineering", "edit"))
):
    try:
        return BusinessApprovalService.bulk_return(
            db=db,
            request_ids=payload.request_ids,
            user=x_user_name,
            role=x_user_role,
            remarks=payload.remarks
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ─────────────────────────────────────────────────────────────────────────────
# APR-003 Security Approval APIs
# ─────────────────────────────────────────────────────────────────────────────


@router.get("/security/kpi")
def get_security_kpi(
    db: Session = Depends(get_db),
    _perm: bool = Depends(require_permission("Role Engineering", "view"))
):
    """Returns KPI counts (pending, approved, rejected, returned, ready_for_publish)."""
    try:
        return SecurityApprovalService.get_kpi_counts(db)
    except Exception as e:
        raise HTTPException(status_code=http_status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


@router.get("/security")
def get_security_requests(
    page: int = 1,
    limit: int = 10,
    search: Optional[str] = None,
    status: Optional[str] = None,
    priority: Optional[str] = None,
    db: Session = Depends(get_db),
    _perm: bool = Depends(require_permission("Role Engineering", "view"))
):
    """Returns paginated Security Review requests."""
    try:
        return SecurityApprovalService.get_security_requests(
            db=db, page=page, limit=limit, search=search, status=status, priority=priority
        )
    except Exception as e:
        raise HTTPException(status_code=http_status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


@router.get("/security/{request_id}")
def get_security_request_by_id(
    request_id: int,
    db: Session = Depends(get_db),
    _perm: bool = Depends(require_permission("Role Engineering", "view"))
):
    """Returns full detail for a single approval request at the security stage."""
    try:
        return SecurityApprovalService.get_security_request_by_id(db, request_id)
    except ValueError as ve:
        raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=http_status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


@router.put("/security/{request_id}/approve")
def security_approve(
    request_id: int,
    payload: ActionRequest,
    db: Session = Depends(get_db),
    x_user_name: str = Header(default="System"),
    x_user_role: str = Header(default="Security Administrator"),
    _perm: bool = Depends(require_permission("Role Engineering", "approve"))
):
    """Security Approver approves the request. Transitions role to Ready For Publish."""
    try:
        return SecurityApprovalService.approve_request(
            db=db, request_id=request_id, user=x_user_name,
            user_role=x_user_role, remarks=payload.remarks
        )
    except PermissionError as pe:
        raise HTTPException(status_code=http_status.HTTP_403_FORBIDDEN, detail=str(pe))
    except ValueError as ve:
        raise HTTPException(status_code=http_status.HTTP_400_BAD_REQUEST, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=http_status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


@router.put("/security/{request_id}/reject")
def security_reject(
    request_id: int,
    payload: ActionRequest,
    db: Session = Depends(get_db),
    x_user_name: str = Header(default="System"),
    x_user_role: str = Header(default="Security Administrator"),
    _perm: bool = Depends(require_permission("Role Engineering", "approve"))
):
    """Security Approver rejects the request. Remarks are mandatory."""
    try:
        return SecurityApprovalService.reject_request(
            db=db, request_id=request_id, user=x_user_name,
            user_role=x_user_role, remarks=payload.remarks
        )
    except PermissionError as pe:
        raise HTTPException(status_code=http_status.HTTP_403_FORBIDDEN, detail=str(pe))
    except ValueError as ve:
        raise HTTPException(status_code=http_status.HTTP_400_BAD_REQUEST, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=http_status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


@router.put("/security/{request_id}/return")
def security_return(
    request_id: int,
    payload: ActionRequest,
    db: Session = Depends(get_db),
    x_user_name: str = Header(default="System"),
    x_user_role: str = Header(default="Security Administrator"),
    _perm: bool = Depends(require_permission("Role Engineering", "approve"))
):
    """Security Approver returns the request for rework. Remarks are mandatory."""
    try:
        return SecurityApprovalService.return_request(
            db=db, request_id=request_id, user=x_user_name,
            user_role=x_user_role, remarks=payload.remarks
        )
    except PermissionError as pe:
        raise HTTPException(status_code=http_status.HTTP_403_FORBIDDEN, detail=str(pe))
    except ValueError as ve:
        raise HTTPException(status_code=http_status.HTTP_400_BAD_REQUEST, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=http_status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


# ─────────────────────────────────────────────────────────────────────────────
# APR-004 Approval Comments APIs
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/requests/{request_id}/comments")
def get_comments(
    request_id: int,
    db: Session = Depends(get_db),
    _perm: bool = Depends(require_permission("Role Engineering", "view"))
):
    """Returns all discussion comments for an approval request, oldest first."""
    try:
        return ApprovalCommentService.get_comments(db, request_id)
    except ValueError as ve:
        raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=http_status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


@router.post("/requests/{request_id}/comments", status_code=201)
def add_comment(
    request_id: int,
    payload: CommentRequest,
    db: Session = Depends(get_db),
    x_user_name: str = Header(default="System"),
    x_user_role: str = Header(default="Role Engineer"),
    _perm: bool = Depends(require_permission("Role Engineering", "edit"))
):
    """Posts a new comment to an approval request's discussion thread."""
    try:
        return ApprovalCommentService.add_comment(
            db=db, request_id=request_id, user=x_user_name,
            user_role=x_user_role, comment_text=payload.comment_text
        )
    except ValueError as ve:
        raise HTTPException(status_code=http_status.HTTP_400_BAD_REQUEST, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=http_status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


@router.delete("/comments/{comment_id}")
def delete_comment(
    comment_id: int,
    db: Session = Depends(get_db),
    x_user_name: str = Header(default="System"),
    x_user_role: str = Header(default="Role Engineer"),
    _perm: bool = Depends(require_permission("Role Engineering", "edit"))
):
    """Deletes a comment. Author or Platform Admin only."""
    try:
        return ApprovalCommentService.delete_comment(
            db=db, comment_id=comment_id, user=x_user_name, user_role=x_user_role
        )
    except ValueError as ve:
        raise HTTPException(status_code=http_status.HTTP_400_BAD_REQUEST, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=http_status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))

