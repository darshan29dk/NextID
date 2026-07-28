"""
Marks any mining campaign stuck in status="Running" as "Failed" so it can be
safely re-run. POST /mining-campaigns/{id}/run runs DBSCAN clustering
synchronously inside the request itself - if the backend process restarts
mid-run (e.g. uvicorn --reload triggered by a .py file change) the thread is
killed with no exception ever raised, so campaign.status never advances past
"Running" and just stays stuck there indefinitely.

This does NOT touch any candidate roles / entitlements / account results
already committed from a previous successful run - it only flips the stuck
campaign's own status field so the UI stops showing "Running" and you can
click Run Mining again.

Run from the backend/ directory:
    python cleanup_stuck_mining_campaigns.py
"""
import app.main  # noqa: F401

from datetime import datetime
from app.database import SessionLocal
from app.models.mining_campaign import MiningCampaign

db = SessionLocal()
try:
    stuck = db.query(MiningCampaign).filter(
        MiningCampaign.status == "Running",
        MiningCampaign.is_deleted == False
    ).all()

    if not stuck:
        print("No campaigns stuck in 'Running' status. Nothing to do.")
    else:
        print(f"Found {len(stuck)} campaign(s) stuck in 'Running':")
        for c in stuck:
            print(f"  #{c.id} '{c.campaign_name}' - updated_at={c.updated_at}")
            c.status = "Failed"
            c.error_message = (c.error_message or "") + \
                " [Auto-marked Failed: backend process restarted mid-run, likely due to --reload triggering on a file change; safe to re-run.]"
            c.modified_by = "System (Stuck Campaign Cleanup)"
            c.updated_at = datetime.utcnow()
        db.commit()
        print("Marked as Failed. You can click 'Run Mining' on these again.")
finally:
    db.close()
