from fastapi import APIRouter, Depends, HTTPException, status, Header
from sqlalchemy.orm import Session
from sqlalchemy import or_, func, desc, asc
from typing import List, Optional
import json
from datetime import datetime

from app.database import get_db
from app.models.platform_role import PlatformRole
from app.models.platform_user import PlatformUser
from app.models.audit_log import AuditLog
from app.models.dashboard import RecentActivity
from app.schemas.platform_role import (
    PlatformRoleCreate, PlatformRoleUpdate, PlatformRoleResponse,
    PlatformRoleDetailResponse, PlatformRolePaginatedResponse,
    AssignedUserSchema, AuditLogSchema
)

router = APIRouter()

# Audit helper
def write_role_audit(db: Session, user: str, action: str, old_val: dict = None, new_val: dict = None):
    try:
        old_val_str = json.dumps(old_val, default=str) if old_val else None
        new_val_str = json.dumps(new_val, default=str) if new_val else None

        audit = AuditLog(
            module="Platform Roles",
            action=action, # "Create", "Update", "Delete", "Activate", "Deactivate"
            performed_by=user,
            old_value=old_val_str,
            new_value=new_val_str,
            timestamp=datetime.utcnow()
        )
        db.add(audit)

        # Post to RecentActivity for Dashboard Feed
        role_label = new_val.get("role_name") if new_val else (old_val.get("role_name") if old_val else "")
        activity = RecentActivity(
            user=user,
            action=f"Platform Role {action.lower()}d - {role_label}",
            status="info" if action != "Delete" else "warning",
            created_at=datetime.utcnow()
        )
        db.add(activity)
        db.commit()
    except Exception as e:
        print(f"Warning: Failed to write platform role audit: {e}")

@router.get("/platform-roles", response_model=PlatformRolePaginatedResponse)
def get_platform_roles(
    page: int = 1,
    limit: int = 25,
    search: Optional[str] = None,
    status: Optional[str] = None,
    risk_level: Optional[str] = None,
    role_type: Optional[str] = None,
    sortBy: Optional[str] = "created_at",
    sortOrder: Optional[str] = "desc",
    db: Session = Depends(get_db)
):
    if page < 1:
        page = 1
    if limit < 1:
        limit = 25

    # Base query joining PlatformUser to count assigned users
    query = db.query(
        PlatformRole,
        func.count(PlatformUser.id).label("users_assigned")
    ).outerjoin(
        PlatformUser,
        (PlatformUser.platform_role_id == PlatformRole.id) & (PlatformUser.is_deleted == False)
    ).filter(
        PlatformRole.is_deleted == False
    ).group_by(PlatformRole.id)

    # 1. Search Query
    if search:
        search_term = f"%{search}%"
        query = query.filter(
            or_(
                PlatformRole.role_code.like(search_term),
                PlatformRole.role_name.like(search_term),
                PlatformRole.description.like(search_term)
            )
        )

    # 2. Filters
    if status:
        query = query.filter(PlatformRole.status == status)
    if risk_level:
        query = query.filter(PlatformRole.risk_level == risk_level)
    if role_type:
        query = query.filter(PlatformRole.role_type == role_type)

    # 3. Sorting mapping
    sort_fields = {
        "role_code": PlatformRole.role_code,
        "role_name": PlatformRole.role_name,
        "created_at": PlatformRole.created_at,
        "risk_level": PlatformRole.risk_level
    }
    
    selected_sort = sort_fields.get(sortBy, PlatformRole.created_at)
    if sortOrder == "asc":
        query = query.order_by(asc(selected_sort))
    else:
        query = query.order_by(desc(selected_sort))

    # Counts
    total = query.count()
    total_pages = (total + limit - 1) // limit if total > 0 else 1

    # Execute offset/limit
    results = query.offset((page - 1) * limit).limit(limit).all()

    # Map tuple response to schema
    roles_list = []
    for r, users_assigned in results:
        roles_list.append(
            PlatformRoleResponse(
                id=r.id,
                role_code=r.role_code,
                role_name=r.role_name,
                description=r.description,
                role_type=r.role_type,
                risk_level=r.risk_level,
                status=r.status,
                approval_required=r.approval_required,
                is_system_role=r.is_system_role,
                is_deleted=r.is_deleted,
                created_at=r.created_at,
                updated_at=r.updated_at,
                created_by=r.created_by,
                modified_by=r.modified_by,
                users_assigned=users_assigned
            )
        )

    return PlatformRolePaginatedResponse(
        total=total,
        page=page,
        limit=limit,
        total_pages=total_pages,
        roles=roles_list
    )

@router.get("/platform-roles/{id}", response_model=PlatformRoleDetailResponse)
def get_platform_role_detail(id: int, db: Session = Depends(get_db)):
    role = db.query(PlatformRole).filter(PlatformRole.id == id, PlatformRole.is_deleted == False).first()
    if not role:
        raise HTTPException(status_code=404, detail="Platform role not found")

    # Resolve active users count
    users_assigned = db.query(PlatformUser).filter(
        PlatformUser.platform_role_id == id,
        PlatformUser.is_deleted == False
    ).count()

    role_res = PlatformRoleResponse(
        id=role.id,
        role_code=role.role_code,
        role_name=role.role_name,
        description=role.description,
        role_type=role.role_type,
        risk_level=role.risk_level,
        status=role.status,
        approval_required=role.approval_required,
        is_system_role=role.is_system_role,
        is_deleted=role.is_deleted,
        created_at=role.created_at,
        updated_at=role.updated_at,
        created_by=role.created_by,
        modified_by=role.modified_by,
        users_assigned=users_assigned
    )

    # 1. Assigned Users list
    assigned_users = db.query(PlatformUser).filter(
        PlatformUser.platform_role_id == id,
        PlatformUser.is_deleted == False
    ).order_by(PlatformUser.id.desc()).all()

    # 2. Audit Trail logs
    # Match role code occurrences in json details
    role_search_term = f'%"{role.role_code}"%'
    audit_trail = db.query(AuditLog).filter(
        AuditLog.module == "Platform Roles",
        or_(
            AuditLog.old_value.like(role_search_term),
            AuditLog.new_value.like(role_search_term)
        )
    ).order_by(AuditLog.timestamp.desc()).all()

    return PlatformRoleDetailResponse(
        role=role_res,
        assigned_users=assigned_users,
        audit_history=audit_trail
    )

@router.post("/platform-roles", response_model=PlatformRoleResponse, status_code=status.HTTP_201_CREATED)
def create_platform_role(
    payload: PlatformRoleCreate,
    db: Session = Depends(get_db),
    x_user_name: str = Header(default="Unknown User")
):
    # Uniqueness checks
    if db.query(PlatformRole).filter(PlatformRole.role_code == payload.role_code, PlatformRole.is_deleted == False).first():
        raise HTTPException(status_code=400, detail="A Platform Role with this Role Code already exists.")

    if db.query(PlatformRole).filter(PlatformRole.role_name == payload.role_name, PlatformRole.is_deleted == False).first():
        raise HTTPException(status_code=400, detail="A Platform Role with this Role Name already exists.")

    role = PlatformRole(
        role_code=payload.role_code,
        role_name=payload.role_name,
        description=payload.description,
        role_type=payload.role_type,
        risk_level=payload.risk_level,
        status=payload.status or "Active",
        approval_required=payload.approval_required,
        is_system_role=payload.is_system_role,
        is_deleted=False,
        created_by=x_user_name,
        modified_by=x_user_name
    )
    db.add(role)
    db.commit()
    db.refresh(role)

    # Log create action
    role_dict = {
        "id": role.id,
        "role_code": role.role_code,
        "role_name": role.role_name,
        "description": role.description,
        "role_type": role.role_type,
        "risk_level": role.risk_level,
        "status": role.status
    }
    write_role_audit(db=db, user=x_user_name, action="Create", old_val=None, new_val=role_dict)

    return PlatformRoleResponse(
        id=role.id,
        role_code=role.role_code,
        role_name=role.role_name,
        description=role.description,
        role_type=role.role_type,
        risk_level=role.risk_level,
        status=role.status,
        approval_required=role.approval_required,
        is_system_role=role.is_system_role,
        is_deleted=role.is_deleted,
        created_at=role.created_at,
        updated_at=role.updated_at,
        created_by=role.created_by,
        modified_by=role.modified_by,
        users_assigned=0
    )

@router.put("/platform-roles/{id}", response_model=PlatformRoleResponse)
def update_platform_role(
    id: int,
    payload: PlatformRoleUpdate,
    db: Session = Depends(get_db),
    x_user_name: str = Header(default="Unknown User")
):
    role = db.query(PlatformRole).filter(PlatformRole.id == id, PlatformRole.is_deleted == False).first()
    if not role:
        raise HTTPException(status_code=404, detail="Platform role not found")

    # Uniqueness checks
    if payload.role_code and payload.role_code != role.role_code:
        if db.query(PlatformRole).filter(PlatformRole.role_code == payload.role_code, PlatformRole.is_deleted == False, PlatformRole.id != id).first():
            raise HTTPException(status_code=400, detail="A Platform Role with this Role Code already exists.")

    if payload.role_name and payload.role_name != role.role_name:
        if db.query(PlatformRole).filter(PlatformRole.role_name == payload.role_name, PlatformRole.is_deleted == False, PlatformRole.id != id).first():
            raise HTTPException(status_code=400, detail="A Platform Role with this Role Name already exists.")

    # Record changes
    old_role_dict = {
        "role_code": role.role_code,
        "role_name": role.role_name,
        "description": role.description,
        "role_type": role.role_type,
        "risk_level": role.risk_level,
        "status": role.status
    }
    
    changes = {}
    action_type = "Update"
    
    for field, value in payload.model_dump(exclude_unset=True).items():
        old_val = getattr(role, field)
        if old_val != value:
            setattr(role, field, value)
            changes[field] = value
            # Capture specific status audit activations/deactivations
            if field == "status":
                if value == "Active" and old_val != "Active":
                    action_type = "Activate"
                elif value == "Inactive" and old_val == "Active":
                    action_type = "Deactivate"

    if changes:
        role.updated_at = datetime.utcnow()
        role.modified_by = x_user_name
        db.commit()
        db.refresh(role)

        new_role_dict = {
            "role_code": role.role_code,
            "role_name": role.role_name,
            "description": role.description,
            "role_type": role.role_type,
            "risk_level": role.risk_level,
            "status": role.status
        }
        
        # Log update details
        write_role_audit(
            db=db,
            user=x_user_name,
            action=action_type,
            old_val=old_role_dict,
            new_val=new_role_dict
        )

    # Get user counts for response
    users_assigned = db.query(PlatformUser).filter(
        PlatformUser.platform_role_id == id,
        PlatformUser.is_deleted == False
    ).count()

    return PlatformRoleResponse(
        id=role.id,
        role_code=role.role_code,
        role_name=role.role_name,
        description=role.description,
        role_type=role.role_type,
        risk_level=role.risk_level,
        status=role.status,
        approval_required=role.approval_required,
        is_system_role=role.is_system_role,
        is_deleted=role.is_deleted,
        created_at=role.created_at,
        updated_at=role.updated_at,
        created_by=role.created_by,
        modified_by=role.modified_by,
        users_assigned=users_assigned
    )

@router.delete("/platform-roles/{id}")
def delete_platform_role(
    id: int,
    db: Session = Depends(get_db),
    x_user_name: str = Header(default="Unknown User")
):
    role = db.query(PlatformRole).filter(PlatformRole.id == id, PlatformRole.is_deleted == False).first()
    if not role:
        raise HTTPException(status_code=404, detail="Platform role not found")

    # Soft delete
    role.is_deleted = True
    role.updated_at = datetime.utcnow()
    role.modified_by = x_user_name
    db.commit()

    role_dict = {
        "id": role.id,
        "role_code": role.role_code,
        "role_name": role.role_name
    }
    write_role_audit(db=db, user=x_user_name, action="Delete", old_val=role_dict, new_val=None)

    return {"detail": "Platform role deleted successfully"}