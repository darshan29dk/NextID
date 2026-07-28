"""
Read-only: checks whether the same entitlement NAME (e.g. "ServiceNow_Report_User")
is backed by multiple different entitlement_id values in
CandidateRoleEntitlement / application_entitlements - which would explain why
the Analytical View's dedup (keyed on entitlement_id) shows several rows with
the same visible name instead of collapsing them into one.

Run from the backend/ directory:
    python check_duplicate_entitlements.py
"""
import app.main  # noqa: F401

from app.database import SessionLocal
from app.models.candidate_role import CandidateRole
from app.models.candidate_role_entitlement import CandidateRoleEntitlement
from app.models.application_entitlement import ApplicationEntitlement

db = SessionLocal()
try:
    print("=" * 70)
    print("1. Top 10 candidate roles by confidence (system-wide) and their")
    print("   CandidateRoleEntitlement rows: entitlement_id + entitlement_name")
    print("=" * 70)
    top10 = db.query(CandidateRole).filter(
        CandidateRole.is_deleted == False
    ).order_by(CandidateRole.confidence_score.desc()).limit(10).all()

    for r in top10:
        ents = db.query(CandidateRoleEntitlement).filter(
            CandidateRoleEntitlement.candidate_role_id == r.id
        ).all()
        for e in ents:
            print(f"  role #{r.id} '{r.role_name}' (campaign={r.campaign_id}) -> "
                  f"entitlement_id={e.entitlement_id} entitlement_name='{e.entitlement_name}'")

    print()
    print("=" * 70)
    print("2. application_entitlements catalog: any duplicate names with")
    print("   different ids? (this is the actual root cause if so)")
    print("=" * 70)
    all_ents = db.query(ApplicationEntitlement.id, ApplicationEntitlement.entitlement_name).all()
    by_name = {}
    for eid, ename in all_ents:
        by_name.setdefault(ename, []).append(eid)

    dupes = {name: ids for name, ids in by_name.items() if len(ids) > 1}
    if not dupes:
        print("  No duplicate entitlement names in the catalog - every name maps to exactly one id.")
    else:
        print(f"  Found {len(dupes)} entitlement name(s) with multiple different ids:")
        for name, ids in sorted(dupes.items(), key=lambda x: -len(x[1]))[:20]:
            print(f"    '{name}': {len(ids)} different id(s) -> {ids[:10]}{'...' if len(ids) > 10 else ''}")
finally:
    db.close()
