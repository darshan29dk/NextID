"""
Read-only: prints the exact status + error_message for the Phase 1 campaign
(and any other non-Draft/Completed campaign), so we know whether "Mining run
failed" is just the earlier stuck-run cleanup, or a fresh, real failure with
its own traceback string.

Run from the backend/ directory:
    python check_campaign_error.py
"""
import app.main  # noqa: F401

from app.database import SessionLocal
from app.models.mining_campaign import MiningCampaign

db = SessionLocal()
try:
    campaigns = db.query(MiningCampaign).filter(MiningCampaign.is_deleted == False).all()
    for c in campaigns:
        print("=" * 70)
        print(f"#{c.id} '{c.campaign_name}'")
        print(f"  status: {c.status}")
        print(f"  updated_at: {c.updated_at}")
        print(f"  error_message: {c.error_message}")
finally:
    db.close()
