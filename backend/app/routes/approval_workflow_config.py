from fastapi import APIRouter, Depends, HTTPException, Query, Header
from sqlalchemy.orm import Session
from sqlalchemy import or_, asc, desc
from typing import List, Optional
from datetime import datetime

from app.database import get_db
from app.models.approval_workflow_config import ApprovalWorkflowConfig, ApprovalWorkflowLevel
from app.models.application import Application
from app.models.platform_user import PlatformUser
from app.schemas.approval_workflow_config import (
    ApprovalWorkflowConfigCreate,
    ApprovalWorkflowConfigUpdate,
    ApprovalWorkflowConfigResponse,
    ApprovalWorkflowPaginatedResponse
)

router = APIRouter()


def seed_default_approval_workflows(db: Session):
    """
    Seeds default system approval workflows if none exist in database.
    """
    count = db.query(ApprovalWorkflowConfig).count()
    if count > 0:
        return

    defaults = [
        {
            "name": "Default (all applications) - Low Risk",
            "scope": "Default — all applications",
            "risk_level": "LOW",
            "workflow_mode": "Unified",
            "description": "Standard 1-level approval workflow for low risk access requests.",
            "is_active": True,
            "is_default": True,
            "levels": [
                {
                    "level_number": 1,
                    "approver_type": "Manager of the user",
                    "timeout_hours": 48,
                    "quorum": "ALL — every resolved approver must approve",
                    "fallback_action": "No fallback — remind approver & alert admins"
                }
            ]
        },
        {
            "name": "Default (all applications) - Medium Risk",
            "scope": "Default — all applications",
            "risk_level": "MEDIUM",
            "workflow_mode": "Unified",
            "description": "2-level approval workflow requiring Manager and Application Owner approval.",
            "is_active": True,
            "is_default": True,
            "levels": [
                {
                    "level_number": 1,
                    "approver_type": "Manager of the user",
                    "timeout_hours": 48,
                    "quorum": "ALL — every resolved approver must approve",
                    "fallback_action": "No fallback — remind approver & alert admins"
                },
                {
                    "level_number": 2,
                    "approver_type": "Application owner",
                    "timeout_hours": 48,
                    "quorum": "ALL — every resolved approver must approve",
                    "fallback_action": "Escalate to manager"
                }
            ]
        },
        {
            "name": "Default (all applications) - High Risk",
            "scope": "Default — all applications",
            "risk_level": "HIGH",
            "workflow_mode": "Unified",
            "description": "3-level approval workflow requiring Manager, Application Owner, and Security Admin.",
            "is_active": True,
            "is_default": True,
            "levels": [
                {
                    "level_number": 1,
                    "approver_type": "Manager of the user",
                    "timeout_hours": 48,
                    "quorum": "ALL — every resolved approver must approve",
                    "fallback_action": "No fallback — remind approver & alert admins"
                },
                {
                    "level_number": 2,
                    "approver_type": "Application owner",
                    "timeout_hours": 48,
                    "quorum": "ALL — every resolved approver must approve",
                    "fallback_action": "Escalate to manager"
                },
                {
                    "level_number": 3,
                    "approver_type": "Security Admin",
                    "timeout_hours": 24,
                    "quorum": "ALL — every resolved approver must approve",
                    "fallback_action": "No fallback — remind approver & alert admins"
                }
            ]
        }
    ]

    for data in defaults:
        levels_data = data.pop("levels")
        wf = ApprovalWorkflowConfig(**data, created_by="System", modified_by="System")
        db.add(wf)
        db.flush()
        for lvl in levels_data:
            db_lvl = ApprovalWorkflowLevel(workflow_id=wf.id, **lvl)
            db.add(db_lvl)

    db.commit()


@router.get("/approval-workflows/meta/options")
def get_workflow_meta_options(db: Session = Depends(get_db)):
    """
    Returns available scope options (applications), risk levels, approver types, quorum, and fallback actions.
    """
    apps = db.query(Application).filter(Application.is_deleted == False).all()
    app_scopes = [f"Application — {a.application_name}" for a in apps]

    scopes = [
        "Default — all applications",
        *app_scopes
    ]

    risk_levels = ["ALL", "LOW", "MEDIUM", "HIGH", "CRITICAL"]

    workflow_modes = [
        "Unified",
        "Lane"
    ]

    approver_types = [
        "Manager of the user",
        "Application owner",
        "Role owner",
        "Specific Person",
        "Workgroup Admin",
        "Security Admin",
        "Governance Admin"
    ]

    quorum_options = [
        "ALL — every resolved approver must approve",
        "ANY — any single approver can approve"
    ]

    fallback_actions = [
        "No fallback — remind approver & alert admins",
        "Escalate to manager",
        "Auto-approve",
        "Auto-reject"
    ]

    return {
        "scopes": scopes,
        "risk_levels": risk_levels,
        "workflow_modes": workflow_modes,
        "approver_types": approver_types,
        "quorum_options": quorum_options,
        "fallback_actions": fallback_actions
    }


@router.get("/approval-workflows", response_model=ApprovalWorkflowPaginatedResponse)
def get_approval_workflows(
    page: int = 1,
    limit: int = 25,
    search: Optional[str] = None,
    scope: Optional[str] = None,
    risk_level: Optional[str] = None,
    is_active: Optional[bool] = None,
    db: Session = Depends(get_db)
):
    seed_default_approval_workflows(db)

    query = db.query(ApprovalWorkflowConfig)

    if search:
        s_term = f"%{search}%"
        query = query.filter(
            or_(
                ApprovalWorkflowConfig.name.like(s_term),
                ApprovalWorkflowConfig.scope.like(s_term),
                ApprovalWorkflowConfig.description.like(s_term)
            )
        )

    if scope:
        query = query.filter(ApprovalWorkflowConfig.scope == scope)

    if risk_level:
        query = query.filter(
            or_(
                ApprovalWorkflowConfig.risk_level == risk_level,
                ApprovalWorkflowConfig.risk_level == "ALL"
            )
        )

    if is_active is not None:
        query = query.filter(ApprovalWorkflowConfig.is_active == is_active)

    query = query.order_by(desc(ApprovalWorkflowConfig.is_default), asc(ApprovalWorkflowConfig.id))

    total = query.count()
    total_pages = (total + limit - 1) // limit if total > 0 else 0
    offset = (page - 1) * limit
    workflows = query.offset(offset).limit(limit).all()

    return {
        "total": total,
        "page": page,
        "limit": limit,
        "total_pages": total_pages,
        "workflows": workflows
    }


@router.get("/approval-workflows/{id}", response_model=ApprovalWorkflowConfigResponse)
def get_approval_workflow(id: int, db: Session = Depends(get_db)):
    wf = db.query(ApprovalWorkflowConfig).filter(ApprovalWorkflowConfig.id == id).first()
    if not wf:
        raise HTTPException(status_code=404, detail="Approval Workflow configuration not found")
    return wf


@router.post("/approval-workflows", response_model=ApprovalWorkflowConfigResponse)
def create_approval_workflow(
    payload: ApprovalWorkflowConfigCreate,
    db: Session = Depends(get_db),
    x_user_name: str = Header(default="System")
):
    wf = ApprovalWorkflowConfig(
        name=payload.name.strip(),
        scope=payload.scope,
        risk_level=payload.risk_level,
        workflow_mode=payload.workflow_mode,
        description=payload.description,
        is_active=payload.is_active,
        is_default=payload.is_default,
        created_by=x_user_name,
        modified_by=x_user_name
    )
    db.add(wf)
    db.flush()

    for idx, lvl_in in enumerate(payload.levels):
        lvl = ApprovalWorkflowLevel(
            workflow_id=wf.id,
            level_number=idx + 1,
            approver_type=lvl_in.approver_type,
            specific_approver_id=lvl_in.specific_approver_id,
            specific_approver_name=lvl_in.specific_approver_name,
            specific_approver_email=lvl_in.specific_approver_email,
            timeout_hours=lvl_in.timeout_hours,
            quorum=lvl_in.quorum,
            fallback_action=lvl_in.fallback_action
        )
        db.add(lvl)

    db.commit()
    db.refresh(wf)
    return wf


@router.put("/approval-workflows/{id}", response_model=ApprovalWorkflowConfigResponse)
def update_approval_workflow(
    id: int,
    payload: ApprovalWorkflowConfigUpdate,
    db: Session = Depends(get_db),
    x_user_name: str = Header(default="System")
):
    wf = db.query(ApprovalWorkflowConfig).filter(ApprovalWorkflowConfig.id == id).first()
    if not wf:
        raise HTTPException(status_code=404, detail="Approval Workflow configuration not found")

    if payload.name is not None:
        wf.name = payload.name.strip()
    if payload.scope is not None:
        wf.scope = payload.scope
    if payload.risk_level is not None:
        wf.risk_level = payload.risk_level
    if payload.workflow_mode is not None:
        wf.workflow_mode = payload.workflow_mode
    if payload.description is not None:
        wf.description = payload.description
    if payload.is_active is not None:
        wf.is_active = payload.is_active
    if payload.is_default is not None:
        wf.is_default = payload.is_default

    wf.modified_by = x_user_name
    wf.updated_at = datetime.utcnow()

    if payload.levels is not None:
        # Delete existing levels and re-create with updated order
        db.query(ApprovalWorkflowLevel).filter(ApprovalWorkflowLevel.workflow_id == id).delete()
        for idx, lvl_in in enumerate(payload.levels):
            lvl = ApprovalWorkflowLevel(
                workflow_id=wf.id,
                level_number=idx + 1,
                approver_type=lvl_in.approver_type,
                specific_approver_id=lvl_in.specific_approver_id,
                specific_approver_name=lvl_in.specific_approver_name,
                specific_approver_email=lvl_in.specific_approver_email,
                timeout_hours=lvl_in.timeout_hours,
                quorum=lvl_in.quorum,
                fallback_action=lvl_in.fallback_action
            )
            db.add(lvl)

    db.commit()
    db.refresh(wf)
    return wf


@router.delete("/approval-workflows/{id}")
def delete_approval_workflow(id: int, db: Session = Depends(get_db)):
    wf = db.query(ApprovalWorkflowConfig).filter(ApprovalWorkflowConfig.id == id).first()
    if not wf:
        raise HTTPException(status_code=404, detail="Approval Workflow configuration not found")

    db.delete(wf)
    db.commit()
    return {"message": f"Approval Workflow '{wf.name}' deleted successfully"}
