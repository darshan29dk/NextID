"""
One-off cleanup script: clears test data from Role Engineering (merge/split
history), Approval Workflow, and Role Catalog so testing can start fresh.

What this does NOT touch:
  - Mining campaigns themselves, or the CampaignAccountResult rows belonging
    to real (non-junk) candidate roles
  - Real candidate roles produced by an actual mining run (kept, just reset
    to a clean Draft state with no publish/approval history)
  - Those roles' entitlements / members (the actual role definitions)
  - Role owner assignments on real roles (RoleOwnerHistory) — not mentioned
    as something to clear, so left alone unless the role itself is junk

What this DOES clear:
  - All approval workflow data: ApprovalComment, ApprovalStep, ApprovalRequest
  - All merge history: RoleMergeSourceRole, RoleMergeHistory
  - All split history: RoleSplitDestinationRole, RoleSplitHistory
  - All role catalog publish state: RoleVersionHistory rows deleted, and every
    remaining CandidateRole's published_at/published_by/current_version reset
    to empty, with status reset back to "Draft" if it was Reviewed / Approved
    / Rejected / Published / Ready For Publish.
  - Leftover junk candidate roles that aren't real mining output: the
    "... - Part A" / "... - Part B" rows left over from Split testing, and
    the empty "Test Finance ..." dummy roles from manually testing role
    creation — deleted entirely, along with their entitlements, members,
    campaign results, and owner history.

Run from the backend/ folder with your venv active:
    python reset_test_data.py
"""

from sqlalchemy import or_
from app.database import SessionLocal
from app.models.approval_comment import ApprovalComment
from app.models.approval_step import ApprovalStep
from app.models.approval_request import ApprovalRequest
from app.models.role_merge_source_roles import RoleMergeSourceRole
from app.models.role_merge_history import RoleMergeHistory
from app.models.role_split_destination_roles import RoleSplitDestinationRole
from app.models.role_split_history import RoleSplitHistory
from app.models.role_version_history import RoleVersionHistory
from app.models.role_owner_history import RoleOwnerHistory
from app.models.candidate_role_entitlement import CandidateRoleEntitlement
from app.models.candidate_role_member import CandidateRoleMember
from app.models.campaign_account_result import CampaignAccountResult
from app.models.candidate_role import CandidateRole


def main():
    db = SessionLocal()
    try:
        counts = {}

        counts["approval_comments"] = db.query(ApprovalComment).delete(synchronize_session=False)
        counts["approval_steps"] = db.query(ApprovalStep).delete(synchronize_session=False)
        counts["approval_requests"] = db.query(ApprovalRequest).delete(synchronize_session=False)

        counts["merge_source_roles"] = db.query(RoleMergeSourceRole).delete(synchronize_session=False)
        counts["merge_history"] = db.query(RoleMergeHistory).delete(synchronize_session=False)

        counts["split_destination_roles"] = db.query(RoleSplitDestinationRole).delete(synchronize_session=False)
        counts["split_history"] = db.query(RoleSplitHistory).delete(synchronize_session=False)

        counts["role_version_history"] = db.query(RoleVersionHistory).delete(synchronize_session=False)

        reset_statuses = ["Reviewed", "Approved", "Rejected", "Published", "Ready For Publish"]
        roles_reset = db.query(CandidateRole).filter(
            CandidateRole.status.in_(reset_statuses)
        ).update(
            {
                CandidateRole.status: "Draft",
                CandidateRole.published_at: None,
                CandidateRole.published_by: None,
                CandidateRole.current_version: 0
            },
            synchronize_session=False
        )
        counts["candidate_roles_reset_to_draft"] = roles_reset

        # Remove leftover junk candidate roles that aren't real mining output:
        #  - "... - Part A" / "... - Part B" — leftover Split-test fragments
        #  - "Test Finance ..." — empty dummy roles from manually testing
        #    role creation (0 users/entitlements)
        #  - "Consolidated Finance Role" — empty leftover from Merge testing
        #  - a batch of hand-created demo roles that all share identical
        #    stats (10 users / 2 apps / 3 entitlements / 85.5% confidence),
        #    which real mining output never does — exact-name matched so we
        #    don't accidentally catch the real "Financial Analyst -
        #    Candidate Role 1" (note the different, longer name)
        demo_role_names = [
            "Financial Analyst", "Database Auditor", "HR Generalist",
            "Billing Administrator", "IT Helpdesk Specialist",
            "Consolidated Finance Role"
        ]
        junk_roles = db.query(CandidateRole).filter(
            or_(
                CandidateRole.role_name.like("%- Part A"),
                CandidateRole.role_name.like("%- Part B"),
                CandidateRole.role_name.like("Test Finance%"),
                CandidateRole.role_name.in_(demo_role_names)
            )
        ).all()
        junk_ids = [r.id for r in junk_roles]

        if junk_ids:
            counts["junk_role_entitlements"] = db.query(CandidateRoleEntitlement).filter(
                CandidateRoleEntitlement.candidate_role_id.in_(junk_ids)
            ).delete(synchronize_session=False)
            counts["junk_role_members"] = db.query(CandidateRoleMember).filter(
                CandidateRoleMember.candidate_role_id.in_(junk_ids)
            ).delete(synchronize_session=False)
            counts["junk_role_campaign_results"] = db.query(CampaignAccountResult).filter(
                CampaignAccountResult.candidate_role_id.in_(junk_ids)
            ).delete(synchronize_session=False)
            counts["junk_role_owner_history"] = db.query(RoleOwnerHistory).filter(
                RoleOwnerHistory.candidate_role_id.in_(junk_ids)
            ).delete(synchronize_session=False)
            counts["junk_candidate_roles_deleted"] = db.query(CandidateRole).filter(
                CandidateRole.id.in_(junk_ids)
            ).delete(synchronize_session=False)
        else:
            counts["junk_candidate_roles_deleted"] = 0

        db.commit()

        print("Cleanup complete:")
        for k, v in counts.items():
            print(f"  {k}: {v}")

    except Exception as e:
        db.rollback()
        print(f"Cleanup failed, nothing was changed: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()
