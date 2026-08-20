import unittest
from datetime import datetime
from app.security.state_machine import StateMachineService, InvalidStateTransitionError
from app.security.invariants import SecurityInvariantsEngine, SecurityInvariantViolation
from app.models.revocation import RevocationJob
from app.models.cascade_revocation import RevocationEvent, DelegationLink
from app.models.jit_lease import JitLease
from app.models.identity import Identity

class TestSecurityInvariantsAndStateMachines(unittest.TestCase):

    def test_state_machine_revocation_job_transitions(self):
        job = RevocationJob(
            id="job-sm-1",
            tenant_id="tenant_sm",
            target_type="AWS_IAM",
            target_identity="arn:aws:iam::123:user/test",
            target_entitlement="AdministratorAccess",
            status="PENDING"
        )
        
        # Valid PENDING -> QUEUED
        StateMachineService.transition_revocation_job(job, "QUEUED")
        self.assertEqual(job.status, "QUEUED")

        # Valid QUEUED -> IN_PROGRESS
        StateMachineService.transition_revocation_job(job, "IN_PROGRESS")
        self.assertEqual(job.status, "IN_PROGRESS")

        # Valid IN_PROGRESS -> VERIFYING
        StateMachineService.transition_revocation_job(job, "VERIFYING")
        self.assertEqual(job.status, "VERIFYING")

        # Attempt VERIFYING -> CONFIRMED without evidence MUST raise InvalidStateTransitionError
        with self.assertRaises(InvalidStateTransitionError):
            StateMachineService.transition_revocation_job(job, "CONFIRMED")

        # Valid VERIFYING -> CONFIRMED with evidence
        res = StateMachineService.transition_revocation_job(job, "CONFIRMED", evidence="SHA-256:1234567890abcdef1234567890abcdef")
        self.assertEqual(job.status, "CONFIRMED")
        self.assertIsNotNone(job.confirmed_at)
        self.assertEqual(res["new_state"], "CONFIRMED")

        # Terminal state transition attempt MUST fail
        with self.assertRaises(InvalidStateTransitionError):
            StateMachineService.transition_revocation_job(job, "IN_PROGRESS")

    def test_state_machine_jit_lease_transitions(self):
        lease = JitLease(
            id="lease-sm-1",
            lease_id="lease-sm-1",
            tenant_id="tenant_sm",
            principal_id="user@test.com",
            provider_type="AWS_STS",
            resource="arn:aws:iam::123:role/Admin",
            expires_at=datetime.utcnow(),
            status="ACTIVE"
        )

        # ACTIVE -> REVOKING
        StateMachineService.transition_jit_lease(lease, "REVOKING")
        self.assertEqual(lease.status, "REVOKING")

        # REVOKING -> VERIFYING
        StateMachineService.transition_jit_lease(lease, "VERIFYING")
        self.assertEqual(lease.status, "VERIFYING")

        # VERIFYING -> REVOKED
        StateMachineService.transition_jit_lease(lease, "REVOKED")
        self.assertEqual(lease.status, "REVOKED")
        self.assertIsNotNone(lease.revoked_at)

    def test_inv_001_delegation_revoked_or_frozen(self):
        parent = Identity(id=1, employee_id="E1", display_name="Parent", status="Revoked", is_frozen=False)
        with self.assertRaises(SecurityInvariantViolation):
            SecurityInvariantsEngine.verify_inv_001_no_delegation_when_revoked_or_frozen(parent)

        parent_frozen = Identity(id=2, employee_id="E2", display_name="Parent2", status="Active", is_frozen=True)
        with self.assertRaises(SecurityInvariantViolation):
            SecurityInvariantsEngine.verify_inv_001_no_delegation_when_revoked_or_frozen(parent_frozen)

    def test_inv_002_privilege_containment(self):
        parent_perms = ["s3:GetObject", "s3:ListBucket"]
        valid_child = ["s3:GetObject"]
        invalid_child = ["s3:GetObject", "s3:DeleteBucket"]

        self.assertTrue(SecurityInvariantsEngine.verify_inv_002_privilege_containment(parent_perms, valid_child))
        with self.assertRaises(SecurityInvariantViolation):
            SecurityInvariantsEngine.verify_inv_002_privilege_containment(parent_perms, invalid_child)

    def test_inv_003_epoch_staleness(self):
        self.assertTrue(SecurityInvariantsEngine.verify_inv_003_epoch_staleness(credential_epoch=2, principal_current_epoch=2))
        with self.assertRaises(SecurityInvariantViolation):
            SecurityInvariantsEngine.verify_inv_003_epoch_staleness(credential_epoch=1, principal_current_epoch=2)

    def test_inv_004_confirmed_requires_evidence(self):
        self.assertTrue(SecurityInvariantsEngine.verify_inv_004_confirmed_requires_evidence("CONFIRMED", "Valid Evidence Payload String Hash 12345"))
        with self.assertRaises(SecurityInvariantViolation):
            SecurityInvariantsEngine.verify_inv_004_confirmed_requires_evidence("CONFIRMED", None)

    def test_inv_005_ttfr_requires_all_mandatory_confirmed(self):
        self.assertTrue(SecurityInvariantsEngine.verify_inv_005_ttfr_requires_all_mandatory_confirmed(5, 5, 120.5))
        with self.assertRaises(SecurityInvariantViolation):
            SecurityInvariantsEngine.verify_inv_005_ttfr_requires_all_mandatory_confirmed(5, 4, 120.5)

    def test_inv_007_fencing_token_monotonicity(self):
        self.assertTrue(SecurityInvariantsEngine.verify_inv_007_fencing_token_monotonicity(worker_token_seq=5, current_db_token_seq=5))
        with self.assertRaises(SecurityInvariantViolation):
            SecurityInvariantsEngine.verify_inv_007_fencing_token_monotonicity(worker_token_seq=4, current_db_token_seq=5)

    def test_inv_008_cross_tenant_trust_contract(self):
        contracts = [("tenant_a", "tenant_b")]
        self.assertTrue(SecurityInvariantsEngine.verify_inv_008_cross_tenant_trust_contract("tenant_a", "tenant_b", contracts))
        with self.assertRaises(SecurityInvariantViolation):
            SecurityInvariantsEngine.verify_inv_008_cross_tenant_trust_contract("tenant_a", "tenant_c", contracts)

    def test_inv_009_zero_raw_secret_persistence(self):
        safe_log = "User logged in with principal_id='user_123' at 2026-08-20T20:00:00Z."
        unsafe_log = "Issued credential with aws_secret_access_key = wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"
        
        self.assertTrue(SecurityInvariantsEngine.verify_inv_009_zero_raw_secret_persistence(safe_log))
        with self.assertRaises(SecurityInvariantViolation):
            SecurityInvariantsEngine.verify_inv_009_zero_raw_secret_persistence(unsafe_log)

    def test_inv_010_idempotent_event_delivery(self):
        keys = {"key-1", "key-2"}
        self.assertFalse(SecurityInvariantsEngine.verify_inv_010_idempotent_event_delivery(keys, "key-1"))
        self.assertTrue(SecurityInvariantsEngine.verify_inv_010_idempotent_event_delivery(keys, "key-3"))

if __name__ == "__main__":
    unittest.main()
