import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database import SessionLocal
from app.models.outbox import OutboxEvent
from app.models.poison_message import PoisonMessage
from app.services.outbox_publisher import publish_pending_outbox_events
from app.services.inbox_consumer import claim_and_process_inbox_message

class TestOutboxInboxMessaging(unittest.TestCase):

    def setUp(self):
        self.db = SessionLocal()

    def tearDown(self):
        self.db.query(OutboxEvent).filter(OutboxEvent.aggregate_id == "test-agg-123").delete()
        self.db.commit()
        self.db.close()

    def test_outbox_v1_publishing_and_inbox_deduplication(self):
        # 1. Create Outbox event
        ev = OutboxEvent(
            tenant_id="tenant_a",
            aggregate_type="REVOCATION_JOB",
            aggregate_id="test-agg-123",
            event_type="JOB_CONFIRMED",
            payload_json='{"job_id": "job-101", "target": "user@test.com"}'
        )
        self.db.add(ev)
        self.db.commit()

        # 2. Publish outbox event
        pub_count = publish_pending_outbox_events(self.db, batch_size=5)
        self.assertGreaterEqual(pub_count, 1)

        # 3. Test Inbox Consumer deduplication
        msg_id = f"msg-{ev.id}"
        is_first_claim = claim_and_process_inbox_message(self.db, "tenant_a", msg_id)
        self.assertTrue(is_first_claim)

        is_duplicate_claim = claim_and_process_inbox_message(self.db, "tenant_a", msg_id)
        self.assertFalse(is_duplicate_claim)

if __name__ == "__main__":
    unittest.main()
