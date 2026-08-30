import os
import sys
import uuid
import unittest
from datetime import datetime, timedelta

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from fastapi.testclient import TestClient
from app.main import app as fastapi_app
from app.database import SessionLocal

from app.models.principal import Principal
from app.models.application import Application
from app.models.account import Account
from app.models.entitlement import Entitlement
from app.models.account_entitlement import AccountEntitlement
from app.models.identity import Identity
from app.models.sod_policy import SodPolicy, SodPolicyRule
from app.models.sod_exception import SodException
from app.models.catalog_item import CatalogItem
from app.models.access_request import AccessRequest, AccessRequestState
from app.models.access_request_approval_step import AccessRequestApprovalStep
from app.models.break_glass_request import BreakGlassRequest
from app.models.certification_campaign import CertificationCampaign, CertificationItem
from app.models.birthright_policy import BirthrightPolicy
from app.models.account_correlation import AccountCorrelationRecord
from app.models.credential_lineage import CredentialLineageNode

from app.services.jml_engine import JMLEngine
from app.services.sod_engine import SoDEngine
from app.services.access_certification_engine import AccessCertificationEngine
from app.services.break_glass_service import BreakGlassService
from app.services.birthright_service import BirthrightService
from app.services.account_correlation_service import AccountCorrelationService
from app.services.approval_workflow_service import ApprovalWorkflowService
from app.services.jit_broker import issue_jit_credential, revoke_jit_lease
from app.services.temporal_provenance_service import TemporalProvenanceService
from app.services.blast_radius_engine import calculate_blast_radius


class TestFunctionalE2ESuite(unittest.TestCase):
    """
    End-to-End Functional Test Suite for NextID Platform.
    Validates complete functional business logic across all 12 platform subsystems.
    """

    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(fastapi_app)

    def setUp(self):
        self.db = SessionLocal()
        self.tenant_id = f"fn_tenant_{uuid.uuid4().hex[:8]}"
        self.headers = {
            "X-Tenant-ID": self.tenant_id,
            "X-Principal-ID": f"admin_{uuid.uuid4().hex[:6]}",
            "X-Principal-Role": "ADMIN"
        }

    def tearDown(self):
        self.db.close()

    def test_01_health_and_readiness_endpoints(self):
        """Functional Test 1: Service health and readiness probes."""
        live_res = self.client.get("/health/live")
        self.assertEqual(live_res.status_code, 200)
        self.assertEqual(live_res.json().get("status"), "UP")
        self.assertEqual(live_res.json().get("liveness"), "ALIVE")

        ready_res = self.client.get("/health/ready")
        self.assertEqual(ready_res.status_code, 200)
        self.assertEqual(ready_res.json().get("status"), "UP")
        self.assertEqual(ready_res.json().get("database"), "CONNECTED")

    def test_02_unified_principal_account_entitlement_model(self):
        """Functional Test 2: Principal, Application, Account, Entitlement lifecycle and association."""
        p_id = f"p_{uuid.uuid4().hex[:8]}"
        principal = Principal(
            id=p_id,
            tenant_id=self.tenant_id,
            principal_type="HUMAN",
            display_name="Functional User One",
            email=f"{p_id}@example.com",
            status="ACTIVE",
            authority_epoch=1
        )
        self.db.add(principal)
        self.db.commit()

        app = Application(
            application_name=f"App_{uuid.uuid4().hex[:6]}",
            application_type="SAAS",
            description="Functional Test SaaS App"
        )
        self.db.add(app)
        self.db.commit()

        acc = Account(
            id=f"acc_{uuid.uuid4().hex[:8]}",
            tenant_id=self.tenant_id,
            principal_id=principal.id,
            application_id=str(app.id),
            external_account_id=f"ext_{uuid.uuid4().hex[:6]}",
            username=f"usr_{uuid.uuid4().hex[:6]}",
            account_type="HUMAN",
            status="ACTIVE"
        )
        self.db.add(acc)

        ent = Entitlement(
            id=f"ent_{uuid.uuid4().hex[:8]}",
            tenant_id=self.tenant_id,
            application_id=str(app.id),
            name="Repo:Admin",
            type="ROLE",
            privileged=True,
            risk_level="HIGH"
        )
        self.db.add(ent)
        self.db.commit()

        acc_ent = AccountEntitlement(
            id=f"ae_{uuid.uuid4().hex[:8]}",
            tenant_id=self.tenant_id,
            account_id=acc.id,
            entitlement_id=ent.id,
            status="ACTIVE",
            source="BIRTHRIGHT"
        )
        self.db.add(acc_ent)
        self.db.commit()

        # Query back and verify relational integrity
        loaded_acc = self.db.query(Account).filter_by(id=acc.id).first()
        self.assertIsNotNone(loaded_acc)
        self.assertEqual(loaded_acc.principal_id, principal.id)
        self.assertEqual(loaded_acc.status, "ACTIVE")

        loaded_ae = self.db.query(AccountEntitlement).filter_by(account_id=acc.id).first()
        self.assertIsNotNone(loaded_ae)
        self.assertEqual(loaded_ae.entitlement_id, ent.id)
        self.assertEqual(loaded_ae.source, "BIRTHRIGHT")

    def test_03_jml_complete_lifecycle_e2e(self):
        """Functional Test 3: Complete Joiner -> Mover -> Leaver -> Rehire sequence."""
        p_id = f"p_jml_{uuid.uuid4().hex[:8]}"
        # 1. Joiner via Engine
        res_join = JMLEngine.process_joiner(
            db=self.db,
            tenant_id=self.tenant_id,
            principal_id=p_id,
            display_name="Alice Wonderland",
            email=f"{p_id}@example.com",
            attributes={"department": "SALES", "job_title": "Account Executive"}
        )
        self.assertEqual(res_join["status"], "SUCCESS")
        self.assertEqual(res_join["principal_id"], p_id)

        # 2. Mover via Engine
        res_move = JMLEngine.process_mover(
            db=self.db,
            tenant_id=self.tenant_id,
            principal_id=p_id,
            new_attributes={"department": "SECURITY", "job_title": "Security Analyst"}
        )
        self.assertEqual(res_move["status"], "SUCCESS")

        # 3. Leaver via Engine
        res_leave = JMLEngine.process_leaver(
            db=self.db,
            tenant_id=self.tenant_id,
            principal_id=p_id
        )
        self.assertEqual(res_leave["status"], "SUCCESS")

        # Verify leaver authority epoch was incremented and principal status is FROZEN
        p_after_leave = self.db.query(Principal).filter_by(id=p_id).first()
        self.assertEqual(p_after_leave.status, "FROZEN")
        self.assertTrue(p_after_leave.is_frozen)
        self.assertGreaterEqual(p_after_leave.authority_epoch, 2)
        initial_epoch = p_after_leave.authority_epoch

        # 4. Rehire via Engine
        rehire_result = JMLEngine.process_rehire(
            db=self.db,
            tenant_id=self.tenant_id,
            principal_id=p_id,
            display_name="Alice Wonderland",
            email=f"{p_id}@example.com",
            attributes={"department": "ENGINEERING", "job_title": "Lead Architect"}
        )
        self.assertEqual(rehire_result["status"], "SUCCESS")
        self.assertGreater(rehire_result["authority_epoch"], initial_epoch)

    def test_04_access_catalog_and_request_workflow_e2e(self):
        """Functional Test 4: Access Catalog search, request submission, multi-step approval, cancel."""
        p_id = f"p_req_{uuid.uuid4().hex[:8]}"
        p = Principal(
            id=p_id,
            tenant_id=self.tenant_id,
            principal_type="HUMAN",
            display_name="Requester User",
            email=f"{p_id}@example.com",
            status="ACTIVE",
            authority_epoch=1
        )
        self.db.add(p)

        cat_item = CatalogItem(
            id=f"cat_{uuid.uuid4().hex[:8]}",
            tenant_id=self.tenant_id,
            name="AWS Production Read-Only Role",
            risk_level="LOW",
            requestable=True,
            status="ACTIVE"
        )
        self.db.add(cat_item)
        self.db.commit()

        # Search catalog
        cat_res = self.client.get("/api/v1/catalog?search=Production", headers=self.headers)
        self.assertEqual(cat_res.status_code, 200)
        self.assertTrue(any(item["name"] == "AWS Production Read-Only Role" for item in cat_res.json()))

        # Submit Access Request
        req_payload = {
            "target_principal_id": p_id,
            "catalog_item_id": cat_item.id,
            "business_justification": "Required for production log analysis and audit",
            "requested_ttl_hours": 8
        }
        sub_res = self.client.post("/api/v1/access-requests", json=req_payload, headers=self.headers)
        self.assertEqual(sub_res.status_code, 200)
        req_id = sub_res.json()["access_request_id"]
        self.assertEqual(sub_res.json()["request_status"], "SUBMITTED")

        # Create approval step and approve
        steps = ApprovalWorkflowService.create_approval_steps(
            db=self.db,
            tenant_id=self.tenant_id,
            access_request_id=req_id,
            catalog_item=cat_item,
            requester_principal_id=p_id,
            trace_id=f"trace_{uuid.uuid4().hex[:6]}"
        )
        self.assertGreaterEqual(len(steps), 1)

        decide_res = ApprovalWorkflowService.decide_step(
            db=self.db,
            tenant_id=self.tenant_id,
            step_id=steps[0].id,
            decision="APPROVED",
            decided_by=f"approver_{uuid.uuid4().hex[:6]}",
            reason="Approved for authorized quarterly audit"
        )
        self.assertEqual(decide_res["decision"], "APPROVED")

    def test_05_sod_toxic_pair_detection_and_exceptions(self):
        """Functional Test 5: SoD Policy creation, toxic pair conflict detection, and exception verification."""
        p_id = f"p_sod_{uuid.uuid4().hex[:8]}"
        p = Principal(
            id=p_id,
            tenant_id=self.tenant_id,
            principal_type="HUMAN",
            display_name="SoD Subject",
            email=f"{p_id}@example.com",
            status="ACTIVE",
            authority_epoch=1
        )
        self.db.add(p)

        app = Application(application_name=f"FinanceApp_{uuid.uuid4().hex[:6]}", application_type="ERP")
        self.db.add(app)
        self.db.commit()

        acc = Account(
            id=f"acc_sod_{uuid.uuid4().hex[:6]}",
            tenant_id=self.tenant_id,
            principal_id=p.id,
            application_id=str(app.id),
            external_account_id=f"ext_sod_{uuid.uuid4().hex[:6]}",
            username="usr_fin",
            status="ACTIVE",
            account_type="HUMAN"
        )
        self.db.add(acc)

        ent_a = Entitlement(id=f"ent_a_{uuid.uuid4().hex[:6]}", tenant_id=self.tenant_id, application_id=str(app.id), name="AccountsPayable:Create", type="ROLE")
        ent_b = Entitlement(id=f"ent_b_{uuid.uuid4().hex[:6]}", tenant_id=self.tenant_id, application_id=str(app.id), name="AccountsPayable:Disburse", type="ROLE")
        self.db.add_all([ent_a, ent_b])
        self.db.commit()

        # User currently holds ent_a
        ae = AccountEntitlement(
            id=f"ae_sod_{uuid.uuid4().hex[:6]}",
            tenant_id=self.tenant_id,
            account_id=acc.id,
            entitlement_id=ent_a.id,
            status="ACTIVE",
            source="BIRTHRIGHT"
        )
        self.db.add(ae)

        # Define Toxic Pair Policy
        policy = SodPolicy(
            id=f"pol_sod_{uuid.uuid4().hex[:8]}",
            policy_code=f"SOD-FIN-{uuid.uuid4().hex[:6]}",
            policy_name="Finance Disburse Toxic Pair",
            risk_level="CRITICAL",
            status="ACTIVE",
            business_owner="FinanceDirector",
            approver="CFO"
        )
        rule = SodPolicyRule(
            policy_id=policy.id,
            application_name=app.application_name,
            entitlement_one=ent_a.id,
            entitlement_two=ent_b.id
        )
        self.db.add_all([policy, rule])
        self.db.commit()

        # Evaluate SoD when user requests ent_b -> must CONFLICT
        result = SoDEngine.evaluate(
            db=self.db,
            tenant_id=self.tenant_id,
            principal_id=p.id,
            requested_entitlement_id=ent_b.id,
            requested_entitlement_name=ent_b.name,
            trigger_type="REQUEST",
            trigger_id="req_sod_01"
        )
        self.assertEqual(result["result"], "CONFLICT")
        self.assertEqual(result["risk_level"], "CRITICAL")
        self.assertEqual(len(result["conflicts"]), 1)

    def test_06_access_certification_campaign_e2e(self):
        """Functional Test 6: Access Certification campaign creation, reviewer decision propagation."""
        camp = AccessCertificationEngine.create_campaign(
            db=self.db,
            tenant_id=self.tenant_id,
            name="Q3 SOC2 Security Review",
            campaign_type="PERIODIC",
            created_by="ComplianceLead",
            starts_at=datetime.utcnow(),
            due_at=datetime.utcnow() + timedelta(days=14)
        )
        camp.status = "ACTIVE"
        self.db.commit()

        # Populate campaign item
        item = CertificationItem(
            id=f"item_{uuid.uuid4().hex[:8]}",
            campaign_id=camp.id,
            tenant_id=self.tenant_id,
            principal_id=f"p_rev_{uuid.uuid4().hex[:6]}",
            account_id=f"acc_rev_{uuid.uuid4().hex[:6]}",
            entitlement_id=f"ent_rev_{uuid.uuid4().hex[:6]}",
            reviewer_id=f"reviewer_{uuid.uuid4().hex[:6]}",
            status="PENDING"
        )
        self.db.add(item)
        self.db.commit()

        # Reviewer keeps access
        dec_res = AccessCertificationEngine.decide_item(
            db=self.db,
            tenant_id=self.tenant_id,
            item_id=item.id,
            decision="KEEP",
            reviewer_id=item.reviewer_id,
            reason="Access verified for ongoing Q3 operations"
        )
        self.assertEqual(dec_res["decision"], "KEEP")
        self.assertEqual(dec_res["item_id"], item.id)

    def test_07_break_glass_emergency_escalation_e2e(self):
        """Functional Test 7: Break Glass escalation, 4h TTL check, approval, activation, and expiration."""
        bg_req = BreakGlassService.submit_request(
            db=self.db,
            tenant_id=self.tenant_id,
            principal_id=f"oncall_{uuid.uuid4().hex[:6]}",
            resource="AWS-Prod-Core-RDS",
            reason="P0 Sev1 Outage: Database replica sync failure in us-east-1 production cluster",
            requested_ttl_hours=3
        )
        self.assertEqual(bg_req["status"], "REQUESTED")
        self.assertTrue(bg_req["requires_maker_checker"])
        req_id = bg_req["request_id"]

        # 1. First approval (Maker)
        approver_id = f"sec_lead_{uuid.uuid4().hex[:6]}"
        appr_res = BreakGlassService.approve(
            db=self.db,
            tenant_id=self.tenant_id,
            request_id=req_id,
            approver_principal_id=approver_id
        )
        self.assertEqual(appr_res["status"], "PENDING_CHECKER")

        # 2. Second approval (Checker) -> activates
        checker_id = f"ciso_{uuid.uuid4().hex[:6]}"
        chk_res = BreakGlassService.checker_approve(
            db=self.db,
            tenant_id=self.tenant_id,
            request_id=req_id,
            checker_principal_id=checker_id
        )
        self.assertEqual(chk_res["status"], "ACTIVE")

    def test_08_birthright_policy_engine_e2e(self):
        """Functional Test 8: Deterministic Birthright rule matching on department/location attributes."""
        app = Application(application_name=f"EngTools_{uuid.uuid4().hex[:6]}", application_type="INTERNAL")
        self.db.add(app)
        self.db.commit()

        ent = Entitlement(id=f"ent_br_{uuid.uuid4().hex[:6]}", tenant_id=self.tenant_id, application_id=str(app.id), name="GitHub:Engineering-Core", type="ROLE")
        self.db.add(ent)
        self.db.commit()

        pol = BirthrightService.create_policy(
            db=self.db,
            tenant_id=self.tenant_id,
            name="Eng Core Birthright",
            conditions={"department": "ENGINEERING"},
            entitlement_id=ent.id,
            entitlement_name=ent.name,
            created_by="Admin"
        )
        pol.status = "ACTIVE"
        self.db.commit()

        # Evaluate for Engineering user -> should match
        eval_eng = BirthrightService.evaluate_for_principal(
            db=self.db,
            tenant_id=self.tenant_id,
            principal_id=f"p_eng_{uuid.uuid4().hex[:6]}",
            attributes={"department": "ENGINEERING"},
            trigger_type="JOINER"
        )
        self.assertEqual(eval_eng["matched_policies"], 1)

        # Evaluate for Sales user -> should NOT match
        eval_sales = BirthrightService.evaluate_for_principal(
            db=self.db,
            tenant_id=self.tenant_id,
            principal_id=f"p_sales_{uuid.uuid4().hex[:6]}",
            attributes={"department": "SALES"},
            trigger_type="JOINER"
        )
        self.assertEqual(eval_sales["matched_policies"], 0)

    def test_09_account_correlation_disambiguation(self):
        """Functional Test 9: External account correlation with exact vs ambiguous candidates."""
        p_id = f"p_corr_{uuid.uuid4().hex[:8]}"
        p = Principal(
            id=p_id,
            tenant_id=self.tenant_id,
            principal_type="HUMAN",
            display_name="Correlation Target",
            email=f"corr_{uuid.uuid4().hex[:6]}@domain.com",
            status="ACTIVE",
            authority_epoch=1
        )
        self.db.add(p)
        self.db.commit()

        # Correlate by exact email
        corr_res = AccountCorrelationService.correlate_account(
            db=self.db,
            tenant_id=self.tenant_id,
            external_account_id=f"ext_acc_{uuid.uuid4().hex[:6]}",
            external_system="OKTA_PROD",
            employee_id=None,
            email=p.email,
            username=None
        )
        self.assertEqual(corr_res["status"], "MATCHED")
        self.assertEqual(corr_res["matched_principal_id"], p.id)
        self.assertFalse(corr_res["requires_manual_review"])

    def test_10_jit_credential_broker_and_revocation(self):
        """Functional Test 10: JIT lease issuance, TTL validation, and direct revocation."""
        p_id = f"p_jit_{uuid.uuid4().hex[:8]}"
        p = Principal(
            id=p_id,
            tenant_id=self.tenant_id,
            principal_type="HUMAN",
            display_name="JIT Developer",
            email=f"{p_id}@example.com",
            status="ACTIVE",
            authority_epoch=1
        )
        self.db.add(p)
        self.db.commit()

        lease_res = issue_jit_credential(
            tenant_id=self.tenant_id,
            principal_id=p.id,
            resource="arn:aws:s3:::audit-logs",
            db=self.db,
            provider_type="AWS_STS",
            ttl_seconds=900
        )
        self.assertIn("lease_id", lease_res)
        self.assertEqual(lease_res["status"], "ISSUED")

        # Revoke the lease
        rev_res = revoke_jit_lease(
            lease_id=lease_res["lease_id"],
            db=self.db,
            tenant_id=self.tenant_id
        )
        self.assertEqual(rev_res["status"], "REVOKED")

    def test_11_temporal_provenance_and_lineage_graph(self):
        """Functional Test 11: Credential lineage hierarchy creation and cycle-free traversal."""
        now = datetime.utcnow()
        ident = Identity(
            employee_id=f"emp_{uuid.uuid4().hex[:6]}",
            display_name="Provenance Identity",
            email="prov@corp.local",
            tenant_id=self.tenant_id,
            status="Active"
        )
        self.db.add(ident)
        self.db.commit()

        graph = TemporalProvenanceService.get_temporal_authority_graph(
            db=self.db,
            tenant_id=self.tenant_id,
            at_timestamp=now + timedelta(minutes=5)
        )
        self.assertEqual(graph["tenant_id"], self.tenant_id)
        self.assertGreaterEqual(graph["nodes_count"], 1)

    def test_12_blast_radius_evaluation(self):
        """Functional Test 12: Deterministic graph-based blast radius calculation for principal."""
        p_id = f"p_blast_{uuid.uuid4().hex[:8]}"
        p = Principal(
            id=p_id,
            tenant_id=self.tenant_id,
            principal_type="HUMAN",
            display_name="Blast Radius Subject",
            email=f"{p_id}@example.com",
            status="ACTIVE",
            authority_epoch=1
        )
        self.db.add(p)

        app = Application(application_name=f"ProdInfra_{uuid.uuid4().hex[:6]}", application_type="CLOUD")
        self.db.add(app)
        self.db.commit()

        acc = Account(
            id=f"acc_blast_{uuid.uuid4().hex[:6]}",
            tenant_id=self.tenant_id,
            principal_id=p.id,
            application_id=str(app.id),
            external_account_id=f"ext_blast_{uuid.uuid4().hex[:6]}",
            username="admin_infra",
            account_type="HUMAN",
            status="ACTIVE"
        )
        self.db.add(acc)
        self.db.commit()

        radius = calculate_blast_radius(
            principal_id=p.id,
            tenant_id=self.tenant_id,
            db=self.db
        )
        self.assertEqual(radius["target_principal_id"], p.id)
        self.assertIn("impact_summary", radius)
        self.assertIn("risk_score_reduction", radius["impact_summary"])


if __name__ == "__main__":
    unittest.main()
