from fastapi import APIRouter, Depends, HTTPException, Header
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional, List
from sqlalchemy import or_

from app.database import get_db
from app.models.application_account import ApplicationAccount
from app.models.identity import Identity
from app.models.application import Application
from app.models.correlation_rule import CorrelationRule
from app.models.audit_log import AuditLog
from app.services.correlation_engine import CorrelationEngine
from app.utils.permissions import require_permission

router = APIRouter()


def write_correlation_audit(db: Session, user: str, action: str, old_val: dict = None, new_val: dict = None):
    """Correlation Workspace (rules + review queue + manual link/unlink)
    previously wrote nothing to the Audit Log at all."""
    import json
    try:
        audit = AuditLog(
            module="Correlation Workspace",
            action=action,
            performed_by=user,
            old_value=json.dumps(old_val, default=str) if old_val else None,
            new_value=json.dumps(new_val, default=str) if new_val else None,
        )
        db.add(audit)
        db.commit()
    except Exception as e:
        print(f"Warning: Failed to write correlation audit record: {e}")

# Schema models
class ManualLinkRequest(BaseModel):
    account_id: int
    identity_id: int

class ManualUnlinkRequest(BaseModel):
    account_id: int

class CorrelationRuleCreate(BaseModel):
    rule_name: str
    identity_attribute: str
    account_attribute: str
    match_type: str = "Exact"  # "Exact", "Partial"
    confidence_score: int = 100
    is_active: bool = True

class ApproveRequest(BaseModel):
    account_ids: List[int]

class RejectRequest(BaseModel):
    account_ids: List[int]


# Rules CRUD Endpoints
@router.get("/correlation/rules")
def get_correlation_rules(
    db: Session = Depends(get_db),
    _perm: bool = Depends(require_permission("Identity Repository", "view"))
):
    """Lists all matching rules."""
    rules = db.query(CorrelationRule).order_by(CorrelationRule.id.asc()).all()
    return {"rules": rules}

@router.post("/correlation/rules")
def create_correlation_rule(
    payload: CorrelationRuleCreate,
    db: Session = Depends(get_db),
    x_user_name: str = Header(default="System"),
    _perm: bool = Depends(require_permission("Identity Repository", "edit"))
):
    """Creates a new custom matching rule."""
    rule = CorrelationRule(
        rule_name=payload.rule_name,
        identity_attribute=payload.identity_attribute,
        account_attribute=payload.account_attribute,
        match_type=payload.match_type,
        confidence_score=payload.confidence_score,
        is_active=payload.is_active
    )
    db.add(rule)
    db.commit()
    db.refresh(rule)
    write_correlation_audit(db, x_user_name, "Create Rule", new_val={"rule_name": rule.rule_name, "identity_attribute": rule.identity_attribute, "account_attribute": rule.account_attribute})
    return rule

@router.put("/correlation/rules/{id}")
def update_correlation_rule(
    id: int,
    payload: CorrelationRuleCreate,
    db: Session = Depends(get_db),
    x_user_name: str = Header(default="System"),
    _perm: bool = Depends(require_permission("Identity Repository", "edit"))
):
    """Updates an existing matching rule."""
    rule = db.query(CorrelationRule).filter(CorrelationRule.id == id).first()
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")

    old_state = {"rule_name": rule.rule_name, "identity_attribute": rule.identity_attribute, "account_attribute": rule.account_attribute, "match_type": rule.match_type, "confidence_score": rule.confidence_score, "is_active": rule.is_active}

    rule.rule_name = payload.rule_name
    rule.identity_attribute = payload.identity_attribute
    rule.account_attribute = payload.account_attribute
    rule.match_type = payload.match_type
    rule.confidence_score = payload.confidence_score
    rule.is_active = payload.is_active

    db.commit()
    db.refresh(rule)
    new_state = {"rule_name": rule.rule_name, "identity_attribute": rule.identity_attribute, "account_attribute": rule.account_attribute, "match_type": rule.match_type, "confidence_score": rule.confidence_score, "is_active": rule.is_active}
    write_correlation_audit(db, x_user_name, "Update Rule", old_val=old_state, new_val=new_state)
    return rule

@router.delete("/correlation/rules/{id}")
def delete_correlation_rule(
    id: int,
    db: Session = Depends(get_db),
    x_user_name: str = Header(default="System"),
    _perm: bool = Depends(require_permission("Identity Repository", "edit"))
):
    """Deletes a matching rule."""
    rule = db.query(CorrelationRule).filter(CorrelationRule.id == id).first()
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")
    rule_name = rule.rule_name
    db.delete(rule)
    db.commit()
    write_correlation_audit(db, x_user_name, "Delete Rule", old_val={"rule_name": rule_name})
    return {"success": True}


# Review Queue Endpoints
@router.get("/correlation/review-queue")
def get_review_queue(
    search: Optional[str] = None,
    filter_type: Optional[str] = "All",  # "All", "Review", "Uncorrelated"
    application_id: Optional[int] = None,
    page: int = 1,
    limit: int = 10,
    db: Session = Depends(get_db),
    _perm: bool = Depends(require_permission("Identity Repository", "view"))
):
    """
    Fetches uncorrelated application accounts and recommended matches (Needs Review).
    """
    query = db.query(ApplicationAccount, Application).join(
        Application, ApplicationAccount.application_id == Application.id
    ).filter(
        ApplicationAccount.is_deleted == False,
        Application.is_deleted == False
    )

    # Sub-filter logic
    if filter_type == "Review":
        query = query.filter(ApplicationAccount.correlation_status == "Needs Review")
    elif filter_type == "Uncorrelated":
        query = query.filter(ApplicationAccount.correlation_status == "Uncorrelated")
    else:  # "All" pending
        query = query.filter(ApplicationAccount.correlation_status.in_(["Needs Review", "Uncorrelated"]))

    if application_id is not None:
        query = query.filter(ApplicationAccount.application_id == application_id)

    if search:
        search_term = f"%{search}%"
        query = query.filter(
            or_(
                ApplicationAccount.account_id.like(search_term),
                ApplicationAccount.account_name.like(search_term),
                ApplicationAccount.email.like(search_term),
                Application.application_name.like(search_term)
            )
        )

    total = query.count()
    offset = (page - 1) * limit
    results = query.order_by(ApplicationAccount.id.asc()).offset(offset).limit(limit).all()

    # Format output items, including recommended identity matches
    items = []
    for acc, app in results:
        candidate_identity = None
        if acc.identity_id:
            candidate_identity = db.query(Identity).filter(Identity.id == acc.identity_id).first()

        items.append({
            "id": acc.id,
            "application_id": app.id,
            "application_name": app.application_name,
            "account_id": acc.account_id,
            "account_name": acc.account_name,
            "email": acc.email,
            "status": acc.status,
            "correlation_status": acc.correlation_status,
            "correlation_method": acc.correlation_method,
            "correlation_confidence": acc.correlation_confidence,
            "recommended_identity": {
                "id": candidate_identity.id,
                "display_name": candidate_identity.display_name or f"{candidate_identity.first_name or ''} {candidate_identity.last_name or ''}".strip() or candidate_identity.email,
                "email": candidate_identity.email,
                "employee_id": candidate_identity.employee_id
            } if candidate_identity else None
        })

    return {
        "total": total,
        "page": page,
        "limit": limit,
        "total_pages": (total + limit - 1) // limit if total > 0 else 0,
        "items": items
    }

@router.post("/api/correlation/review-queue/approve")  # Alias or main route
@router.post("/correlation/review-queue/approve")
def approve_recommendations(
    payload: ApproveRequest,
    db: Session = Depends(get_db),
    x_user_name: str = Header(default="System"),
    _perm: bool = Depends(require_permission("Identity Repository", "edit"))
):
    """Batch approves automatic recommendations, confirming link status."""
    accounts = db.query(ApplicationAccount).filter(
        ApplicationAccount.id.in_(payload.account_ids),
        ApplicationAccount.is_deleted == False
    ).all()

    for acc in accounts:
        if acc.identity_id:
            acc.correlation_status = "Correlated"
            acc.correlation_method = "Automatic"

    db.commit()
    write_correlation_audit(db, x_user_name, "Approve Recommendations", new_val={"account_ids": payload.account_ids, "count": len(accounts)})
    return {"success": True, "count": len(accounts)}

@router.post("/api/correlation/review-queue/reject")  # Alias or main route
@router.post("/correlation/review-queue/reject")
def reject_recommendations(
    payload: RejectRequest,
    db: Session = Depends(get_db),
    x_user_name: str = Header(default="System"),
    _perm: bool = Depends(require_permission("Identity Repository", "edit"))
):
    """Batch rejects recommendations, resetting them to uncorrelated state."""
    accounts = db.query(ApplicationAccount).filter(
        ApplicationAccount.id.in_(payload.account_ids),
        ApplicationAccount.is_deleted == False
    ).all()

    for acc in accounts:
        acc.identity_id = None
        acc.correlation_status = "Uncorrelated"
        acc.correlation_method = None
        acc.correlation_confidence = 0

    db.commit()
    write_correlation_audit(db, x_user_name, "Reject Recommendations", new_val={"account_ids": payload.account_ids, "count": len(accounts)})
    return {"success": True, "count": len(accounts)}


# Existing Core Endpoints
@router.post("/correlation/auto")
def run_auto_correlation_route(
    application_id: Optional[int] = None,
    db: Session = Depends(get_db),
    x_user_name: str = Header(default="System"),
    _perm: bool = Depends(require_permission("Identity Repository", "edit"))
):
    """Triggers the correlation engine to automatically match uncorrelated accounts to identities."""
    try:
        updated = CorrelationEngine.run_auto_correlation(db, application_id)
        correlated_count = sum(1 for a in updated if a.correlation_status == "Correlated")
        review_count = sum(1 for a in updated if a.correlation_status == "Needs Review")

        write_correlation_audit(
            db, x_user_name, "Run Auto-Correlation",
            new_val={"application_id": application_id, "total_processed": len(updated), "correlated": correlated_count, "needs_review": review_count}
        )

        return {
            "success": True,
            "total_processed": len(updated),
            "correlated": correlated_count,
            "needs_review": review_count,
            "message": f"Auto-correlation complete. Matched {correlated_count} account(s), sent {review_count} to review queue."
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Auto-correlation failed: {str(e)}")

@router.post("/correlation/link")
def manual_link_account(
    payload: ManualLinkRequest,
    db: Session = Depends(get_db),
    x_user_name: str = Header(default="System"),
    _perm: bool = Depends(require_permission("Identity Repository", "edit"))
):
    """Manually correlates an account to a specific identity, overriding any auto-matching logic."""
    account = db.query(ApplicationAccount).filter(
        ApplicationAccount.id == payload.account_id,
        ApplicationAccount.is_deleted == False
    ).first()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")

    identity = db.query(Identity).filter(
        Identity.id == payload.identity_id,
        Identity.is_deleted == False
    ).first()
    if not identity:
        raise HTTPException(status_code=404, detail="Identity not found")

    account.identity_id = identity.id
    account.correlation_status = "Correlated"
    account.correlation_method = "Manual"
    account.correlation_confidence = 100

    db.commit()
    write_correlation_audit(
        db, x_user_name, "Manual Link",
        new_val={"account_id": account.id, "account_name": account.account_id, "identity_id": identity.id, "identity_name": identity.display_name or identity.email}
    )
    return {
        "success": True,
        "message": f"Account '{account.account_id}' successfully linked to identity '{identity.display_name or identity.email}'."
    }

@router.post("/correlation/unlink")
def manual_unlink_account(
    payload: ManualUnlinkRequest,
    db: Session = Depends(get_db),
    x_user_name: str = Header(default="System"),
    _perm: bool = Depends(require_permission("Identity Repository", "edit"))
):
    """Breaks the correlation link for a specific account."""
    account = db.query(ApplicationAccount).filter(
        ApplicationAccount.id == payload.account_id,
        ApplicationAccount.is_deleted == False
    ).first()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")

    old_identity_id = account.identity_id
    account.identity_id = None
    account.correlation_status = "Uncorrelated"
    account.correlation_method = None
    account.correlation_confidence = 0

    db.commit()
    write_correlation_audit(db, x_user_name, "Manual Unlink", old_val={"account_id": account.id, "identity_id": old_identity_id})
    return {
        "success": True,
        "message": f"Account '{account.account_id}' successfully unlinked."
    }

@router.get("/correlation/unlinked-accounts")
def get_unlinked_accounts(
    search: Optional[str] = None,
    db: Session = Depends(get_db),
    _perm: bool = Depends(require_permission("Identity Repository", "view"))
):
    """Lists all application accounts that are currently uncorrelated."""
    query = db.query(ApplicationAccount, Application).join(
        Application, ApplicationAccount.application_id == Application.id
    ).filter(
        ApplicationAccount.correlation_status == "Uncorrelated",
        ApplicationAccount.is_deleted == False,
        Application.is_deleted == False
    )
    
    if search:
        search_term = f"%{search}%"
        query = query.filter(
            or_(
                ApplicationAccount.account_id.like(search_term),
                ApplicationAccount.account_name.like(search_term),
                ApplicationAccount.email.like(search_term),
                Application.application_name.like(search_term)
            )
        )
        
    results = query.limit(100).all()
    
    return {
        "accounts": [
            {
                "id": acc.id,
                "application_name": app.application_name,
                "account_id": acc.account_id,
                "account_name": acc.account_name,
                "email": acc.email,
                "status": acc.status
            } for acc, app in results
        ]
    }
