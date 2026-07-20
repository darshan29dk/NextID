"""Read-only check: what identities exist, and which ones are covered by a
candidate role membership, to sanity-check the Executive Dashboard's
"Total Identities" and "Overall Role Coverage" numbers against real data."""

import app.main  # noqa: F401

from app.database import SessionLocal
from app.models.identity import Identity
from app.models.candidate_role_member import CandidateRoleMember


def main():
    db = SessionLocal()
    try:
        identities = db.query(Identity).filter(Identity.is_deleted == False).all()
        print(f"Total identities ({len(identities)}):")
        for i in identities:
            print(f"  id={i.id} email={i.email} department={i.department} employee_id={i.employee_id}")

        covered_ids = {r[0] for r in db.query(CandidateRoleMember.identity_id).distinct().all()}
        print(f"\nDistinct identity_ids covered by a CandidateRoleMember row: {sorted(covered_ids)}")

        member_rows = db.query(CandidateRoleMember).all()
        print(f"\nAll CandidateRoleMember rows ({len(member_rows)}):")
        for m in member_rows:
            print(f"  candidate_role_id={m.candidate_role_id} identity_id={m.identity_id} employee_name={m.employee_name}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
