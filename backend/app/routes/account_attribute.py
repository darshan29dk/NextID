from fastapi import APIRouter, Depends, HTTPException, status, Header
from sqlalchemy.orm import Session
from sqlalchemy import or_, and_, asc, desc
from typing import List, Optional
import json
from datetime import datetime

from app.database import get_db
from app.models.attribute_category import AttributeCategory
from app.models.account_attribute import AccountAttribute
from app.models.audit_log import AuditLog
from app.models.dashboard import RecentActivity
from app.schemas.account_attribute import (
    AccountAttributeCreate, AccountAttributeUpdate, AccountAttributeResponse,
    AccountAttributePaginatedResponse, AccountAttributeDetailResponse
)
from app.schemas.attribute_category import AttributeCategoryResponse

router = APIRouter()

# Helper for Audit Logging
def write_account_attribute_audit(db: Session, user: str, action: str, old_val: dict = None, new_val: dict = None):
    try:
        old_val_str = json.dumps(old_val, default=str) if old_val else None
        new_val_str = json.dumps(new_val, default=str) if new_val else None

        audit = AuditLog(
            module="Account Attributes",
            action=action, # "Create", "Update", "Delete", "Restore"
            performed_by=user,
            old_value=old_val_str,
            new_value=new_val_str,
            timestamp=datetime.utcnow()
        )
        db.add(audit)

        # Recent Activity Feed
        attr_label = new_val.get("display_name") if new_val else (old_val.get("display_name") if old_val else "")
        activity = RecentActivity(
            user=user,
            action=f"Account Attribute {action.lower()}d - {attr_label}",
            status="info" if action not in ["Delete", "Deactivate"] else "warning",
            created_at=datetime.utcnow()
        )
        db.add(activity)
        db.commit()
    except Exception as e:
        print(f"Warning: Failed to write account attribute audit: {e}")

@router.get("/account-attributes", response_model=AccountAttributePaginatedResponse)
def get_account_attributes(
    page: int = 1,
    limit: int = 25,
    search: Optional[str] = None,
    status: Optional[str] = None,
    category_id: Optional[int] = None,
    application_type: Optional[str] = None,
    data_type: Optional[str] = None,
    is_required: Optional[bool] = None,
    is_searchable: Optional[bool] = None,
    is_editable: Optional[bool] = None,
    sortBy: Optional[str] = "display_order",
    sortOrder: Optional[str] = "asc",
    include_deleted: Optional[bool] = False,
    db: Session = Depends(get_db)
):
    if page < 1:
        page = 1
    if limit < 1:
        limit = 25

    query = db.query(AccountAttribute)
    
    if not include_deleted:
        query = query.filter(AccountAttribute.is_deleted == False)

    # 1. Search Query (Attribute Name, Display Name, Description)
    if search:
        search_term = f"%{search}%"
        query = query.filter(
            or_(
                AccountAttribute.attribute_name.like(search_term),
                AccountAttribute.display_name.like(search_term),
                AccountAttribute.description.like(search_term)
            )
        )

    # 2. Filters
    if status:
        query = query.filter(AccountAttribute.status == status)
    if category_id is not None:
        query = query.filter(AccountAttribute.category_id == category_id)
    if application_type:
        query = query.filter(AccountAttribute.application_type == application_type)
    if data_type:
        query = query.filter(AccountAttribute.data_type == data_type)
    if is_required is not None:
        query = query.filter(AccountAttribute.is_required == is_required)
    if is_searchable is not None:
        query = query.filter(AccountAttribute.is_searchable == is_searchable)
    if is_editable is not None:
        query = query.filter(AccountAttribute.is_editable == is_editable)

    # 3. Sorting mapping (Attribute Name, Created Date, Display Order, Status)
    sort_fields = {
        "attribute_name": AccountAttribute.attribute_name,
        "created_at": AccountAttribute.created_at,
        "display_order": AccountAttribute.display_order,
        "status": AccountAttribute.status
    }
    
    selected_sort = sort_fields.get(sortBy, AccountAttribute.display_order)
    if sortOrder == "desc":
        query = query.order_by(desc(selected_sort))
    else:
        query = query.order_by(asc(selected_sort))

    total = query.count()
    total_pages = (total + limit - 1) // limit if total > 0 else 1
    results = query.offset((page - 1) * limit).limit(limit).all()

    return AccountAttributePaginatedResponse(
        total=total,
        page=page,
        limit=limit,
        total_pages=total_pages,
        attributes=results
    )

@router.get("/account-attributes/{id}", response_model=AccountAttributeDetailResponse)
def get_account_attribute_detail(id: int, db: Session = Depends(get_db)):
    attr = db.query(AccountAttribute).filter(AccountAttribute.id == id).first()
    if not attr:
        raise HTTPException(status_code=404, detail="Account attribute not found")

    # Fetch audit history logs for this specific attribute name
    attr_search_term = f'%"{attr.attribute_name}"%'
    audit_trail = db.query(AuditLog).filter(
        AuditLog.module == "Account Attributes",
        or_(
            AuditLog.old_value.like(attr_search_term),
            AuditLog.new_value.like(attr_search_term)
        )
    ).order_by(AuditLog.timestamp.desc()).all()

    return AccountAttributeDetailResponse(
        attribute=attr,
        audit_history=audit_trail
    )

@router.post("/account-attributes", response_model=AccountAttributeResponse, status_code=status.HTTP_201_CREATED)
def create_account_attribute(
    payload: AccountAttributeCreate,
    db: Session = Depends(get_db),
    x_user_name: str = Header(default="Unknown User")
):
    # Uniqueness checks
    norm_name = payload.attribute_name.strip().lower().replace(" ", "_")
    
    if db.query(AccountAttribute).filter(
        AccountAttribute.attribute_name == norm_name,
        AccountAttribute.is_deleted == False
    ).first():
        raise HTTPException(status_code=400, detail="An Account Attribute with this Attribute Name already exists.")

    if db.query(AccountAttribute).filter(
        AccountAttribute.display_name == payload.display_name.strip(),
        AccountAttribute.is_deleted == False
    ).first():
        raise HTTPException(status_code=400, detail="An Account Attribute with this Display Name already exists.")

    # Validate category if set
    if payload.category_id is not None:
        cat = db.query(AttributeCategory).filter(AttributeCategory.id == payload.category_id, AttributeCategory.is_deleted == False).first()
        if not cat:
            raise HTTPException(status_code=400, detail="The selected Attribute Category does not exist.")

    # Validate regex rule if set
    if payload.validation_rule:
        import re
        try:
            re.compile(payload.validation_rule)
        except re.error:
            raise HTTPException(status_code=400, detail="Invalid regular expression pattern in Validation Rule.")

    attr = AccountAttribute(
        attribute_name=norm_name,
        display_name=payload.display_name.strip(),
        description=payload.description,
        attribute_type="Custom",
        data_type=payload.data_type,
        application_type=payload.application_type,
        is_required=payload.is_required,
        is_unique=payload.is_unique,
        is_searchable=payload.is_searchable,
        is_editable=payload.is_editable,
        default_value=payload.default_value,
        display_order=payload.display_order or 0,
        status=payload.status or "Active",
        category_id=payload.category_id,
        validation_rule=payload.validation_rule,
        is_system=False,
        is_deleted=False,
        created_by=x_user_name,
        modified_by=x_user_name
    )
    db.add(attr)
    db.commit()
    db.refresh(attr)

    attr_dict = {
        "id": attr.id,
        "attribute_name": attr.attribute_name,
        "display_name": attr.display_name,
        "data_type": attr.data_type,
        "status": attr.status
    }
    write_account_attribute_audit(db=db, user=x_user_name, action="Create", old_val=None, new_val=attr_dict)

    return attr

@router.put("/account-attributes/{id}", response_model=AccountAttributeResponse)
def update_account_attribute(
    id: int,
    payload: AccountAttributeUpdate,
    db: Session = Depends(get_db),
    x_user_name: str = Header(default="Unknown User")
):
    attr = db.query(AccountAttribute).filter(AccountAttribute.id == id, AccountAttribute.is_deleted == False).first()
    if not attr:
        raise HTTPException(status_code=404, detail="Account attribute not found")

    # Enforce protection on System/Protected attributes
    if attr.is_system or attr.attribute_type == "System":
        # Prevent editing anything except description or display_order
        restricted_updates = {}
        for field, value in payload.model_dump(exclude_unset=True).items():
            if field not in ["description", "display_order"]:
                old_val = getattr(attr, field)
                if old_val != value:
                    restricted_updates[field] = value
        if restricted_updates:
            raise HTTPException(
                status_code=400,
                detail=f"Cannot modify restricted properties {list(restricted_updates.keys())} on a System Attribute. Only Description and Order are editable."
            )

    # Uniqueness checks
    if payload.attribute_name and payload.attribute_name.strip().lower().replace(" ", "_") != attr.attribute_name:
        norm_name = payload.attribute_name.strip().lower().replace(" ", "_")
        if db.query(AccountAttribute).filter(
            AccountAttribute.attribute_name == norm_name,
            AccountAttribute.is_deleted == False,
            AccountAttribute.id != id
        ).first():
            raise HTTPException(status_code=400, detail="An Account Attribute with this Attribute Name already exists.")

    if payload.display_name and payload.display_name.strip() != attr.display_name:
        if db.query(AccountAttribute).filter(
            AccountAttribute.display_name == payload.display_name.strip(),
            AccountAttribute.is_deleted == False,
            AccountAttribute.id != id
        ).first():
            raise HTTPException(status_code=400, detail="An Account Attribute with this Display Name already exists.")

    # Validate category if set
    if payload.category_id is not None:
        cat = db.query(AttributeCategory).filter(AttributeCategory.id == payload.category_id, AttributeCategory.is_deleted == False).first()
        if not cat:
            raise HTTPException(status_code=400, detail="The selected Attribute Category does not exist.")

    # Validate regex rule if set
    if payload.validation_rule:
        import re
        try:
            re.compile(payload.validation_rule)
        except re.error:
            raise HTTPException(status_code=400, detail="Invalid regular expression pattern in Validation Rule.")

    old_dict = {
        "id": attr.id,
        "attribute_name": attr.attribute_name,
        "display_name": attr.display_name,
        "data_type": attr.data_type,
        "status": attr.status
    }

    changes = {}
    for field, value in payload.model_dump(exclude_unset=True).items():
        if field == "attribute_name" and value:
            value = value.strip().lower().replace(" ", "_")
        old_val = getattr(attr, field)
        if old_val != value:
            setattr(attr, field, value)
            changes[field] = {"old": old_val, "new": value}

    if changes:
        attr.updated_at = datetime.utcnow()
        attr.modified_by = x_user_name
        db.commit()
        db.refresh(attr)

        new_dict = {
            "id": attr.id,
            "attribute_name": attr.attribute_name,
            "display_name": attr.display_name,
            "data_type": attr.data_type,
            "status": attr.status
        }
        write_account_attribute_audit(db=db, user=x_user_name, action="Update", old_val=old_dict, new_val=new_dict)

    return attr

@router.delete("/account-attributes/{id}")
def delete_account_attribute(
    id: int,
    db: Session = Depends(get_db),
    x_user_name: str = Header(default="Unknown User"),
    x_user_role: str = Header(default="Unknown Role")
):
    # Enforce role-based permission
    if x_user_role != "Platform Administrator":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied. Only Platform Administrators can delete account attributes."
        )

    attr = db.query(AccountAttribute).filter(AccountAttribute.id == id, AccountAttribute.is_deleted == False).first()
    if not attr:
        raise HTTPException(status_code=404, detail="Account attribute not found")

    # Prevent deleting default system attributes
    if attr.is_system or attr.attribute_type == "System":
        raise HTTPException(status_code=400, detail="Cannot delete default system attributes.")

    # Soft Delete
    attr.is_deleted = True
    attr.updated_at = datetime.utcnow()
    attr.modified_by = x_user_name
    db.commit()

    attr_dict = {
        "id": attr.id,
        "attribute_name": attr.attribute_name,
        "display_name": attr.display_name
    }
    write_account_attribute_audit(db=db, user=x_user_name, action="Delete", old_val=attr_dict, new_val=None)

    return {"detail": "Account attribute deleted successfully"}

@router.post("/account-attributes/{id}/restore", response_model=AccountAttributeResponse)
def restore_account_attribute(
    id: int,
    db: Session = Depends(get_db),
    x_user_name: str = Header(default="Unknown User"),
    x_user_role: str = Header(default="Unknown Role")
):
    # Enforce role-based permission
    if x_user_role != "Platform Administrator":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied. Only Platform Administrators can restore account attributes."
        )

    attr = db.query(AccountAttribute).filter(AccountAttribute.id == id, AccountAttribute.is_deleted == True).first()
    if not attr:
        raise HTTPException(status_code=404, detail="Deleted account attribute not found")

    # Restore
    attr.is_deleted = False
    attr.updated_at = datetime.utcnow()
    attr.modified_by = x_user_name
    db.commit()
    db.refresh(attr)

    attr_dict = {
        "id": attr.id,
        "attribute_name": attr.attribute_name,
        "display_name": attr.display_name
    }
    write_account_attribute_audit(db=db, user=x_user_name, action="Restore", old_val=None, new_val=attr_dict)

    return attr
