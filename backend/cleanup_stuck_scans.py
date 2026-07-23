"""
One-off cleanup for SoD scan jobs that are permanently stuck showing
"RUNNING" in Scan History even though the background process behind them
is already dead (caused by the missing concurrency guard on policy import -
now fixed in app/routes/sod_policy.py).

Marks any scan with status="RUNNING" and no end_time as "FAILED" so the
Scan History page stops showing phantom in-progress jobs. Safe to run any
time - it only touches rows that are already stuck, and only if they're not
genuinely still running (checked by re-reading progress twice, a few
seconds apart, and confirming it hasn't moved).

Usage (from the backend/ directory, with your normal venv active):
    python cleanup_stuck_scans.py
"""
import time

# Import the whole app first, not just the one model file. SodViolation's
# relationships reference SodPolicy/Identity by name (string), and SQLAlchemy
# only resolves those against classes that have actually been imported
# somewhere - app.main already imports every model via its route modules, so
# importing it here guarantees the full registry is populated the same way
# it is when the real server runs, instead of failing with "failed to locate
# a name" for whichever model this script didn't happen to import directly.
import app.main  # noqa: F401

from app.database import SessionLocal
from app.models.sod_violation import SodScanHistory

db = SessionLocal()
try:
    stuck = db.query(SodScanHistory).filter(
        SodScanHistory.status == "RUNNING",
        SodScanHistory.end_time.is_(None)
    ).all()

    if not stuck:
        print("No stuck scans found. Nothing to do.")
    else:
        print(f"Found {len(stuck)} scan(s) marked RUNNING. Checking whether they're actually still progressing...")
        before = {s.id: s.progress_pct for s in stuck}
        time.sleep(5)
        db.expire_all()

        still_stuck = []
        for s in stuck:
            db.refresh(s)
            if s.progress_pct == before[s.id]:
                still_stuck.append(s)
            else:
                print(f"  Scan #{s.id} ('{s.scan_name}') is still actively progressing ({before[s.id]}% -> {s.progress_pct}%) - leaving it alone.")

        if not still_stuck:
            print("All RUNNING scans are still making real progress. Nothing changed.")
        else:
            for s in still_stuck:
                print(f"  Marking scan #{s.id} ('{s.scan_name}', stuck at {s.progress_pct}%) as FAILED.")
                s.status = "FAILED"
                from datetime import datetime
                s.end_time = datetime.utcnow()
            db.commit()
            print(f"Done. Marked {len(still_stuck)} stuck scan(s) as FAILED.")
finally:
    db.close()
