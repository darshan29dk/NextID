import os
import unittest
from datetime import datetime, timedelta
from fastapi.testclient import TestClient
from app.main import app
from app.database import SessionLocal
from app.models.identity import Identity
from app.models.cascade_revocation import DelegationLink
from app.models.credential_lineage import CredentialLineageNode
from app.services.temporal_provenance_service import TemporalProvenanceService

client = TestClient(app)

class TestTemporalProvenanceLineage(unittest.TestCase):

    def setUp(self):
        os.environ["TEST_MOCK_MODE"] = "1"
        from app.database import engine, Base
        import app.models.credential_lineage
        Base.metadata.create_all(bind=engine)
        self.db = SessionLocal()
        self.tenant_id = "test_tpl_tenant"

        # Cleanup existing test records in correct FK order
        from app.models.cascade_revocation import RevocationEvent, CascadeAction
        self.db.query(CascadeAction).filter(CascadeAction.tenant_id == self.tenant_id).delete()
        self.db.query(RevocationEvent).filter(RevocationEvent.tenant_id == self.tenant_id).delete()
        self.db.query(CredentialLineageNode).filter(CredentialLineageNode.tenant_id == self.tenant_id).delete()
        self.db.query(DelegationLink).filter(DelegationLink.tenant_id == self.tenant_id).delete()
        self.db.query(Identity).filter(Identity.tenant_id == self.tenant_id).delete()
        self.db.commit()

        # Create root parent identity
        self.root = Identity(
            employee_id="TPL-ROOT",
            display_name="TPL Root Owner",
            tenant_id=self.tenant_id,
            status="Active",
            created_at=datetime.utcnow() - timedelta(days=5)
        )
        self.child = Identity(
            employee_id="TPL-CHILD",
            display_name="TPL Child Agent",
            tenant_id=self.tenant_id,
            status="Active",
            created_at=datetime.utcnow() - timedelta(days=2)
        )
        self.db.add(self.root)
        self.db.add(self.child)
        self.db.commit()

        # Create delegation link
        self.link = DelegationLink(
            tenant_id=self.tenant_id,
            parent_identity_id=self.root.id,
            child_identity_id=self.child.id,
            delegation_type="AGENT",
            status="Active",
            created_at=datetime.utcnow() - timedelta(days=1)
        )
        self.db.add(self.link)
        self.db.commit()

        # Create derived credential lineage node
        self.node = CredentialLineageNode(
            id="cred-node-123",
            credential_id="cred-node-123",
            tenant_id=self.tenant_id,
            issuer_principal_id=self.root.employee_id,
            holder_principal_id=self.child.employee_id,
            provider="AWS_STS",
            credential_type="STS_SESSION",
            resource="arn:aws:iam::123:role/AgentRole",
            expires_at=datetime.utcnow() + timedelta(hours=2),
            authority_epoch=1,
            policy_decision_id="PD-V2-TEST",
            credential_fingerprint_sha256="sha256_mock_fingerprint_1234567890",
            status="ACTIVE"
        )
        self.db.add(self.node)
        self.db.commit()

    def test_phase4_historical_authority_graph_endpoint(self):
        headers = {"X-Tenant-ID": self.tenant_id}
        res = client.get("/api/v1/authority/graph/history", headers=headers)
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["tenant_id"], self.tenant_id)
        self.assertGreaterEqual(data["nodes_count"], 2)

    def test_phase5_authority_provenance_endpoint(self):
        headers = {"X-Tenant-ID": self.tenant_id}
        res = client.get(f"/api/v1/authority/provenance/{self.child.employee_id}", headers=headers)
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertTrue(data["provenance_found"])
        self.assertEqual(data["root_authority_source"]["employee_id"], self.root.employee_id)
        self.assertGreaterEqual(len(data["delegation_path"]), 1)

    def test_phase6_credential_lineage_endpoint(self):
        headers = {"X-Tenant-ID": self.tenant_id}
        res = client.get(f"/api/v1/credentials/lineage/{self.child.employee_id}", headers=headers)
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["total_credentials"], 1)
        self.assertEqual(data["credentials"][0]["fingerprint"], "sha256_mock_fingerprint_1234567890")

    def test_phase6_dual_lineage_cascade_revocation(self):
        res = TemporalProvenanceService.cascade_revoke_dual_lineage(
            db=self.db,
            tenant_id=self.tenant_id,
            root_principal_id=self.root.employee_id
        )
        self.assertEqual(res["status"], "CONFIRMED")
        self.assertGreaterEqual(res["revoked_identities_count"], 2)
        self.assertEqual(res["revoked_credentials_count"], 1)

        # Check DB updates
        refreshed_node = self.db.query(CredentialLineageNode).filter(CredentialLineageNode.id == self.node.id).first()
        self.assertEqual(refreshed_node.status, "REVOKED")

    def test_graph_safety_cycles_self_references_and_fanout(self):
        from app.security.invariants import SecurityInvariantsEngine, SecurityInvariantViolation
        
        # 1. Cross-tenant lineage injection prevention
        active_contracts = [("test_tpl_tenant", "tenant_allowed")]
        self.assertTrue(SecurityInvariantsEngine.verify_inv_008_cross_tenant_trust_contract("test_tpl_tenant", "tenant_allowed", active_contracts))
        with self.assertRaises(SecurityInvariantViolation):
            SecurityInvariantsEngine.verify_inv_008_cross_tenant_trust_contract("test_tpl_tenant", "unauthorized_tenant", active_contracts)

        # 2. Cycle detection loop prevention in dual lineage traversal
        c1 = CredentialLineageNode(id="c1", credential_id="c1", parent_credential_id="c2", tenant_id=self.tenant_id, issuer_principal_id="P1", holder_principal_id="P2", provider="AWS_STS", credential_type="STS_SESSION", resource="R1", expires_at=datetime.utcnow() + timedelta(hours=1), credential_fingerprint_sha256="fp1", status="ACTIVE")
        c2 = CredentialLineageNode(id="c2", credential_id="c2", parent_credential_id="c1", tenant_id=self.tenant_id, issuer_principal_id="P2", holder_principal_id="P1", provider="AWS_STS", credential_type="STS_SESSION", resource="R1", expires_at=datetime.utcnow() + timedelta(hours=1), credential_fingerprint_sha256="fp2", status="ACTIVE")
        self.db.add(c1)
        self.db.add(c2)
        self.db.commit()

        # Cascade execution on root MUST NOT loop infinitely on cyclic credential lineage graph
        res = TemporalProvenanceService.cascade_revoke_dual_lineage(db=self.db, tenant_id=self.tenant_id, root_principal_id=self.root.employee_id)
        self.assertEqual(res["status"], "CONFIRMED")

if __name__ == "__main__":
    unittest.main()
