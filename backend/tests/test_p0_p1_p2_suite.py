import os
import json
import unittest
from datetime import datetime, timedelta
from app.database import SessionLocal
from app.models.identity import Identity
from app.models.cascade_revocation import DelegationLink, RevocationEvent
from app.models.cascade_snapshot import CascadeSnapshot
from app.services.confidence_score import calculate_revocation_confidence
from app.services.revocation_service import verify_post_revocation
from app.routes.graph_explain import explain_authority_lineage
from app.routes.kill_switch import emergency_agent_kill_switch, emergency_provider_kill_switch, emergency_tenant_kill_switch
from app.routes.cascade_restore import dr_safe_cascade_restore

class TestP0P1P2EnterpriseSuite(unittest.TestCase):

    def setUp(self):
        os.environ["TEST_MOCK_MODE"] = "1"
        self.db = SessionLocal()
        self.tenant_id = "test_p0_tenant"
        self.db.query(DelegationLink).filter(DelegationLink.tenant_id == self.tenant_id).delete()
        self.db.query(Identity).filter(Identity.tenant_id == self.tenant_id).delete()
        self.db.commit()

        # Create test identities
        self.parent = Identity(
            employee_id="P0-PARENT",
            display_name="P0 Root Parent",
            tenant_id=self.tenant_id,
            status="Active",
            created_at=datetime.utcnow()
        )
        self.child = Identity(
            employee_id="P0-CHILD",
            display_name="P0 Downstream Child Agent",
            tenant_id=self.tenant_id,
            status="Active",
            created_at=datetime.utcnow()
        )
        self.db.add(self.parent)
        self.db.add(self.child)
        self.db.commit()

        # Create link
        self.link = DelegationLink(
            tenant_id=self.tenant_id,
            parent_identity_id=self.parent.id,
            child_identity_id=self.child.id,
            status="Active",
            created_at=datetime.utcnow()
        )
        self.db.add(self.link)
        self.db.commit()

    def tearDown(self):
        self.db.query(DelegationLink).filter(DelegationLink.tenant_id == self.tenant_id).delete()
        self.db.query(Identity).filter(Identity.tenant_id == self.tenant_id).delete()
        self.db.query(CascadeSnapshot).filter(CascadeSnapshot.tenant_id == self.tenant_id).delete()
        self.db.commit()
        self.db.close()

    def test_p0_graph_explainability(self):
        result = explain_authority_lineage(
            identity_id=self.child.id,
            tenant_id=self.tenant_id,
            _perm=True,
            db=self.db
        )
        self.assertEqual(result["tenant_id"], self.tenant_id)
        self.assertEqual(result["root_grantor"]["id"], self.parent.id)
        self.assertEqual(result["total_lineage_hops"], 1)

    def test_p1_scoped_kill_switches(self):
        # Test Tenant Kill Switch
        tenant_res = emergency_tenant_kill_switch(
            tenant_id=self.tenant_id,
            reason="Test Tenant Freeze",
            _perm=True,
            db=self.db
        )
        self.assertGreaterEqual(tenant_res["identities_frozen"], 2)

        # Test Provider Kill Switch
        prov_res = emergency_provider_kill_switch(
            provider_name="AWS",
            tenant_id=self.tenant_id,
            reason="Test Provider Freeze",
            _perm=True,
            db=self.db
        )
        self.assertEqual(prov_res["provider"], "AWS")

    def test_p2_revocation_confidence_score(self):
        score_res = calculate_revocation_confidence(
            http_status=204,
            provider_verification_confirmed=True,
            evidence_payload={"status": "REVOKED", "target": "AWS_IAM_KEY_123"},
            auth_challenge_failed=True
        )
        self.assertEqual(score_res["confidence_score_percent"], 100.0)
        self.assertEqual(score_res["confidence_level"], "HIGH")
        self.assertTrue(score_res["is_verifiable_revocation"])

    def test_p2_dr_safe_cascade_restore(self):
        snapshot = CascadeSnapshot(
            id="snap_p2_test_123",
            tenant_id=self.tenant_id,
            event_id=1,
            nodes_json=json.dumps([{"id": self.child.id}]),
            links_json=json.dumps([{"id": self.link.id}]),
            snapshot_hash="sha256_mock_hash",
            created_at=datetime.utcnow()
        )
        self.db.add(snapshot)
        self.db.commit()

        restore_res = dr_safe_cascade_restore(
            snapshot_id="snap_p2_test_123",
            tenant_id=self.tenant_id,
            _perm=True,
            db=self.db
        )
        self.assertEqual(restore_res["status"], "RESTORED")
        self.assertEqual(restore_res["reauthorized_identities_count"], 1)

    def test_cross_tenant_isolation_and_object_id_guessing(self):
        import uuid
        from app.models.jit_lease import JitLease
        unique_lease_id = f"lease-tenant-a-{uuid.uuid4().hex[:8]}"
        lease_a = JitLease(
            id=unique_lease_id,
            lease_id=unique_lease_id,
            tenant_id="tenant_a",
            principal_id="user_a@test.com",
            provider_type="AWS_STS",
            resource="arn:aws:iam::123:role/Admin",
            expires_at=datetime.utcnow() + timedelta(hours=1),
            status="COMPENSATION_FAILED"
        )
        self.db.add(lease_a)
        self.db.commit()

        from app.routes.unresolved_authority_route import get_unresolved_authority_queue, retry_unresolved_authority_remediation
        from app.services.security_context import SecurityContext
        
        sec_ctx_b = SecurityContext(tenant_id="tenant_b", principal_id="user_b", permissions=["queue:read"], roles=["operator"])
        
        # Querying queue with tenant_b context should NOT return tenant_a items
        queue_b = get_unresolved_authority_queue(sec_ctx=sec_ctx_b, db=self.db)
        item_ids_b = [i["id"] for i in queue_b["items"]]
        self.assertNotIn(unique_lease_id, item_ids_b)

        # Retrying tenant_a lease ID with tenant_b context MUST fail closed with 404
        from fastapi import HTTPException
        with self.assertRaises(HTTPException) as cm:
            retry_unresolved_authority_remediation(item_id=unique_lease_id, sec_ctx=sec_ctx_b, db=self.db)
        self.assertEqual(cm.exception.status_code, 404)

    def test_zero_secret_leakage_in_db_and_logs(self):
        from app.models.jit_lease import JitLease
        lease = JitLease(
            id="lease-secret-check",
            tenant_id=self.tenant_id,
            principal_id="audit_agent",
            provider_type="AWS_STS",
            resource="role/arn",
            status="ISSUED"
        )
        # Verify no secret columns exist on JitLease OR model attributes
        self.assertFalse(hasattr(lease, "secret_access_key"))
        self.assertFalse(hasattr(lease, "session_token"))
        self.assertFalse(hasattr(lease, "password"))

    def test_stale_worker_fencing_token_rejection(self):
        from app.models.cascade_revocation import RevocationJob
        from app.services.revocation_service import process_revocation_job
        
        job = RevocationJob(
            tenant_id=self.tenant_id,
            target_identity="agent_fencing_test",
            target_type="GENERIC",
            target_entitlement="arn:aws:iam::123:role/Admin",
            status="PENDING",
            fencing_token="fence-5",
            fencing_token_seq=5
        )
        self.db.add(job)
        self.db.commit()

        # Processing with stale worker token ("fence-2" vs current "fence-5") MUST raise exception
        with self.assertRaises(Exception) as cm:
            process_revocation_job(db=self.db, job=job, worker_fencing_token="fence-2")
        self.assertIn("Fencing token mismatch", str(cm.exception))

if __name__ == "__main__":
    unittest.main()
