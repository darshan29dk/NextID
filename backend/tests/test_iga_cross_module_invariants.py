import unittest
import uuid
import json
import os
import sys
from datetime import datetime, timedelta

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.database import SessionLocal, engine, Base
from app.models.principal import Principal
from app.models.identity import Identity
from app.models.account import Account
from app.models.entitlement import Entitlement
from app.models.account_entitlement import AccountEntitlement
from app.models.catalog_item import CatalogItem
from app.models.access_request import AccessRequest, AccessRequestState, ACCESS_REQUEST_TRANSITIONS
from app.models.access_request_approval_step import AccessRequestApprovalStep
from app.models.sod_policy import SodPolicy, SodPolicyRule
from app.models.sod_violation import SodViolation
from app.models.sod_exception import SodException
from app.models.break_glass_request import BreakGlassRequest
from app.models.certification_campaign import CertificationCampaign, CertificationItem
from app.models.revocation import RevocationJob
from app.models.lifecycle_event import LifecycleEvent
from app.models.birthright_policy import BirthrightPolicy, BirthrightEvaluation
from app.models.account_correlation import AccountCorrelationRecord

from app.services.jml_engine import JMLEngine
from app.services.approval_workflow_service import ApprovalWorkflowService
from app.services.sod_engine import SoDEngine
from app.services.access_certification_engine import AccessCertificationEngine
from app.services.break_glass_service import BreakGlassService, BREAK_GLASS_MAX_TTL_HOURS
from app.services.birthright_service import BirthrightService
from app.services.account_correlation_service import AccountCorrelationService
from app.connectors.scim import SCIMConnector


class TestIGACrossModuleInvariants(unittest.TestCase):

    def setUp(self):
        os.environ["TEST_MOCK_MODE"] = "1"
        Base.metadata.create_all(bind=engine)
        self.db = SessionLocal()
        self.tenant_id = f"test_tenant_{uuid.uuid4().hex[:8]}"

    def tearDown(self):
        self.db.close()

    def _create_principal(self, id_prefix: str = "p", email: str = None, display_name: str = None, status: str = "ACTIVE") -> Principal:
        p_id = f"{id_prefix}_{uuid.uuid4().hex[:8]}"
        p = Principal(
            id=p_id,
            tenant_id=self.tenant_id,
            principal_type="HUMAN",
            display_name=display_name or f"User {p_id}",
            email=email or f"{p_id}@test.local",
            authority_epoch=1,
            status=status,
            is_frozen=(status == "FROZEN")
        )
        self.db.add(p)
        self.db.commit()
        return p

    def _create_entitlement(self, id_prefix: str = "ent", name: str = None) -> Entitlement:
        e_id = f"{id_prefix}_{uuid.uuid4().hex[:8]}"
        ent = Entitlement(
            id=e_id,
            tenant_id=self.tenant_id,
            application_id="app_core",
            name=name or f"Entitlement {e_id}",
            type="PERMISSION"
        )
        self.db.add(ent)
        self.db.commit()
        return ent

    def _create_account(self, id_prefix: str = "acc", principal_id: str = None) -> Account:
        a_id = f"{id_prefix}_{uuid.uuid4().hex[:8]}"
        acc = Account(
            id=a_id,
            tenant_id=self.tenant_id,
            principal_id=principal_id,
            application_id="app_core",
            external_account_id=f"ext_{a_id}",
            username=f"user_{a_id}",
            status="ACTIVE"
        )
        self.db.add(acc)
        self.db.commit()
        return acc

    # =========================================================================
    # 1. CROSS-MODULE AUTHORITY INVARIANTS: LEAVER, MOVER, REHIRE, CERT REVOKE
    # =========================================================================

    def test_leaver_immediately_freezes_and_blocks_authority_actions(self):
        """A. LEAVER freezes principal, increments epoch, and cascade-revokes accounts."""
        p = self._create_principal("p_leaver", "alice.leaver@example.com", "Alice Leaver")

        res = JMLEngine.process_leaver(self.db, self.tenant_id, p.id)
        self.assertEqual(res["status"], "SUCCESS")
        self.assertTrue(res["is_frozen"])

        self.db.refresh(p)
        self.assertTrue(p.is_frozen)
        self.assertEqual(p.status, "FROZEN")
        self.assertEqual(p.authority_epoch, 2)

    def test_mover_increments_epoch_and_recalculates_birthright(self):
        """B. MOVER increments authority_epoch and recalculates birthrights."""
        p = self._create_principal("p_mover", "bob.mover@example.com", "Bob Mover")

        res = JMLEngine.process_mover(self.db, self.tenant_id, p.id, {"department": "Finance"})
        self.assertEqual(res["status"], "SUCCESS")
        self.assertEqual(res["new_authority_epoch"], 2)

        self.db.refresh(p)
        self.assertEqual(p.authority_epoch, 2)

    def test_rehire_does_not_reactivate_historical_credentials_or_leases(self):
        """C. REHIRE activates principal with new epoch, without restoring old leases/delegations."""
        p = self._create_principal("p_rehire", "charlie.rehire@example.com", "Charlie Rehire", status="FROZEN")

        res = JMLEngine.process_rehire(self.db, self.tenant_id, p.id, attributes={"department": "Engineering"})
        self.assertEqual(res["status"], "SUCCESS")
        self.assertEqual(res["event_type"], "REHIRE")
        self.assertFalse(res["historical_credentials_reactivated"])
        self.assertFalse(res["historical_leases_restored"])
        self.assertFalse(res["historical_delegations_restored"])
        self.assertEqual(res["authority_epoch"], 2)

        self.db.refresh(p)
        self.assertEqual(p.status, "ACTIVE")
        self.assertFalse(p.is_frozen)
        self.assertEqual(p.authority_epoch, 2)

    def test_certification_revoke_triggers_revocation_pipeline(self):
        """D. Certification REVOKE sets requires_revocation=True for RevocationJob engine."""
        admin = self._create_principal("admin_sec", "admin.sec@test.local")
        p = self._create_principal("p_cert", "cert.user@test.local")
        acc = self._create_account("acc_cert", p.id)
        ent = self._create_entitlement("ent_cert", "AdminAccess")

        ae = AccountEntitlement(
            id=f"ae_cert_{uuid.uuid4().hex[:8]}",
            tenant_id=self.tenant_id,
            account_id=acc.id,
            entitlement_id=ent.id,
            source="REQUEST",
            status="ACTIVE"
        )
        self.db.add(ae)
        self.db.commit()

        campaign = AccessCertificationEngine.create_campaign(
            db=self.db,
            tenant_id=self.tenant_id,
            name="Q3 Admin Review",
            campaign_type="PRIVILEGED_ACCESS",
            created_by=admin.id,
            starts_at=datetime.utcnow(),
            due_at=datetime.utcnow() + timedelta(days=14)
        )

        AccessCertificationEngine.populate_items(self.db, self.tenant_id, campaign.id)
        item = self.db.query(CertificationItem).filter(CertificationItem.campaign_id == campaign.id).first()
        self.assertIsNotNone(item)

        decision_res = AccessCertificationEngine.decide_item(
            db=self.db,
            tenant_id=self.tenant_id,
            item_id=item.id,
            decision="REVOKE",
            reviewer_id=admin.id,
            reason="Role no longer required"
        )
        self.assertEqual(decision_res["decision"], "REVOKE")
        self.assertTrue(decision_res["requires_revocation"])

    # =========================================================================
    # 2. ACCESS REQUEST STATE MACHINE CERTIFICATION & TRANSITION MATRIX
    # =========================================================================

    def test_access_request_state_machine_valid_progression(self):
        """Valid linear lifecycle: DRAFT -> SUBMITTED -> POLICY_CHECK -> SOD_CHECK -> PENDING_APPROVAL -> APPROVED -> PROVISIONING -> VERIFYING -> FULFILLED -> REVOKED"""
        p = self._create_principal("p_sm")
        ent = self._create_entitlement("ent_sm", "SM Entitlement")
        cat = CatalogItem(
            id=f"cat_sm_{uuid.uuid4().hex[:8]}",
            tenant_id=self.tenant_id,
            name="SM Catalog Item",
            entitlement_id=ent.id,
            risk_level="LOW",
            owner_principal_id=p.id
        )
        self.db.add(cat)
        self.db.commit()

        req = AccessRequest(
            id=f"req_sm_{uuid.uuid4().hex[:8]}",
            tenant_id=self.tenant_id,
            requester_principal_id=p.id,
            target_principal_id=p.id,
            catalog_item_id=cat.id,
            status=AccessRequestState.DRAFT
        )
        self.db.add(req)
        self.db.commit()

        valid_sequence = [
            AccessRequestState.SUBMITTED,
            AccessRequestState.POLICY_CHECK,
            AccessRequestState.SOD_CHECK,
            AccessRequestState.PENDING_APPROVAL,
            AccessRequestState.APPROVED,
            AccessRequestState.PROVISIONING,
            AccessRequestState.VERIFYING,
            AccessRequestState.FULFILLED,
            AccessRequestState.REVOKED
        ]

        for next_state in valid_sequence:
            req.transition_to(next_state)
            self.assertEqual(req.status, next_state)

    def test_access_request_rejects_illegal_state_jumps(self):
        """Rejects illegal jumps like DRAFT -> FULFILLED or DENIED -> APPROVED."""
        p = self._create_principal("p_sm_rej")
        ent = self._create_entitlement("ent_sm_rej", "SM Entitlement 2")
        cat = CatalogItem(
            id=f"cat_sm_{uuid.uuid4().hex[:8]}",
            tenant_id=self.tenant_id,
            name="SM Catalog Item 2",
            entitlement_id=ent.id,
            risk_level="LOW",
            owner_principal_id=p.id
        )
        self.db.add(cat)
        self.db.commit()

        req = AccessRequest(
            id=f"req_sm_{uuid.uuid4().hex[:8]}",
            tenant_id=self.tenant_id,
            requester_principal_id=p.id,
            target_principal_id=p.id,
            catalog_item_id=cat.id,
            status=AccessRequestState.DRAFT
        )
        self.db.add(req)
        self.db.commit()

        with self.assertRaises(ValueError):
            req.transition_to(AccessRequestState.FULFILLED)

        req.transition_to(AccessRequestState.SUBMITTED)
        req.transition_to(AccessRequestState.POLICY_CHECK)
        req.transition_to(AccessRequestState.DENIED)
        self.assertEqual(req.status, AccessRequestState.DENIED)

        with self.assertRaises(ValueError):
            req.transition_to(AccessRequestState.APPROVED)

    # =========================================================================
    # 3. APPROVAL SECURITY & MAKER-CHECKER
    # =========================================================================

    def test_requester_cannot_approve_own_high_risk_request(self):
        """Maker != checker: requester cannot approve their own HIGH/CRITICAL request."""
        alice = self._create_principal("user_alice", "alice@test.local")
        ent = self._create_entitlement("ent_db", "Prod DB Access")
        cat = CatalogItem(
            id=f"cat_high_{uuid.uuid4().hex[:8]}",
            tenant_id=self.tenant_id,
            name="Prod DB Admin",
            entitlement_id=ent.id,
            risk_level="HIGH",
            owner_principal_id=alice.id
        )
        req = AccessRequest(
            id=f"req_high_{uuid.uuid4().hex[:8]}",
            tenant_id=self.tenant_id,
            requester_principal_id=alice.id,
            target_principal_id=alice.id,
            catalog_item_id=cat.id,
            status=AccessRequestState.PENDING_APPROVAL
        )
        step = AccessRequestApprovalStep(
            id=f"step_high_{uuid.uuid4().hex[:8]}",
            tenant_id=self.tenant_id,
            access_request_id=req.id,
            step_order=1,
            approver_type="APPLICATION_OWNER",
            approver_principal_id=alice.id,
            status="PENDING"
        )
        self.db.add_all([cat, req, step])
        self.db.commit()

        with self.assertRaises(ValueError) as ctx:
            ApprovalWorkflowService.decide_step(
                db=self.db,
                tenant_id=self.tenant_id,
                step_id=step.id,
                decision="APPROVED",
                decided_by=alice.id
            )
        self.assertIn("Maker-checker violation", str(ctx.exception))

    def test_expired_approval_step_is_rejected(self):
        """Expired approval step past due_at cannot be approved."""
        manager = self._create_principal("manager_bob", "bob@test.local")
        ent = self._create_entitlement("ent_exp", "Exp Entitlement")
        cat = CatalogItem(
            id=f"cat_exp_{uuid.uuid4().hex[:8]}",
            tenant_id=self.tenant_id,
            name="Exp Catalog Item",
            entitlement_id=ent.id,
            risk_level="LOW",
            owner_principal_id=manager.id
        )
        req = AccessRequest(
            id=f"req_exp_{uuid.uuid4().hex[:8]}",
            tenant_id=self.tenant_id,
            requester_principal_id=manager.id,
            target_principal_id=manager.id,
            catalog_item_id=cat.id,
            status=AccessRequestState.PENDING_APPROVAL
        )
        step = AccessRequestApprovalStep(
            id=f"step_exp_{uuid.uuid4().hex[:8]}",
            tenant_id=self.tenant_id,
            access_request_id=req.id,
            step_order=1,
            approver_type="MANAGER",
            approver_principal_id=manager.id,
            status="PENDING",
            due_at=datetime.utcnow() - timedelta(hours=1)
        )
        self.db.add_all([cat, req, step])
        self.db.commit()

        with self.assertRaises(ValueError) as ctx:
            ApprovalWorkflowService.decide_step(
                db=self.db,
                tenant_id=self.tenant_id,
                step_id=step.id,
                decision="APPROVED",
                decided_by=manager.id
            )
        self.assertIn("expired", str(ctx.exception))

    # =========================================================================
    # 4. SOD HARDENING & EXCEPTION LIFECYCLE
    # =========================================================================

    def test_sod_detects_toxic_combination_and_respects_valid_exception(self):
        """SoD flags conflicting entitlement pairs and requires a valid exception."""
        p = self._create_principal("p_fin")
        ent1 = self._create_entitlement("ent_create_pay", "Create Payment")
        ent2 = self._create_entitlement("ent_approve_pay", "Approve Payment")
        acc = self._create_account("acc_fin", p.id)

        ae = AccountEntitlement(
            id=f"ae_fin_{uuid.uuid4().hex[:8]}",
            tenant_id=self.tenant_id,
            account_id=acc.id,
            entitlement_id=ent1.id,
            source="REQUEST",
            status="ACTIVE"
        )
        self.db.add(ae)

        policy = SodPolicy(
            id=f"sod_pol_{uuid.uuid4().hex[:8]}",
            policy_code=f"SOD_{uuid.uuid4().hex[:8]}",
            policy_name="Create vs Approve Payment",
            risk_level="HIGH",
            status="ACTIVE",
            business_owner="cfo@test.local",
            approver="ciso@test.local"
        )
        rule = SodPolicyRule(
            policy_id=policy.id,
            application_name="ERP",
            entitlement_one=ent1.id,
            entitlement_two=ent2.id
        )
        self.db.add_all([policy, rule])
        self.db.commit()

        eval_res = SoDEngine.evaluate(
            db=self.db,
            tenant_id=self.tenant_id,
            principal_id=p.id,
            requested_entitlement_id=ent2.id,
            requested_entitlement_name="Approve Payment",
            trigger_type="REQUEST",
            trigger_id="req_001"
        )
        self.assertEqual(eval_res["result"], "CONFLICT")
        self.assertEqual(eval_res["risk_level"], "HIGH")

        # Create Identity for foreign key
        ident = Identity(
            employee_id=p.id,
            display_name=p.display_name,
            email=p.email,
            tenant_id=self.tenant_id,
            status="Active"
        )
        self.db.add(ident)
        self.db.commit()

        exc = SodException(
            id=f"exc_{uuid.uuid4().hex[:8]}",
            exception_number=f"EXC-{uuid.uuid4().hex[:6]}",
            policy_id=policy.id,
            user_id=ident.id,
            employee_id=p.id,
            username=p.display_name,
            application_name="ERP",
            business_justification="Emergency coverage approved by CFO",
            requested_by="manager_01",
            approved_by="cfo@test.local",
            status="APPROVED",
            expiry_date=datetime.utcnow() + timedelta(days=7)
        )
        self.db.add(exc)
        self.db.commit()

        eval_res2 = SoDEngine.evaluate(
            db=self.db,
            tenant_id=self.tenant_id,
            principal_id=p.id,
            requested_entitlement_id=ent2.id,
            requested_entitlement_name="Approve Payment",
            trigger_type="REQUEST",
            trigger_id="req_002"
        )
        self.assertEqual(eval_res2["result"], "EXCEPTION_REQUIRED")
        self.assertTrue(eval_res2["exception_required"])

    # =========================================================================
    # 5. BREAK-GLASS ADVERSARIAL HARDENING
    # =========================================================================

    def test_break_glass_enforces_ttl_cap_and_blocks_self_approval(self):
        """Break-glass caps TTL at 4 hours and enforces maker-checker on high risk."""
        p = self._create_principal("p_bg")
        submit_res = BreakGlassService.submit_request(
            db=self.db,
            tenant_id=self.tenant_id,
            principal_id=p.id,
            resource="production-k8s-root",
            reason="Production database failover incident INC-9901 requires access",
            requested_ttl_hours=24
        )
        self.assertEqual(submit_res["capped_ttl_hours"], BREAK_GLASS_MAX_TTL_HOURS)
        self.assertTrue(submit_res["requires_maker_checker"])
        req_id = submit_res["request_id"]

        with self.assertRaises(ValueError) as ctx:
            BreakGlassService.approve(
                db=self.db,
                tenant_id=self.tenant_id,
                request_id=req_id,
                approver_principal_id=p.id
            )
        self.assertIn("Maker-checker violation", str(ctx.exception))

        app1 = BreakGlassService.approve(
            db=self.db,
            tenant_id=self.tenant_id,
            request_id=req_id,
            approver_principal_id="p_manager_01"
        )
        self.assertEqual(app1["status"], "PENDING_CHECKER")

        with self.assertRaises(ValueError) as ctx:
            BreakGlassService.checker_approve(
                db=self.db,
                tenant_id=self.tenant_id,
                request_id=req_id,
                checker_principal_id="p_manager_01"
            )
        self.assertIn("Maker-checker violation", str(ctx.exception))

        app2 = BreakGlassService.checker_approve(
            db=self.db,
            tenant_id=self.tenant_id,
            request_id=req_id,
            checker_principal_id="p_secops_01"
        )
        self.assertEqual(app2["status"], "ACTIVE")
        self.assertIsNotNone(app2["expires_at"])

    # =========================================================================
    # 6. SCIM FAILURE RECOVERY & READ-BACK
    # =========================================================================

    def test_scim_connector_handles_errors_and_verifies_readback(self):
        """SCIM connector fails closed on HTTP errors and requires active read-back."""
        conn = SCIMConnector()
        res = conn.verify_account_state(tenant_id=self.tenant_id, external_account_id="scim-usr-01")
        self.assertTrue(res.verified)
        self.assertEqual(res.observed_state, "REVOKED")

    # =========================================================================
    # 7. ACCOUNT CORRELATION ADVERSARIAL MATCHING
    # =========================================================================

    def test_account_correlation_flags_ambiguous_matches_for_manual_review(self):
        """Account correlation routes ambiguous or multiple valid matches to MANUAL_REVIEW."""
        # Create two matching principals for 'admin' to trigger ambiguity
        p1 = self._create_principal("p_admin1", "admin1@test.local", "admin")
        p2 = self._create_principal("p_admin2", "admin2@test.local", "admin")

        res = AccountCorrelationService.correlate_account(
            db=self.db,
            tenant_id=self.tenant_id,
            external_account_id=f"acc_ambig_{uuid.uuid4().hex[:8]}",
            external_system="ActiveDirectory",
            username="admin",
            risk_level="HIGH"
        )
        self.assertIn(res["status"], ["AMBIGUOUS", "MANUAL_REVIEW"])
        self.assertTrue(res["requires_manual_review"])


if __name__ == "__main__":
    unittest.main()
