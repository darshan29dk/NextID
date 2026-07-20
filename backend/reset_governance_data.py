"""
One-off: clear the fake Governance seed data (3 SoD policies, 20 violations,
30 exceptions) that was generated from a leftover test-identities CSV
(testcorp.com users) uploaded before the real identity data. The seed guards
in main.py have been disabled so this won't regenerate on restart.

After running this, use the "Run Full Scan" button on the Scan History page
(Governance > Scan History) to compute real violations against your actual
uploaded identities/entitlements.

Run from the backend/ folder with your venv active:
    python reset_governance_data.py
"""

import app.main  # noqa: F401 — registers every model, same pattern used in
# undo_test_merge.py / undo_test_split.py.

from app.database import SessionLocal
from app.models.sod_policy import SodPolicy, SodPolicyRule
from app.models.sod_violation import SodViolation, SodScanHistory, SodViolationAudit, SodViolationComment, SodViolationAttachment
from app.models.sod_exception import SodException, SodExceptionApproval, SodExceptionComment, SodExceptionAudit, SodExceptionAttachment


def main():
    db = SessionLocal()
    try:
        # Children before parents to satisfy FK constraints.
        n = db.query(SodExceptionAttachment).delete(synchronize_session=False)
        print(f"Deleted {n} SodExceptionAttachment")
        n = db.query(SodExceptionComment).delete(synchronize_session=False)
        print(f"Deleted {n} SodExceptionComment")
        n = db.query(SodExceptionApproval).delete(synchronize_session=False)
        print(f"Deleted {n} SodExceptionApproval")
        n = db.query(SodExceptionAudit).delete(synchronize_session=False)
        print(f"Deleted {n} SodExceptionAudit")
        n = db.query(SodException).delete(synchronize_session=False)
        print(f"Deleted {n} SodException")

        n = db.query(SodViolationAttachment).delete(synchronize_session=False)
        print(f"Deleted {n} SodViolationAttachment")
        n = db.query(SodViolationComment).delete(synchronize_session=False)
        print(f"Deleted {n} SodViolationComment")
        n = db.query(SodViolationAudit).delete(synchronize_session=False)
        print(f"Deleted {n} SodViolationAudit")
        n = db.query(SodViolation).delete(synchronize_session=False)
        print(f"Deleted {n} SodViolation")
        n = db.query(SodScanHistory).delete(synchronize_session=False)
        print(f"Deleted {n} SodScanHistory")

        n = db.query(SodPolicyRule).delete(synchronize_session=False)
        print(f"Deleted {n} SodPolicyRule")
        n = db.query(SodPolicy).delete(synchronize_session=False)
        print(f"Deleted {n} SodPolicy")

        db.commit()
        print("Governance data cleared. Recreate real SoD policies via the UI, then run a Full Scan.")
    except Exception as e:
        db.rollback()
        print(f"Failed: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()
