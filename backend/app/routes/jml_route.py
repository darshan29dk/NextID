from fastapi import APIRouter, Depends, HTTPException, Security
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional, Dict, Any, List
from app.database import get_db
from app.services.security_context import SecurityContext, get_security_context
from app.services.jml_engine import JMLEngine
from app.models.lifecycle_event import LifecycleEvent
from app.models.principal import Principal
from app.models.identity import Identity
from app.models.candidate_role import CandidateRole
from app.models.birthright_policy import BirthrightPolicy

router = APIRouter(prefix="/api/v1/jml", tags=["JML Engine"])

class JMLEventRequest(BaseModel):
    event_type: str  # JOINER, MOVER, LEAVER, REHIRE
    principal_id: str
    display_name: Optional[str] = None
    email: Optional[str] = None
    attributes: Optional[Dict[str, Any]] = None

class JMLSimulateRequest(BaseModel):
    event_type: str
    principal_id: str
    attributes: Optional[Dict[str, Any]] = None

@router.get("/metrics")
def get_jml_metrics(
    db: Session = Depends(get_db),
    sec_ctx: SecurityContext = Depends(get_security_context)
):
    tenant_id = sec_ctx.tenant_id
    events = db.query(LifecycleEvent).filter(LifecycleEvent.tenant_id == tenant_id).all()
    
    total = len(events)
    joiners = sum(1 for e in events if e.event_type == "JOINER")
    movers = sum(1 for e in events if e.event_type == "MOVER")
    leavers = sum(1 for e in events if e.event_type == "LEAVER")
    rehires = sum(1 for e in events if e.event_type == "REHIRE")
    
    active_principals = db.query(Principal).filter(Principal.tenant_id == tenant_id, Principal.status == "ACTIVE").count()
    frozen_principals = db.query(Principal).filter(Principal.tenant_id == tenant_id, Principal.status == "FROZEN").count()
    active_policies = db.query(BirthrightPolicy).filter(BirthrightPolicy.tenant_id == tenant_id, BirthrightPolicy.status == "ACTIVE").count()

    return {
        "total_events": total,
        "joiners": joiners,
        "movers": movers,
        "leavers": leavers,
        "rehires": rehires,
        "active_principals": active_principals,
        "frozen_principals": frozen_principals,
        "active_birthright_policies": active_policies
    }

@router.get("/principals")
def list_principals_for_jml(
    db: Session = Depends(get_db),
    sec_ctx: SecurityContext = Depends(get_security_context)
):
    tenant_id = sec_ctx.tenant_id
    principals = db.query(Principal).filter(Principal.tenant_id == tenant_id).order_by(Principal.created_at.desc()).limit(150).all()
    identities = {i.employee_id: i for i in db.query(Identity).filter(Identity.tenant_id == tenant_id).all()}
    
    result = []
    for p in principals:
        ident = identities.get(p.id)
        result.append({
            "id": p.id,
            "principal_type": p.principal_type or "HUMAN",
            "display_name": p.display_name or (ident.display_name if ident else p.id),
            "email": p.email or (ident.email if ident else None),
            "department": ident.department if ident else "Engineering",
            "job_title": ident.job_title if ident else "Staff Engineer",
            "manager": ident.manager if ident else None,
            "sponsor_id": p.sponsor_id,
            "status": p.status,
            "is_frozen": p.is_frozen,
            "authority_epoch": p.authority_epoch,
            "created_at": p.created_at.isoformat() if p.created_at else None
        })
    return result

@router.get("/role-options")
def get_role_options(
    db: Session = Depends(get_db),
    sec_ctx: SecurityContext = Depends(get_security_context)
):
    """
    Returns dynamically discovered departments and engineered roles
    from Candidate Roles (Role Engineering), Identity repository, and enterprise catalog.
    """
    candidate_roles = db.query(CandidateRole).filter(CandidateRole.is_deleted == False).all()
    ident_rows = db.query(Identity.department, Identity.job_title).filter(Identity.is_deleted == False).all()

    base_roles_by_dept = {
        "Engineering": [
            "Senior Site Reliability Engineer",
            "Cloud Infrastructure Architect",
            "Staff Backend Engineer",
            "DevOps Automation Specialist",
            "Principal Software Engineer",
            "Lead Systems Architect",
            "Frontend Platform Engineer"
        ],
        "Security": [
            "Security Operations Analyst",
            "IAM Infrastructure Lead",
            "Cloud Security Engineer",
            "Lead Penetration Tester",
            "Threat Intelligence Specialist",
            "GRC & Audit Officer"
        ],
        "IT & Infrastructure": [
            "IT Systems Administrator",
            "Senior Network Engineer",
            "Database Administrator",
            "Enterprise Service Desk Lead",
            "Virtualization Engineer"
        ],
        "Finance": [
            "Financial Controller",
            "Accounts Payable Specialist",
            "Corporate Treasury Analyst",
            "Senior Payroll Accountant",
            "Internal Audit Manager"
        ],
        "Operations": [
            "Operations Strategy Lead",
            "Global Logistics Coordinator",
            "Facilities Operations Manager",
            "Business Process Analyst"
        ],
        "Product": [
            "Principal Product Manager",
            "Technical Product Owner",
            "UX Research Lead",
            "Product Operations Manager"
        ],
        "Human Resources": [
            "People Operations Partner",
            "Talent Acquisition Lead",
            "HR Compliance Director",
            "Total Rewards Specialist"
        ],
        "Sales & Marketing": [
            "Enterprise Account Executive",
            "Solutions Architect (Pre-Sales)",
            "Product Marketing Manager",
            "Demand Generation Specialist"
        ]
    }

    dept_map = {k: list(v) for k, v in base_roles_by_dept.items()}

    # Merge from CandidateRole (Role Engineering)
    for cr in candidate_roles:
        d = (cr.department or "Engineering").strip()
        r = (cr.role_name or cr.job_function or "").strip()
        if d and r:
            if d not in dept_map:
                dept_map[d] = []
            if r not in dept_map[d]:
                dept_map[d].append(r)

    # Merge from Identity repository
    for d, jt in ident_rows:
        if d and jt:
            dept_clean = d.strip()
            # Normalize casing
            matched_dept = next((k for k in dept_map if k.lower() == dept_clean.lower()), dept_clean)
            if matched_dept not in dept_map:
                dept_map[matched_dept] = []
            if jt.strip() not in dept_map[matched_dept]:
                dept_map[matched_dept].append(jt.strip())

    departments = sorted(list(dept_map.keys()))
    
    return {
        "departments": departments,
        "roles_by_department": dept_map
    }

@router.post("/simulate")
def simulate_jml_event(
    req: JMLSimulateRequest,
    db: Session = Depends(get_db),
    sec_ctx: SecurityContext = Depends(get_security_context)
):
    return JMLEngine.simulate_event(
        db=db,
        tenant_id=sec_ctx.tenant_id,
        event_type=req.event_type,
        principal_id=req.principal_id,
        attributes=req.attributes
    )

@router.post("/events")
def trigger_jml_event(
    req: JMLEventRequest,
    db: Session = Depends(get_db),
    sec_ctx: SecurityContext = Depends(get_security_context)
):
    event_type = req.event_type.upper()
    tenant_id = sec_ctx.tenant_id

    if event_type == "JOINER":
        if not req.display_name:
            raise HTTPException(status_code=400, detail="display_name is required for JOINER event.")
        return JMLEngine.process_joiner(
            db=db,
            tenant_id=tenant_id,
            principal_id=req.principal_id,
            display_name=req.display_name,
            email=req.email,
            attributes=req.attributes
        )
    elif event_type == "MOVER":
        return JMLEngine.process_mover(
            db=db,
            tenant_id=tenant_id,
            principal_id=req.principal_id,
            new_attributes=req.attributes or {}
        )
    elif event_type == "LEAVER":
        return JMLEngine.process_leaver(
            db=db,
            tenant_id=tenant_id,
            principal_id=req.principal_id
        )
    elif event_type == "REHIRE":
        return JMLEngine.process_rehire(
            db=db,
            tenant_id=tenant_id,
            principal_id=req.principal_id,
            display_name=req.display_name,
            email=req.email,
            attributes=req.attributes
        )
    else:
        raise HTTPException(status_code=400, detail=f"Unsupported JML event type '{event_type}'. Must be JOINER, MOVER, LEAVER, or REHIRE.")

@router.get("/events")
def list_jml_events(
    db: Session = Depends(get_db),
    sec_ctx: SecurityContext = Depends(get_security_context)
):
    events = db.query(LifecycleEvent).filter(LifecycleEvent.tenant_id == sec_ctx.tenant_id).order_by(LifecycleEvent.created_at.desc()).all()
    return [{
        "id": e.id,
        "tenant_id": e.tenant_id,
        "principal_id": e.principal_id,
        "event_type": e.event_type,
        "source": e.source,
        "status": e.status,
        "effective_at": e.effective_at.isoformat() if e.effective_at else None,
        "created_at": e.created_at.isoformat() if e.created_at else None
    } for e in events]

@router.get("/events/{id}")
def get_jml_event(
    id: str,
    db: Session = Depends(get_db),
    sec_ctx: SecurityContext = Depends(get_security_context)
):
    event = db.query(LifecycleEvent).filter(LifecycleEvent.tenant_id == sec_ctx.tenant_id, LifecycleEvent.id == id).first()
    if not event:
        raise HTTPException(status_code=404, detail=f"JML Event '{id}' not found.")
    return {
        "id": event.id,
        "tenant_id": event.tenant_id,
        "principal_id": event.principal_id,
        "event_type": event.event_type,
        "source": event.source,
        "status": event.status,
        "payload": event.payload,
        "effective_at": event.effective_at.isoformat() if event.effective_at else None,
        "created_at": event.created_at.isoformat() if event.created_at else None
    }
