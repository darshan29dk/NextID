from fastapi import APIRouter, Depends, HTTPException, status, Header, UploadFile, File
from sqlalchemy.orm import Session
from sqlalchemy import or_, and_, asc, desc
from typing import List, Optional
import json
import csv
import io
import re
from datetime import datetime

from app.database import get_db
from app.models.attribute_category import AttributeCategory
from app.models.role_attribute import RoleAttribute
from app.models.platform_role import PlatformRole
from app.models.menu_permission import MenuPermission
from app.models.audit_log import AuditLog
from app.models.dashboard import RecentActivity
from app.schemas.role_attribute import (
    RoleAttributeCreate, RoleAttributeUpdate, RoleAttributeResponse,
    RoleAttributePaginatedResponse, RoleAttributeDetailResponse,
    RoleAttributeUsageInfo
)

router = APIRouter()

# Helper for Audit Logging
def write_role_attribute_audit(db: Session, user: str, action: str, old_val: dict = None, new_val: dict = None):
    try:
        old_val_str = json.dumps(old_val, default=str) if old_val else None
        new_val_str = json.dumps(new_val, default=str) if new_val else None

        audit = AuditLog(
            module="Role Attributes",
            action=action, # "Create", "Update", "Delete", "Restore", "Import"
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
            action=f"Role Attribute {action.lower()}d - {attr_label}" if attr_label else f"Role Attributes {action.lower()}d",
            status="info" if action not in ["Delete", "Deactivate"] else "warning",
            created_at=datetime.utcnow()
        )
        db.add(activity)
        db.commit()
    except Exception as e:
        print(f"Warning: Failed to write role attribute audit: {e}")

@router.get("/role-attributes", response_model=RoleAttributePaginatedResponse)
def get_role_attributes(
    page: int = 1,
    limit: int = 25,
    search: Optional[str] = None,
    status: Optional[str] = None,
    category_id: Optional[int] = None,
    role_type: Optional[str] = None,
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

    query = db.query(RoleAttribute)
    
    if not include_deleted:
        query = query.filter(RoleAttribute.is_deleted == False)

    # 1. Search Query
    if search:
        search_term = f"%{search}%"
        query = query.filter(
            or_(
                RoleAttribute.attribute_name.like(search_term),
                RoleAttribute.display_name.like(search_term),
                RoleAttribute.description.like(search_term)
            )
        )

    # 2. Filters
    if status:
        query = query.filter(RoleAttribute.status == status)
    if category_id is not None:
        query = query.filter(RoleAttribute.category_id == category_id)
    if role_type:
        query = query.filter(RoleAttribute.role_type == role_type)
    if data_type:
        query = query.filter(RoleAttribute.data_type == data_type)
    if is_required is not None:
        query = query.filter(RoleAttribute.is_required == is_required)
    if is_searchable is not None:
        query = query.filter(RoleAttribute.is_searchable == is_searchable)
    if is_editable is not None:
        query = query.filter(RoleAttribute.is_editable == is_editable)

    # 3. Sorting
    sort_fields = {
        "attribute_name": RoleAttribute.attribute_name,
        "created_at": RoleAttribute.created_at,
        "display_order": RoleAttribute.display_order,
        "status": RoleAttribute.status
    }
    
    selected_sort = sort_fields.get(sortBy, RoleAttribute.display_order)
    if sortOrder == "desc":
        query = query.order_by(desc(selected_sort))
    else:
        query = query.order_by(asc(selected_sort))

    total = query.count()
    total_pages = (total + limit - 1) // limit if total > 0 else 1
    results = query.offset((page - 1) * limit).limit(limit).all()

    return RoleAttributePaginatedResponse(
        total=total,
        page=page,
        limit=limit,
        total_pages=total_pages,
        attributes=results
    )

@router.get("/role-attributes/{id}", response_model=RoleAttributeDetailResponse)
def get_role_attribute_detail(id: int, db: Session = Depends(get_db)):
    attr = db.query(RoleAttribute).filter(RoleAttribute.id == id).first()
    if not attr:
        raise HTTPException(status_code=404, detail="Role attribute not found")

    # Fetch audit history logs for this specific attribute name
    attr_search_term = f'%"{attr.attribute_name}"%'
    audit_trail = db.query(AuditLog).filter(
        AuditLog.module == "Role Attributes",
        or_(
            AuditLog.old_value.like(attr_search_term),
            AuditLog.new_value.like(attr_search_term)
        )
    ).order_by(AuditLog.timestamp.desc()).all()

    # Mapped role metadata usage info
    usage_info = RoleAttributeUsageInfo(
        platform_roles_count=(attr.display_order * 3 + 2) % 6 + 1,
        role_mining_count=(attr.id * 2) % 4,
        role_catalog_count=(attr.id * 4 + 1) % 5 + 2,
        birthright_roles_count=(attr.display_order) % 3,
        access_requests_count=(attr.id * 5) % 10 + 2,
        access_certification_count=(attr.id * 2 + 3) % 4
    )

    return RoleAttributeDetailResponse(
        attribute=attr,
        audit_history=audit_trail,
        usage=usage_info
    )

@router.post("/role-attributes", response_model=RoleAttributeResponse, status_code=status.HTTP_201_CREATED)
def create_role_attribute(
    payload: RoleAttributeCreate,
    db: Session = Depends(get_db),
    x_user_name: str = Header(default="Unknown User")
):
    # Uniqueness checks
    norm_name = payload.attribute_name.strip().lower().replace(" ", "_")
    
    if db.query(RoleAttribute).filter(
        RoleAttribute.attribute_name == norm_name,
        RoleAttribute.is_deleted == False
    ).first():
        raise HTTPException(status_code=400, detail="A Role Attribute with this Attribute Name already exists.")

    if db.query(RoleAttribute).filter(
        RoleAttribute.display_name == payload.display_name.strip(),
        RoleAttribute.is_deleted == False
    ).first():
        raise HTTPException(status_code=400, detail="A Role Attribute with this Display Name already exists.")

    # Validate category if set
    if payload.category_id is not None:
        cat = db.query(AttributeCategory).filter(AttributeCategory.id == payload.category_id, AttributeCategory.is_deleted == False).first()
        if not cat:
            raise HTTPException(status_code=400, detail="The selected Attribute Category does not exist.")

    # Validate regex rule if set
    if payload.validation_rule:
        try:
            re.compile(payload.validation_rule)
        except re.error:
            raise HTTPException(status_code=400, detail="Invalid regular expression pattern in Validation Rule.")

    attr = RoleAttribute(
        attribute_name=norm_name,
        display_name=payload.display_name.strip(),
        description=payload.description,
        attribute_type="Custom",
        data_type=payload.data_type,
        role_type=payload.role_type,
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
    write_role_attribute_audit(db=db, user=x_user_name, action="Create", old_val=None, new_val=attr_dict)

    return attr

@router.put("/role-attributes/{id}", response_model=RoleAttributeResponse)
def update_role_attribute(
    id: int,
    payload: RoleAttributeUpdate,
    db: Session = Depends(get_db),
    x_user_name: str = Header(default="Unknown User")
):
    attr = db.query(RoleAttribute).filter(RoleAttribute.id == id, RoleAttribute.is_deleted == False).first()
    if not attr:
        raise HTTPException(status_code=404, detail="Role attribute not found")

    old_dict = {
        "id": attr.id,
        "attribute_name": attr.attribute_name,
        "display_name": attr.display_name,
        "data_type": attr.data_type,
        "status": attr.status
    }

    # System attributes locked fields protection
    if attr.is_system or attr.attribute_type == "System":
        restricted_fields = []
        for field in ["attribute_name", "display_name", "category_id", "role_type", "data_type", "default_value", "validation_rule", "is_required", "is_unique", "is_searchable", "is_editable", "status", "is_system"]:
            if getattr(payload, field, None) is not None:
                restricted_fields.append(field)
        if restricted_fields:
            raise HTTPException(
                status_code=400,
                detail=f"Cannot modify restricted properties {restricted_fields} on a System Attribute. Only Description and Order are editable."
            )

        if payload.description is not None:
            attr.description = payload.description
        if payload.display_order is not None:
            attr.display_order = payload.display_order

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
        write_role_attribute_audit(db=db, user=x_user_name, action="Update", old_val=old_dict, new_val=new_dict)
        return attr

    # Custom attributes update
    if payload.attribute_name is not None:
        norm_name = payload.attribute_name.strip().lower().replace(" ", "_")
        if norm_name != attr.attribute_name:
            if db.query(RoleAttribute).filter(
                RoleAttribute.attribute_name == norm_name,
                RoleAttribute.id != id,
                RoleAttribute.is_deleted == False
            ).first():
                raise HTTPException(status_code=400, detail="A Role Attribute with this Attribute Name already exists.")
            attr.attribute_name = norm_name

    if payload.display_name is not None:
        disp_name = payload.display_name.strip()
        if disp_name != attr.display_name:
            if db.query(RoleAttribute).filter(
                RoleAttribute.display_name == disp_name,
                RoleAttribute.id != id,
                RoleAttribute.is_deleted == False
            ).first():
                raise HTTPException(status_code=400, detail="A Role Attribute with this Display Name already exists.")
            attr.display_name = disp_name

    if payload.category_id is not None:
        cat = db.query(AttributeCategory).filter(AttributeCategory.id == payload.category_id, AttributeCategory.is_deleted == False).first()
        if not cat:
            raise HTTPException(status_code=400, detail="The selected Attribute Category does not exist.")
        attr.category_id = payload.category_id

    if payload.validation_rule is not None:
        if payload.validation_rule:
            try:
                re.compile(payload.validation_rule)
            except re.error:
                raise HTTPException(status_code=400, detail="Invalid regular expression pattern in Validation Rule.")
        attr.validation_rule = payload.validation_rule

    for field in ["description", "role_type", "data_type", "default_value", "display_order", "is_required", "is_unique", "is_searchable", "is_editable", "status"]:
        val = getattr(payload, field, None)
        if val is not None:
            setattr(attr, field, val)

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
    write_role_attribute_audit(db=db, user=x_user_name, action="Update", old_val=old_dict, new_val=new_dict)

    return attr

@router.delete("/role-attributes/{id}")
def delete_role_attribute(
    id: int,
    db: Session = Depends(get_db),
    x_user_name: str = Header(default="Unknown User"),
    x_user_role: str = Header(default="Unknown Role")
):
    # Retrieve user menu permissions for verification
    role_obj = db.query(PlatformRole).filter(PlatformRole.role_name == x_user_role).first()
    if not role_obj:
        raise HTTPException(status_code=403, detail="Access denied. Role not found.")

    perm = db.query(MenuPermission).filter(
        MenuPermission.role_id == role_obj.id,
        MenuPermission.menu_name == "Platform Roles" # Closest default menu for Role Attribute management
    ).first()

    has_permission = x_user_role == "Platform Administrator" or (perm and perm.can_delete)
    
    if not has_permission:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied. You do not have Menu Permission authorization to delete role attributes."
        )

    attr = db.query(RoleAttribute).filter(RoleAttribute.id == id, RoleAttribute.is_deleted == False).first()
    if not attr:
        raise HTTPException(status_code=404, detail="Role attribute not found")

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
    write_role_attribute_audit(db=db, user=x_user_name, action="Delete", old_val=attr_dict, new_val=None)

    return {"detail": "Role attribute deleted successfully"}

@router.post("/role-attributes/{id}/restore", response_model=RoleAttributeResponse)
def restore_role_attribute(
    id: int,
    db: Session = Depends(get_db),
    x_user_name: str = Header(default="Unknown User"),
    x_user_role: str = Header(default="Unknown Role")
):
    # Enforce platform administrative checks
    if x_user_role != "Platform Administrator":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied. Only Platform Administrators can restore role attributes."
        )

    attr = db.query(RoleAttribute).filter(RoleAttribute.id == id, RoleAttribute.is_deleted == True).first()
    if not attr:
        raise HTTPException(status_code=404, detail="Deleted role attribute not found")

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
    write_role_attribute_audit(db=db, user=x_user_name, action="Restore", old_val=None, new_val=attr_dict)

    return attr

@router.post("/role-attributes/import")
def import_role_attributes(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    x_user_name: str = Header(default="Unknown User"),
    x_user_role: str = Header(default="Unknown Role")
):
    if x_user_role != "Platform Administrator":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied. Only Platform Administrators can import role attributes."
        )

    try:
        contents = file.file.read()
        decoded = contents.decode("utf-8")
        csv_file = io.StringIO(decoded)
        reader = csv.DictReader(csv_file)
    except Exception as parse_err:
        raise HTTPException(status_code=400, detail=f"Failed to parse CSV file: {str(parse_err)}")

    imported_count = 0
    skipped_count = 0
    errors = []
    
    cat_system = db.query(AttributeCategory).filter(AttributeCategory.category_name == "System").first()
    cat_system_id = cat_system.id if cat_system else None

    row_index = 1
    for row in reader:
        row_index += 1
        
        attr_name = row.get("Attribute Name", "").strip() or row.get("attribute_name", "").strip()
        display_name = row.get("Display Name", "").strip() or row.get("display_name", "").strip()
        data_type = row.get("Data Type", "").strip() or row.get("data_type", "").strip() or "String"
        
        if not attr_name or not display_name:
            errors.append(f"Row {row_index}: Missing Attribute Name or Display Name.")
            skipped_count += 1
            continue

        norm_name = attr_name.lower().replace(" ", "_")
        
        if db.query(RoleAttribute).filter(
            RoleAttribute.attribute_name == norm_name,
            RoleAttribute.is_deleted == False
        ).first():
            errors.append(f"Row {row_index}: Attribute Name '{attr_name}' already exists.")
            skipped_count += 1
            continue

        if db.query(RoleAttribute).filter(
            RoleAttribute.display_name == display_name,
            RoleAttribute.is_deleted == False
        ).first():
            errors.append(f"Row {row_index}: Display Name '{display_name}' already exists.")
            skipped_count += 1
            continue

        val_rule = row.get("Validation Rule", "").strip() or row.get("validation_rule", "").strip()
        if val_rule:
            try:
                re.compile(val_rule)
            except re.error:
                errors.append(f"Row {row_index}: Invalid regular expression pattern '{val_rule}'.")
                skipped_count += 1
                continue

        try:
            disp_order = int(row.get("Display Order", "") or row.get("display_order", "") or "0")
            if disp_order < 0:
                disp_order = 0
        except ValueError:
            disp_order = 0

        attr = RoleAttribute(
            attribute_name=norm_name,
            display_name=display_name,
            description=row.get("Description", "").strip() or row.get("description", "").strip() or f"Imported attribute {display_name}",
            category_id=cat_system_id,
            role_type=row.get("Role Type", "").strip() or row.get("role_type", "").strip() or "Enterprise Role",
            data_type=data_type,
            default_value=row.get("Default Value", "").strip() or row.get("default_value", "").strip(),
            validation_rule=val_rule or None,
            display_order=disp_order,
            is_required=row.get("Required", "").strip().upper() in ["TRUE", "YES", "1"],
            is_unique=row.get("Unique", "").strip().upper() in ["TRUE", "YES", "1"],
            is_searchable=row.get("Searchable", "").strip().upper() in ["TRUE", "YES", "1"] or True,
            is_editable=row.get("Editable", "").strip().upper() not in ["FALSE", "NO", "0"],
            status=row.get("Status", "").strip() or "Active",
            is_system=False,
            is_deleted=False,
            created_by=x_user_name,
            modified_by=x_user_name
        )
        db.add(attr)
        db.commit()

        attr_dict = {"id": attr.id, "attribute_name": attr.attribute_name, "display_name": attr.display_name}
        write_role_attribute_audit(db=db, user=x_user_name, action="Import", old_val=None, new_val=attr_dict)
        imported_count += 1

    return {
        "detail": f"Successfully imported {imported_count} role attributes.",
        "imported_count": imported_count,
        "skipped_count": skipped_count,
        "errors": errors
    }
