from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import Optional, List
from pydantic import BaseModel
from datetime import datetime

from app.database import get_db
from app.models.revocation import RevocationJob
from app.services.revocation_service import process_revocation_job

router = APIRouter(prefix="/api/revocation", tags=["Revocation Engine"])

class RevocationTriggerRequest(BaseModel):
    target_type: str  # GITHUB, AWS_IAM, MCP_SESSION, GENERIC
    target_identity: str
    target_entitlement: str
    created_by: Optional[str] = "System"
    simulated_failure: Optional[bool] = False  # Allows testing retries/escalations

@router.post("/trigger")
def trigger_revocation(req: RevocationTriggerRequest, db: Session = Depends(get_db)):
    """
    Creates a new RevocationJob and invokes target hooks with 3-retry escalation logic.
    """
    job = RevocationJob(
        target_type=req.target_type.upper(),
        target_identity=req.target_identity,
        target_entitlement=req.target_entitlement,
        status="PENDING",
        created_by=req.created_by or "System"
    )
    db.add(job)
    db.commit()
    db.refresh(job)
    
    if req.simulated_failure:
        # Simulate a hook failure for retry testing
        job.attempted_at = datetime.utcnow()
        job.retry_count += 1
        job.error_log = f"[Attempt {job.retry_count}/3] Simulated hook connection timeout."
        if job.retry_count >= job.max_retries:
            job.status = "ESCALATED"
            job.escalated_at = datetime.utcnow()
        else:
            job.status = "FAILED"
        db.commit()
        return job
        
    processed_job = process_revocation_job(db, job)
    return processed_job

@router.get("/jobs")
def list_revocation_jobs(
    status: Optional[str] = Query(None),
    target_type: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db)
):
    """
    Retrieves all revocation jobs with optional filtering by status and target_type.
    """
    query = db.query(RevocationJob)
    if status:
        query = query.filter(RevocationJob.status == status.upper())
    if target_type:
        query = query.filter(RevocationJob.target_type == target_type.upper())
        
    jobs = query.order_by(RevocationJob.created_at.desc()).limit(limit).all()
    return jobs

@router.get("/jobs/{job_id}")
def get_revocation_job(job_id: str, db: Session = Depends(get_db)):
    """
    Returns full details for a specific revocation job.
    """
    job = db.query(RevocationJob).filter(RevocationJob.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Revocation job not found.")
    return job

@router.post("/jobs/{job_id}/retry")
def retry_revocation_job(job_id: str, force_success: Optional[bool] = False, db: Session = Depends(get_db)):
    """
    Manually retries a FAILED or ESCALATED revocation job.
    If retry_count < max_retries, it attempts the next retry.
    If force_success is True, it simulates successful confirmation.
    """
    job = db.query(RevocationJob).filter(RevocationJob.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Revocation job not found.")
        
    if force_success:
        job.status = "CONFIRMED"
        job.confirmed_at = datetime.utcnow()
        job.confirmation_payload = '{"status": "CONFIRMED_MANUALLY", "verified": true}'
        job.error_log = None
        db.commit()
        return job

    if job.retry_count >= job.max_retries and job.status == "ESCALATED":
        # Reset retry counter for manual admin escalation retry
        job.retry_count = 0
        
    processed_job = process_revocation_job(db, job)
    return processed_job
