"""
One-off: undo the "Test Merge - Financial + Sales" merge created during
today's RE-002 test, since the Undo Merge UI doesn't exist yet in the
frontend (confirmed — the backend endpoint works, but no button calls it).

This restores the 2 source roles to Draft/active and removes the merged
destination role, using the same MergeRoleService.undo_merge logic the
missing UI button would have called.

Run from the backend/ folder with your venv active:
    python undo_test_merge.py
"""

import app.main  # noqa: F401 — importing the full app (not just individual models)
# registers every SQLAlchemy model the same way the real server does, avoiding
# one-off "table/class not found" errors from relationships that reference
# models this script didn't otherwise import. Safe to import without actually
# running the server — FastAPI route/model registration happens at import
# time, but nothing here starts listening on a port or fires startup events.

from app.database import SessionLocal
from app.models.role_merge_history import RoleMergeHistory
from app.services.merge_role_service import MergeRoleService


def main():
    db = SessionLocal()
    try:
        history = db.query(RoleMergeHistory).order_by(RoleMergeHistory.created_at.desc()).first()
        if not history:
            print("No merge history found — nothing to undo.")
            return

        print(f"Undoing merge history id={history.id} (parent_role_id={history.parent_role_id})...")
        result = MergeRoleService.undo_merge(db, history.id, "Sania Gupta")
        print("Undo result:", result)

    except Exception as e:
        print(f"Undo failed: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()
