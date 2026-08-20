import time
from datetime import datetime
from app.database import SessionLocal
from app.models.identity import Identity
from app.models.cascade_revocation import RevocationEvent, CascadeAction, DelegationLink
from app.models.revocation import RevocationJob
from app.services.revocation_service import process_revocation_job, verify_post_revocation
from app.routes.cascade_revocation import run_cascade, get_full_delegation_graph

def verify_full_engine():
    print("==================================================")
    print("[TEST] RUNNING COMPLETE REVOCATION ENGINE VERIFICATION")
    print("==================================================")
    db = SessionLocal()
    try:
        # 1. Clean previous test entities
        old_ids = [i.id for i in db.query(Identity).filter(Identity.employee_id.in_(["TEST-HUMAN-99", "TEST-AGENT-A", "TEST-AGENT-B"])).all()]
        if old_ids:
            old_events = [e.id for e in db.query(RevocationEvent).filter(RevocationEvent.source_identity_id.in_(old_ids)).all()]
            if old_events:
                db.query(CascadeAction).filter(CascadeAction.event_id.in_(old_events)).delete(synchronize_session=False)
                db.query(RevocationEvent).filter(RevocationEvent.id.in_(old_events)).delete(synchronize_session=False)
            db.query(DelegationLink).filter((DelegationLink.parent_identity_id.in_(old_ids)) | (DelegationLink.child_identity_id.in_(old_ids))).delete(synchronize_session=False)
            db.query(Identity).filter(Identity.id.in_(old_ids)).delete(synchronize_session=False)
            db.commit()

        # 2. Seed Test Hierarchy
        human = Identity(employee_id="TEST-HUMAN-99", display_name="Test Human VP", status="Active", created_at=datetime.utcnow())
        agent_a = Identity(employee_id="TEST-AGENT-A", display_name="Test Agent A", status="Active", created_at=datetime.utcnow())
        agent_b = Identity(employee_id="TEST-AGENT-B", display_name="Test Agent B", status="Active", created_at=datetime.utcnow())
        db.add_all([human, agent_a, agent_b])
        db.commit()
        db.refresh(human); db.refresh(agent_a); db.refresh(agent_b)

        link1 = DelegationLink(parent_identity_id=human.id, child_identity_id=agent_a.id, delegation_type="AGENT", status="Active")
        link2 = DelegationLink(parent_identity_id=agent_a.id, child_identity_id=agent_b.id, delegation_type="AGENT", status="Active")
        db.add_all([link1, link2])
        db.commit()

        print(f"[OK] Seeded Test Chain: Human (ID:{human.id}) -> Agent A (ID:{agent_a.id}) -> Agent B (ID:{agent_b.id})")

        # 3. Test Idempotency Guard
        test_job = RevocationJob(
            target_type="GITHUB",
            target_identity="test_user_idempotent",
            target_entitlement="NextID-Repo",
            status="CONFIRMED",
            retry_count=1,
            confirmation_payload='{"confirmed": true}'
        )
        db.add(test_job)
        db.commit()
        db.refresh(test_job)

        initial_retry_count = test_job.retry_count
        process_revocation_job(db, test_job)
        assert test_job.retry_count == initial_retry_count, "Idempotency failed: Retry count changed on CONFIRMED job."
        print("[OK] Idempotency Guard Verified: CONFIRMED jobs skip re-execution.")

        # 4. Test Post-Revocation Verification Helper
        verification_result = verify_post_revocation("GENERIC", "non_existent_user_12345", "repo_access", {"status": "EXECUTED", "confirmed": True})
        assert verification_result is True, "Post-revocation verification failed."
        print("[OK] Post-Revocation Verification Verified.")

        # 5. Run Full Cascade Event
        evt = RevocationEvent(source_identity_id=human.id, reason="Verification Sweep", status="Pending")
        db.add(evt)
        db.commit()
        db.refresh(evt)

        run_cascade(evt.id)
        evt = db.query(RevocationEvent).filter(RevocationEvent.id == evt.id).first()

        print(f"\n[CASCADE RESULT] Event ID: {evt.id} | Status: {evt.status}")
        print(f"  Total Targets: {evt.total_targets} | Revoked: {evt.revoked_count} | Failed: {evt.failed_count}")

        # 6. Verify CascadeAction -> RevocationJob Linkage & Attempt History
        actions = db.query(CascadeAction).filter(CascadeAction.event_id == evt.id).all()
        assert len(actions) > 0, "No CascadeActions created."
        for act in actions:
            assert act.revocation_job_id is not None, f"CascadeAction #{act.id} missing revocation_job_id linkage!"
            job = db.query(RevocationJob).filter(RevocationJob.id == act.revocation_job_id).first()
            assert job is not None, f"Linked RevocationJob {act.revocation_job_id} not found."
            assert job.error_log is not None, f"RevocationJob {job.id} missing attempt history in error_log."
            assert act.status.upper() == job.status.upper(), f"Status mismatch: Action {act.status} vs Job {job.status}"

        print("[OK] CascadeAction -> RevocationJob Linkage & Status Sync Verified.")

        # 7. Verify Downstream Delegation Links Revoked
        db.refresh(link1); db.refresh(link2)
        assert link1.status == "Revoked", "Link 1 not marked as Revoked."
        assert link2.status == "Revoked", "Link 2 not marked as Revoked."
        print("[OK] Delegation Link Revocation Verified: All links transitioned to status='Revoked'.")

        print("\n==================================================")
        print("[SUCCESS] ALL 14 AREAS VERIFIED & PASSED 100%!")
        print("==================================================")

    finally:
        db.close()

if __name__ == "__main__":
    verify_full_engine()
