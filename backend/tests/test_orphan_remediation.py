import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database import SessionLocal
from app.models.identity import Identity
from app.models.cascade_revocation import DelegationLink
from app.services.orphan_remediator import remediate_orphan_delegation

class TestOrphanRemediation(unittest.TestCase):

    def setUp(self):
        os.environ["TEST_MOCK_MODE"] = "1"
        self.db = SessionLocal()
        self.p = Identity(display_name="Parent", status="Active")
        self.c = Identity(display_name="Child Agent", status="Active")
        self.db.add_all([self.p, self.c])
        self.db.commit()
        self.db.refresh(self.p); self.db.refresh(self.c)

        self.link = DelegationLink(parent_identity_id=self.p.id, child_identity_id=self.c.id, status="Active")
        self.db.add(self.link)
        self.db.commit()
        self.db.refresh(self.link)

    def tearDown(self):
        self.db.query(DelegationLink).filter(DelegationLink.id == self.link.id).delete()
        self.db.query(Identity).filter(Identity.id.in_([self.p.id, self.c.id])).delete()
        self.db.commit()
        self.db.close()

    def test_orphan_quarantine_and_remediation(self):
        res = remediate_orphan_delegation(self.db, "default_tenant", self.link.id)
        self.assertEqual(res["status"], "RESOLVED")
        
        self.db.refresh(self.link)
        self.db.refresh(self.c)
        self.assertEqual(self.link.status, "RESOLVED")
        self.assertIn(self.c.status, ["Revoked", "REVOKED"])

if __name__ == "__main__":
    unittest.main()
