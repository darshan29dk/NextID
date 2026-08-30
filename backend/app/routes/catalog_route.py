from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional, List
from app.database import get_db
from app.services.security_context import SecurityContext, get_security_context
from app.models.catalog_item import CatalogItem

router = APIRouter(prefix="/api/v1/catalog", tags=["Access Catalog"])

class CreateCatalogItemRequest(BaseModel):
    name: str
    description: Optional[str] = None
    application_id: Optional[str] = None
    entitlement_id: Optional[str] = None
    risk_level: str = "LOW"
    requestable: bool = True
    approval_policy_id: Optional[str] = None
    sod_policy_id: Optional[str] = None
    default_ttl_hours: int = 24
    max_ttl_hours: int = 720
    requires_business_justification: bool = True
    owner_principal_id: Optional[str] = None

@router.get("")
def list_catalog_items(
    application_id: Optional[str] = None,
    risk_level: Optional[str] = None,
    requestable: Optional[bool] = None,
    owner_principal_id: Optional[str] = None,
    search: Optional[str] = None,
    db: Session = Depends(get_db),
    sec_ctx: SecurityContext = Depends(get_security_context)
):
    query = db.query(CatalogItem).filter(CatalogItem.tenant_id == sec_ctx.tenant_id, CatalogItem.status == "ACTIVE")

    if application_id:
        query = query.filter(CatalogItem.application_id == application_id)
    if risk_level:
        query = query.filter(CatalogItem.risk_level == risk_level.upper())
    if requestable is not None:
        query = query.filter(CatalogItem.requestable == requestable)
    if owner_principal_id:
        query = query.filter(CatalogItem.owner_principal_id == owner_principal_id)
    if search:
        query = query.filter(CatalogItem.name.ilike(f"%{search}%") | CatalogItem.description.ilike(f"%{search}%"))

    items = query.order_by(CatalogItem.name.asc()).all()
    return [{
        "id": item.id,
        "tenant_id": item.tenant_id,
        "name": item.name,
        "description": item.description,
        "application_id": item.application_id,
        "entitlement_id": item.entitlement_id,
        "risk_level": item.risk_level,
        "requestable": item.requestable,
        "approval_policy_id": item.approval_policy_id,
        "sod_policy_id": item.sod_policy_id,
        "default_ttl_hours": item.default_ttl_hours,
        "max_ttl_hours": item.max_ttl_hours,
        "requires_business_justification": item.requires_business_justification,
        "owner_principal_id": item.owner_principal_id,
        "status": item.status,
        "created_at": item.created_at.isoformat() if item.created_at else None
    } for item in items]

@router.get("/{id}")
def get_catalog_item(
    id: str,
    db: Session = Depends(get_db),
    sec_ctx: SecurityContext = Depends(get_security_context)
):
    item = db.query(CatalogItem).filter(CatalogItem.tenant_id == sec_ctx.tenant_id, CatalogItem.id == id).first()
    if not item:
        raise HTTPException(status_code=404, detail=f"Catalog Item '{id}' not found.")
    return {
        "id": item.id,
        "tenant_id": item.tenant_id,
        "name": item.name,
        "description": item.description,
        "application_id": item.application_id,
        "entitlement_id": item.entitlement_id,
        "risk_level": item.risk_level,
        "requestable": item.requestable,
        "approval_policy_id": item.approval_policy_id,
        "sod_policy_id": item.sod_policy_id,
        "default_ttl_hours": item.default_ttl_hours,
        "max_ttl_hours": item.max_ttl_hours,
        "requires_business_justification": item.requires_business_justification,
        "owner_principal_id": item.owner_principal_id,
        "status": item.status,
        "created_at": item.created_at.isoformat() if item.created_at else None
    }

@router.post("")
def create_catalog_item(
    req: CreateCatalogItemRequest,
    db: Session = Depends(get_db),
    sec_ctx: SecurityContext = Depends(get_security_context)
):
    item = CatalogItem(
        tenant_id=sec_ctx.tenant_id,
        name=req.name,
        description=req.description,
        application_id=req.application_id,
        entitlement_id=req.entitlement_id,
        risk_level=req.risk_level.upper(),
        requestable=req.requestable,
        approval_policy_id=req.approval_policy_id,
        sod_policy_id=req.sod_policy_id,
        default_ttl_hours=req.default_ttl_hours,
        max_ttl_hours=req.max_ttl_hours,
        requires_business_justification=req.requires_business_justification,
        owner_principal_id=req.owner_principal_id,
        status="ACTIVE"
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return {"status": "SUCCESS", "catalog_item_id": item.id}
