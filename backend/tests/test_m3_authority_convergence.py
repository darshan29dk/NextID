import os
import sys
import unittest
from unittest.mock import patch, MagicMock

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database import SessionLocal
from app.models.provider_credential import ProviderCredential
from app.models.cascade_revocation import DelegationLink, RevocationEvent
from app.models.identity import Identity
from app.models.revocation import RevocationJob
from app.services.reconciliation import reconcile_provider_drift
from app.services.orphan_remediator import remediate_orphan_delegation
from app.routes.ttfr_metrics import get_ttfr_signature_metrics
from app.connectors.base import VerificationResult, VerificationState, ExecutionResult
from app.connectors.registry import ConnectorRegistry

class TestM3AuthorityConvergence(unittest.TestCase):

    def setUp(self):
        os.environ["TEST_MOCK_MODE"] = "1"
        self.db = SessionLocal()
        self.tenant_id = "test_m3_tenant"

        # Cleanup test tenant records
        self.db.query(ProviderCredential).filter(ProviderCredential.tenant_id == self.tenant_id).delete()
        self.db.query(DelegationLink).filter(DelegationLink.tenant_id == self.tenant_id).delete()
        self.db.query(Identity).filter(Identity.tenant_id == self.tenant_id).delete()
        self.db.query(RevocationJob).filter(RevocationJob.tenant_id == self.tenant_id).delete()
        self.db.query(RevocationEvent).filter(RevocationEvent.tenant_id == self.tenant_id).delete()
        self.db.commit()

    def tearDown(self):
        self.db.query(ProviderCredential).filter(ProviderCredential.tenant_id == self.tenant_id).delete()
        self.db.query(DelegationLink).filter(DelegationLink.tenant_id == self.tenant_id).delete()
        self.db.query(Identity).filter(Identity.tenant_id == self.tenant_id).delete()
        self.db.query(RevocationJob).filter(RevocationJob.tenant_id == self.tenant_id).delete()
        self.db.query(RevocationEvent).filter(RevocationEvent.tenant_id == self.tenant_id).delete()
        self.db.commit()
        self.db.close()

    # --- 1. DRIFT DETECTION & AUTO-REMEDIATION TEST ---
    def test_drift_detection_and_auto_remediation(self):
        """
        Tests: Desired=REVOKED, Observed=ACTIVE -> DRIFTED -> Spawns RevocationJob -> Executed & Verified -> CONVERGED.
        """
        cred = ProviderCredential(
            tenant_id=self.tenant_id,
            provider="GITHUB",
            credential_name="drifted-github-user-01",
            credential_type="OAUTH_TOKEN",
            target_resource="NextID-Org",
            vault_reference_uri="vault://secret/data/test_m3/github/1",
            credential_fingerprint_sha256="m3_sha256_fingerprint_01",
            status="REVOKED"
        )
        self.db.add(cred)
        self.db.commit()

        connector = ConnectorRegistry.get_connector("GITHUB")

        def mock_verify(req, exec_res=None):
            if exec_res is not None:
                # Post-execution verification readcheck
                return VerificationResult(
                    state=VerificationState.VERIFIED_REVOKED,
                    verified=True,
                    observed_state="REVOKED",
                    provider_request_id="req-post-ver",
                    retryable=False
                )
            else:
                # Pre-execution scan / pre-execution readcheck
                return VerificationResult(
                    state=VerificationState.STILL_ACTIVE,
                    verified=False,
                    observed_state="ACTIVE",
                    provider_request_id="req-pre-ver",
                    retryable=False
                )

        mock_exec = ExecutionResult(
            status="SUCCESS",
            provider_request_id="req-exec-mock",
            retryable=False,
            http_status=200,
            sanitized_payload={"mock": True}
        )

        with patch.object(connector, "verify", side_effect=mock_verify), patch.object(connector, "execute", return_value=mock_exec):
            result = reconcile_provider_drift(self.db, tenant_id=self.tenant_id, auto_remediate=True)

        self.assertEqual(result["drift_count"], 1)
        self.assertEqual(result["remediated_count"], 1)
        self.assertEqual(result["convergence_status"], "CONVERGED")
        self.assertEqual(result["drift_items"][0]["remediation_status"], "CONVERGED")

    # --- 2. PROVIDER ALREADY REVOKED CONVERGENCE TEST ---
    def test_provider_already_revoked_convergence(self):
        """
        Tests: Desired=REVOKED, Observed=REVOKED -> Immediate CONVERGED.
        """
        cred = ProviderCredential(
            tenant_id=self.tenant_id,
            provider="AWS_IAM",
            credential_name="clean-aws-user-02",
            credential_type="SERVICE_ACCOUNT_KEY",
            target_resource="arn:aws:iam::123456789012:user/clean-aws-user-02",
            vault_reference_uri="vault://secret/data/test_m3/aws/2",
            credential_fingerprint_sha256="m3_sha256_fingerprint_02",
            status="REVOKED"
        )
        self.db.add(cred)
        self.db.commit()

        # Mock provider read-check to return REVOKED
        with patch("app.services.reconciliation.check_external_provider_status", return_value="REVOKED"):
            result = reconcile_provider_drift(self.db, tenant_id=self.tenant_id)

        self.assertEqual(result["drift_count"], 0)
        self.assertEqual(result["convergence_status"], "CONVERGED")

    # --- 3. UNVERIFIABLE PROVIDER FAIL-CLOSED TEST ---
    def test_unverifiable_provider_fail_closed(self):
        """
        Tests: Unknown provider state returns UNKNOWN -> UNVERIFIABLE convergence status.
        """
        cred = ProviderCredential(
            tenant_id=self.tenant_id,
            provider="UNKNOWN_SAAS_PROVIDER",
            credential_name="unknown-saas-user-03",
            credential_type="API_KEY",
            target_resource="global",
            vault_reference_uri="vault://secret/data/test_m3/unknown/3",
            credential_fingerprint_sha256="m3_sha256_fingerprint_03",
            status="REVOKED"
        )
        self.db.add(cred)
        self.db.commit()

        with patch("app.services.reconciliation.check_external_provider_status", return_value="UNKNOWN"):
            result = reconcile_provider_drift(self.db, tenant_id=self.tenant_id)

        self.assertEqual(result["unverifiable_count"], 1)
        self.assertEqual(result["convergence_status"], "UNVERIFIABLE")
        self.assertIn("unknown-saas-user-03", result["unresolved_target_ids"])

    # --- 4. ORPHAN AUTHORITY REMEDIATION PIPELINE ---
    def test_orphan_authority_remediation_pipeline(self):
        """
        Tests: Orphan delegation link remediated through core Revocation Engine pipeline.
        """
        parent = Identity(tenant_id=self.tenant_id, display_name="Parent Identity", status="REVOKED")
        child = Identity(tenant_id=self.tenant_id, display_name="Child Orphan Identity", status="ACTIVE")
        self.db.add_all([parent, child])
        self.db.commit()

        link = DelegationLink(
            tenant_id=self.tenant_id,
            parent_identity_id=parent.id,
            child_identity_id=child.id,
            delegation_type="DELEGATE",
            status="ACTIVE"
        )
        self.db.add(link)
        self.db.commit()

        res = remediate_orphan_delegation(self.db, self.tenant_id, link.id)

        self.assertEqual(res["status"], "RESOLVED")
        self.assertEqual(res["job_status"], "CONFIRMED")
        
        # Verify link & child status updated
        self.db.refresh(link)
        self.db.refresh(child)
        self.assertEqual(link.status, "RESOLVED")
        self.assertEqual(child.status, "REVOKED")

    # --- 5. MANUAL VERIFICATION SEPARATION TEST ---
    def test_manual_verification_separation(self):
        """
        Tests: Manual verification records MANUALLY_CONFIRMED, distinct from PROVIDER_VERIFIED.
        """
        cred = ProviderCredential(
            tenant_id=self.tenant_id,
            provider="GENERIC",
            credential_name="manual-ver-user-05",
            credential_type="API_KEY",
            target_resource="global",
            vault_reference_uri="vault://secret/data/test_m3/manual/5",
            credential_fingerprint_sha256="m3_sha256_fingerprint_05",
            status="MANUALLY_CONFIRMED"
        )
        self.db.add(cred)
        self.db.commit()

        result = reconcile_provider_drift(self.db, tenant_id=self.tenant_id)

        self.assertEqual(result["convergence_status"], "CONVERGED")
        self.assertEqual(result["drift_items"][0]["verification_type"], "MANUAL_VERIFIED")
        self.assertEqual(result["drift_items"][0]["remediation_status"], "MANUALLY_CONFIRMED")

    # --- 6. UNRESOLVED MANDATORY TARGET HOLDS TTFR NULL TEST ---
    def test_unresolved_mandatory_target_holds_ttfr_null(self):
        """
        Tests: Unresolved mandatory target holds TTFR metric state as CONVERGING and average TTFR as None.
        """
        job = RevocationJob(
            tenant_id=self.tenant_id,
            target_type="GENERIC",
            target_identity="unresolved-mandatory-target",
            target_entitlement="ent-unresolved",
            target_class="MANDATORY",
            status="FAILED"
        )
        self.db.add(job)
        self.db.commit()

        metrics = get_ttfr_signature_metrics(tenant_id=self.tenant_id, _perm=True, db=self.db)

        self.assertFalse(metrics["ttfr_finalized"])
        self.assertEqual(metrics["state"], "CONVERGING")
        self.assertIsNone(metrics["average_ttfr_seconds"])
        self.assertEqual(metrics["unresolved_target_count"], 1)
        self.assertIn("unresolved-mandatory-target", metrics["unresolved_target_ids"])

if __name__ == "__main__":
    unittest.main()
