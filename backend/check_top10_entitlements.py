"""
Read-only diagnostic: the Role Engineering Analytical View's default
"Top 10 roles by confidence score" is only showing 3 unique entitlement rows
in the grid. Before assuming a bug, check whether that's just because the
top-10-by-confidence roles happen to be minimal-access roles (interns,
entry-level) that only carry a couple of entitlements each, which would
naturally dedup down to a small number of unique rows.

Makes no changes - purely reads and prints. Run from the backend/ directory:
    python check_top10_entitlements.py
"""
import app.main  # noqa: F401

from app.database import SessionLocal
from app.models.candidate_role import CandidateRole
from app.models.candidate_role_entitlement import CandidateRoleEntitlement

db = SessionLocal()
try:
    top10 = db.query(CandidateRole).filter(
        CandidateRole.is_deleted == False
    ).order_by(CandidateRole.confidence_score.desc()).limit(10).all()

    print("=" * 70)
    print("Exact top-10-by-confidence roles (what the Analytical View defaults to)")
    print("=" * 70)
    all_ent_names = set()
    for r in top10:
        ents = db.query(CandidateRoleEntitlement).filter(
            CandidateRoleEntitlement.candidate_role_id == r.id
        ).all()
        names = sorted(set(e.entitlement_name for e in ents))
        all_ent_names.update(names)
        print(f"  #{r.id} '{r.role_name}' (confidence={r.confidence_score}, members={r.member_count}) "
              f"-> {len(ents)} entitlement row(s): {names}")

    print()
    print(f"Unique entitlement names across all 10 roles combined: {len(all_ent_names)}")
    print(f"  {sorted(all_ent_names)}")
finally:
    db.close()
