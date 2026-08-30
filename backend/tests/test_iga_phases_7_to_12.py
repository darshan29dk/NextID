"""
Unit Tests for NextID Deterministic IGA Extension: Phases 7 to 12
- Phase 7: Deterministic Approval Workflow Engine
- Phase 8: Deterministic Segregation of Duties (SoD) Engine
- Phase 9: Evidence-Backed Access Certification Engine
- Phase 10: Break Glass Emergency Access Service
- Phase 11: Deterministic Birthright Access Engine
- Phase 12: Deterministic Account Correlation Service
"""
import os
import unittest
import uuid
import json
from datetime import datetime, timedelta

from app.database import SessionLocal, engine, Base
from app.models.principal import Principal
from app.models.account import Account
from app.models.entitlement import Entitlement
from app.models.account_entitlement import AccountEntitlement
from app.models.catalog_item import CatalogItem
from app.models.access_request import AccessRequest
from app.models.sod_policy import SodPolicy, SodPolicyRule
from app.models.sod_violation import SodViolation
from app.models.sod_exception import SodException
from app.models.certification_campaign import CertificationCampaign, CertificationItem
from app.models.break_glass_request import BreakGlassRequest
from app.models.birthright_policy import BirthrightPolicy, BirthrightEvaluation
from app.models.account_correlation import AccountCorrelationRecord

from app.services.approval_workflow_service import ApprovalWorkflowService
from app.services.sod_engine import SoDEngine
from app.services.access_certification_engine import AccessCertificationEngine
from app.services.break_glass_service import BreakGlassService
from app.services.birthright_service import BirthrightService
from app.services.account_correlation_service import AccountCorrelationService


class TestIGAPhases7To12(unittest.TestCase):

    def setUp(self):
        os.environ["TEST_MOCK_MODE"] = "1"
        Base.metadata.create_all(bind=engine)
        self.db = SessionLocal()
        self.tenant_id = f"test_tenant_{uuid.uuid4().hex[:8]}"

        # Seed test principal
        self.principal = Principal(
            id=f"p_{uuid.uuid4().hex[:8]}",
            tenant_id=self.tenant_id,
            principal_type="HUMAN",
            display_name="Test Operator",
            email="operator@test.local",
            authority_epoch=1,
            status="ACTIVE",
            is_frozen=False
        )
        self.db.add(self.principal)

        # Seed test account
        self.account = Account(
            id=f"acc_{uuid.uuid4().hex[:8]}",
            tenant_id=self.tenant_id,
            principal_id=self.principal.id,
            external_account_id="ext_acc_01",
            username="operator",
            status="ACTIVE"
        )
        self.db.add(self.account)
        self.db.commit()

    def tearDown(self):
        self.db.close()

    def test_phase_7_approval_workflow(self):
        # 1. Test creation of approval steps for high risk catalog item
        cat_item = CatalogItem(
            id=f"cat_{uuid.uuid4().hex[:8]}",
            tenant_id=self.tenant_id,
            name="Prod AWS Access",
            risk_level="CRITICAL",
            owner_principal_id=self.principal.id,
            requestable=True
        )
        self.db.add(cat_item)
        self.db.commit()

        req_id = f"ar_{uuid.uuid4().hex[:8]}"
        steps = ApprovalWorkflowService.create_approval_steps(
            db=self.db,
            tenant_id=self.tenant_id,
            access_request_id=req_id,
            catalog_item=cat_item,
            requester_principal_id=self.principal.id,
            trace_id="test_trace"
        )
        self.assertEqual(len(steps), 2)  # Critical requires App Owner and Security Admin
        self.assertEqual(steps[0].approver_type, "APPLICATION_OWNER")
        self.assertEqual(steps[1].approver_type, "SECURITY_ADMIN")

        # 2. Test Step Decision
        step1 = steps[0]
        dec_res = ApprovalWorkflowService.decide_step(
            db=self.db,
            tenant_id=self.tenant_id,
            step_id=step1.id,
            decision="APPROVED",
            decided_by=self.principal.id,
            reason="Verified business need"
        )
        self.assertEqual(dec_res["decision"], "APPROVED")

        # 3. Test Invalid Transition (fail-closed)
        with self.assertRaises(ValueError):
            ApprovalWorkflowService.decide_step(
                db=self.db,
                tenant_id=self.tenant_id,
                step_id=step1.id,
                decision="DENIED",
                decided_by=self.principal.id
            )

    def test_phase_8_sod_engine(self):
        # Create active SoD policy
        ent_a = f"ent_a_{uuid.uuid4().hex[:6]}"
        ent_b = f"ent_b_{uuid.uuid4().hex[:6]}"
        
        pol = SodPolicy(
            id=str(uuid.uuid4()),
            policy_code=f"SOD_{uuid.uuid4().hex[:6]}",
            policy_name="Accounts Payable vs Payment Release",
            risk_level="CRITICAL",
            status="ACTIVE",
            business_owner="compliance@test.local",
            approver="ciso@test.local"
        )
        self.db.add(pol)
        self.db.flush()

        # Create Entitlement records
        e1 = Entitlement(id=ent_a, tenant_id=self.tenant_id, name="Accounts Payable Entry", type="PERMISSION")
        e2 = Entitlement(id=ent_b, tenant_id=self.tenant_id, name="Payment Release", type="PERMISSION")
        self.db.add(e1)
        self.db.add(e2)

        rule = SodPolicyRule(
            policy_id=pol.id,
            application_name="ERP",
            entitlement_one=ent_a,
            entitlement_two=ent_b,
            condition_type="AND"
        )
        self.db.add(rule)

        # Principal holds ent_a via account
        ae = AccountEntitlement(
            id=str(uuid.uuid4()),
            tenant_id=self.tenant_id,
            account_id=self.account.id,
            entitlement_id=ent_a,
            status="ACTIVE",
            source="REQUEST"
        )
        self.db.add(ae)
        self.db.commit()

        # Evaluate SoD when requesting ent_b -> Should CONFLICT
        res_conflict = SoDEngine.evaluate(
            db=self.db,
            tenant_id=self.tenant_id,
            principal_id=self.principal.id,
            requested_entitlement_id=ent_b,
            requested_entitlement_name="Payment Release",
            trigger_type="ACCESS_REQUEST",
            trigger_id="req_01"
        )
        self.assertEqual(res_conflict["result"], "CONFLICT")
        self.assertEqual(res_conflict["risk_level"], "CRITICAL")
        self.assertFalse(res_conflict["exception_required"])

        # Evaluate SoD when requesting unrelated entitlement -> Should CLEAR
        res_clear = SoDEngine.evaluate(
            db=self.db,
            tenant_id=self.tenant_id,
            principal_id=self.principal.id,
            requested_entitlement_id="unrelated_ent",
            requested_entitlement_name="Slack Access",
            trigger_type="ACCESS_REQUEST",
            trigger_id="req_02"
        )
        self.assertEqual(res_clear["result"], "CLEAR")

    def test_phase_9_access_certification(self):
        # 1. Create campaign
        campaign = AccessCertificationEngine.create_campaign(
            db=self.db,
            tenant_id=self.tenant_id,
            name="Q3 Privileged Access Review",
            campaign_type="PRIVILEGED_ACCESS",
            created_by=self.principal.id,
            starts_at=datetime.utcnow(),
            due_at=datetime.utcnow() + timedelta(days=14)
        )
        self.assertEqual(campaign.status, "DRAFT")

        # 2. Add an active entitlement
        cert_ent_id = f"ent_cert_{uuid.uuid4().hex[:8]}"
        ent_cert = Entitlement(id=cert_ent_id, tenant_id=self.tenant_id, name="Cert Test Entitlement", type="ROLE")
        self.db.add(ent_cert)
        self.db.flush()

        ae = AccountEntitlement(
            id=str(uuid.uuid4()),
            tenant_id=self.tenant_id,
            account_id=self.account.id,
            entitlement_id=cert_ent_id,
            status="ACTIVE",
            source="BIRTHRIGHT"
        )
        self.db.add(ae)
        self.db.commit()

        # 3. Populate items
        count = AccessCertificationEngine.populate_items(self.db, self.tenant_id, campaign.id)
        self.assertGreaterEqual(count, 1)
        self.assertEqual(campaign.status, "ACTIVE")

        # 4. Review decision
        items = self.db.query(CertificationItem).filter(CertificationItem.campaign_id == campaign.id).all()
        dec_res = AccessCertificationEngine.decide_item(
            db=self.db,
            tenant_id=self.tenant_id,
            item_id=items[0].id,
            decision="REVOKE",
            reviewer_id=self.principal.id,
            reason="User changed projects"
        )
        self.assertEqual(dec_res["decision"], "REVOKE")
        self.assertTrue(dec_res["requires_revocation"])

    def test_phase_10_break_glass(self):
        # 1. Submit Break Glass Request for high-risk prod resource (caps TTL at 4h, requires maker-checker)
        bg_res = BreakGlassService.submit_request(
            db=self.db,
            tenant_id=self.tenant_id,
            principal_id=self.principal.id,
            resource="aws://production-database-root",
            reason="Production database outage incident response",
            requested_ttl_hours=12,  # Requested 12h -> must cap to 4h
            incident_ticket="INC-9912",
            authenticated_with="FIDO2_YUBIKEY"
        )
        self.assertEqual(bg_res["capped_ttl_hours"], 4)
        self.assertTrue(bg_res["requires_maker_checker"])
        self.assertEqual(bg_res["status"], "REQUESTED")

        # 2. Approver 1 approves -> Goes to PENDING_CHECKER
        app1_res = BreakGlassService.approve(
            db=self.db,
            tenant_id=self.tenant_id,
            request_id=bg_res["request_id"],
            approver_principal_id="approver_1"
        )
        self.assertEqual(app1_res["status"], "PENDING_CHECKER")

        # 3. Maker-checker prevents same person approving
        with self.assertRaises(ValueError):
            BreakGlassService.checker_approve(
                db=self.db,
                tenant_id=self.tenant_id,
                request_id=bg_res["request_id"],
                checker_principal_id="approver_1"
            )

        # 4. Checker 2 approves -> Goes to ACTIVE
        app2_res = BreakGlassService.checker_approve(
            db=self.db,
            tenant_id=self.tenant_id,
            request_id=bg_res["request_id"],
            checker_principal_id="approver_2"
        )
        self.assertEqual(app2_res["status"], "ACTIVE")

        # 5. Revocation / Expiry
        exp_res = BreakGlassService.expire_and_revoke(
            db=self.db,
            tenant_id=self.tenant_id,
            request_id=bg_res["request_id"]
        )
        self.assertEqual(exp_res["status"], "REVOKING")
        self.assertTrue(exp_res["requires_provider_revocation"])

    def test_phase_11_birthright_policy(self):
        # 1. Create Policy and target Entitlement
        birth_ent_id = f"ent_eng_{uuid.uuid4().hex[:8]}"
        ent_birth = Entitlement(id=birth_ent_id, tenant_id=self.tenant_id, name="Engineering GitHub + Slack", type="GROUP")
        self.db.add(ent_birth)
        self.db.commit()

        pol = BirthrightService.create_policy(
            db=self.db,
            tenant_id=self.tenant_id,
            name="Engineering Standard Tooling",
            conditions={"department": "ENGINEERING", "employment_type": "EMPLOYEE"},
            entitlement_id=birth_ent_id,
            entitlement_name="Engineering GitHub + Slack",
            created_by=self.principal.id
        )
        pol.status = "ACTIVE"
        self.db.commit()

        # 2. Evaluate for matching principal
        res_match = BirthrightService.evaluate_for_principal(
            db=self.db,
            tenant_id=self.tenant_id,
            principal_id=self.principal.id,
            attributes={"department": "ENGINEERING", "employment_type": "EMPLOYEE"},
            trigger_type="JOINER"
        )
        self.assertEqual(res_match["matched_policies"], 1)
        self.assertIn(birth_ent_id, res_match["granted"])

        # 3. Evaluate for non-matching principal (Mover)
        res_no_match = BirthrightService.evaluate_for_principal(
            db=self.db,
            tenant_id=self.tenant_id,
            principal_id=self.principal.id,
            attributes={"department": "SALES", "employment_type": "EMPLOYEE"},
            trigger_type="MOVER"
        )
        self.assertEqual(res_no_match["matched_policies"], 0)

    def test_phase_12_account_correlation(self):
        # 1. Exact Email Match -> MATCHED
        res_email = AccountCorrelationService.correlate_account(
            db=self.db,
            tenant_id=self.tenant_id,
            external_account_id="gh_9901",
            external_system="GITHUB",
            email="operator@test.local",
            risk_level="LOW"
        )
        self.assertEqual(res_email["status"], "MATCHED")
        self.assertEqual(res_email["matched_principal_id"], self.principal.id)
        self.assertEqual(res_email["rule_confidence"], 1.0)

        # 2. Unmatched Account
        res_unmatched = AccountCorrelationService.correlate_account(
            db=self.db,
            tenant_id=self.tenant_id,
            external_account_id="ghost_01",
            external_system="AWS",
            email="nonexistent@test.local",
            risk_level="LOW"
        )
        self.assertEqual(res_unmatched["status"], "UNMATCHED")

        # 3. High-Risk Account without exact employee ID -> Requires MANUAL_REVIEW
        res_high_risk = AccountCorrelationService.correlate_account(
            db=self.db,
            tenant_id=self.tenant_id,
            external_account_id="admin_user_01",
            external_system="KUBERNETES",
            username="Test Operator",
            risk_level="HIGH"
        )
        self.assertEqual(res_high_risk["status"], "MANUAL_REVIEW")
        self.assertTrue(res_high_risk["requires_manual_review"])

        # 4. Manual Review Decision
        rev_res = AccountCorrelationService.manual_review_decision(
            db=self.db,
            tenant_id=self.tenant_id,
            record_id=res_high_risk["record_id"],
            decision="CONFIRM",
            principal_id_override=self.principal.id,
            reviewed_by="security_admin"
        )
        self.assertEqual(rev_res["status"], "MATCHED")
        self.assertEqual(rev_res["matched_principal_id"], self.principal.id)


if __name__ == "__main__":
    unittest.main()
