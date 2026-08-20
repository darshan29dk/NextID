import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database import SessionLocal
from app.models.revocation import RevocationJob
from app.services.revocation_service import process_revocation_job

class TestWorkerFencingAndLease(unittest.TestCase):

    def setUp(self):
        os.environ["TEST_MOCK_MODE"] = "1"
        self.db = SessionLocal()

    def tearDown(self):
        self.db.query(RevocationJob).filter(RevocationJob.target_identity == "fence-test-user").delete()
        self.db.commit()
        self.db.close()

    def test_worker_fencing_token_validation(self):
        job = RevocationJob(
            tenant_id="tenant_b",
            target_type="GENERIC",
            target_identity="fence-test-user",
            target_entitlement="entitlement-1",
            fencing_token="fence-token-valid",
            status="PENDING"
        )
        self.db.add(job)
        self.db.commit()
        self.db.refresh(job)

        # 1. Processing with matching fencing token succeeds
        processed = process_revocation_job(self.db, job, worker_fencing_token="fence-token-valid")
        self.assertEqual(processed.status, "CONFIRMED")

        # 2. Processing with mismatched fencing token raises error
        job.status = "PENDING"
        job.fencing_token = "fence-token-new"
        self.db.commit()

        with self.assertRaises(Exception):
            process_revocation_job(self.db, job, worker_fencing_token="fence-token-stale")

if __name__ == "__main__":
    unittest.main()
