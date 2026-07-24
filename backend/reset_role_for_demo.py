"""
One-off reset for a single candidate role, so the whole classify -> assign
owner -> submit -> approve -> publish lifecycle can be demoed live again
instead of showing an already-completed example.

Resets, for the given role:
  - classification, primary/backup owner fields, published fields, status,
    current_version -> back to a fresh "just mined" Draft state
  - deletes its ApprovalRequest(s) and their ApprovalStep(s)
  - deletes its RoleVersionHistory row(s) created by publishing

Does NOT touch confidence_score, entitlement/user/application counts, or
anything else mining produced - only the Role Engineering / Approval /
Catalog fields that get set during the reviewed-and-published lifecycle.

Usage (from backend/, with your normal venv active):
    python reset_role_for_demo.py "Marketing Analyst - Variant B"
or, if you know the id:
    python reset_role_for_demo.py --id 2686
"""
import sys
import app.main  # noqa: F401 - populates the SQLAlchemy model registry, see cleanup_stuck_scans.py

from app.database import SessionLocal
from app.models.candidate_role import CandidateRole
from app.models.approval_request import ApprovalRequest
from app.models.approval_step import ApprovalStep
from app.models.role_version_history import RoleVersionHistory
from app.models.role_owner_history import RoleOwnerHistory


def main():
    if len(sys.argv) < 2:
        print("Usage: python reset_role_for_demo.py \"<role name>\"  OR  --id <role_id>")
        sys.exit(1)

    db = SessionLocal()
    try:
        if sys.argv[1] == "--id":
            role = db.query(CandidateRole).filter(CandidateRole.id == int(sys.argv[2])).first()
        else:
            name = sys.argv[1]
            matches = db.query(CandidateRole).filter(CandidateRole.role_name == name).all()
            if len(matches) > 1:
                print(f"Multiple roles named '{name}' found - re-run with --id instead:")
                for m in matches:
                    print(f"  id={m.id}  status={m.status}  confidence={m.confidence_score}")
                sys.exit(1)
            role = matches[0] if matches else None

        if not role:
            print("Role not found.")
            sys.exit(1)

        print(f"Found role #{role.id} '{role.role_name}' - current status: {role.status}, classification: {role.classification}")

        # Delete approval requests + their steps. ApprovalStep has no
        # relationship()/cascade back to ApprovalRequest (just a bare FK
        # column), so SQLAlchemy's unit-of-work doesn't know steps must go
        # first - it tried deleting the request first last time and MySQL
        # rejected it on the FK constraint. Flushing the step deletes before
        # touching the request forces the correct order.
        reqs = db.query(ApprovalRequest).filter(ApprovalRequest.candidate_role_id == role.id).all()
        for req in reqs:
            steps = db.query(ApprovalStep).filter(ApprovalStep.approval_request_id == req.id).all()
            for s in steps:
                db.delete(s)
            db.flush()
            print(f"  Deleting ApprovalRequest #{req.id} (status was '{req.status}') and its {len(steps)} step(s).")
            db.delete(req)
            db.flush()

        # Delete version history snapshots created by publishing
        versions = db.query(RoleVersionHistory).filter(RoleVersionHistory.candidate_role_id == role.id).all()
        for v in versions:
            print(f"  Deleting RoleVersionHistory v{v.version_number}.")
            db.delete(v)

        # Delete owner history records. The Owners tab reads from this table
        # (RoleOwnerService.get_current_owners), not from the denormalized
        # primary_owner_* fields on CandidateRole directly - clearing only
        # those fields (as the first version of this script did) left the old
        # owner still showing up, review-date-expired badge and all.
        owner_records = db.query(RoleOwnerHistory).filter(RoleOwnerHistory.candidate_role_id == role.id).all()
        for o in owner_records:
            print(f"  Deleting RoleOwnerHistory #{o.id} ({o.owner_type} owner: {o.owner_name}).")
            db.delete(o)

        # Reset the role itself back to a fresh, just-mined state
        role.classification = None
        role.status = "Draft"
        role.primary_owner_name = None
        role.primary_owner_email = None
        role.primary_owner_id = None
        role.backup_owner_name = None
        role.backup_owner_email = None
        role.backup_owner_id = None
        role.owner_review_date = None
        role.published_at = None
        role.published_by = None
        role.current_version = 0
        role.modified_by = "System (Reset)"

        db.commit()
        print(f"Done. Role #{role.id} '{role.role_name}' is back to Draft, unclassified, no owner, unpublished.")
        print("Reload the page - it should now show up fresh in Role Engineering, ready for the live walkthrough.")

    finally:
        db.close()


if __name__ == "__main__":
    main()
