from fastapi import APIRouter, Depends, HTTPException, status, Header
from sqlalchemy.orm import Session
from sqlalchemy import or_, and_, asc, desc
from typing import List, Optional
import json
from datetime import datetime

from app.database import get_db
from app.models.attribute_category import AttributeCategory
from app.models.identity_attribute import IdentityAttribute
from app.models.audit_log import AuditLog
from app.models.dashboard import RecentActivity
from app.schemas.identity_attribute import (
    IdentityAttributeCreate, IdentityAttributeUpdate, IdentityAttributeResponse,
    IdentityAttributePaginatedResponse, IdentityAttributeDetailResponse
)
from app.schemas.attribute_category import AttributeCategoryResponse

router = APIRouter()

# Helper for Audit Logging
def write_attribute_audit(db: Session, user: str, action: str, old_val: dict = None, new_val: dict = None):
    try:
        old_val_str = json.dumps(old_val, default=str) if old_val else None
        new_val_str = json.dumps(new_val, default=str) if new_val else None

        audit = AuditLog(
            module="Identity Attributes",
            action=action, # "Create", "Update", "Delete"
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
            action=f"Identity Attribute {action.lower()}d - {attr_label}",
            status="info" if action != "Delete" else "warning",
            created_at=datetime.utcnow()
        )
        db.add(activity)
        db.commit()
    except Exception as e:
        print(f"Warning: Failed to write attribute audit: {e}")

@router.get("/attribute-categories", response_model=List[AttributeCategoryResponse])
def get_attribute_categories(db: Session = Depends(get_db)):
    categories = db.query(AttributeCategory).filter(AttributeCategory.is_deleted == False).all()
    return categories

@router.get("/identity-attributes", response_model=IdentityAttributePaginatedResponse)
def get_identity_attributes(
    page: int = 1,
    limit: int = 25,
    search: Optional[str] = None,
    status: Optional[str] = None,
    category_id: Optional[int] = None,
    data_type: Optional[str] = None,
    is_required: Optional[bool] = None,
    is_searchable: Optional[bool] = None,
    sortBy: Optional[str] = "display_order",
    sortOrder: Optional[str] = "asc",
    db: Session = Depends(get_db)
):
    if page < 1:
        page = 1
    if limit < 1:
        limit = 25

    query = db.query(IdentityAttribute).filter(IdentityAttribute.is_deleted == False)

    # 1. Search Query
    if search:
        search_term = f"%{search}%"
        query = query.filter(
            or_(
                IdentityAttribute.attribute_name.like(search_term),
                IdentityAttribute.display_name.like(search_term),
                IdentityAttribute.description.like(search_term)
            )
        )

    # 2. Filters
    if status:
        query = query.filter(IdentityAttribute.status == status)
    if category_id is not None:
        query = query.filter(IdentityAttribute.category_id == category_id)
    if data_type:
        query = query.filter(IdentityAttribute.data_type == data_type)
    if is_required is not None:
        query = query.filter(IdentityAttribute.is_required == is_required)
    if is_searchable is not None:
        query = query.filter(IdentityAttribute.is_searchable == is_searchable)

    # 3. Sorting mapping
    sort_fields = {
        "attribute_name": IdentityAttribute.attribute_name,
        "created_at": IdentityAttribute.created_at,
        "display_order": IdentityAttribute.display_order,
        "status": IdentityAttribute.status
    }
    
    selected_sort = sort_fields.get(sortBy, IdentityAttribute.display_order)
    if sortOrder == "desc":
        query = query.order_by(desc(selected_sort))
    else:
        query = query.order_by(asc(selected_sort))

    total = query.count()
    total_pages = (total + limit - 1) // limit if total > 0 else 1
    results = query.offset((page - 1) * limit).limit(limit).all()

    return IdentityAttributePaginatedResponse(
        total=total,
        page=page,
        limit=limit,
        total_pages=total_pages,
        attributes=results
    )

@router.get("/identity-attributes/{id}", response_model=IdentityAttributeDetailResponse)
def get_identity_attribute_detail(id: int, db: Session = Depends(get_db)):
    attr = db.query(IdentityAttribute).filter(IdentityAttribute.id == id, IdentityAttribute.is_deleted == False).first()
    if not attr:
        raise HTTPException(status_code=404, detail="Identity attribute not found")

    # Fetch audit history logs for this specific attribute name
    attr_search_term = f'%"{attr.attribute_name}"%'
    audit_trail = db.query(AuditLog).filter(
        AuditLog.module == "Identity Attributes",
        or_(
            AuditLog.old_value.like(attr_search_term),
            AuditLog.new_value.like(attr_search_term)
        )
    ).order_by(AuditLog.timestamp.desc()).all()

    return IdentityAttributeDetailResponse(
        attribute=attr,
        audit_history=audit_trail
    )

@router.post("/identity-attributes", response_model=IdentityAttributeResponse, status_code=status.HTTP_201_CREATED)
def create_identity_attribute(
    payload: IdentityAttributeCreate,
    db: Session = Depends(get_db),
    x_user_name: str = Header(default="Unknown User")
):
    # Uniqueness checks
    norm_name = payload.attribute_name.strip().lower().replace(" ", "_")
    
    if db.query(IdentityAttribute).filter(
        IdentityAttribute.attribute_name == norm_name,
        IdentityAttribute.is_deleted == False
    ).first():
        raise HTTPException(status_code=400, detail="An Identity Attribute with this Attribute Name already exists.")

    if db.query(IdentityAttribute).filter(
        IdentityAttribute.display_name == payload.display_name.strip(),
        IdentityAttribute.is_deleted == False
    ).first():
        raise HTTPException(status_code=400, detail="An Identity Attribute with this Display Name already exists.")

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

    attr = IdentityAttribute(
        attribute_name=norm_name,
        display_name=payload.display_name.strip(),
        description=payload.description,
        attribute_type="Custom",
        data_type=payload.data_type,
        is_required=payload.is_required,
        is_unique=payload.is_unique,
        is_searchable=payload.is_searchable,
        is_editable=payload.is_editable,
        default_value=payload.default_value,
        display_order=payload.display_order or 0,
        status=payload.status or "Active",
        category_id=payload.category_id,
        validation_rule=payload.validation_rule,
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
    write_attribute_audit(db=db, user=x_user_name, action="Create", old_val=None, new_val=attr_dict)

    return attr

@router.put("/identity-attributes/{id}", response_model=IdentityAttributeResponse)
def update_identity_attribute(
    id: int,
    payload: IdentityAttributeUpdate,
    db: Session = Depends(get_db),
    x_user_name: str = Header(default="Unknown User")
):
    attr = db.query(IdentityAttribute).filter(IdentityAttribute.id == id, IdentityAttribute.is_deleted == False).first()
    if not attr:
        raise HTTPException(status_code=404, detail="Identity attribute not found")

    # Prevent editing default system attributes if they are marked non-editable
    if attr.attribute_type == "System" and not attr.is_editable:
        # Check if they are trying to edit restricted properties or if they can edit general properties like display_order/status/category_id/validation_rule
        # For simplicity, if is_editable=False, let's restrict attribute_name, display_name, data_type, etc.
        # But we still allow display_order or status editing if necessary. Or restrict everything.
        # The prompt says: "EDIT ATTRIBUTE: Update every field... Prevent duplicate Display/Names". Let's allow editing unless name changes or similar.
        # Let's enforce that System attribute names and data types cannot be changed:
        if payload.attribute_name and payload.attribute_name.strip().lower() != attr.attribute_name:
            raise HTTPException(status_code=400, detail="Cannot modify the attribute name of a System Attribute.")
        if payload.data_type and payload.data_type != attr.data_type:
            raise HTTPException(status_code=400, detail="Cannot modify the data type of a System Attribute.")

    # Uniqueness checks
    if payload.attribute_name and payload.attribute_name.strip().lower().replace(" ", "_") != attr.attribute_name:
        norm_name = payload.attribute_name.strip().lower().replace(" ", "_")
        if db.query(IdentityAttribute).filter(
            IdentityAttribute.attribute_name == norm_name,
            IdentityAttribute.is_deleted == False,
            IdentityAttribute.id != id
        ).first():
            raise HTTPException(status_code=400, detail="An Identity Attribute with this Attribute Name already exists.")

    if payload.display_name and payload.display_name.strip() != attr.display_name:
        if db.query(IdentityAttribute).filter(
            IdentityAttribute.display_name == payload.display_name.strip(),
            IdentityAttribute.is_deleted == False,
            IdentityAttribute.id != id
        ).first():
            raise HTTPException(status_code=400, detail="An Identity Attribute with this Display Name already exists.")

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
        write_attribute_audit(db=db, user=x_user_name, action="Update", old_val=old_dict, new_val=new_dict)

    return attr

@router.delete("/identity-attributes/{id}")
def delete_identity_attribute(
    id: int,
    db: Session = Depends(get_db),
    x_user_name: str = Header(default="Unknown User"),
    x_user_role: str = Header(default="Unknown Role")
):
    if x_user_role != "Platform Administrator":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied. Only Platform Administrators can delete identity attributes."
        )

    attr = db.query(IdentityAttribute).filter(IdentityAttribute.id == id, IdentityAttribute.is_deleted == False).first()
    if not attr:
        raise HTTPException(status_code=404, detail="Identity attribute not found")

    # Prevent deleting default system attributes
    if attr.attribute_type == "System":
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
    write_attribute_audit(db=db, user=x_user_name, action="Delete", old_val=attr_dict, new_val=None)

    return {"detail": "Identity attribute deleted successfully"}
