import os
import sys
import json
import unittest
from datetime import datetime

# Add app to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.database import SessionLocal, engine, Base
from app.models.identity import Identity
from app.models.cascade_revocation import RevocationEvent, CascadeAction, DelegationLink
from app.models.revocation import RevocationJob
from app.models.outbox import OutboxEvent
from app.models.inbox import InboxMessage
from app.models.delegation_policy import DelegationPolicy
from app.models.principal import Principal
from app.services.revocation_service import process_revocation_job, verify_post_revocation
from app.services.audit_chain import canonicalize_json, calculate_evidence_hash, append_tamper_evident_audit
from app.services.policy_engine import evaluate_policy_precedence, validate_privilege_containment
from app.services.runtime_auth import authorize_runtime_action
from app.services.jit_broker import issue_jit_credential

# Create all database tables
Base.metadata.create_all(bind=engine)

class TestNextIDEnterpriseArchitecture(unittest.TestCase):

    def setUp(self):
        self.db = SessionLocal()
        # Seed test principal
        self.test_identity = Identity(
            display_name="Darshan Enterprise Test",
            email="darshan.test@nextid.io",
            department="DevOps",
            status="Active",
            authority_epoch=1,
            is_frozen=False
        )
        self.db.add(self.test_identity)
        self.db.commit()
        self.db.refresh(self.test_identity)

    def tearDown(self):
        self.db.query(CascadeAction).delete()
        self.db.query(RevocationEvent).delete()
        self.db.query(DelegationLink).delete()
        self.db.query(RevocationJob).delete()
        self.db.query(OutboxEvent).delete()
        self.db.query(InboxMessage).delete()
        self.db.query(Identity).filter(Identity.id == self.test_identity.id).delete()
        self.db.commit()
        self.db.close()

    def test_01_rfc8785_canonical_json_and_sha256_hash(self):
        payload = {"b": 2, "a": 1, "authorization": "Bearer secret_token"}
        canonical_str = canonicalize_json({"a": 1, "b": 2})
        self.assertEqual(canonical_str, '{"a":1,"b":2}')
        
        evidence_hash = calculate_evidence_hash(payload)
        self.assertEqual(len(evidence_hash), 64)  # SHA-256 length

    def test_02_policy_engine_deterministic_precedence(self):
        policies = [
            {"name": "AllowAll", "allowed_permissions": ["read", "write"]},
            {"name": "DenyWrite", "denied_permissions": ["write"]}
        ]
        res = evaluate_policy_precedence(policies, "write")
        self.assertEqual(res["decision"], "DENY")
        self.assertEqual(res["reason_code"], "POLICY_DENY_MATCH")

    def test_03_privilege_containment_validator(self):
        res_valid = validate_privilege_containment(["repo:read", "repo:write"], ["repo:read"])
        self.assertTrue(res_valid["valid"])

        res_invalid = validate_privilege_containment(["repo:read"], ["repo:read", "admin:all"])
        self.assertFalse(res_invalid["valid"])
        self.assertIn("admin:all", res_invalid["violations"])

    def test_04_revocation_job_outbox_and_fencing_token(self):
        job = RevocationJob(
            target_type="GENERIC",
            target_identity="test-generic-user",
            target_entitlement="org:member",
            status="PENDING",
            created_by="Test Engine"
        )
        self.db.add(job)
        self.db.commit()
        self.db.refresh(job)

        processed_job = process_revocation_job(self.db, job, worker_fencing_token=None)
        self.assertEqual(processed_job.status, "CONFIRMED")
        self.assertIsNotNone(processed_job.fencing_token)
        self.assertIsNotNone(processed_job.verification_evidence)

        # Verify outbox event creation
        outbox_event = self.db.query(OutboxEvent).filter(OutboxEvent.aggregate_id == job.id).first()
        self.assertIsNotNone(outbox_event)
        self.assertEqual(outbox_event.event_type, "JOB_CONFIRMED")

    def test_05_runtime_auth_and_freeze_enforcement(self):
        # 1. Active identity -> Authorized
        res_auth = authorize_runtime_action(self.db, "default_tenant", self.test_identity.id, "read", "dataset-1")
        self.assertTrue(res_auth["authorized"])

        # 2. Freeze identity -> Denied
        self.test_identity.is_frozen = True
        self.db.commit()

        res_frozen = authorize_runtime_action(self.db, "default_tenant", self.test_identity.id, "read", "dataset-1")
        self.assertFalse(res_frozen["authorized"])
        self.assertEqual(res_frozen["decision"], "DENY")

    def test_06_jit_credential_broker(self):
        cred = issue_jit_credential("default_tenant", self.test_identity.id, "aws-s3-bucket", ttl_seconds=1800)
        self.assertEqual(cred["identity_id"], self.test_identity.id)
        self.assertTrue(cred["vault_uri"].startswith("vault://secret/data/jit/"))
        self.assertEqual(len(cred["credential_fingerprint"]), 64)

if __name__ == "__main__":
    unittest.main()
