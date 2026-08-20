import os
import sys
import unittest
from unittest.mock import patch, MagicMock

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database import SessionLocal
from app.models.revocation import RevocationJob
from app.models.inbox import InboxMessage
from app.models.outbox import OutboxEvent
from app.connectors.base import VerificationResult, VerificationState, ExecutionResult
from app.connectors.github import GitHubConnector
from app.connectors.registry import ConnectorRegistry
from app.services.revocation_service import process_revocation_job
from app.services.inbox_consumer import claim_and_process_inbox_message, finalize_inbox_message
from app.services.rate_limiter import rate_limiter
from app.services.circuit_breaker import circuit_breaker

class TestM2ReliabilityAndCrashSafety(unittest.TestCase):

    def setUp(self):
        os.environ["TEST_MOCK_MODE"] = "1"
        self.db = SessionLocal()
        self.tenant_id = "test_m2_tenant"

        # Cleanup test tenant rows
        self.db.query(RevocationJob).filter(RevocationJob.tenant_id == self.tenant_id).delete()
        self.db.query(InboxMessage).filter(InboxMessage.tenant_id == self.tenant_id).delete()
        self.db.query(OutboxEvent).filter(OutboxEvent.tenant_id == self.tenant_id).delete()
        self.db.commit()

    def tearDown(self):
        self.db.query(RevocationJob).filter(RevocationJob.tenant_id == self.tenant_id).delete()
        self.db.query(InboxMessage).filter(InboxMessage.tenant_id == self.tenant_id).delete()
        self.db.query(OutboxEvent).filter(OutboxEvent.tenant_id == self.tenant_id).delete()
        self.db.commit()
        self.db.close()

    # --- 1. CRASH-AFTER-SUCCESS RECOVERY TEST ---
    def test_crash_after_success_recovery(self):
        """
        Simulates: Provider revocation succeeded, but worker crashed right before DB update.
        Redelivered job runs pre-execution read-check, detects access is ALREADY REVOKED,
        and marks CONFIRMED without executing duplicate provider API calls.
        """
        job = RevocationJob(
            tenant_id=self.tenant_id,
            target_type="GITHUB",
            target_identity="crash-user-01",
            target_entitlement="NextID-Org",
            target_class="MANDATORY",
            status="PENDING"
        )
        self.db.add(job)
        self.db.commit()
        self.db.refresh(job)

        connector = ConnectorRegistry.get_connector("GITHUB")

        # Mock connector.verify to return VERIFIED_REVOKED on pre-check readcheck
        with patch.object(connector, "verify") as mock_verify, patch.object(connector, "execute") as mock_execute:
            mock_verify.return_value = VerificationResult(
                state=VerificationState.VERIFIED_REVOKED,
                verified=True,
                observed_state="REVOKED",
                provider_request_id="req-crash-check",
                retryable=False,
                evidence={"pre_check": True}
            )

            processed = process_revocation_job(self.db, job)

            # Assert process_revocation_job detected crash-after-success and marked CONFIRMED
            self.assertEqual(processed.status, "CONFIRMED")
            self.assertIn("Pre-execution check verified target already revoked", processed.error_log)
            
            # Assert execute was NEVER called (avoiding duplicate provider API execution)
            mock_execute.assert_not_called()
            mock_verify.assert_called_once()

    # --- 2. DUPLICATE INBOX DELIVERY REJECTION TEST ---
    def test_duplicate_inbox_delivery_rejection(self):
        """
        Tests consumer inbox message deduplication & crash recovery lease handling.
        """
        msg_id = "msg-m2-dedup-01"

        # Worker 1 claims active lease -> Succeeds
        claimed_1 = claim_and_process_inbox_message(self.db, self.tenant_id, msg_id, consumer_id="worker-1", lease_seconds=60)
        self.assertTrue(claimed_1)

        # Worker 2 attempts to claim same active message -> Rejected
        claimed_2 = claim_and_process_inbox_message(self.db, self.tenant_id, msg_id, consumer_id="worker-2", lease_seconds=60)
        self.assertFalse(claimed_2)

        # Finalize message processing
        finalize_inbox_message(self.db, self.tenant_id, msg_id, success=True)

        # Worker 3 attempts to claim already PROCESSED message -> Rejected
        claimed_3 = claim_and_process_inbox_message(self.db, self.tenant_id, msg_id, consumer_id="worker-3", lease_seconds=60)
        self.assertFalse(claimed_3)

    # --- 3. STALE FENCING TOKEN REJECTION TEST ---
    def test_stale_fencing_token_rejection(self):
        """
        Verifies that stale fencing tokens raise exceptions and block database write mutations.
        """
        job = RevocationJob(
            tenant_id=self.tenant_id,
            target_type="GENERIC",
            target_identity="fence-user-99",
            target_entitlement="ent-99",
            fencing_token="fence-token-active",
            status="PENDING"
        )
        self.db.add(job)
        self.db.commit()
        self.db.refresh(job)

        with self.assertRaises(Exception) as ctx:
            process_revocation_job(self.db, job, worker_fencing_token="fence-token-stale")

        self.assertIn("Fencing token mismatch", str(ctx.exception))

    # --- 4. RATE LIMITER & CIRCUIT BREAKER TEST ---
    def test_rate_limiter_and_circuit_breaker(self):
        """
        Verifies token bucket rate limiting caps and circuit breaker OPEN transitions under load.
        """
        # Test rate limiter cap (limit=2)
        allowed_1 = rate_limiter.is_allowed(self.tenant_id, "AWS", "acc-1", "us-east-1", "REVOKE", limit=2)
        allowed_2 = rate_limiter.is_allowed(self.tenant_id, "AWS", "acc-1", "us-east-1", "REVOKE", limit=2)
        allowed_3 = rate_limiter.is_allowed(self.tenant_id, "AWS", "acc-1", "us-east-1", "REVOKE", limit=2)

        self.assertTrue(allowed_1)
        self.assertTrue(allowed_2)
        self.assertFalse(allowed_3)  # Throttled!

        # Test Circuit Breaker failure threshold
        cb_key_args = (self.tenant_id, "GITHUB", "acc-2", "us-east-1", "REVOKE")
        self.assertTrue(circuit_breaker.can_execute(*cb_key_args))

        # Record 5 consecutive failures to trigger OPEN state
        for _ in range(5):
            circuit_breaker.record_result(*cb_key_args, success=False)

        # Circuit should now be OPEN and fast-fail execution
        self.assertFalse(circuit_breaker.can_execute(*cb_key_args))

if __name__ == "__main__":
    unittest.main()
