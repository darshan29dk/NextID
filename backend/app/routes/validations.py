from fastapi import APIRouter, Depends, HTTPException, status, Header
from sqlalchemy.orm import Session
import json
from datetime import datetime
from typing import List, Optional

from app.database import get_db
from app.models.validation_rule import ValidationRule
from app.models.connector import Connector
from app.models.audit_log import AuditLog
from app.models.dashboard import RecentActivity
from app.schemas.validation_rule import (
    ValidationRuleCreate, ValidationRuleUpdate, ValidationRuleResponse,
    ValidationRulePaginatedResponse, TestValidationRequest, TestValidationResponse
)
from app.services.validation_engine import ValidationEngine

router = APIRouter()

# Authentication Helpers
def check_write_permission(x_user_role: str = Header(default="Read Only User")):
    if x_user_role not in ["Platform Administrator", "Data Steward"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied. Only Administrators and Data Stewards can configure rules."
        )

def check_delete_permission(x_user_role: str = Header(default="Read Only User")):
    if x_user_role != "Platform Administrator":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied. Only Platform Administrators can delete rules."
        )

# Audit Log Helper
def write_validation_audit(db: Session, user: str, action: str, old_val: dict = None, new_val: dict = None):
    try:
        old_val_str = json.dumps(old_val, default=str) if old_val else None
        new_val_str = json.dumps(new_val, default=str) if new_val else None

        audit = AuditLog(
            module="Validations",
            action=action, # "Create", "Update", "Delete", "Enable", "Disable"
            performed_by=user,
            old_value=old_val_str,
            new_value=new_val_str,
            timestamp=datetime.utcnow()
        )
        db.add(audit)

        # Recent Activity Feed
        rule_name = new_val.get("rule_name") if new_val else (old_val.get("rule_name") if old_val else "")
        activity = RecentActivity(
            user=user,
            action=f"Validation rule {rule_name} {action.lower()}d",
            status="info" if action != "Delete" else "warning",
            created_at=datetime.utcnow()
        )
        db.add(activity)
        db.commit()
    except Exception as e:
        print(f"Warning: Failed to write audit: {e}")

# Endpoints
@router.get("/connectors/{id}/validations", response_model=ValidationRulePaginatedResponse)
def get_validation_rules(
    id: int,
    page: int = 1,
    limit: int = 25,
    db: Session = Depends(get_db)
):
    if page < 1:
        page = 1
    if limit < 1:
        limit = 25

    query = db.query(ValidationRule).filter(
        ValidationRule.connector_id == id,
        ValidationRule.is_deleted == False
    )

    total = query.count()
    total_pages = (total + limit - 1) // limit if total > 0 else 0
    offset = (page - 1) * limit
    rules = query.order_by(ValidationRule.execution_order.asc()).offset(offset).limit(limit).all()

    return {
        "total": total,
        "page": page,
        "limit": limit,
        "total_pages": total_pages,
        "rules": rules
    }

@router.post("/connectors/{id}/validations", response_model=ValidationRuleResponse, dependencies=[Depends(check_write_permission)])
def create_validation_rule(
    id: int,
    payload: ValidationRuleCreate,
    db: Session = Depends(get_db),
    x_user_name: str = Header(default="System")
):
    connector = db.query(Connector).filter(Connector.id == id, Connector.is_deleted == False).first()
    if not connector:
        raise HTTPException(status_code=404, detail="Connector not found")

    rule = ValidationRule(
        connector_id=id,
        mapping_id=payload.mapping_id,
        rule_name=payload.rule_name,
        validation_type=payload.validation_type,
        parameters=payload.parameters,
        severity=payload.severity or "Error",
        error_message=payload.error_message,
        enabled=payload.enabled if payload.enabled is not None else True,
        execution_order=payload.execution_order or 0,
        created_by=x_user_name,
        modified_by=x_user_name
    )
    db.add(rule)
    db.commit()
    db.refresh(rule)

    rule_dict = {
        "id": rule.id,
        "rule_name": rule.rule_name,
        "validation_type": rule.validation_type,
        "severity": rule.severity,
        "enabled": rule.enabled
    }
    write_validation_audit(db, x_user_name, "Create", None, rule_dict)

    return rule

@router.put("/validations/{id}", response_model=ValidationRuleResponse, dependencies=[Depends(check_write_permission)])
def update_validation_rule(
    id: int,
    payload: ValidationRuleUpdate,
    db: Session = Depends(get_db),
    x_user_name: str = Header(default="System")
):
    rule = db.query(ValidationRule).filter(ValidationRule.id == id, ValidationRule.is_deleted == False).first()
    if not rule:
        raise HTTPException(status_code=404, detail="Validation rule not found")

    old_dict = {
        "id": rule.id,
        "rule_name": rule.rule_name,
        "validation_type": rule.validation_type,
        "severity": rule.severity,
        "enabled": rule.enabled
    }

    update_data = payload.dict(exclude_unset=True)
    for key, value in update_data.items():
        setattr(rule, key, value)

    rule.modified_by = x_user_name
    rule.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(rule)

    new_dict = {
        "id": rule.id,
        "rule_name": rule.rule_name,
        "validation_type": rule.validation_type,
        "severity": rule.severity,
        "enabled": rule.enabled
    }
    action = "Update"
    if "enabled" in update_data:
        action = "Enable" if rule.enabled else "Disable"
    write_validation_audit(db, x_user_name, action, old_dict, new_dict)

    return rule

@router.delete("/validations/{id}", dependencies=[Depends(check_delete_permission)])
def delete_validation_rule(
    id: int,
    db: Session = Depends(get_db),
    x_user_name: str = Header(default="System")
):
    rule = db.query(ValidationRule).filter(ValidationRule.id == id, ValidationRule.is_deleted == False).first()
    if not rule:
        raise HTTPException(status_code=404, detail="Validation rule not found")

    old_dict = {
        "id": rule.id,
        "rule_name": rule.rule_name,
        "validation_type": rule.validation_type,
        "severity": rule.severity,
        "enabled": rule.enabled
    }

    rule.is_deleted = True
    rule.modified_by = x_user_name
    rule.updated_at = datetime.utcnow()
    db.commit()

    write_validation_audit(db, x_user_name, "Delete", old_dict, None)

    return {"message": "Validation rule deleted successfully"}

@router.post("/test-rule/validate", response_model=TestValidationResponse)
def test_validation(payload: TestValidationRequest):
    try:
        val_res = ValidationEngine.validate_value(
            value=payload.value,
            validation_type=payload.validation_type,
            parameters_str=payload.parameters,
            error_message=None,
            seen_values=None,
            severity="Error"
        )
        return {
            "success": True,
            "status": val_res["status"],
            "message": val_res["message"]
        }
    except Exception as e:
        return {
            "success": False,
            "status": "Error",
            "message": str(e)
        }
