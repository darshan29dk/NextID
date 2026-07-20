"""
One-off: undo the "RE-003 verification test" split of "Financial Analyst -
Candidate Role 1" (into Part A / Part B), since the Undo Split UI doesn't
exist yet in the frontend — same gap as Merge History/Undo (the backend
endpoint works, but no button calls it).

This restores the original role to Draft/active and removes the two split
destination roles, using the same SplitRoleService.undo_split logic the
missing UI button would have called.

Run from the backend/ folder with your venv active:
    python undo_test_split.py
"""

import app.main  # noqa: F401 — importing the full app registers every
# SQLAlchemy model the same way the real server does, avoiding one-off
# "table/class not found" errors from relationships this script didn't
# otherwise import directly (same fix used in undo_test_merge.py).

from app.database import SessionLocal
from app.models.role_split_history import RoleSplitHistory
from app.services.split_role_service import SplitRoleService


def main():
    db = SessionLocal()
    try:
        history = db.query(RoleSplitHistory).order_by(RoleSplitHistory.created_at.desc()).first()
        if not history:
            print("No split history found — nothing to undo.")
            return

        print(f"Undoing split history id={history.id} (original_role_id={history.original_role_id})...")
        result = SplitRoleService.undo_split(db, history.id, "Sania Gupta")
        print("Undo result:", result)

    except Exception as e:
        print(f"Undo failed: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()
