from fastapi import APIRouter, Depends, HTTPException, status, Header
from sqlalchemy.orm import Session
from typing import Optional
import json
from datetime import datetime

from app.database import get_db
from app.models.attribute_category import AttributeCategory
from app.models.identity_attribute import IdentityAttribute
from app.models.account_attribute import AccountAttribute
from app.models.entitlement_attribute import EntitlementAttribute
from app.models.role_attribute import RoleAttribute
from app.models.audit_log import AuditLog
from app.models.dashboard import RecentActivity
from app.schemas.attribute_category import (
    AttributeCategoryCreate, AttributeCategoryUpdate, AttributeCategoryResponse
)

router = APIRouter()

def write_category_audit(db: Session, user: str, action: str, old_val: dict = None, new_val: dict = None):
    try:
        old_val_str = json.dumps(old_val, default=str) if old_val else None
        new_val_str = json.dumps(new_val, default=str) if new_val else None

        audit = AuditLog(
            module="Attribute Categories",
            action=action,
            performed_by=user,
            old_value=old_val_str,
            new_value=new_val_str,
            timestamp=datetime.utcnow()
        )
        db.add(audit)

        label = new_val.get("category_name") if new_val else (old_val.get("category_name") if old_val else "")
        activity = RecentActivity(
            user=user,
            action=f"Attribute Category {action.lower()}d - {label}",
            status="info" if action != "Delete" else "warning",
            created_at=datetime.utcnow()
        )
        db.add(activity)
        db.commit()
    except Exception as e:
        print(f"Warning: Failed to write category audit: {e}")

def count_category_usage(db: Session, category_id: int) -> int:
    count = 0
    count += db.query(IdentityAttribute).filter(
        IdentityAttribute.category_id == category_id, IdentityAttribute.is_deleted == False
    ).count()
    count += db.query(AccountAttribute).filter(
        AccountAttribute.category_id == category_id, AccountAttribute.is_deleted == False
    ).count()
    count += db.query(EntitlementAttribute).filter(
        EntitlementAttribute.category_id == category_id, EntitlementAttribute.is_deleted == False
    ).count()
    count += db.query(RoleAttribute).filter(
        RoleAttribute.category_id == category_id, RoleAttribute.is_deleted == False
    ).count()
    return count

@router.post("/attribute-categories", response_model=AttributeCategoryResponse, status_code=status.HTTP_201_CREATED)
def create_attribute_category(
    payload: AttributeCategoryCreate,
    db: Session = Depends(get_db),
    x_user_name: str = Header(default="Unknown User")
):
    if db.query(AttributeCategory).filter(
        AttributeCategory.category_name == payload.category_name,
        AttributeCategory.is_deleted == False
    ).first():
        raise HTTPException(status_code=400, detail="A category with this name already exists.")

    category = AttributeCategory(
        category_name=payload.category_name,
        description=payload.description,
        is_deleted=False,
        created_by=x_user_name,
        modified_by=x_user_name
    )
    db.add(category)
    db.commit()
    db.refresh(category)

    write_category_audit(
        db=db, user=x_user_name, action="Create",
        old_val=None,
        new_val={"id": category.id, "category_name": category.category_name}
    )

    return category

@router.put("/attribute-categories/{id}", response_model=AttributeCategoryResponse)
def update_attribute_category(
    id: int,
    payload: AttributeCategoryUpdate,
    db: Session = Depends(get_db),
    x_user_name: str = Header(default="Unknown User")
):
    category = db.query(AttributeCategory).filter(
        AttributeCategory.id == id, AttributeCategory.is_deleted == False
    ).first()
    if not category:
        raise HTTPException(status_code=404, detail="Attribute category not found")

    if payload.category_name and payload.category_name != category.category_name:
        if db.query(AttributeCategory).filter(
            AttributeCategory.category_name == payload.category_name,
            AttributeCategory.is_deleted == False,
            AttributeCategory.id != id
        ).first():
            raise HTTPException(status_code=400, detail="A category with this name already exists.")

    old_dict = {"id": category.id, "category_name": category.category_name}

    changes = {}
    for field, value in payload.model_dump(exclude_unset=True).items():
        old_val = getattr(category, field)
        if old_val != value:
            setattr(category, field, value)
            changes[field] = {"old": old_val, "new": value}

    if changes:
        category.updated_at = datetime.utcnow()
        category.modified_by = x_user_name
        db.commit()
        db.refresh(category)

        write_category_audit(
            db=db, user=x_user_name, action="Update",
            old_val=old_dict,
            new_val={"id": category.id, "category_name": category.category_name}
        )

    return category

@router.delete("/attribute-categories/{id}")
def delete_attribute_category(
    id: int,
    db: Session = Depends(get_db),
    x_user_name: str = Header(default="Unknown User"),
    x_user_role: str = Header(default="Unknown Role")
):
    if x_user_role != "Platform Administrator":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied. Only Platform Administrators can delete attribute categories."
        )

    category = db.query(AttributeCategory).filter(
        AttributeCategory.id == id, AttributeCategory.is_deleted == False
    ).first()
    if not category:
        raise HTTPException(status_code=404, detail="Attribute category not found")

    usage_count = count_category_usage(db, id)
    if usage_count > 0:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot delete this category — it is currently used by {usage_count} attribute(s). Reassign those attributes to a different category first."
        )

    category.is_deleted = True
    category.updated_at = datetime.utcnow()
    category.modified_by = x_user_name
    db.commit()

    write_category_audit(
        db=db, user=x_user_name, action="Delete",
        old_val={"id": category.id, "category_name": category.category_name},
        new_val=None
    )

    return {"detail": "Attribute category deleted successfully"}