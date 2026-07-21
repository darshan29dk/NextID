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
from app.models.entitlement_attribute import EntitlementAttribute
from app.models.audit_log import AuditLog
from app.models.dashboard import RecentActivity
from app.schemas.entitlement_attribute import (
    EntitlementAttributeCreate, EntitlementAttributeUpdate, EntitlementAttributeResponse,
    EntitlementAttributePaginatedResponse, EntitlementAttributeDetailResponse,
    EntitlementAttributeBulkStatusRequest, EntitlementAttributeBulkDeleteRequest,
    AttributeUsageInfo
)

router = APIRouter()

# Helper for Audit Logging
def write_entitlement_attribute_audit(db: Session, user: str, action: str, old_val: dict = None, new_val: dict = None):
    try:
        old_val_str = json.dumps(old_val, default=str) if old_val else None
        new_val_str = json.dumps(new_val, default=str) if new_val else None

        audit = AuditLog(
            module="Entitlement Attributes",
            action=action, # "Create", "Update", "Delete", "Restore", "Bulk Status", "Bulk Delete", "Import"
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
            action=f"Entitlement Attribute {action.lower()}d - {attr_label}" if attr_label else f"Entitlement Attributes {action.lower()}d",
            status="info" if action not in ["Delete", "Deactivate"] else "warning",
            created_at=datetime.utcnow()
        )
        db.add(activity)
        db.commit()
    except Exception as e:
        print(f"Warning: Failed to write entitlement attribute audit: {e}")

@router.get("/entitlement-attributes", response_model=EntitlementAttributePaginatedResponse)
def get_entitlement_attributes(
    page: int = 1,
    limit: int = 25,
    search: Optional[str] = None,
    status: Optional[str] = None,
    category_id: Optional[int] = None,
    application_name: Optional[str] = None,
    entitlement_type: Optional[str] = None,
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

    query = db.query(EntitlementAttribute)
    
    if not include_deleted:
        query = query.filter(EntitlementAttribute.is_deleted == False)

    # 1. Search Query
    if search:
        search_term = f"%{search}%"
        query = query.filter(
            or_(
                EntitlementAttribute.attribute_name.like(search_term),
                EntitlementAttribute.display_name.like(search_term),
                EntitlementAttribute.description.like(search_term)
            )
        )

    # 2. Filters
    if status:
        query = query.filter(EntitlementAttribute.status == status)
    if category_id is not None:
        query = query.filter(EntitlementAttribute.category_id == category_id)
    if application_name:
        query = query.filter(EntitlementAttribute.application_name == application_name)
    if entitlement_type:
        query = query.filter(EntitlementAttribute.entitlement_type == entitlement_type)
    if data_type:
        query = query.filter(EntitlementAttribute.data_type == data_type)
    if is_required is not None:
        query = query.filter(EntitlementAttribute.is_required == is_required)
    if is_searchable is not None:
        query = query.filter(EntitlementAttribute.is_searchable == is_searchable)
    if is_editable is not None:
        query = query.filter(EntitlementAttribute.is_editable == is_editable)

    # 3. Sorting
    sort_fields = {
        "attribute_name": EntitlementAttribute.attribute_name,
        "created_at": EntitlementAttribute.created_at,
        "display_order": EntitlementAttribute.display_order,
        "status": EntitlementAttribute.status
    }
    
    selected_sort = sort_fields.get(sortBy, EntitlementAttribute.display_order)
    if sortOrder == "desc":
        query = query.order_by(desc(selected_sort))
    else:
        query = query.order_by(asc(selected_sort))

    total = query.count()
    total_pages = (total + limit - 1) // limit if total > 0 else 1
    results = query.offset((page - 1) * limit).limit(limit).all()

    return EntitlementAttributePaginatedResponse(
        total=total,
        page=page,
        limit=limit,
        total_pages=total_pages,
        attributes=results
    )

@router.get("/entitlement-attributes/{id}", response_model=EntitlementAttributeDetailResponse)
def get_entitlement_attribute_detail(id: int, db: Session = Depends(get_db)):
    attr = db.query(EntitlementAttribute).filter(EntitlementAttribute.id == id).first()
    if not attr:
        raise HTTPException(status_code=404, detail="Entitlement attribute not found")

    # Fetch audit history logs for this specific attribute name
    attr_search_term = f'%"{attr.attribute_name}"%'
    audit_trail = db.query(AuditLog).filter(
        AuditLog.module == "Entitlement Attributes",
        or_(
            AuditLog.old_value.like(attr_search_term),
            AuditLog.new_value.like(attr_search_term)
        )
    ).order_by(AuditLog.timestamp.desc()).all()

    # Generate deterministic mock usage details based on attribute characteristics
    usage_info = AttributeUsageInfo(
        roles_count=(attr.display_order * 2 + 3) % 8 + 1,
        systems_count=1 if attr.is_system else ((attr.id % 3) + 1),
        policies_count=(attr.id * 3) % 6,
        active_mappings_count=(attr.id * 4 + 7) % 25 + 5
    )

    return EntitlementAttributeDetailResponse(
        attribute=attr,
        audit_history=audit_trail,
        usage=usage_info
    )

@router.post("/entitlement-attributes", response_model=EntitlementAttributeResponse, status_code=status.HTTP_201_CREATED)
def create_entitlement_attribute(
    payload: EntitlementAttributeCreate,
    db: Session = Depends(get_db),
    x_user_name: str = Header(default="Unknown User")
):
    # Uniqueness checks
    norm_name = payload.attribute_name.strip().lower().replace(" ", "_")
    
    if db.query(EntitlementAttribute).filter(
        EntitlementAttribute.attribute_name == norm_name,
        EntitlementAttribute.is_deleted == False
    ).first():
        raise HTTPException(status_code=400, detail="An Entitlement Attribute with this Attribute Name already exists.")

    if db.query(EntitlementAttribute).filter(
        EntitlementAttribute.display_name == payload.display_name.strip(),
        EntitlementAttribute.is_deleted == False
    ).first():
        raise HTTPException(status_code=400, detail="An Entitlement Attribute with this Display Name already exists.")

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

    attr = EntitlementAttribute(
        attribute_name=norm_name,
        display_name=payload.display_name.strip(),
        description=payload.description,
        attribute_type="Custom",
        data_type=payload.data_type,
        application_name=payload.application_name,
        entitlement_type=payload.entitlement_type,
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
    write_entitlement_attribute_audit(db=db, user=x_user_name, action="Create", old_val=None, new_val=attr_dict)

    return attr

@router.put("/entitlement-attributes/{id}", response_model=EntitlementAttributeResponse)
def update_entitlement_attribute(
    id: int,
    payload: EntitlementAttributeUpdate,
    db: Session = Depends(get_db),
    x_user_name: str = Header(default="Unknown User")
):
    attr = db.query(EntitlementAttribute).filter(EntitlementAttribute.id == id, EntitlementAttribute.is_deleted == False).first()
    if not attr:
        raise HTTPException(status_code=404, detail="Entitlement attribute not found")

    old_dict = {
        "id": attr.id,
        "attribute_name": attr.attribute_name,
        "display_name": attr.display_name,
        "data_type": attr.data_type,
        "status": attr.status
    }

    # If system attribute, restrict modification fields
    if attr.is_system or attr.attribute_type == "System":
        # Check if they are trying to modify restricted fields
        restricted_fields = []
        for field in ["attribute_name", "display_name", "category_id", "application_name", "entitlement_type", "data_type", "default_value", "validation_rule", "is_required", "is_unique", "is_searchable", "is_editable", "status", "is_system"]:
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
        write_entitlement_attribute_audit(db=db, user=x_user_name, action="Update", old_val=old_dict, new_val=new_dict)
        return attr

    # Custom Attribute Update logic
    if payload.attribute_name is not None:
        norm_name = payload.attribute_name.strip().lower().replace(" ", "_")
        if norm_name != attr.attribute_name:
            if db.query(EntitlementAttribute).filter(
                EntitlementAttribute.attribute_name == norm_name,
                EntitlementAttribute.id != id,
                EntitlementAttribute.is_deleted == False
            ).first():
                raise HTTPException(status_code=400, detail="An Entitlement Attribute with this Attribute Name already exists.")
            attr.attribute_name = norm_name

    if payload.display_name is not None:
        disp_name = payload.display_name.strip()
        if disp_name != attr.display_name:
            if db.query(EntitlementAttribute).filter(
                EntitlementAttribute.display_name == disp_name,
                EntitlementAttribute.id != id,
                EntitlementAttribute.is_deleted == False
            ).first():
                raise HTTPException(status_code=400, detail="An Entitlement Attribute with this Display Name already exists.")
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

    # Map other fields
    for field in ["description", "application_name", "entitlement_type", "data_type", "default_value", "display_order", "is_required", "is_unique", "is_searchable", "is_editable", "status"]:
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
    write_entitlement_attribute_audit(db=db, user=x_user_name, action="Update", old_val=old_dict, new_val=new_dict)

    return attr

@router.delete("/entitlement-attributes/{id}")
def delete_entitlement_attribute(
    id: int,
    db: Session = Depends(get_db),
    x_user_name: str = Header(default="Unknown User"),
    x_user_role: str = Header(default="Unknown Role")
):
    # Enforce role-based permission
    if x_user_role != "Platform Administrator":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied. Only Platform Administrators can delete entitlement attributes."
        )

    attr = db.query(EntitlementAttribute).filter(EntitlementAttribute.id == id, EntitlementAttribute.is_deleted == False).first()
    if not attr:
        raise HTTPException(status_code=404, detail="Entitlement attribute not found")

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
    write_entitlement_attribute_audit(db=db, user=x_user_name, action="Delete", old_val=attr_dict, new_val=None)

    return {"detail": "Entitlement attribute deleted successfully"}

@router.post("/entitlement-attributes/{id}/restore", response_model=EntitlementAttributeResponse)
def restore_entitlement_attribute(
    id: int,
    db: Session = Depends(get_db),
    x_user_name: str = Header(default="Unknown User"),
    x_user_role: str = Header(default="Unknown Role")
):
    # Enforce role-based permission
    if x_user_role != "Platform Administrator":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied. Only Platform Administrators can restore entitlement attributes."
        )

    attr = db.query(EntitlementAttribute).filter(EntitlementAttribute.id == id, EntitlementAttribute.is_deleted == True).first()
    if not attr:
        raise HTTPException(status_code=404, detail="Deleted entitlement attribute not found")

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
    write_entitlement_attribute_audit(db=db, user=x_user_name, action="Restore", old_val=None, new_val=attr_dict)

    return attr

@router.post("/entitlement-attributes/bulk-status")
def bulk_update_status(
    payload: EntitlementAttributeBulkStatusRequest,
    db: Session = Depends(get_db),
    x_user_name: str = Header(default="Unknown User")
):
    count = 0
    updated_names = []
    
    # Restrict status changes to custom attributes OR allow modifying status if required.
    # Note: Default system attributes have system restrictions, but let's allow bulk activating/deactivating
    # custom ones and warn or skip system ones if they are locked.
    for attr_id in payload.ids:
        attr = db.query(EntitlementAttribute).filter(EntitlementAttribute.id == attr_id, EntitlementAttribute.is_deleted == False).first()
        if attr:
            if attr.is_system or attr.attribute_type == "System":
                # System attributes cannot have their status modified easily in some configurations,
                # let's skip modification of system status to prevent lockouts.
                continue
            
            old_dict = {"id": attr.id, "attribute_name": attr.attribute_name, "status": attr.status}
            attr.status = payload.status
            attr.updated_at = datetime.utcnow()
            attr.modified_by = x_user_name
            db.commit()
            
            new_dict = {"id": attr.id, "attribute_name": attr.attribute_name, "status": attr.status}
            write_entitlement_attribute_audit(db=db, user=x_user_name, action="Bulk Status", old_val=old_dict, new_val=new_dict)
            count += 1
            updated_names.append(attr.display_name)

    return {"detail": f"Successfully updated status to {payload.status} for {count} custom attributes.", "names": updated_names}

@router.post("/entitlement-attributes/bulk-delete")
def bulk_delete_attributes(
    payload: EntitlementAttributeBulkDeleteRequest,
    db: Session = Depends(get_db),
    x_user_name: str = Header(default="Unknown User"),
    x_user_role: str = Header(default="Unknown Role")
):
    # Enforce role-based permission
    if x_user_role != "Platform Administrator":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied. Only Platform Administrators can delete entitlement attributes."
        )

    count = 0
    skipped_system = 0
    deleted_names = []

    for attr_id in payload.ids:
        attr = db.query(EntitlementAttribute).filter(EntitlementAttribute.id == attr_id, EntitlementAttribute.is_deleted == False).first()
        if attr:
            if attr.is_system or attr.attribute_type == "System":
                skipped_system += 1
                continue
            
            attr.is_deleted = True
            attr.updated_at = datetime.utcnow()
            attr.modified_by = x_user_name
            db.commit()

            attr_dict = {"id": attr.id, "attribute_name": attr.attribute_name, "display_name": attr.display_name}
            write_entitlement_attribute_audit(db=db, user=x_user_name, action="Bulk Delete", old_val=attr_dict, new_val=None)
            count += 1
            deleted_names.append(attr.display_name)

    return {
        "detail": f"Successfully deleted {count} custom attributes.",
        "skipped_system_count": skipped_system,
        "deleted_names": deleted_names
    }

@router.post("/entitlement-attributes/import")
def import_entitlement_attributes(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    x_user_name: str = Header(default="Unknown User"),
    x_user_role: str = Header(default="Unknown Role")
):
    # Enforce administrative access
    if x_user_role != "Platform Administrator":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied. Only Platform Administrators can import entitlement attributes."
        )

    try:
        contents = file.file.read()
        decoded = contents.decode("utf-8")
        csv_file = io.StringIO(decoded)
        # Parse CSV fields
        reader = csv.DictReader(csv_file)
    except Exception as parse_err:
        raise HTTPException(status_code=400, detail=f"Failed to parse CSV file: {str(parse_err)}")

    imported_count = 0
    skipped_count = 0
    errors = []
    
    # Get standard Category Systems
    cat_system = db.query(AttributeCategory).filter(AttributeCategory.category_name == "System").first()
    cat_system_id = cat_system.id if cat_system else None

    row_index = 1
    for row in reader:
        row_index += 1
        
        # Required columns mapping
        attr_name = row.get("Attribute Name", "").strip() or row.get("attribute_name", "").strip()
        display_name = row.get("Display Name", "").strip() or row.get("display_name", "").strip()
        data_type = row.get("Data Type", "").strip() or row.get("data_type", "").strip() or "String"
        
        if not attr_name or not display_name:
            errors.append(f"Row {row_index}: Missing Attribute Name or Display Name.")
            skipped_count += 1
            continue

        norm_name = attr_name.lower().replace(" ", "_")
        
        # Verify duplicate names
        if db.query(EntitlementAttribute).filter(
            EntitlementAttribute.attribute_name == norm_name,
            EntitlementAttribute.is_deleted == False
        ).first():
            errors.append(f"Row {row_index}: Attribute Name '{attr_name}' already exists.")
            skipped_count += 1
            continue

        if db.query(EntitlementAttribute).filter(
            EntitlementAttribute.display_name == display_name,
            EntitlementAttribute.is_deleted == False
        ).first():
            errors.append(f"Row {row_index}: Display Name '{display_name}' already exists.")
            skipped_count += 1
            continue

        # Validate regex rule if set
        val_rule = row.get("Validation Rule", "").strip() or row.get("validation_rule", "").strip()
        if val_rule:
            try:
                re.compile(val_rule)
            except re.error:
                errors.append(f"Row {row_index}: Invalid regular expression pattern '{val_rule}'.")
                skipped_count += 1
                continue

        # Resolve display order
        try:
            disp_order = int(row.get("Display Order", "") or row.get("display_order", "") or "0")
            if disp_order < 0:
                disp_order = 0
        except ValueError:
            disp_order = 0

        # Construct model
        attr = EntitlementAttribute(
            attribute_name=norm_name,
            display_name=display_name,
            description=row.get("Description", "").strip() or row.get("description", "").strip() or f"Imported attribute {display_name}",
            category_id=cat_system_id,
            application_name=row.get("Application", "").strip() or row.get("application", "").strip() or row.get("application_name", "").strip(),
            entitlement_type=row.get("Entitlement Type", "").strip() or row.get("entitlement_type", "").strip(),
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
        write_entitlement_attribute_audit(db=db, user=x_user_name, action="Import", old_val=None, new_val=attr_dict)
        imported_count += 1

    return {
        "detail": f"Successfully imported {imported_count} entitlement attributes.",
        "imported_count": imported_count,
        "skipped_count": skipped_count,
        "errors": errors
    }
