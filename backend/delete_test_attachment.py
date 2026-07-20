"""
One-off: delete the test attachment ("Admin guide (1).docx") uploaded to
Ananya Desai's SoD violation during today's file-attachment fix test. There's
no delete button in the UI for violation/exception attachments — that
functionality doesn't exist yet (same kind of gap as the missing Merge/Split
undo UI in Role Engineering), so this removes it directly.

Run from the backend/ folder with your venv active:
    python delete_test_attachment.py
"""

import os

import app.main  # noqa: F401 — registers every model.

from app.database import SessionLocal
from app.models.sod_violation import SodViolationAttachment


def main():
    db = SessionLocal()
    try:
        atts = db.query(SodViolationAttachment).filter(
            SodViolationAttachment.filename.like("Admin guide%")
        ).all()
        if not atts:
            print("No matching test attachment found — nothing to delete.")
            return

        for att in atts:
            print(f"Deleting attachment id={att.id} filename={att.filename} file_path={att.file_path}")
            if att.file_path:
                disk_path = os.path.join(
                    os.path.dirname(os.path.abspath(__file__)), att.file_path
                )
                if os.path.exists(disk_path):
                    os.remove(disk_path)
                    print(f"  Removed file from disk: {disk_path}")
            db.delete(att)

        db.commit()
        print("Done.")
    except Exception as e:
        db.rollback()
        print(f"Failed: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()
