import os
import sys
import unittest
from datetime import datetime

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from fastapi.testclient import TestClient
from app.main import app as fastapi_app
from app.database import SessionLocal, engine, Base

from app.models.account import Account
from app.models.entitlement import Entitlement
from app.models.account_entitlement import AccountEntitlement
from app.models.lifecycle_event import LifecycleEvent
from app.models.catalog_item import CatalogItem
from app.models.access_request import AccessRequest
from app.models.principal import Principal
from app.models.identity import Identity

from app.services.jml_engine import JMLEngine
from app.connectors.scim import SCIMConnector




class TestJMLCatalogAccessRequests(unittest.TestCase):

    def setUp(self):
        os.environ["TEST_MOCK_MODE"] = "1"
        Base.metadata.create_all(bind=engine)
        self.db = SessionLocal()
        self.tenant_id = "test_jml_tenant"
        self.client = TestClient(fastapi_app)

        # Clean up records
        from app.models.cascade_revocation import RevocationEvent, CascadeAction, DelegationLink
        from app.models.credential_lineage import CredentialLineageNode

        self.db.query(AccessRequest).filter(AccessRequest.tenant_id == self.tenant_id).delete()
        self.db.query(CatalogItem).filter(CatalogItem.tenant_id == self.tenant_id).delete()
        self.db.query(LifecycleEvent).filter(LifecycleEvent.tenant_id == self.tenant_id).delete()
        self.db.query(AccountEntitlement).filter(AccountEntitlement.tenant_id == self.tenant_id).delete()
        self.db.query(Account).filter(Account.tenant_id == self.tenant_id).delete()
        self.db.query(Entitlement).filter(Entitlement.tenant_id == self.tenant_id).delete()
        self.db.query(CascadeAction).filter(CascadeAction.tenant_id == self.tenant_id).delete()
        self.db.query(RevocationEvent).filter(RevocationEvent.tenant_id == self.tenant_id).delete()
        self.db.query(CredentialLineageNode).filter(CredentialLineageNode.tenant_id == self.tenant_id).delete()
        self.db.query(DelegationLink).filter(DelegationLink.tenant_id == self.tenant_id).delete()
        self.db.query(Identity).filter(Identity.tenant_id == self.tenant_id).delete()
        self.db.query(Principal).filter(Principal.tenant_id == self.tenant_id).delete()
        self.db.commit()

    def test_joiner_mover_leaver_workflows(self):
        # 1. Joiner Workflow
        join_res = JMLEngine.process_joiner(
            db=self.db,
            tenant_id=self.tenant_id,
            principal_id="P-1001",
            display_name="Alice User",
            email="alice@corp.com",
            attributes={"principal_type": "HUMAN", "department": "FINANCE"}
        )
        self.assertEqual(join_res["status"], "SUCCESS")
        self.assertEqual(join_res["event_type"], "JOINER")

        p = self.db.query(Principal).filter(Principal.tenant_id == self.tenant_id, Principal.id == "P-1001").first()
        self.assertIsNotNone(p)
        self.assertEqual(p.status, "ACTIVE")
        self.assertFalse(p.is_frozen)

        # 2. Mover Workflow
        move_res = JMLEngine.process_mover(
            db=self.db,
            tenant_id=self.tenant_id,
            principal_id="P-1001",
            new_attributes={"department": "ENGINEERING"}
        )
        self.assertEqual(move_res["status"], "SUCCESS")
        self.assertEqual(move_res["new_authority_epoch"], 2)

        # 3. Leaver Workflow
        leave_res = JMLEngine.process_leaver(
            db=self.db,
            tenant_id=self.tenant_id,
            principal_id="P-1001"
        )
        self.assertEqual(leave_res["status"], "SUCCESS")
        self.assertTrue(leave_res["is_frozen"])

        p_frozen = self.db.query(Principal).filter(Principal.tenant_id == self.tenant_id, Principal.id == "P-1001").first()
        self.assertTrue(p_frozen.is_frozen)
        self.assertEqual(p_frozen.status, "FROZEN")

    def test_scim_connector(self):
        scim = SCIMConnector()
        c_res = scim.create_account(self.tenant_id, "P-2002", "bob_dev")
        self.assertEqual(c_res["status"], "SUCCESS")
        self.assertEqual(c_res["provider"], "SCIM_2_0")

        u_res = scim.update_account(self.tenant_id, "scim-usr-P-2002", {"title": "Senior Dev"})
        self.assertEqual(u_res["status"], "SUCCESS")

        d_res = scim.disable_account(self.tenant_id, "scim-usr-P-2002")
        self.assertFalse(d_res["active"])

        v_res = scim.verify_account_state(self.tenant_id, "scim-usr-P-2002")
        self.assertTrue(v_res.verified)

    def test_access_catalog_endpoints(self):
        headers = {"X-Tenant-ID": self.tenant_id}
        create_res = self.client.post("/api/v1/catalog", json={
            "name": "AWS Production Admin Role",
            "description": "Full administrator access to AWS prod environment",
            "risk_level": "CRITICAL",
            "requestable": True,
            "default_ttl_hours": 8,
            "max_ttl_hours": 24,
            "requires_business_justification": True
        }, headers=headers)
        self.assertEqual(create_res.status_code, 200)
        item_id = create_res.json()["catalog_item_id"]

        list_res = self.client.get("/api/v1/catalog", headers=headers)
        self.assertEqual(list_res.status_code, 200)
        items = list_res.json()
        self.assertGreaterEqual(len(items), 1)

        get_res = self.client.get(f"/api/v1/catalog/{item_id}", headers=headers)
        self.assertEqual(get_res.status_code, 200)
        self.assertEqual(get_res.json()["name"], "AWS Production Admin Role")

    def test_access_request_lifecycle(self):
        headers = {"X-Tenant-ID": self.tenant_id}
        # Create Catalog Item
        cat_res = self.client.post("/api/v1/catalog", json={
            "name": "GitHub Admin Entitlement",
            "risk_level": "HIGH",
            "requestable": True,
            "requires_business_justification": True
        }, headers=headers)
        cat_id = cat_res.json()["catalog_item_id"]

        # Submit Access Request
        req_res = self.client.post("/api/v1/access-requests", json={
            "catalog_item_id": cat_id,
            "business_justification": "Emergency hotfix on production repo",
            "requested_ttl_hours": 4
        }, headers=headers)
        self.assertEqual(req_res.status_code, 200)
        req_id = req_res.json()["access_request_id"]
        self.assertEqual(req_res.json()["request_status"], "SUBMITTED")

        # Get Access Request
        get_res = self.client.get(f"/api/v1/access-requests/{req_id}", headers=headers)
        self.assertEqual(get_res.status_code, 200)
        self.assertEqual(get_res.json()["business_justification"], "Emergency hotfix on production repo")

        # Cancel Access Request
        cancel_res = self.client.post(f"/api/v1/access-requests/{req_id}/cancel", headers=headers)
        self.assertEqual(cancel_res.status_code, 200)
        self.assertEqual(cancel_res.json()["request_status"], "CANCELLED")

if __name__ == "__main__":
    unittest.main()
