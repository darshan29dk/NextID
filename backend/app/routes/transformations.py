from fastapi import APIRouter, Depends, HTTPException, status, Header
from sqlalchemy.orm import Session
import json
from datetime import datetime
from typing import List, Optional

from app.database import get_db
from app.models.transformation_rule import TransformationRule
from app.models.connector import Connector
from app.models.audit_log import AuditLog
from app.models.dashboard import RecentActivity
from app.schemas.transformation_rule import (
    TransformationRuleCreate, TransformationRuleUpdate, TransformationRuleResponse,
    TransformationRulePaginatedResponse, TestTransformationRequest, TestTransformationResponse
)
from app.services.transformation_engine import TransformationEngine

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
def write_transformation_audit(db: Session, user: str, action: str, old_val: dict = None, new_val: dict = None):
    try:
        old_val_str = json.dumps(old_val, default=str) if old_val else None
        new_val_str = json.dumps(new_val, default=str) if new_val else None

        audit = AuditLog(
            module="Transformations",
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
            action=f"Transformation rule {rule_name} {action.lower()}d",
            status="info" if action != "Delete" else "warning",
            created_at=datetime.utcnow()
        )
        db.add(activity)
        db.commit()
    except Exception as e:
        print(f"Warning: Failed to write audit: {e}")

# Endpoints
@router.get("/connectors/{id}/transformations", response_model=TransformationRulePaginatedResponse)
def get_transformation_rules(
    id: int,
    page: int = 1,
    limit: int = 25,
    db: Session = Depends(get_db)
):
    if page < 1:
        page = 1
    if limit < 1:
        limit = 25

    query = db.query(TransformationRule).filter(
        TransformationRule.connector_id == id,
        TransformationRule.is_deleted == False
    )

    total = query.count()
    total_pages = (total + limit - 1) // limit if total > 0 else 0
    offset = (page - 1) * limit
    rules = query.order_by(TransformationRule.execution_order.asc()).offset(offset).limit(limit).all()

    return {
        "total": total,
        "page": page,
        "limit": limit,
        "total_pages": total_pages,
        "rules": rules
    }

@router.post("/connectors/{id}/transformations", response_model=TransformationRuleResponse, dependencies=[Depends(check_write_permission)])
def create_transformation_rule(
    id: int,
    payload: TransformationRuleCreate,
    db: Session = Depends(get_db),
    x_user_name: str = Header(default="System")
):
    connector = db.query(Connector).filter(Connector.id == id, Connector.is_deleted == False).first()
    if not connector:
        raise HTTPException(status_code=404, detail="Connector not found")

    rule = TransformationRule(
        connector_id=id,
        mapping_id=payload.mapping_id,
        rule_name=payload.rule_name,
        transformation_type=payload.transformation_type,
        expression=payload.expression,
        parameters=payload.parameters,
        execution_order=payload.execution_order or 0,
        enabled=payload.enabled if payload.enabled is not None else True,
        created_by=x_user_name,
        modified_by=x_user_name
    )
    db.add(rule)
    db.commit()
    db.refresh(rule)

    rule_dict = {
        "id": rule.id,
        "rule_name": rule.rule_name,
        "transformation_type": rule.transformation_type,
        "enabled": rule.enabled
    }
    write_transformation_audit(db, x_user_name, "Create", None, rule_dict)

    return rule

@router.put("/transformations/{id}", response_model=TransformationRuleResponse, dependencies=[Depends(check_write_permission)])
def update_transformation_rule(
    id: int,
    payload: TransformationRuleUpdate,
    db: Session = Depends(get_db),
    x_user_name: str = Header(default="System")
):
    rule = db.query(TransformationRule).filter(TransformationRule.id == id, TransformationRule.is_deleted == False).first()
    if not rule:
        raise HTTPException(status_code=404, detail="Transformation rule not found")

    old_dict = {
        "id": rule.id,
        "rule_name": rule.rule_name,
        "transformation_type": rule.transformation_type,
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
        "transformation_type": rule.transformation_type,
        "enabled": rule.enabled
    }
    action = "Update"
    if "enabled" in update_data:
        action = "Enable" if rule.enabled else "Disable"
    write_transformation_audit(db, x_user_name, action, old_dict, new_dict)

    return rule

@router.delete("/transformations/{id}", dependencies=[Depends(check_delete_permission)])
def delete_transformation_rule(
    id: int,
    db: Session = Depends(get_db),
    x_user_name: str = Header(default="System")
):
    rule = db.query(TransformationRule).filter(TransformationRule.id == id, TransformationRule.is_deleted == False).first()
    if not rule:
        raise HTTPException(status_code=404, detail="Transformation rule not found")

    old_dict = {
        "id": rule.id,
        "rule_name": rule.rule_name,
        "transformation_type": rule.transformation_type,
        "enabled": rule.enabled
    }

    rule.is_deleted = True
    rule.modified_by = x_user_name
    rule.updated_at = datetime.utcnow()
    db.commit()

    write_transformation_audit(db, x_user_name, "Delete", old_dict, None)

    return {"message": "Transformation rule deleted successfully"}

@router.post("/test-rule/transform", response_model=TestTransformationResponse)
def test_transformation(payload: TestTransformationRequest):
    try:
        output = TransformationEngine.transform_value(
            value=payload.value,
            rule_type=payload.transformation_type,
            expression=payload.expression,
            parameters_str=payload.parameters,
            row_data={"value": payload.value}
        )
        return {
            "success": True,
            "output_value": str(output),
            "error_message": None
        }
    except Exception as e:
        return {
            "success": False,
            "output_value": None,
            "error_message": str(e)
        }
