"""
Read-only diagnostic: when no filter/selection is applied, the Analytical
View should default to the top 10 candidate roles by confidence score - but
only 3 are showing. Before assuming a code bug, check what's actually in the
database: maybe only 3 non-deleted candidate roles exist in the relevant
scope right now (after all the mining re-runs / consolidation / cleanup this
session), which would mean "top 10" correctly shows all 3 that exist.

Makes no changes - purely reads and prints. Run from the backend/ directory:
    python check_candidate_role_counts.py
"""
import app.main  # noqa: F401 - populate full SQLAlchemy registry first

from app.database import SessionLocal
from app.models.candidate_role import CandidateRole
from app.models.mining_campaign import MiningCampaign

db = SessionLocal()
try:
    print("=" * 70)
    print("1. Role Engineering scope (get_multi_role_matrix): ALL non-deleted")
    print("   candidate roles, system-wide, regardless of campaign")
    print("=" * 70)
    all_roles = db.query(CandidateRole).filter(CandidateRole.is_deleted == False).order_by(
        CandidateRole.confidence_score.desc()
    ).all()
    print(f"  Total non-deleted candidate roles system-wide: {len(all_roles)}")
    for r in all_roles[:15]:
        print(f"    #{r.id} '{r.role_name}' campaign_id={r.campaign_id} confidence={r.confidence_score} deleted={r.is_deleted}")

    print()
    print("=" * 70)
    print("2. Also check: are there deleted rows that might explain the drop")
    print("   (e.g. consolidation runs marking old variants as deleted)?")
    print("=" * 70)
    deleted_roles = db.query(CandidateRole).filter(CandidateRole.is_deleted == True).all()
    print(f"  Total is_deleted=True candidate roles: {len(deleted_roles)}")

    print()
    print("=" * 70)
    print("3. Per-campaign breakdown (relevant for Role Discovery's")
    print("   get_campaign_matrix, which is scoped to ONE campaign_id)")
    print("=" * 70)
    campaigns = db.query(MiningCampaign).filter(MiningCampaign.is_deleted == False).all()
    for c in campaigns:
        cnt = db.query(CandidateRole).filter(
            CandidateRole.campaign_id == c.id,
            CandidateRole.is_deleted == False
        ).count()
        print(f"  Campaign #{c.id} '{c.campaign_name}': {cnt} non-deleted candidate role(s)")

finally:
    db.close()
