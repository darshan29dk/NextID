import os
import sys
import unittest
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database import SessionLocal
from app.models.identity import Identity
from app.routes.ttfr_metrics import get_ttfr_signature_metrics
from app.routes.investigation_mode import investigate_agent_authority
from app.routes.compliance_evidence import generate_compliance_evidence_report

class TestAuthorityControlPlane(unittest.TestCase):

    def setUp(self):
        os.environ["TEST_MOCK_MODE"] = "1"
        self.db = SessionLocal()
        self.tenant_id = "test_acp_tenant"

        from app.models.cascade_revocation import RevocationEvent
        self.db.query(RevocationEvent).filter(RevocationEvent.tenant_id == self.tenant_id).delete()
        self.db.query(Identity).filter(Identity.tenant_id == self.tenant_id).delete()
        self.db.commit()

        self.agent = Identity(
            employee_id="ACP-AGENT-01",
            display_name="PaymentAgent",
            tenant_id=self.tenant_id,
            status="Active",
            created_at=datetime.utcnow()
        )
        self.db.add(self.agent)
        self.db.commit()

    def tearDown(self):
        from app.models.cascade_revocation import RevocationEvent
        self.db.query(RevocationEvent).filter(RevocationEvent.tenant_id == self.tenant_id).delete()
        self.db.query(Identity).filter(Identity.tenant_id == self.tenant_id).delete()
        self.db.commit()
        self.db.close()

    def test_ttfr_signature_metrics(self):
        res = get_ttfr_signature_metrics(
            tenant_id=self.tenant_id,
            _perm=True,
            db=self.db
        )
        self.assertEqual(res["signature_metric"], "TTFR (Time To Full Revocation)")
        self.assertIn("p95_ttfr_seconds", res)
        self.assertEqual(res["remaining_mandatory_authority"], 0)

    def test_investigation_mode(self):
        res = investigate_agent_authority(
            identity_id=self.agent.id,
            tenant_id=self.tenant_id,
            _perm=True,
            db=self.db
        )
        self.assertEqual(res["target_agent_name"], "PaymentAgent")
        self.assertEqual(res["granted_permission"], "payments.execute")
        self.assertEqual(res["risk_level"], "CRITICAL")

    def test_compliance_evidence_report(self):
        # Seed dummy event
        from app.models.cascade_revocation import RevocationEvent
        event = RevocationEvent(
            tenant_id=self.tenant_id,
            source_identity_id=self.agent.id,
            reason="Security Audit Verification",
            status="Confirmed"
        )
        self.db.add(event)
        self.db.commit()

        res = generate_compliance_evidence_report(
            event_id=event.id,
            tenant_id=self.tenant_id,
            _perm=True,
            db=self.db
        )
        self.assertEqual(res["event_id"], event.id)
        self.assertIn("rfc8785_canonical_sha256_digest", res)
        self.assertTrue(res["audit_chain_verified"])

if __name__ == "__main__":
    unittest.main()
