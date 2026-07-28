"""
Independently re-derives a candidate role's numbers straight from the raw
imported data (ApplicationAccountEntitlement grants, CampaignAccountResult
membership) and compares them against what's actually stored on the role /
its CandidateRoleEntitlement rows - the same numbers the Analytical View and
Role Engineering workbench display. If everything below says "MATCH", the
displayed data is a true reflection of the real account/entitlement data,
not a computation or display bug.

Checks, per role:
  1. Member count: CampaignAccountResult rows for this role vs. stored
     role.member_count.
  2. Each entitlement's coverage %: recomputed as
     (members who actually hold it, per ApplicationAccountEntitlement)
     / (role's total members) - compared against the stored
     CandidateRoleEntitlement.member_coverage_pct.
  3. Confidence score: recomputed as the average Jaccard similarity between
     each member's real entitlement set and the role's core entitlement set
     (same formula role_mining_engine.py uses) - compared against stored
     role.confidence_score.

Read-only - makes no changes. Run from the backend/ directory:
    python verify_role_mining_accuracy.py            (checks the top 5 by confidence)
    python verify_role_mining_accuracy.py 2686        (checks one specific role id)
"""
import sys
import app.main  # noqa: F401

from app.database import SessionLocal
from app.models.candidate_role import CandidateRole
from app.models.candidate_role_entitlement import CandidateRoleEntitlement
from app.models.campaign_account_result import CampaignAccountResult
from app.models.application_account_entitlement import ApplicationAccountEntitlement


def jaccard(a: set, b: set) -> float:
    if not a and not b:
        return 0.0
    union = a | b
    if not union:
        return 0.0
    return len(a & b) / len(union) * 100.0


db = SessionLocal()
try:
    if len(sys.argv) > 1:
        role_ids = [int(sys.argv[1])]
    else:
        role_ids = [
            r.id for r in db.query(CandidateRole).filter(CandidateRole.is_deleted == False)
            .order_by(CandidateRole.confidence_score.desc()).limit(5).all()
        ]

    for role_id in role_ids:
        role = db.query(CandidateRole).filter(CandidateRole.id == role_id).first()
        if not role:
            print(f"Role #{role_id} not found.")
            continue

        print("=" * 70)
        print(f"Role #{role.id} '{role.role_name}'")
        print("=" * 70)

        # --- 1. Membership ---
        results = db.query(CampaignAccountResult).filter(
            CampaignAccountResult.candidate_role_id == role.id
        ).all()
        account_ids = [r.account_id for r in results]
        real_member_count = len(account_ids)
        member_match = "MATCH" if real_member_count == role.member_count else "MISMATCH"
        print(f"  Members: stored={role.member_count}  actual CampaignAccountResult rows={real_member_count}  [{member_match}]")

        # --- 2. Per-account real entitlement sets ---
        grants = db.query(ApplicationAccountEntitlement).filter(
            ApplicationAccountEntitlement.account_id.in_(account_ids)
        ).all() if account_ids else []
        account_entitlements = {}
        for g in grants:
            key = g.entitlement_id if g.entitlement_id else f"raw:{(g.entitlement_name_raw or '').strip().lower()}"
            account_entitlements.setdefault(g.account_id, set()).add(key)

        cres = db.query(CandidateRoleEntitlement).filter(
            CandidateRoleEntitlement.candidate_role_id == role.id
        ).all()

        print(f"  Entitlements on this role: {len(cres)}")
        for e in cres:
            key = e.entitlement_id if e.entitlement_id else f"raw:{(e.entitlement_name or '').strip().lower()}"
            holders = sum(1 for acc_id in account_ids if key in account_entitlements.get(acc_id, set()))
            real_pct = round((holders / real_member_count) * 100.0, 1) if real_member_count else 0.0
            stored_pct = e.member_coverage_pct
            match = "MATCH" if abs((stored_pct or 0) - real_pct) < 0.15 else "MISMATCH"
            print(f"    '{e.entitlement_name}': stored_coverage={stored_pct}%  recomputed={real_pct}%  [{match}]")

        # --- 3. Confidence score ---
        core_keys = {
            (e.entitlement_id if e.entitlement_id else f"raw:{(e.entitlement_name or '').strip().lower()}")
            for e in cres if e.is_core
        }
        sims = []
        for acc_id in account_ids:
            sims.append(jaccard(account_entitlements.get(acc_id, set()), core_keys))
        recomputed_confidence = round(sum(sims) / len(sims), 1) if sims else 0.0
        conf_match = "MATCH" if abs((role.confidence_score or 0) - recomputed_confidence) < 0.15 else "MISMATCH"
        print(f"  Confidence: stored={role.confidence_score}%  recomputed={recomputed_confidence}%  [{conf_match}]")
        print()
finally:
    db.close()
