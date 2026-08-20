import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database import SessionLocal
from app.services.reconciliation import reconcile_provider_drift
from app.services.observability import ObservabilityService

class TestReconciliationAndObservability(unittest.TestCase):

    def setUp(self):
        self.db = SessionLocal()

    def tearDown(self):
        self.db.close()

    def test_reconciliation_scan_and_alert_deduplication(self):
        # 1. Reconciliation Scan
        recon = reconcile_provider_drift(self.db, "default_tenant")
        self.assertTrue(recon["desired_state_version"].startswith("v3.0") or recon["desired_state_version"].startswith("v2.0"))

        # 2. Alert Deduplication
        failures = [
            {"target": "user-1", "error": "403 Forbidden"},
            {"target": "user-2", "error": "500 Internal Error"}
        ]
        alert = ObservabilityService.deduplicate_alert_notifications("default_tenant", event_id=99, failures=failures)
        self.assertTrue(alert["deduplicated"])
        self.assertEqual(alert["total_failures"], 2)

if __name__ == "__main__":
    unittest.main()
