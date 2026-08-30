from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
from app.database import get_db
from app.services.security_context import SecurityContext, get_security_context
from app.models.access_request import AccessRequest
from app.models.catalog_item import CatalogItem

router = APIRouter(prefix="/api/v1/access-requests", tags=["Access Request Engine"])

class CreateAccessRequest(BaseModel):
    catalog_item_id: str
    target_principal_id: Optional[str] = None
    business_justification: Optional[str] = None
    requested_ttl_hours: Optional[int] = None

@router.post("")
def create_access_request(
    req: CreateAccessRequest,
    db: Session = Depends(get_db),
    sec_ctx: SecurityContext = Depends(get_security_context)
):
    catalog_item = db.query(CatalogItem).filter(
        CatalogItem.tenant_id == sec_ctx.tenant_id,
        CatalogItem.id == req.catalog_item_id
    ).first()

    if not catalog_item:
        raise HTTPException(status_code=404, detail=f"Catalog Item '{req.catalog_item_id}' not found.")

    if not catalog_item.requestable:
        raise HTTPException(status_code=400, detail=f"Catalog Item '{catalog_item.name}' is not requestable.")

    if catalog_item.requires_business_justification and not req.business_justification:
        raise HTTPException(status_code=400, detail="Business justification is required for this catalog item.")

    ttl = req.requested_ttl_hours or catalog_item.default_ttl_hours
    if ttl > catalog_item.max_ttl_hours:
        raise HTTPException(status_code=400, detail=f"Requested TTL ({ttl}h) exceeds maximum allowed ({catalog_item.max_ttl_hours}h).")

    target_principal_id = req.target_principal_id or sec_ctx.principal_id or "user_default"

    access_req = AccessRequest(
        tenant_id=sec_ctx.tenant_id,
        requester_principal_id=sec_ctx.principal_id or "user_default",
        target_principal_id=target_principal_id,
        catalog_item_id=catalog_item.id,
        requested_entitlement_id=catalog_item.entitlement_id,
        business_justification=req.business_justification,
        requested_ttl_hours=ttl,
        status="SUBMITTED"
    )
    db.add(access_req)
    db.commit()
    db.refresh(access_req)

    return {
        "status": "SUCCESS",
        "access_request_id": access_req.id,
        "request_status": access_req.status
    }

@router.get("")
def list_access_requests(
    status: Optional[str] = None,
    requester_principal_id: Optional[str] = None,
    target_principal_id: Optional[str] = None,
    db: Session = Depends(get_db),
    sec_ctx: SecurityContext = Depends(get_security_context)
):
    query = db.query(AccessRequest).filter(AccessRequest.tenant_id == sec_ctx.tenant_id)
    if status:
        query = query.filter(AccessRequest.status == status.upper())
    if requester_principal_id:
        query = query.filter(AccessRequest.requester_principal_id == requester_principal_id)
    if target_principal_id:
        query = query.filter(AccessRequest.target_principal_id == target_principal_id)

    requests = query.order_by(AccessRequest.created_at.desc()).all()
    return [{
        "id": r.id,
        "tenant_id": r.tenant_id,
        "requester_principal_id": r.requester_principal_id,
        "target_principal_id": r.target_principal_id,
        "catalog_item_id": r.catalog_item_id,
        "requested_entitlement_id": r.requested_entitlement_id,
        "business_justification": r.business_justification,
        "requested_ttl_hours": r.requested_ttl_hours,
        "status": r.status,
        "created_at": r.created_at.isoformat() if r.created_at else None,
        "updated_at": r.updated_at.isoformat() if r.updated_at else None
    } for r in requests]

@router.get("/{id}")
def get_access_request(
    id: str,
    db: Session = Depends(get_db),
    sec_ctx: SecurityContext = Depends(get_security_context)
):
    r = db.query(AccessRequest).filter(AccessRequest.tenant_id == sec_ctx.tenant_id, AccessRequest.id == id).first()
    if not r:
        raise HTTPException(status_code=404, detail=f"Access Request '{id}' not found.")
    return {
        "id": r.id,
        "tenant_id": r.tenant_id,
        "requester_principal_id": r.requester_principal_id,
        "target_principal_id": r.target_principal_id,
        "catalog_item_id": r.catalog_item_id,
        "requested_entitlement_id": r.requested_entitlement_id,
        "business_justification": r.business_justification,
        "requested_ttl_hours": r.requested_ttl_hours,
        "status": r.status,
        "policy_decision_id": r.policy_decision_id,
        "error_message": r.error_message,
        "created_at": r.created_at.isoformat() if r.created_at else None,
        "updated_at": r.updated_at.isoformat() if r.updated_at else None
    }

from app.models.access_request import AccessRequest, AccessRequestState

@router.post("/{id}/cancel")
def cancel_access_request(
    id: str,
    db: Session = Depends(get_db),
    sec_ctx: SecurityContext = Depends(get_security_context)
):
    r = db.query(AccessRequest).filter(AccessRequest.tenant_id == sec_ctx.tenant_id, AccessRequest.id == id).first()
    if not r:
        raise HTTPException(status_code=404, detail=f"Access Request '{id}' not found.")

    try:
        if r.status == AccessRequestState.FULFILLED:
            r.transition_to(AccessRequestState.REVOKED)
        else:
            r.transition_to(AccessRequestState.CANCELLED)
        db.commit()
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    return {"status": "SUCCESS", "access_request_id": r.id, "request_status": r.status}
