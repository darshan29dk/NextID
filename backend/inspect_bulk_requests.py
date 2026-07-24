"""
Read-only inspection - counts ApprovalRequest rows by workflow_name to
confirm the ~800 stray requests all came from the old (now-fixed)
auto-classify bug, which hardcoded workflow_name="Unclassified Role
Governance Review" and created a request directly with no owner/validation.

Usage: python inspect_bulk_requests.py
"""
import app.main  # noqa: F401
from app.database import SessionLocal
from app.models.approval_request import ApprovalRequest
from sqlalchemy import func

db = SessionLocal()
try:
    rows = db.query(
        ApprovalRequest.workflow_name,
        ApprovalRequest.submitted_by,
        func.count(ApprovalRequest.id)
    ).group_by(ApprovalRequest.workflow_name, ApprovalRequest.submitted_by).all()

    print(f"{'Workflow Name':<45} {'Submitted By':<20} {'Count'}")
    print("-" * 75)
    for workflow_name, submitted_by, count in rows:
        print(f"{str(workflow_name):<45} {str(submitted_by):<20} {count}")

    total = db.query(ApprovalRequest).count()
    print(f"\nTotal ApprovalRequest rows: {total}")
finally:
    db.close()
