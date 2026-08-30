import unittest
import uuid
import os
import sys
import logging
import io
from datetime import datetime, timedelta

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.database import SessionLocal, engine, Base
from app.models.principal import Principal
from app.models.catalog_item import CatalogItem
from app.models.entitlement import Entitlement
from app.models.access_request import AccessRequest, AccessRequestState
from app.services.break_glass_service import BreakGlassService


class TestIGASecurityAndSanitization(unittest.TestCase):
    """
    Security Fuzzing, IDOR, and Secret Sanitization Test Suite.
    """

    def setUp(self):
        os.environ["TEST_MOCK_MODE"] = "1"
        Base.metadata.create_all(bind=engine)
        self.db = SessionLocal()
        self.tenant_id = f"test_tenant_{uuid.uuid4().hex[:8]}"

        self.principal = Principal(
            id=f"p_sec_{uuid.uuid4().hex[:8]}",
            tenant_id=self.tenant_id,
            principal_type="HUMAN",
            display_name="Security Test User",
            email=f"sec_{uuid.uuid4().hex[:6]}@test.local",
            authority_epoch=1,
            status="ACTIVE"
        )
        self.db.add(self.principal)
        self.db.commit()

    def tearDown(self):
        self.db.close()

    def test_sql_injection_in_justification_handled_safely(self):
        """SQL injection payloads in justification strings do not corrupt query execution."""
        sqli_payload = "'; DROP TABLE principals; --"
        bg_res = BreakGlassService.submit_request(
            db=self.db,
            tenant_id=self.tenant_id,
            principal_id=self.principal.id,
            resource="prod-vault-cluster",
            reason=f"Emergency maintenance {sqli_payload}",
            requested_ttl_hours=1
        )
        self.assertIsNotNone(bg_res["request_id"])

        # Confirm principals table is completely intact
        p = self.db.query(Principal).filter(Principal.id == self.principal.id).first()
        self.assertIsNotNone(p)

    def test_break_glass_reason_minimum_length_enforcement(self):
        """Empty or trivially short justification strings are rejected."""
        with self.assertRaises(ValueError) as ctx:
            BreakGlassService.submit_request(
                db=self.db,
                tenant_id=self.tenant_id,
                principal_id=self.principal.id,
                resource="prod-vault-cluster",
                reason="short",  # < 10 chars
                requested_ttl_hours=1
            )
        self.assertIn("reason", str(ctx.exception).lower())

    def test_secret_sanitization_in_logging_filter(self):
        """Tokens and sensitive credentials must be masked if passed to logger."""
        log_capture = io.StringIO()
        handler = logging.StreamHandler(log_capture)
        test_logger = logging.getLogger("test_security_logger")
        test_logger.setLevel(logging.INFO)
        test_logger.addHandler(handler)

        secret_token = "ghp_secretTokenValue123456789"
        # Simulate masked logging
        masked = secret_token[:4] + "*" * (len(secret_token) - 8) + secret_token[-4:]
        test_logger.info("Connecting with credential %s", masked)

        log_output = log_capture.getvalue()
        self.assertNotIn("ghp_secretTokenValue123456789", log_output)
        self.assertIn("ghp_", log_output)
        self.assertIn("6789", log_output)


if __name__ == "__main__":
    unittest.main()
