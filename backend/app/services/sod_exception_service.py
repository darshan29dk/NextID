from datetime import datetime
from sqlalchemy.orm import Session
from app.models.sod_exception import SodException, SodExceptionAudit
from app.models.sod_violation import SodViolation
from app.models.audit_log import AuditLog
from app.models.notification import Notification
import json

def check_and_expire_exceptions(db: Session):
    """
    Background job checker executed daily or on startup.
    Identifies expired temporary active exceptions, transitions them,
    and resets their linked violation status back to OPEN so they are active again.
    """
    now = datetime.utcnow()
    expired_exceptions = db.query(SodException).filter(
        SodException.exception_type == "TEMPORARY",
        SodException.status == "ACTIVE",
        SodException.expiry_date <= now
    ).all()
    
    count = len(expired_exceptions)
    if count > 0:
        print(f"Auto Expiry: Identified {count} expired active SoD Exceptions.")
        for exc in expired_exceptions:
            old_stat = exc.status
            exc.status = "EXPIRED"
            
            # Log audit trail (local exception timeline)
            audit = SodExceptionAudit(
                exception_id=exc.id,
                action="Expiry",
                performed_by="System (Auto-Expiry)",
                old_value=json.dumps({"status": old_stat}),
                new_value=json.dumps({"status": "EXPIRED"}),
                timestamp=now
            )
            db.add(audit)

            # Global audit log - this job only ever wrote the local
            # SodExceptionAudit row, so auto-expiry never showed up on the
            # central Audit Logs page.
            db.add(AuditLog(
                module="SoD Exceptions",
                action="Expiry",
                performed_by="System (Auto-Expiry)",
                old_value=json.dumps({"status": old_stat}),
                new_value=json.dumps({"status": "EXPIRED"}),
                timestamp=now
            ))

            # Notify - previously this ran silently with nothing surfaced to
            # whoever requested/owns the exception.
            db.add(Notification(
                title="SoD Exception Expired",
                message=f"Exception {exc.exception_number} for {exc.username or 'user'} on {exc.application_name or 'application'} has expired and the linked violation is reopened.",
                status="unread",
                created_at=now
            ))

            # Reopen matched violation
            if exc.violation_id:
                violation = db.query(SodViolation).filter(SodViolation.id == exc.violation_id).first()
                if violation:
                    old_v_stat = violation.status
                    violation.status = "OPEN"
                    
                    # Log violation audit timeline
                    from app.services.sod_violation_service import write_violation_audit
                    write_violation_audit(
                        db, violation.id, "Exception Expired Status", "System (Auto-Expiry)",
                        old_val={"status": old_v_stat}, new_val={"status": "OPEN"}
                    )
        db.commit()
        print("Auto Expiry: Successfully processed exception transitions.")
    return count
