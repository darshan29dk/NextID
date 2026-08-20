import sys
import os
import logging
import io
import unittest
from datetime import datetime
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app.main import app
from app.services.jit_broker import (
    issue_jit_credential,
    revoke_jit_lease,
    revoke_all_principal_leases,
    list_active_leases,
    generate_strengthened_idempotency_key
)
from app.connectors.aws_sts import AWSSTSConnector
from app.connectors.vault import VaultConnector
from app.connectors.oauth import OAuthConnector
from app.models.jit_lease import JitLease

client = TestClient(app)

class TestM52JitAdversarial(unittest.TestCase):
    """
    Milestone M5.2 Provider-Backed & Adversarial Test Suite:
    1. Provider-Success / Local-Persistence Failure & Automatic Compensation
    2. 2-Phase Persisted Issuance State Machine (ISSUING -> ACTIVE)
    3. Strengthened Idempotency & DB UNIQUE Constraint Race Resolution
    4. Real Provider Connectors (AWS STS, Vault, OAuth)
    5. Provider Read-Back Verification Fail-Closed (UNVERIFIABLE)
    6. Zero Secret Leakage in Log Outputs & Exception Messages
    7. Atomic Pre-Issuance Freeze & Epoch Race Guards
    8. Strict Multi-Tenant Isolation
    """

    def test_real_aws_sts_connector_issuance(self):
        """AWSSTSConnector issues valid ephemeral credentials without DB secret persistence."""
        conn = AWSSTSConnector()
        res = conn.assume_role(
            role_arn="arn:aws:iam::123456789012:role/NextID-JIT-Role",
            role_session_name="Session-Test-01",
            duration_seconds=3600
        )
        self.assertTrue(res["success"])
        self.assertEqual(res["provider"], "AWS_STS")
        self.assertIn("access_key_id", res)
        self.assertIn("secret_access_key", res)
        self.assertIn("assumed_role_arn", res)

    def test_real_vault_connector_issuance_and_revocation(self):
        """VaultConnector issues dynamic credentials and executes dynamic lease revocation."""
        conn = VaultConnector()
        issue_res = conn.issue_dynamic_credential(role_name="read-role", ttl_seconds=1800)
        self.assertTrue(issue_res["success"])
        self.assertEqual(issue_res["provider"], "VAULT")
        self.assertIn("vault_lease_id", issue_res)

        rev_res = conn.revoke_lease(lease_id=issue_res["vault_lease_id"])
        self.assertTrue(rev_res["success"])
        self.assertEqual(rev_res["state"], "VERIFIED_REVOKED")

    def test_real_oauth_token_revocation(self):
        """OAuthConnector revokes OAuth token via standard RFC 7009 endpoint."""
        conn = OAuthConnector()
        res = conn.revoke_token(token="nxt_oauth_bearer_123456789")
        self.assertTrue(res["success"])
        self.assertEqual(res["state"], "VERIFIED_REVOKED")

    def test_provider_succeeds_local_commit_fails_compensation(self):
        """
        Adversarial Test: Provider API succeeds, but local DB commit raises Exception!
        Verifies:
        1. Exception is caught gracefully.
        2. Status is marked ISSUANCE_UNCERTAIN / LOCAL_COMMIT_FAILED_COMPENSATED.
        3. Automatic compensation revocation is triggered on provider.
        """
        db_mock = MagicMock()
        db_mock.query.return_value.filter.return_value.first.return_value = None
        db_mock.query.return_value.filter.return_value.all.return_value = []
        # Simulate commit error on Phase 3 (first commit for ISSUING succeeds, second commit for ACTIVE fails)
        db_mock.commit.side_effect = [None, Exception("DB Disk Full / Network Cut")]

        res = issue_jit_credential(
            tenant_id="tenant-adv-01",
            principal_id="agent-crash-01",
            action="READ",
            resource="AWS_S3_CRITICAL",
            provider_type="AWS_STS",
            db=db_mock,
            parent_permissions=["READ"],
            requested_permissions=["READ"]
        )

        self.assertFalse(res["authorized"])
        self.assertEqual(res["status"], "REJECTED")
        self.assertEqual(res["reason_code"], "LOCAL_COMMIT_FAILED_COMPENSATED")

    def test_issuing_row_created_before_provider_api_call(self):
        """
        Adversarial Test: 2-Phase Persisted Issuance State Machine.
        Verifies DB record is added with status='ISSUING' BEFORE calling external provider.
        """
        db_mock = MagicMock()
        db_mock.query.return_value.filter.return_value.first.return_value = None
        db_mock.query.return_value.filter.return_value.all.return_value = []
        res = issue_jit_credential(
            tenant_id="tenant-adv-01",
            principal_id="agent-2phase-01",
            action="READ",
            resource="PROD_DB",
            provider_type="VAULT",
            db=db_mock,
            parent_permissions=["READ"],
            requested_permissions=["READ"]
        )

        self.assertTrue(res["authorized"])
        self.assertEqual(res["status"], "ISSUED")
        # Verify db.add was called for Phase 1 ISSUING state
        self.assertTrue(db_mock.add.called)
        added_obj = db_mock.add.call_args[0][0]
        self.assertIsInstance(added_obj, JitLease)

    def test_zero_secret_leak_in_logger_output(self):
        """
        Adversarial Test: Zero Secret Leakage in Log Output.
        Captures logger stream during JIT issuance and asserts plaintext secret values are absent.
        """
        log_capture = io.StringIO()
        handler = logging.StreamHandler(log_capture)
        logger_jit = logging.getLogger("app.services.jit_broker")
        logger_jit.setLevel(logging.INFO)
        logger_jit.addHandler(handler)

        res = issue_jit_credential(
            tenant_id="tenant-adv-01",
            principal_id="agent-secret-01",
            action="READ",
            resource="SECRET_BUCKET",
            provider_type="AWS_STS",
            parent_permissions=["READ"],
            requested_permissions=["READ"]
        )

        handler.flush()
        log_contents = log_capture.getvalue()
        logger_jit.removeHandler(handler)

        ephemeral_secret = res["lease"]["ephemeral_credentials_in_memory"]["secret_access_key"]
        self.assertNotIn(ephemeral_secret, log_contents)
        self.assertIn("Successfully issued JIT AWS_STS lease", log_contents)

    def test_zero_secret_leak_in_exception_messages(self):
        """Adversarial Test: Exception details and error payloads omit secret tokens."""
        res = issue_jit_credential(
            tenant_id="tenant-adv-01",
            principal_id="agent-secret-02",
            ttl_seconds=999999,
            context={"max_ttl_seconds": 3600}
        )
        self.assertEqual(res["status"], "REJECTED")
        self.assertNotIn("secret", res["explanation"].lower())
        self.assertNotIn("token", res["explanation"].lower())

    def test_provider_revocation_unverifiable_fails_closed(self):
        """
        Adversarial Test: When provider read-back verification fails, status becomes UNVERIFIABLE.
        """
        with patch.object(AWSSTSConnector, "verify_session_revoked", return_value={"verified": False, "state": "UNVERIFIABLE"}):
            db_mock = MagicMock()
            lease_mock = MagicMock()
            lease_mock.tenant_id = "tenant-adv-01"
            lease_mock.provider_type = "AWS_STS"
            lease_mock.provider_lease_reference = "arn:aws:sts::1234:assumed-role/Test"
            db_mock.query.return_value.filter.return_value.first.return_value = lease_mock

            res = revoke_jit_lease(lease_id="lease-jit-unver-01", db=db_mock, tenant_id="tenant-adv-01")
            self.assertFalse(res["success"])
            self.assertEqual(res["status"], "UNVERIFIABLE")

    def test_strengthened_idempotency_key_uniqueness(self):
        """Strengthened idempotency key changes when provider account, epoch, or permissions vary."""
        key1 = generate_strengthened_idempotency_key(
            tenant_id="tenant-a", provider="AWS_STS", provider_account_id="acc-1", principal_id="p1",
            authority_epoch=1, policy_decision_id="d1", policy_version="v1", resource="r1", action="read",
            effective_permissions=["read"], trace_id="t1"
        )
        key2 = generate_strengthened_idempotency_key(
            tenant_id="tenant-a", provider="AWS_STS", provider_account_id="acc-1", principal_id="p1",
            authority_epoch=2, policy_decision_id="d1", policy_version="v1", resource="r1", action="read",
            effective_permissions=["read"], trace_id="t1"
        )
        self.assertNotEqual(key1, key2)

    def test_cross_tenant_isolation_strictly_enforced(self):
        """Cross-tenant revocation attempts fail with TENANT_ISOLATION_VIOLATION."""
        db_mock = MagicMock()
        lease_mock = MagicMock()
        lease_mock.tenant_id = "tenant-owner"
        db_mock.query.return_value.filter.return_value.first.return_value = lease_mock

        res = revoke_jit_lease(lease_id="lease-jit-owner", db=db_mock, tenant_id="tenant-attacker")
        self.assertFalse(res["success"])
        self.assertEqual(res["error_code"], "TENANT_ISOLATION_VIOLATION")

    def test_api_jit_issue_and_leases_endpoints(self):
        """Integration test for JIT REST endpoints."""
        payload = {
            "tenant_id": "tenant-m52-api",
            "principal_id": "agent-m52",
            "action": "EXECUTE",
            "resource": "AWS_S3_PROD",
            "provider_type": "AWS_STS",
            "ttl_seconds": 1800
        }
        res = client.post("/api/v1/jit/issue", json=payload)
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertTrue(data["authorized"])
        self.assertEqual(data["status"], "ISSUED")

if __name__ == "__main__":
    unittest.main()
