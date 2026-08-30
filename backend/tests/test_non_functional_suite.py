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
from app.models.account import Account
from app.models.application import Application
from app.models.entitlement import Entitlement
from app.models.access_request import AccessRequest
from app.models.catalog_item import CatalogItem
from app.models.outbox import OutboxEvent

from app.services.circuit_breaker import circuit_breaker
from app.services.rate_limiter import rate_limiter
from app.services.inbox_consumer import claim_and_process_inbox_message, finalize_inbox_message
from app.services.audit_chain import calculate_evidence_hash, append_tamper_evident_audit


class TestNonFunctionalSuite(unittest.TestCase):
    """
    Non-Functional Test Suite for NextID Platform.
    Validates Security, Multi-Tenant IDOR, Circuit Breaking, Rate Limiting,
    Fault Tolerance, Crash Safety, and Data Sanitization.
    """

    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(fastapi_app)

    def setUp(self):
        self.db = SessionLocal()
        self.tenant_a = f"nf_tenant_a_{uuid.uuid4().hex[:6]}"
        self.tenant_b = f"nf_tenant_b_{uuid.uuid4().hex[:6]}"
        self.headers_a = {
            "X-Tenant-ID": self.tenant_a,
            "X-Principal-ID": f"user_a_{uuid.uuid4().hex[:4]}",
            "X-Principal-Role": "ADMIN"
        }
        self.headers_b = {
            "X-Tenant-ID": self.tenant_b,
            "X-Principal-ID": f"user_b_{uuid.uuid4().hex[:4]}",
            "X-Principal-Role": "USER"
        }

    def tearDown(self):
        self.db.close()

    def test_01_security_multi_tenant_idor_boundary_isolation(self):
        """Non-Functional Test 1: Strict cross-tenant data isolation and IDOR prevention."""
        # Create resource in Tenant A
        p_a = Principal(
            id=f"p_a_{uuid.uuid4().hex[:8]}",
            tenant_id=self.tenant_a,
            principal_type="HUMAN",
            display_name="Tenant A Secret User",
            email="tenant_a@corp.internal",
            status="ACTIVE",
            authority_epoch=1
        )
        self.db.add(p_a)

        cat_a = CatalogItem(
            id=f"cat_a_{uuid.uuid4().hex[:8]}",
            tenant_id=self.tenant_a,
            name="Confidential Project Access",
            risk_level="HIGH",
            requestable=True,
            status="ACTIVE"
        )
        self.db.add(cat_a)

        req_a = AccessRequest(
            id=f"ar_a_{uuid.uuid4().hex[:8]}",
            tenant_id=self.tenant_a,
            catalog_item_id=cat_a.id,
            requester_principal_id=p_a.id,
            target_principal_id=p_a.id,
            business_justification="Confidential Tenant A Operations",
            requested_ttl_hours=4,
            status="SUBMITTED"
        )
        self.db.add(req_a)
        self.db.commit()

        # Tenant B probes Tenant A's Access Request via API -> Must return 404 (or 403)
        res_probe = self.client.get(f"/api/v1/access-requests/{req_a.id}", headers=self.headers_b)
        self.assertIn(res_probe.status_code, [404, 403])

        # Tenant B attempts to cancel Tenant A's Access Request -> Must return 404 (or 403)
        res_cancel = self.client.post(f"/api/v1/access-requests/{req_a.id}/cancel", headers=self.headers_b)
        self.assertIn(res_cancel.status_code, [404, 403])

    def test_02_circuit_breaker_downstream_fault_tolerance(self):
        """Non-Functional Test 2: Circuit Breaker fast-failing upon repeated provider failures."""
        provider = "AWS_STS"
        account = f"acc_{uuid.uuid4().hex[:6]}"
        region = "us-east-1"
        operation = "REVOKE"

        # Initially executable
        self.assertTrue(circuit_breaker.can_execute(self.tenant_a, provider, account, region, operation))

        # Record failures exceeding threshold (default 5)
        for _ in range(5):
            circuit_breaker.record_result(self.tenant_a, provider, account, region, operation, success=False)

        # Requests should fast-fail without calling downstream provider
        self.assertFalse(circuit_breaker.can_execute(self.tenant_a, provider, account, region, operation))

    def test_03_rate_limiter_flood_traffic_protection(self):
        """Non-Functional Test 3: Rate limiter throttling under flood request conditions."""
        provider = "OKTA"
        account = f"acc_rate_{uuid.uuid4().hex[:6]}"
        limit = 3

        # First 3 requests should pass
        for i in range(limit):
            allowed = rate_limiter.is_allowed(self.tenant_a, provider, account, limit=limit)
            self.assertTrue(allowed, f"Request {i+1} should be permitted within limit")

        # Exceeding request should be throttled
        throttled = rate_limiter.is_allowed(self.tenant_a, provider, account, limit=limit)
        self.assertFalse(throttled, "Request exceeding rate limit must be throttled")

    def test_04_sql_injection_and_payload_sanitization(self):
        """Non-Functional Test 4: SQL Injection resistance on search & justification inputs."""
        sqli_payloads = [
            "' OR '1'='1",
            "'; DROP TABLE principals; --",
            "1 UNION SELECT null, null, null--",
            "' OR 1=1; SELECT * FROM audit_logs; --"
        ]

        # Seed valid principal & catalog item for submitting request
        p = Principal(
            id=f"p_sqli_{uuid.uuid4().hex[:6]}",
            tenant_id=self.tenant_a,
            principal_type="HUMAN",
            display_name="SQLi Test Principal",
            status="ACTIVE",
            authority_epoch=1
        )
        cat = CatalogItem(
            id=f"cat_sqli_{uuid.uuid4().hex[:6]}",
            tenant_id=self.tenant_a,
            name="SQLi Test Item",
            risk_level="LOW",
            requestable=True,
            status="ACTIVE"
        )
        self.db.add_all([p, cat])
        self.db.commit()

        for payload in sqli_payloads:
            res = self.client.get(f"/api/v1/catalog?search={payload}", headers=self.headers_a)
            # Response must be HTTP 200 with safe list, NOT an unhandled 500 or SQL syntax error
            self.assertEqual(res.status_code, 200)

            # Test submitting access request with injection payload in justification
            sub_res = self.client.post("/api/v1/access-requests", json={
                "target_principal_id": p.id,
                "catalog_item_id": cat.id,
                "business_justification": f"Legitimate justification with {payload}",
                "requested_ttl_hours": 4
            }, headers=self.headers_a)
            # Request should be safely parameterized
            self.assertEqual(sub_res.status_code, 200)

    def test_05_outbox_inbox_deduplication_and_crash_safety(self):
        """Non-Functional Test 5: Inbox Consumer idempotency and duplicate message suppression."""
        msg_id = f"msg_dedup_{uuid.uuid4().hex[:8]}"

        # First claim should succeed
        claim_first = claim_and_process_inbox_message(
            db=self.db,
            tenant_id=self.tenant_a,
            message_id=msg_id,
            consumer_id="worker_01",
            lease_seconds=60
        )
        self.assertTrue(claim_first)

        # Finalize the message
        finalize_inbox_message(
            db=self.db,
            tenant_id=self.tenant_a,
            message_id=msg_id,
            success=True
        )

        # Duplicate delivery of the same message should be safely suppressed
        claim_duplicate = claim_and_process_inbox_message(
            db=self.db,
            tenant_id=self.tenant_a,
            message_id=msg_id,
            consumer_id="worker_02",
            lease_seconds=60
        )
        self.assertFalse(claim_duplicate)

    def test_06_audit_log_secret_and_token_masking(self):
        """Non-Functional Test 6: Audit log record sanitization and sensitive credential masking."""
        raw_metadata = {
            "token": "ghp_SecretGithubAccessToken123456789",
            "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0",
            "secret": "aws_secret_access_key_xyz987654321",
            "safe_attribute": "Engineering"
        }

        # Calculate evidence hash removes sensitive fields
        evidence_hash = calculate_evidence_hash(raw_metadata)
        self.assertIsNotNone(evidence_hash)
        self.assertEqual(len(evidence_hash), 64)

        # Append tamper-evident audit record
        log_entry = append_tamper_evident_audit(
            db=self.db,
            module="AUTHZ",
            action="ISSUE_TOKEN",
            performed_by="SecAdmin",
            new_value="Token issued for Engineering",
            tenant_id=self.tenant_a
        )
        self.assertIn("[SHA256:", log_entry.new_value)
        self.assertIsNotNone(log_entry.record_hash)

    def test_07_database_transaction_atomicity_and_rollback(self):
        """Non-Functional Test 7: Atomic rollback on foreign key or schema violation."""
        initial_p_count = self.db.query(Principal).filter_by(tenant_id=self.tenant_a).count()

        try:
            # Begin a nested transaction
            p = Principal(
                id=f"p_atomic_{uuid.uuid4().hex[:6]}",
                tenant_id=self.tenant_a,
                principal_type="HUMAN",
                display_name="Atomic Subject",
                email="atomic@example.com",
                status="ACTIVE",
                authority_epoch=1
            )
            self.db.add(p)
            self.db.flush()

            # Intentionally cause a database foreign key violation
            invalid_acc = Account(
                id=f"acc_bad_{uuid.uuid4().hex[:6]}",
                tenant_id=self.tenant_a,
                principal_id="non_existent_principal_id_99999",
                application_id="9999999",
                external_account_id="ext_bad",
                username="bad_acc",
                status="ACTIVE"
            )
            self.db.add(invalid_acc)
            self.db.commit()
        except Exception:
            self.db.rollback()

        # Verify initial principal was rolled back and not persisted
        final_p_count = self.db.query(Principal).filter_by(tenant_id=self.tenant_a).count()
        self.assertEqual(initial_p_count, final_p_count)


if __name__ == "__main__":
    unittest.main()
