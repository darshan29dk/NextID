"""
Cleans up the ~801 stray ApprovalRequest rows created by the old (now-fixed)
auto-classify bug, which hardcoded workflow_name="Unclassified Role
Governance Review" and created a request directly for every low-confidence
role - with no owner, no description/entitlement checks, bypassing
ApprovalWorkflowService.submit_role() entirely. Confirmed via
inspect_bulk_requests.py: exactly 801 rows carry that workflow_name (81 by
'superadmin', 720 by 'Darshan Kumar'), versus the 1 legitimate request
submitted the real way (workflow_name="Default (all applications) - Low
Risk", by Sania Gupta) - that one and any other real submission is left
untouched.

For each stray request, this:
  - deletes its ApprovalStep(s)
  - deletes the ApprovalRequest itself
  - resets the associated CandidateRole.status back to "Draft" (it was only
    ever "Business Review" because of this bug - the role was never
    actually reviewed) so it shows up correctly in Role Engineering again,
    needing a real Submit for Approval like any other role. Classification
    is left as-is, since that's a legitimate value set by the fixed
    auto-classify feature.

Usage (from backend/, with your normal venv active):
    python cleanup_bulk_bad_requests.py
"""
import app.main  # noqa: F401
from app.database import SessionLocal
from app.models.approval_request import ApprovalRequest
from app.models.approval_step import ApprovalStep
from app.models.candidate_role import CandidateRole

BAD_WORKFLOW_NAME = "Unclassified Role Governance Review"

db = SessionLocal()
try:
    bad_requests = db.query(ApprovalRequest).filter(
        ApprovalRequest.workflow_name == BAD_WORKFLOW_NAME
    ).all()

    print(f"Found {len(bad_requests)} stray request(s) with workflow_name='{BAD_WORKFLOW_NAME}'.")
    if not bad_requests:
        print("Nothing to clean up.")
    else:
        role_ids = {r.candidate_role_id for r in bad_requests}

        deleted_steps = 0
        for req in bad_requests:
            steps = db.query(ApprovalStep).filter(ApprovalStep.approval_request_id == req.id).all()
            for s in steps:
                db.delete(s)
                deleted_steps += 1
            db.flush()
            db.delete(req)
        db.flush()
        print(f"Deleted {len(bad_requests)} ApprovalRequest row(s) and {deleted_steps} ApprovalStep row(s).")

        roles = db.query(CandidateRole).filter(
            CandidateRole.id.in_(role_ids),
            CandidateRole.status == "Business Review"
        ).all()
        for role in roles:
            role.status = "Draft"
            role.modified_by = "System (Cleanup)"
        print(f"Reset {len(roles)} affected candidate role(s) back to Draft status.")

        db.commit()
        print("Done. Approval Requests list should now show just the legitimate request(s).")
finally:
    db.close()
