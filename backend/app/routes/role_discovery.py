from fastapi import APIRouter, Depends, HTTPException, Header
from sqlalchemy.orm import Session
from sqlalchemy import or_
from typing import Optional, List
from datetime import datetime
import json

from app.database import get_db
from app.models.mining_campaign import MiningCampaign
from app.models.candidate_role import CandidateRole
from app.models.candidate_role_entitlement import CandidateRoleEntitlement
from app.models.campaign_account_result import CampaignAccountResult
from app.models.application_account import ApplicationAccount
from app.models.application import Application
from app.models.identity import Identity
from app.models.audit_log import AuditLog
from app.models.dashboard import RecentActivity
from app.schemas.mining_campaign import MiningCampaignCreate, MiningCampaignResponse, MiningCampaignPaginatedResponse
from app.services.role_mining_engine import RoleMiningEngine
from app.utils.permissions import require_permission

router = APIRouter()


# Helper for Audit Logging
def write_role_discovery_audit(db: Session, user: str, action: str, old_val: dict = None, new_val: dict = None):
    try:
        old_val_str = json.dumps(old_val, default=str) if old_val else None
        new_val_str = json.dumps(new_val, default=str) if new_val else None

        audit = AuditLog(
            module="Role Discovery",
            action=action,  # "Create", "Run Mining", "Delete"
            performed_by=user,
            old_value=old_val_str,
            new_value=new_val_str,
            timestamp=datetime.utcnow()
        )
        db.add(audit)

        campaign_label = (new_val.get("campaign_name") if new_val else None) or (old_val.get("campaign_name") if old_val else "")
        activity = RecentActivity(
            user=user,
            action=f"Mining campaign {action.lower()} - {campaign_label}",
            status="info" if action != "Delete" else "warning",
            created_at=datetime.utcnow()
        )
        db.add(activity)
        db.commit()
    except Exception:
        db.rollback()


# ---------------------------------------------------------------------------
# RD-001: Mining Campaigns (CRUD)
# ---------------------------------------------------------------------------

@router.get("/mining-campaigns", response_model=MiningCampaignPaginatedResponse)
def get_mining_campaigns(
    page: int = 1,
    limit: int = 25,
    search: Optional[str] = None,
    db: Session = Depends(get_db),
    _perm: bool = Depends(require_permission("Role Discovery", "view"))
):
    if page < 1:
        page = 1
    if limit < 1:
        limit = 25

    query = db.query(MiningCampaign).filter(MiningCampaign.is_deleted == False)
    if search:
        query = query.filter(MiningCampaign.campaign_name.like(f"%{search}%"))

    total = query.count()
    total_pages = (total + limit - 1) // limit if total > 0 else 0
    campaigns = query.order_by(MiningCampaign.created_at.desc()).offset((page - 1) * limit).limit(limit).all()

    return {"total": total, "page": page, "limit": limit, "total_pages": total_pages, "campaigns": campaigns}


@router.post("/mining-campaigns", response_model=MiningCampaignResponse, status_code=201)
def create_mining_campaign(
    payload: MiningCampaignCreate,
    db: Session = Depends(get_db),
    x_user_name: str = Header(default="System"),
    _perm: bool = Depends(require_permission("Role Discovery", "create"))
):
    if payload.scope_type == "Application":
        if not payload.application_id:
            raise HTTPException(status_code=400, detail="application_id is required when scope_type is 'Application'.")
        app_obj = db.query(Application).filter(
            Application.id == payload.application_id, Application.is_deleted == False
        ).first()
        if not app_obj:
            raise HTTPException(status_code=400, detail="The selected application does not exist.")

    campaign = MiningCampaign(
        campaign_name=payload.campaign_name,
        description=payload.description,
        scope_type=payload.scope_type,
        application_id=payload.application_id if payload.scope_type == "Application" else None,
        eps=payload.eps,
        min_samples=payload.min_samples,
        status="Draft",
        created_by=x_user_name,
        modified_by=x_user_name
    )
    db.add(campaign)
    db.commit()
    db.refresh(campaign)

    write_role_discovery_audit(db, x_user_name, "Create", new_val={
        "id": campaign.id,
        "campaign_name": campaign.campaign_name,
        "scope_type": campaign.scope_type
    })

    return campaign


@router.get("/mining-campaigns/{id}", response_model=MiningCampaignResponse)
def get_mining_campaign(
    id: int,
    db: Session = Depends(get_db),
    _perm: bool = Depends(require_permission("Role Discovery", "view"))
):
    campaign = db.query(MiningCampaign).filter(MiningCampaign.id == id, MiningCampaign.is_deleted == False).first()
    if not campaign:
        raise HTTPException(status_code=404, detail="Mining campaign not found")
    return campaign


@router.delete("/mining-campaigns/{id}")
def delete_mining_campaign(
    id: int,
    db: Session = Depends(get_db),
    x_user_name: str = Header(default="System"),
    _perm: bool = Depends(require_permission("Role Discovery", "delete"))
):
    campaign = db.query(MiningCampaign).filter(MiningCampaign.id == id, MiningCampaign.is_deleted == False).first()
    if not campaign:
        raise HTTPException(status_code=404, detail="Mining campaign not found")
    campaign.is_deleted = True
    campaign.modified_by = x_user_name
    db.commit()

    write_role_discovery_audit(db, x_user_name, "Delete", old_val={
        "id": campaign.id,
        "campaign_name": campaign.campaign_name
    })

    return {"success": True}


# ---------------------------------------------------------------------------
# RD-002: Campaign Execution
# ---------------------------------------------------------------------------

@router.post("/mining-campaigns/{id}/run", response_model=MiningCampaignResponse)
def run_mining_campaign(
    id: int,
    db: Session = Depends(get_db),
    x_user_name: str = Header(default="System"),
    _perm: bool = Depends(require_permission("Role Discovery", "edit"))
):
    campaign = db.query(MiningCampaign).filter(MiningCampaign.id == id, MiningCampaign.is_deleted == False).first()
    if not campaign:
        raise HTTPException(status_code=404, detail="Mining campaign not found")

    campaign.status = "Running"
    campaign.modified_by = x_user_name
    db.commit()

    try:
        campaign = RoleMiningEngine.run_campaign(db, campaign)
    except Exception as e:
        campaign.status = "Failed"
        campaign.error_message = str(e)
        db.commit()
        write_role_discovery_audit(db, x_user_name, "Run Mining", new_val={
            "id": campaign.id,
            "campaign_name": campaign.campaign_name,
            "status": "Failed",
            "error_message": str(e)
        })
        raise HTTPException(status_code=500, detail=f"Mining run failed: {str(e)}")

    write_role_discovery_audit(db, x_user_name, "Run Mining", new_val={
        "id": campaign.id,
        "campaign_name": campaign.campaign_name,
        "status": campaign.status,
        "total_accounts_analyzed": campaign.total_accounts_analyzed,
        "total_candidate_roles": campaign.total_candidate_roles,
        "total_outliers": campaign.total_outliers,
        "coverage_percentage": campaign.coverage_percentage
    })

    return campaign


# ---------------------------------------------------------------------------
# RD-003 / RD-006: Candidate Roles
# ---------------------------------------------------------------------------

@router.get("/mining-campaigns/{id}/candidate-roles")
def get_candidate_roles(
    id: int,
    search: Optional[str] = None,
    db: Session = Depends(get_db),
    _perm: bool = Depends(require_permission("Role Discovery", "view"))
):
    campaign = db.query(MiningCampaign).filter(MiningCampaign.id == id, MiningCampaign.is_deleted == False).first()
    if not campaign:
        raise HTTPException(status_code=404, detail="Mining campaign not found")

    query = db.query(CandidateRole).filter(CandidateRole.campaign_id == id)
    if search:
        search_term = f"%{search}%"
        query = query.filter(or_(CandidateRole.role_name.like(search_term), CandidateRole.job_function.like(search_term)))

    roles = query.order_by(CandidateRole.job_function.asc(), CandidateRole.confidence_score.desc()).all()

    return {
        "roles": [
            {
                "id": r.id,
                "role_name": r.role_name,
                "job_function": r.job_function,
                "member_count": r.member_count,
                "confidence_score": r.confidence_score,
                "status": r.status,
                "created_at": r.created_at.isoformat()
            } for r in roles
        ]
    }


@router.get("/role-discovery/candidate-roles/{id}")
def get_candidate_role_detail(
    id: int,
    db: Session = Depends(get_db),
    _perm: bool = Depends(require_permission("Role Discovery", "view"))
):
    role = db.query(CandidateRole).filter(CandidateRole.id == id).first()
    if not role:
        raise HTTPException(status_code=404, detail="Candidate role not found")

    entitlements = db.query(CandidateRoleEntitlement).filter(
        CandidateRoleEntitlement.candidate_role_id == id
    ).order_by(CandidateRoleEntitlement.member_coverage_pct.desc()).all()

    members = db.query(CampaignAccountResult, ApplicationAccount, Application).join(
        ApplicationAccount, CampaignAccountResult.account_id == ApplicationAccount.id
    ).join(
        Application, ApplicationAccount.application_id == Application.id
    ).filter(CampaignAccountResult.candidate_role_id == id).all()

    return {
        "id": role.id,
        "role_name": role.role_name,
        "job_function": role.job_function,
        "member_count": role.member_count,
        "confidence_score": role.confidence_score,
        "status": role.status,
        "campaign_id": role.campaign_id,
        "entitlements": [
            {
                "entitlement_name": e.entitlement_name,
                "member_coverage_pct": e.member_coverage_pct,
                "is_core": e.is_core
            } for e in entitlements
        ],
        "members": [
            {
                "account_id": acc.id,
                "account_name": acc.account_name,
                "application_name": app.application_name,
                "similarity_score": res.similarity_score
            } for res, acc, app in members
        ]
    }


# ---------------------------------------------------------------------------
# RD-004: Role Comparison
# ---------------------------------------------------------------------------

@router.get("/role-discovery/candidate-roles/compare")
def compare_candidate_roles(
    ids: str,  # comma-separated candidate role ids, e.g. "3,7"
    db: Session = Depends(get_db),
    _perm: bool = Depends(require_permission("Role Discovery", "view"))
):
    try:
        role_ids = [int(x) for x in ids.split(",") if x.strip()]
    except ValueError:
        raise HTTPException(status_code=400, detail="ids must be a comma-separated list of integers")

    if len(role_ids) < 2:
        raise HTTPException(status_code=400, detail="Provide at least 2 candidate role ids to compare")

    roles = db.query(CandidateRole).filter(CandidateRole.id.in_(role_ids)).all()
    if len(roles) != len(role_ids):
        raise HTTPException(status_code=404, detail="One or more candidate roles were not found")

    role_entitlements = {}
    for role in roles:
        core = db.query(CandidateRoleEntitlement).filter(
            CandidateRoleEntitlement.candidate_role_id == role.id,
            CandidateRoleEntitlement.is_core == True
        ).all()
        role_entitlements[role.id] = {e.entitlement_name for e in core}

    all_sets = list(role_entitlements.values())
    shared = set.intersection(*all_sets) if all_sets else set()

    comparison = []
    for role in roles:
        my_set = role_entitlements[role.id]
        others = set().union(*[s for rid, s in role_entitlements.items() if rid != role.id]) if len(roles) > 1 else set()
        comparison.append({
            "id": role.id,
            "role_name": role.role_name,
            "job_function": role.job_function,
            "member_count": role.member_count,
            "confidence_score": role.confidence_score,
            "core_entitlement_count": len(my_set),
            "unique_to_this_role": sorted(my_set - others),
            "shared_with_all": sorted(shared)
        })

    return {"shared_entitlement_count": len(shared), "roles": comparison}


# ---------------------------------------------------------------------------
# RD-007: Outlier Analysis
# ---------------------------------------------------------------------------

@router.get("/mining-campaigns/{id}/outliers")
def get_campaign_outliers(
    id: int,
    search: Optional[str] = None,
    db: Session = Depends(get_db),
    _perm: bool = Depends(require_permission("Role Discovery", "view"))
):
    campaign = db.query(MiningCampaign).filter(MiningCampaign.id == id, MiningCampaign.is_deleted == False).first()
    if not campaign:
        raise HTTPException(status_code=404, detail="Mining campaign not found")

    query = db.query(CampaignAccountResult, ApplicationAccount, Application).join(
        ApplicationAccount, CampaignAccountResult.account_id == ApplicationAccount.id
    ).join(
        Application, ApplicationAccount.application_id == Application.id
    ).filter(
        CampaignAccountResult.campaign_id == id,
        CampaignAccountResult.candidate_role_id.is_(None)
    )

    if search:
        search_term = f"%{search}%"
        query = query.filter(or_(
            ApplicationAccount.account_id.like(search_term),
            ApplicationAccount.account_name.like(search_term),
            CampaignAccountResult.job_function.like(search_term)
        ))

    results = query.all()

    return {
        "total": len(results),
        "outliers": [
            {
                "account_id": acc.id,
                "account_name": acc.account_name,
                "application_name": app.application_name,
                "job_function": res.job_function
            } for res, acc, app in results
        ]
    }
