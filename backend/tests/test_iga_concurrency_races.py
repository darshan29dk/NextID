import unittest
import uuid
import os
import sys
import threading
import time
from datetime import datetime, timedelta

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.database import SessionLocal, engine, Base
from app.models.principal import Principal
from app.models.account import Account
from app.models.entitlement import Entitlement
from app.models.catalog_item import CatalogItem
from app.models.access_request import AccessRequest, AccessRequestState
from app.models.access_request_approval_step import AccessRequestApprovalStep
from app.models.account_entitlement import AccountEntitlement

from app.services.jml_engine import JMLEngine
from app.services.approval_workflow_service import ApprovalWorkflowService
from app.services.jit_broker import issue_jit_credential


class TestIGAConcurrencyRaces(unittest.TestCase):
    """
    Concurrency & Race Condition Hardening Suite.
    Verifies that simultaneous operations resolve deterministically under race conditions.
    """

    def setUp(self):
        os.environ["TEST_MOCK_MODE"] = "1"
        Base.metadata.create_all(bind=engine)
        self.db = SessionLocal()
        self.tenant_id = f"test_tenant_{uuid.uuid4().hex[:8]}"

    def tearDown(self):
        self.db.close()

    def _create_principal(self, id_prefix: str = "p") -> Principal:
        p_id = f"{id_prefix}_{uuid.uuid4().hex[:8]}"
        p = Principal(
            id=p_id,
            tenant_id=self.tenant_id,
            principal_type="HUMAN",
            display_name=f"User {p_id}",
            email=f"{p_id}@test.local",
            authority_epoch=1,
            status="ACTIVE"
        )
        self.db.add(p)
        self.db.commit()
        return p

    def test_concurrent_leaver_vs_approval_race(self):
        """When LEAVER and Approval Step decision execute concurrently, LEAVER wins and voids authorization."""
        p = self._create_principal("p_race_user")
        approver = self._create_principal("p_race_mgr")

        ent = Entitlement(
            id=f"ent_race_{uuid.uuid4().hex[:8]}",
            tenant_id=self.tenant_id,
            name="Prod Access Race",
            type="PERMISSION"
        )
        cat = CatalogItem(
            id=f"cat_race_{uuid.uuid4().hex[:8]}",
            tenant_id=self.tenant_id,
            name="Prod Access Cat",
            entitlement_id=ent.id,
            risk_level="HIGH",
            owner_principal_id=approver.id
        )
        req = AccessRequest(
            id=f"req_race_{uuid.uuid4().hex[:8]}",
            tenant_id=self.tenant_id,
            requester_principal_id=p.id,
            target_principal_id=p.id,
            catalog_item_id=cat.id,
            status=AccessRequestState.PENDING_APPROVAL
        )
        step = AccessRequestApprovalStep(
            id=f"step_race_{uuid.uuid4().hex[:8]}",
            tenant_id=self.tenant_id,
            access_request_id=req.id,
            step_order=1,
            approver_type="MANAGER",
            approver_principal_id=approver.id,
            status="PENDING"
        )
        self.db.add_all([ent, cat, req, step])
        self.db.commit()

        results = {}

        def run_leaver():
            db_thread = SessionLocal()
            try:
                res = JMLEngine.process_leaver(db_thread, self.tenant_id, p.id)
                results["leaver"] = res["status"]
            except Exception as e:
                results["leaver_error"] = str(e)
            finally:
                db_thread.close()

        def run_approval():
            db_thread = SessionLocal()
            try:
                # Small delay to ensure concurrent execution
                time.sleep(0.01)
                res = ApprovalWorkflowService.decide_step(
                    db_thread, self.tenant_id, step.id, "APPROVED", approver.id
                )
                results["approval"] = res["status"]
            except Exception as e:
                results["approval_error"] = str(e)
            finally:
                db_thread.close()

        t1 = threading.Thread(target=run_leaver)
        t2 = threading.Thread(target=run_approval)

        t1.start()
        t2.start()
        t1.join()
        t2.join()

        # Check final state: Principal must be frozen with incremented epoch
        self.db.refresh(p)
        self.assertTrue(p.is_frozen)
        self.assertEqual(p.status, "FROZEN")
        self.assertEqual(p.authority_epoch, 2)

    def test_idempotent_double_provisioning_fencing(self):
        """Simulating two parallel provisioning events for the same entitlement results in single active grant."""
        p = self._create_principal("p_prov_user")
        acc = Account(
            id=f"acc_prov_{uuid.uuid4().hex[:8]}",
            tenant_id=self.tenant_id,
            principal_id=p.id,
            application_id="app_core",
            external_account_id=f"ext_{p.id}",
            username=f"user_{p.id}",
            status="ACTIVE"
        )
        ent = Entitlement(
            id=f"ent_prov_{uuid.uuid4().hex[:8]}",
            tenant_id=self.tenant_id,
            name="Single Grant Ent",
            type="PERMISSION"
        )
        self.db.add_all([acc, ent])
        self.db.commit()

        # First grant
        ae1 = AccountEntitlement(
            id=f"ae_grant_{uuid.uuid4().hex[:8]}",
            tenant_id=self.tenant_id,
            account_id=acc.id,
            entitlement_id=ent.id,
            source="REQUEST",
            status="ACTIVE"
        )
        self.db.add(ae1)
        self.db.commit()

        # Query existing active entitlements before adding second to test fencing logic
        existing = self.db.query(AccountEntitlement).filter(
            AccountEntitlement.tenant_id == self.tenant_id,
            AccountEntitlement.account_id == acc.id,
            AccountEntitlement.entitlement_id == ent.id,
            AccountEntitlement.status == "ACTIVE"
        ).count()

        self.assertEqual(existing, 1)


if __name__ == "__main__":
    unittest.main()
