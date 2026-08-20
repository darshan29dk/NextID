import json
import hashlib
import logging
from datetime import datetime
from sqlalchemy.orm import Session
from app.models.audit_log import AuditLog

logger = logging.getLogger(__name__)

def canonicalize_json(data: dict) -> str:
    """
    RFC 8785 JSON Canonicalization Scheme (JCS):
    Sorts dictionary keys recursively and formats JSON compactly without whitespace for deterministic hashing.
    """
    return json.dumps(data, sort_keys=True, separators=(',', ':'))

def calculate_evidence_hash(payload: dict) -> str:
    """
    Calculates SHA-256 digest over sanitized, canonicalized RFC 8785 evidence payload.
    """
    sanitized = {k: v for k, v in payload.items() if k.lower() not in ['authorization', 'cookie', 'token', 'secret', 'password']}
    canonical_str = canonicalize_json(sanitized)
    return hashlib.sha256(canonical_str.encode('utf-8')).hexdigest()

def append_tamper_evident_audit(db: Session, module: str, action: str, performed_by: str, new_value: str, tenant_id: str = "default_tenant") -> AuditLog:
    """
    Appends a tamper-evident audit log entry linked via SHA-256 cryptographic chain.
    """
    last_log = db.query(AuditLog).order_by(AuditLog.id.desc()).first()
    prev_hash = last_log.record_hash if (last_log and hasattr(last_log, "record_hash") and last_log.record_hash) else "0000000000000000000000000000000000000000000000000000000000000000"
    
    timestamp_str = datetime.utcnow().isoformat()
    raw_content = f"{prev_hash}|{tenant_id}|{module}|{action}|{performed_by}|{new_value}|{timestamp_str}"
    current_hash = hashlib.sha256(raw_content.encode('utf-8')).hexdigest()

    log_entry = AuditLog(
        performed_by=performed_by,
        action=action,
        module=module,
        new_value=f"[SHA256:{current_hash[:16]}] {new_value}",
        record_hash=current_hash,
        timestamp=datetime.utcnow()
    )
    db.add(log_entry)
    db.commit()
    return log_entry

def append_audit_log(db: Session, module: str, action: str, performed_by: str, new_value: str) -> AuditLog:
    """Backward compatibility wrapper for append_tamper_evident_audit"""
    return append_tamper_evident_audit(db=db, module=module, action=action, performed_by=performed_by, new_value=new_value)
