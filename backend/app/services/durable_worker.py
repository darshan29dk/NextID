import time
import logging
import threading
from datetime import datetime
from sqlalchemy.orm import Session
from app.database import SessionLocal
from app.services.outbox_publisher import publish_pending_outbox_events
from app.services.inbox_consumer import claim_and_process_inbox_message, finalize_inbox_message
from app.models.revocation import RevocationJob
from app.services.revocation_service import process_revocation_job

logger = logging.getLogger(__name__)

class DurableWorkerDaemon:
    """
    Durable Worker Daemon:
    Orchestrates outbox event publishing, worker pool polling, lease heartbeat renewal,
    and consumer inbox message deduplication for production NextID engines.
    """

    def __init__(self, worker_id: str = "worker-node-1", poll_interval_sec: float = 2.0):
        self.worker_id = worker_id
        self.poll_interval_sec = poll_interval_sec
        self._running = False
        self._thread = None

    def start(self):
        """Starts the background worker daemon loop."""
        if self._running:
            return
        self._running = True
        self._thread = threading.Thread(target=self._run_loop, daemon=True, name=f"DurableWorker-{self.worker_id}")
        self._thread.start()
        logger.info(f"[DURABLE WORKER] Started daemon thread '{self._thread.name}'.")

    def stop(self):
        """Stops the worker daemon loop gracefully."""
        self._running = False
        if self._thread and self._thread.is_alive():
            self._thread.join(timeout=5.0)
        logger.info(f"[DURABLE WORKER] Worker '{self.worker_id}' stopped gracefully.")

    def _run_loop(self):
        while self._running:
            try:
                db: Session = SessionLocal()
                try:
                    # 1. Publish Pending Outbox Events
                    published = publish_pending_outbox_events(db, publisher_id=self.worker_id, batch_size=10)

                    # 2. Poll and Process Pending Revocation Jobs
                    pending_jobs = db.query(RevocationJob).filter(
                        RevocationJob.status.in_(["PENDING", "FAILED"])
                    ).limit(5).all()

                    for job in pending_jobs:
                        msg_id = f"job-{job.id}-{job.retry_count}"
                        if claim_and_process_inbox_message(db, getattr(job, "tenant_id", "default_tenant"), msg_id, consumer_id=self.worker_id):
                            try:
                                process_revocation_job(db, job, worker_fencing_token=job.fencing_token)
                                finalize_inbox_message(db, getattr(job, "tenant_id", "default_tenant"), msg_id, success=True)
                            except Exception as job_err:
                                logger.error(f"[DURABLE WORKER] Exception processing job {job.id}: {job_err}")
                                finalize_inbox_message(db, getattr(job, "tenant_id", "default_tenant"), msg_id, success=False)
                finally:
                    db.close()
            except Exception as loop_err:
                logger.error(f"[DURABLE WORKER] Daemon loop exception: {loop_err}")
            
            time.sleep(self.poll_interval_sec)

# Singleton worker daemon instance
durable_worker = DurableWorkerDaemon()
