import hashlib
import logging
from datetime import datetime
from typing import Optional
from sqlalchemy.orm import Session
from app.models.audit_log import AuditLog

logger = logging.getLogger(__name__)

def compute_record_hash(
    previous_hash: Optional[str],
    module: str,
    action: str,
    performed_by: str,
    old_value: Optional[str],
    new_value: Optional[str],
    timestamp: datetime
) -> str:
    """
    Computes a deterministic SHA-256 hex digest chaining to previous_hash (or 'GENESIS').
    """
    prev = previous_hash or "GENESIS"
    ts_str = timestamp.isoformat() if timestamp else ""
    raw_data = f"{prev}|{module or ''}|{action or ''}|{performed_by or ''}|{old_value or ''}|{new_value or ''}|{ts_str}"
    return hashlib.sha256(raw_data.encode("utf-8")).hexdigest()

def append_audit_log(
    db: Session,
    module: str,
    action: str,
    performed_by: str,
    old_value: Optional[str] = None,
    new_value: Optional[str] = None
) -> AuditLog:
    """
    Fetches the most recent AuditLog row, computes tamper-evident record_hash,
    creates and commits the new AuditLog row.
    """
    last_log = db.query(AuditLog).order_by(AuditLog.id.desc()).first()
    previous_hash = last_log.record_hash if (last_log and last_log.record_hash) else "GENESIS"
    
    now = datetime.utcnow()
    rec_hash = compute_record_hash(
        previous_hash=previous_hash,
        module=module,
        action=action,
        performed_by=performed_by,
        old_value=old_value,
        new_value=new_value,
        timestamp=now
    )

    log_entry = AuditLog(
        module=module,
        action=action,
        performed_by=performed_by,
        old_value=old_value,
        new_value=new_value,
        timestamp=now,
        record_hash=rec_hash
    )
    
    db.add(log_entry)
    db.commit()
    db.refresh(log_entry)
    return log_entry
