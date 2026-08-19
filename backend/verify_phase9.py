import time
import app.main
from fastapi.testclient import TestClient
from app.database import SessionLocal
from app.models.cascade_revocation import RevocationEvent, CascadeAction
from app.models.revocation import RevocationJob

def verify_unification():
    client = TestClient(app.main.app)
    print("=== STEP 4 VERIFICATION: UNIFIED ARCHITECTURE TEST ===")
    res = client.post(
        "/api/revocation-events",
        json={"source_identity_id": 13, "reason": "Unified architecture e2e test"},
        headers={"X-User-Role": "Platform Administrator"}
    )

    print(f"Trigger Status Code: {res.status_code}")
    event_id = res.json().get("id")

    db = SessionLocal()

    # Poll status for up to 35 seconds
    event = None
    for _ in range(35):
        db.expire_all()
        event = db.query(RevocationEvent).filter(RevocationEvent.id == event_id).first()
        if event and event.status in ["Completed", "Completed With Failures", "Completed With Errors", "Failed"]:
            break
        time.sleep(1)

    db.refresh(event)
    actions = db.query(CascadeAction).filter(CascadeAction.event_id == event_id).all()

    print(f"RevocationEvent ID: {event.id} | Status: {event.status} | Total Targets: {event.total_targets} | Revoked: {event.revoked_count}")
    print(f"CascadeActions Count: {len(actions)}")

    linked_jobs = []
    status_mismatches = 0

    for act in actions:
        job = db.query(RevocationJob).filter(RevocationJob.id == act.revocation_job_id).first()
        if job:
            linked_jobs.append(job)
            if (act.status == "Confirmed" and job.status != "CONFIRMED") or (act.status == "Failed" and job.status not in ["FAILED", "ESCALATED"]):
                status_mismatches += 1

    print(f"Linked {len(linked_jobs)} / {len(actions)} CascadeActions to RevocationJob rows.")
    print(f"Status Mismatches: {status_mismatches}")

    sample_act = actions[0] if actions else None
    sample_job = db.query(RevocationJob).filter(RevocationJob.id == sample_act.revocation_job_id).first() if sample_act else None

    print("\n[SAMPLE LINKED PAIR VERIFICATION]")
    print(f"CascadeAction ID: {sample_act.id if sample_act else None} | Status: {sample_act.status if sample_act else None} | FK Job ID: {sample_act.revocation_job_id if sample_act else None}")
    print(f"RevocationJob ID: {sample_job.id if sample_job else None} | Status: {sample_job.status if sample_job else None} | Target: {sample_job.target_identity if sample_job else None} | Target Type: {sample_job.target_type if sample_job else None}")

    db.close()

if __name__ == "__main__":
    verify_unification()
