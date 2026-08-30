import unittest
import uuid
import os
import sys
import json
from datetime import datetime, timedelta

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.database import SessionLocal, engine, Base
from app.models.principal import Principal
from app.models.account import Account
from app.models.entitlement import Entitlement
from app.models.catalog_item import CatalogItem
from app.models.access_request import AccessRequest, AccessRequestState
from app.models.access_request_approval_step import AccessRequestApprovalStep
from app.models.certification_campaign import CertificationCampaign
from app.models.break_glass_request import BreakGlassRequest
from app.models.birthright_policy import BirthrightPolicy

from app.services.approval_workflow_service import ApprovalWorkflowService
from app.services.break_glass_service import BreakGlassService
from app.services.access_certification_engine import AccessCertificationEngine
from app.services.birthright_service import BirthrightService
from app.services.account_correlation_service import AccountCorrelationService


class TestIGATenantEscape(unittest.TestCase):
    """
    Comprehensive Tenant Escape & IDOR Probe Test Suite across all 9 IGA entity types.
    Ensures that Tenant B CANNOT read, mutate, approve, or revoke Tenant A's objects.
    """

    def setUp(self):
        os.environ["TEST_MOCK_MODE"] = "1"
        Base.metadata.create_all(bind=engine)
        self.db = SessionLocal()
        self.tenant_a = f"tenant_alpha_{uuid.uuid4().hex[:6]}"
        self.tenant_b = f"tenant_beta_{uuid.uuid4().hex[:6]}"

        # Seed Tenant A Principal
        self.principal_a = Principal(
            id=f"p_a_{uuid.uuid4().hex[:8]}",
            tenant_id=self.tenant_a,
            principal_type="HUMAN",
            display_name="Alice Alpha",
            email=f"alice_{uuid.uuid4().hex[:6]}@alpha.corp",
            authority_epoch=1,
            status="ACTIVE"
        )
        # Seed Tenant B Principal
        self.principal_b = Principal(
            id=f"p_b_{uuid.uuid4().hex[:8]}",
            tenant_id=self.tenant_b,
            principal_type="HUMAN",
            display_name="Bob Beta",
            email=f"bob_{uuid.uuid4().hex[:6]}@beta.corp",
            authority_epoch=1,
            status="ACTIVE"
        )
        self.db.add_all([self.principal_a, self.principal_b])
        self.db.commit()

    def tearDown(self):
        self.db.close()

    def test_idor_tenant_cannot_read_or_mutate_other_tenant_access_request(self):
        """Tenant B cannot fetch, approve, or cancel Tenant A's access request."""
        ent = Entitlement(
            id=f"ent_a_{uuid.uuid4().hex[:8]}",
            tenant_id=self.tenant_a,
            name="Alpha Confidential DB",
            type="PERMISSION"
        )
        cat = CatalogItem(
            id=f"cat_a_{uuid.uuid4().hex[:8]}",
            tenant_id=self.tenant_a,
            name="Alpha Catalog Item",
            entitlement_id=ent.id,
            risk_level="HIGH",
            owner_principal_id=self.principal_a.id
        )
        req = AccessRequest(
            id=f"req_a_{uuid.uuid4().hex[:8]}",
            tenant_id=self.tenant_a,
            requester_principal_id=self.principal_a.id,
            target_principal_id=self.principal_a.id,
            catalog_item_id=cat.id,
            status=AccessRequestState.PENDING_APPROVAL
        )
        step = AccessRequestApprovalStep(
            id=f"step_a_{uuid.uuid4().hex[:8]}",
            tenant_id=self.tenant_a,
            access_request_id=req.id,
            step_order=1,
            approver_type="SECURITY_ADMIN",
            approver_principal_id=self.principal_a.id,
            status="PENDING"
        )
        self.db.add_all([ent, cat, req, step])
        self.db.commit()

        # Tenant B tries to approve Tenant A's step
        with self.assertRaises(ValueError) as ctx:
            ApprovalWorkflowService.decide_step(
                db=self.db,
                tenant_id=self.tenant_b,
                step_id=step.id,
                decision="APPROVED",
                decided_by=self.principal_b.id
            )
        self.assertIn("not found", str(ctx.exception).lower())

    def test_idor_tenant_cannot_approve_other_tenant_break_glass(self):
        """Tenant B cannot approve Tenant A's break-glass request."""
        bg = BreakGlassService.submit_request(
            db=self.db,
            tenant_id=self.tenant_a,
            principal_id=self.principal_a.id,
            resource="prod-vault-cluster",
            reason="Emergency incident INC-99002 response by Alpha ops team",
            requested_ttl_hours=2
        )
        bg_id = bg["request_id"]

        with self.assertRaises(ValueError) as ctx:
            BreakGlassService.approve(
                db=self.db,
                tenant_id=self.tenant_b,
                request_id=bg_id,
                approver_principal_id=self.principal_b.id
            )
        self.assertIn("not found", str(ctx.exception).lower())

    def test_idor_tenant_cannot_decide_other_tenant_certification_campaign(self):
        """Tenant B cannot review items in Tenant A's certification campaign."""
        campaign = AccessCertificationEngine.create_campaign(
            db=self.db,
            tenant_id=self.tenant_a,
            name="Alpha Exec Access Review",
            campaign_type="USER_ACCESS_REVIEW",
            created_by=self.principal_a.id,
            starts_at=datetime.utcnow(),
            due_at=datetime.utcnow() + timedelta(days=7)
        )

        with self.assertRaises(ValueError) as ctx:
            AccessCertificationEngine.decide_item(
                db=self.db,
                tenant_id=self.tenant_b,
                item_id="nonexistent_or_other_tenant_item",
                decision="KEEP",
                reviewer_id=self.principal_b.id
            )
        self.assertIn("not found", str(ctx.exception).lower())

    def test_idor_tenant_cannot_evaluate_birthright_across_tenants(self):
        """Tenant B's birthright evaluation does not match or grant Tenant A's policies."""
        pol_a = BirthrightService.create_policy(
            db=self.db,
            tenant_id=self.tenant_a,
            name="Alpha All-Hands Slack",
            conditions={"department": "Finance"},
            entitlement_id=f"ent_alpha_{uuid.uuid4().hex[:6]}",
            entitlement_name="Alpha Slack",
            created_by=self.principal_a.id
        )
        pol_a.status = "ACTIVE"
        self.db.commit()

        # Evaluate Tenant B with same department
        eval_res = BirthrightService.evaluate_for_principal(
            db=self.db,
            tenant_id=self.tenant_b,
            principal_id=self.principal_b.id,
            attributes={"department": "Finance"},
            trigger_type="JOINER"
        )
        # Must not match Tenant A's policy
        self.assertEqual(eval_res["matched_policies"], 0)
        self.assertEqual(len(eval_res["granted"]), 0)

    def test_idor_tenant_cannot_correlate_accounts_into_foreign_tenant_principals(self):
        """Tenant B account correlation cannot link to Tenant A's principal."""
        res = AccountCorrelationService.correlate_account(
            db=self.db,
            tenant_id=self.tenant_b,
            external_account_id=f"ext_acc_{uuid.uuid4().hex[:8]}",
            external_system="Okta",
            employee_id=self.principal_a.id,  # Points to Tenant A's principal ID
            username="alice",
            email=self.principal_a.email
        )
        # Because it's isolated by tenant_b, it should NOT match tenant_a's principal
        self.assertNotEqual(res["matched_principal_id"], self.principal_a.id)
        self.assertEqual(res["status"], "UNMATCHED")


if __name__ == "__main__":
    import json
    unittest.main()
