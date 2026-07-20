"""
One-off: delete CandidateRoleMember/CandidateRoleEntitlement rows that
belong to a soft-deleted (is_deleted=True) CandidateRole. These were left
behind by undo_merge/undo_split before that logic was fixed to clean them up
(the fix only prevents new orphans going forward — this clears the ones
already sitting in the database from earlier merge/split/undo test runs).

Run from the backend/ folder with your venv active:
    python cleanup_orphaned_role_members.py
"""

import app.main  # noqa: F401

from app.database import SessionLocal
from app.models.candidate_role import CandidateRole
from app.models.candidate_role_member import CandidateRoleMember
from app.models.candidate_role_entitlement import CandidateRoleEntitlement


def main():
    db = SessionLocal()
    try:
        deleted_role_ids = [
            r.id for r in db.query(CandidateRole.id).filter(CandidateRole.is_deleted == True).all()
        ]
        print(f"Soft-deleted CandidateRole ids: {deleted_role_ids}")

        member_ids_from_deleted = [
            m.candidate_role_id for m in db.query(CandidateRoleMember.candidate_role_id).distinct().all()
        ]
        orphan_role_ids_via_members = [
            cid for cid in set(member_ids_from_deleted)
            if cid not in {r.id for r in db.query(CandidateRole.id).filter(CandidateRole.is_deleted == False).all()}
        ]
        print(f"CandidateRole ids referenced by members but not an active role: {orphan_role_ids_via_members}")

        target_ids = list(set(deleted_role_ids) | set(orphan_role_ids_via_members))

        if target_ids:
            n1 = db.query(CandidateRoleMember).filter(
                CandidateRoleMember.candidate_role_id.in_(target_ids)
            ).delete(synchronize_session=False)
            n2 = db.query(CandidateRoleEntitlement).filter(
                CandidateRoleEntitlement.candidate_role_id.in_(target_ids)
            ).delete(synchronize_session=False)
            db.commit()
            print(f"Deleted {n1} orphaned CandidateRoleMember rows and {n2} orphaned CandidateRoleEntitlement rows.")
        else:
            print("No orphaned rows found — nothing to clean up.")
    except Exception as e:
        db.rollback()
        print(f"Failed: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()
