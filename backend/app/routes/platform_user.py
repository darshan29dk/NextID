from fastapi import APIRouter, Depends, HTTPException, status, Header
from sqlalchemy.orm import Session
from sqlalchemy import or_, func
from typing import List, Optional
import json
from datetime import datetime

from app.database import get_db
from app.models.platform_role import PlatformRole
from app.models.platform_user import PlatformUser
from app.models.audit_log import AuditLog
from app.models.dashboard import RecentActivity
from app.models.notification import Notification
from app.schemas.platform_user import (
    PlatformUserCreate, PlatformUserUpdate, PlatformUserResponse,
    PlatformUserPaginatedResponse, PlatformRoleResponse
)

router = APIRouter()

# Audit Log helper
def write_audit_record(db: Session, user: str, action: str, details_dict: dict, old_val_dict: dict = None):
    try:
        old_val_str = json.dumps(old_val_dict, default=str) if old_val_dict else None
        new_val_str = json.dumps(details_dict, default=str) if details_dict else None
        
        if action == "DELETE_USER":
            old_val_str = json.dumps(details_dict, default=str)
            new_val_str = None
        elif action == "UPDATE_USER":
            changes = details_dict.get("changes", {})
            old_state = {k: v["old"] for k, v in changes.items()}
            new_state = {k: v["new"] for k, v in changes.items()}
            old_val_str = json.dumps(old_state, default=str)
            new_val_str = json.dumps(new_state, default=str)

        audit = AuditLog(
            module="Platform Users",
            action=action.replace("_USER", "").title(), # "Create", "Update", "Delete"
            performed_by=user,
            old_value=old_val_str,
            new_value=new_val_str,
            timestamp=datetime.utcnow()
        )
        db.add(audit)
        
        # Also post to RecentActivity for Dashboard feed
        activity_label = "created"
        if action == "UPDATE_USER":
            activity_label = "updated"
        elif action == "DELETE_USER":
            activity_label = "deleted"
            
        activity = RecentActivity(
            user=user,
            action=f"Platform User {activity_label} - {details_dict.get('first_name', '')} {details_dict.get('last_name', '')} ({details_dict.get('email', '')})",
            status="info" if action != "DELETE_USER" else "warning",
            created_at=datetime.utcnow()
        )
        db.add(activity)
        db.commit()
    except Exception as e:
        print(f"Warning: Failed to write audit record: {e}")

@router.get("/platform-users", response_model=PlatformUserPaginatedResponse)
def get_platform_users(
    page: int = 1,
    limit: int = 10,
    search: Optional[str] = None,
    status: Optional[str] = None,
    department: Optional[str] = None,
    role_id: Optional[int] = None,
    db: Session = Depends(get_db)
):
    if page < 1:
        page = 1
    if limit < 1:
        limit = 10
        
    query = db.query(PlatformUser).filter(PlatformUser.is_deleted == False)
    
    # 1. Search Query (Matches first_name, last_name, email, or employee_id)
    if search:
        search_term = f"%{search}%"
        query = query.filter(
            or_(
                PlatformUser.first_name.like(search_term),
                PlatformUser.last_name.like(search_term),
                PlatformUser.email.like(search_term),
                PlatformUser.employee_id.like(search_term)
            )
        )
        
    # 2. Filters
    if status:
        query = query.filter(PlatformUser.status == status)
    if department:
        query = query.filter(PlatformUser.department == department)
    if role_id:
        query = query.filter(PlatformUser.platform_role_id == role_id)
        
    # Total counts
    total = query.count()
    total_pages = (total + limit - 1) // limit if total > 0 else 1
    
    # Execute query with offset/limit
    users = query.order_by(PlatformUser.id.desc()).offset((page - 1) * limit).limit(limit).all()
    
    return PlatformUserPaginatedResponse(
        total=total,
        page=page,
        limit=limit,
        total_pages=total_pages,
        users=users
    )

@router.get("/platform-users/{id}", response_model=PlatformUserResponse)
def get_platform_user(id: int, db: Session = Depends(get_db)):
    user = db.query(PlatformUser).filter(PlatformUser.id == id, PlatformUser.is_deleted == False).first()
    if not user:
        raise HTTPException(status_code=404, detail="Platform user not found")
    return user

@router.post("/platform-users", response_model=PlatformUserResponse, status_code=status.HTTP_201_CREATED)
def create_platform_user(
    payload: PlatformUserCreate,
    db: Session = Depends(get_db),
    x_user_name: str = Header(default="Unknown User")
):
    # Verify email uniqueness
    if db.query(PlatformUser).filter(PlatformUser.email == payload.email, PlatformUser.is_deleted == False).first():
        raise HTTPException(status_code=400, detail="A user with this email already exists.")
        
    # Verify employee_id uniqueness
    if db.query(PlatformUser).filter(PlatformUser.employee_id == payload.employee_id, PlatformUser.is_deleted == False).first():
        raise HTTPException(status_code=400, detail="A user with this Employee ID already exists.")

    # Verify platform role FK
    if payload.platform_role_id:
        role = db.query(PlatformRole).filter(PlatformRole.id == payload.platform_role_id).first()
        if not role:
            raise HTTPException(status_code=400, detail="The selected Platform Role does not exist.")

    # Create user
    user = PlatformUser(
        employee_id=payload.employee_id,
        first_name=payload.first_name,
        last_name=payload.last_name,
        email=payload.email,
        phone=payload.phone,
        department=payload.department,
        job_title=payload.job_title,
        business_role=payload.business_role,
        platform_role_id=payload.platform_role_id,
        status=payload.status or "Active",
        manager=payload.manager,
        is_deleted=False,
        created_by=x_user_name,
        modified_by=x_user_name
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    # Log action
    write_audit_record(
        db=db,
        user=x_user_name,
        action="CREATE_USER",
        details_dict={
            "id": user.id,
            "employee_id": user.employee_id,
            "first_name": user.first_name,
            "last_name": user.last_name,
            "email": user.email,
            "department": user.department,
            "platform_role_id": user.platform_role_id
        }
    )

    # Account creation previously left the audit trail but never told anyone -
    # this at least surfaces it on the bell icon for whoever's watching.
    full_name = f"{user.first_name or ''} {user.last_name or ''}".strip() or user.email
    db.add(Notification(
        title="New Platform User Created",
        message=f"{full_name} ({user.email}) was added by {x_user_name}.",
        status="unread",
        created_at=datetime.utcnow()
    ))
    db.commit()

    return user

@router.put("/platform-users/{id}", response_model=PlatformUserResponse)
def update_platform_user(
    id: int,
    payload: PlatformUserUpdate,
    db: Session = Depends(get_db),
    x_user_name: str = Header(default="Unknown User")
):
    user = db.query(PlatformUser).filter(PlatformUser.id == id, PlatformUser.is_deleted == False).first()
    if not user:
        raise HTTPException(status_code=404, detail="Platform user not found")

    # Email uniqueness
    if payload.email and payload.email != user.email:
        if db.query(PlatformUser).filter(PlatformUser.email == payload.email, PlatformUser.is_deleted == False, PlatformUser.id != id).first():
            raise HTTPException(status_code=400, detail="A user with this email already exists.")

    # Employee ID uniqueness
    if payload.employee_id and payload.employee_id != user.employee_id:
        if db.query(PlatformUser).filter(PlatformUser.employee_id == payload.employee_id, PlatformUser.is_deleted == False, PlatformUser.id != id).first():
            raise HTTPException(status_code=400, detail="A user with this Employee ID already exists.")

    # Platform role FK
    if payload.platform_role_id is not None:
        role = db.query(PlatformRole).filter(PlatformRole.id == payload.platform_role_id).first()
        if not role:
            raise HTTPException(status_code=400, detail="The selected Platform Role does not exist.")

    # Track updates for audit logging
    changes = {}
    
    # Update fields
    for field, value in payload.model_dump(exclude_unset=True).items():
        old_val = getattr(user, field)
        if old_val != value:
            setattr(user, field, value)
            changes[field] = {"old": old_val, "new": value}

    if changes:
        user.updated_at = datetime.utcnow()
        user.modified_by = x_user_name
        db.commit()
        db.refresh(user)

        # Log action
        write_audit_record(
            db=db,
            user=x_user_name,
            action="UPDATE_USER",
            details_dict={
                "id": user.id,
                "first_name": user.first_name,
                "last_name": user.last_name,
                "email": user.email,
                "changes": changes
            }
        )

    return user

@router.delete("/platform-users/{id}")
def delete_platform_user(
    id: int,
    db: Session = Depends(get_db),
    x_user_name: str = Header(default="Unknown User")
):
    user = db.query(PlatformUser).filter(PlatformUser.id == id, PlatformUser.is_deleted == False).first()
    if not user:
        raise HTTPException(status_code=404, detail="Platform user not found")

    # Perform soft delete
    user.is_deleted = True
    user.updated_at = datetime.utcnow()
    user.modified_by = x_user_name
    db.commit()

    # Log action
    write_audit_record(
        db=db,
        user=x_user_name,
        action="DELETE_USER",
        details_dict={
            "id": user.id,
            "first_name": user.first_name,
            "last_name": user.last_name,
            "email": user.email
        }
    )

    return {"detail": "Platform user deleted successfully"}