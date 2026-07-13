"""
One-off cleanup script: soft-deletes every identity that was created via the
Identity Repository's "Bulk Upload" feature (source_connector_name = "Bulk Upload"),
leaving connector-imported and manually created identities untouched.

Run this from the backend/ folder, with the same environment the app itself uses:

    python reset_bulk_identities.py

It uses the app's own database config, so no credentials are duplicated here.
"""

from app.database import SessionLocal
from app.models.identity import Identity

def main():
    db = SessionLocal()
    try:
        matches = db.query(Identity).filter(
            Identity.source_connector_name == "Bulk Upload",
            Identity.is_deleted == False
        ).all()

        if not matches:
            print("No bulk-uploaded identities found (nothing to reset).")
            return

        print(f"Found {len(matches)} bulk-uploaded identities:")
        for i in matches:
            print(f"  - id={i.id}  {i.display_name or i.email}  ({i.email})")

        confirm = input(f"\nSoft-delete all {len(matches)} of these? (yes/no): ").strip().lower()
        if confirm != "yes":
            print("Cancelled — nothing was deleted.")
            return

        for i in matches:
            i.is_deleted = True
            i.modified_by = "Cleanup Script"
        db.commit()
        print(f"Done. {len(matches)} bulk-uploaded identities have been removed from the Identity Repository.")
    finally:
        db.close()

if __name__ == "__main__":
    main()
