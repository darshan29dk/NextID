from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.interval import IntervalTrigger
from datetime import datetime, timedelta
import time as time_module

scheduler = BackgroundScheduler()

def run_scheduled_test(connector_id: int):
    """
    Runs a real Test Connection for a connector on its configured schedule.
    Imported inside the function to avoid circular imports at module load time.
    """
    from app.database import SessionLocal
    from app.models.connector import Connector
    from app.routes.connectors import test_connector

    db = SessionLocal()
    try:
        connector = db.query(Connector).filter(
            Connector.id == connector_id,
            Connector.is_deleted == False,
            Connector.schedule_enabled == True
        ).first()
        if not connector:
            return

        # Reuses the exact same tested logic as the manual "Test Connection" button
        test_connector(id=connector_id, db=db, x_user_name="Scheduler")

        # Update next_scheduled_run based on frequency
        now = datetime.utcnow()
        if connector.schedule_frequency == "Hourly":
            connector.next_scheduled_run = now + timedelta(hours=1)
        elif connector.schedule_frequency == "Daily":
            connector.next_scheduled_run = now + timedelta(days=1)
        elif connector.schedule_frequency == "Weekly":
            connector.next_scheduled_run = now + timedelta(weeks=1)
        db.commit()
    except Exception as e:
        print(f"Scheduled test run failed for connector {connector_id}: {e}")
    finally:
        db.close()


def register_connector_schedule(connector_id: int, frequency: str):
    """
    (Re)registers a recurring job for a connector. Removes any existing job
    for this connector first, so updating a schedule doesn't create duplicates.
    """
    job_id = f"connector_test_{connector_id}"
    existing = scheduler.get_job(job_id)
    if existing:
        scheduler.remove_job(job_id)

    interval_map = {
        "Hourly": {"hours": 1},
        "Daily": {"days": 1},
        "Weekly": {"weeks": 1}
    }
    interval_kwargs = interval_map.get(frequency)
    if not interval_kwargs:
        return

    scheduler.add_job(
        run_scheduled_test,
        trigger=IntervalTrigger(**interval_kwargs),
        args=[connector_id],
        id=job_id,
        replace_existing=True
    )


def unregister_connector_schedule(connector_id: int):
    job_id = f"connector_test_{connector_id}"
    existing = scheduler.get_job(job_id)
    if existing:
        scheduler.remove_job(job_id)


def start_scheduler():
    if not scheduler.running:
        scheduler.start()


def restore_active_schedules():
    """
    Called once at app startup — re-registers jobs for any connector that
    already had scheduling enabled before the server restarted (since
    APScheduler's in-memory jobs don't survive a restart on their own).
    """
    from app.database import SessionLocal
    from app.models.connector import Connector

    db = SessionLocal()
    try:
        active = db.query(Connector).filter(
            Connector.schedule_enabled == True,
            Connector.is_deleted == False
        ).all()
        for connector in active:
            if connector.schedule_frequency:
                register_connector_schedule(connector.id, connector.schedule_frequency)
    finally:
        db.close()