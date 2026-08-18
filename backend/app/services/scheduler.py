from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.interval import IntervalTrigger
from datetime import datetime, timedelta
import time as time_module
from typing import Optional

scheduler = BackgroundScheduler()

def run_scheduled_test(connector_id: int):
    """
    Runs a real scheduled Import for a connector on its configured schedule.
    Imported inside the function to avoid circular imports at module load time.
    """
    from app.database import SessionLocal
    from app.models.connector import Connector
    from app.routes.connectors import import_connector_data

    db = SessionLocal()
    try:
        connector = db.query(Connector).filter(
            Connector.id == connector_id,
            Connector.is_deleted == False,
            Connector.schedule_enabled == True
        ).first()
        if not connector:
            return

        table_name = None
        if connector.connector_type == "Database":
            table_name = connector.file_path

        # Reuses the exact same import logic as the manual "Import Now" button
        import_connector_data(
            id=connector_id,
            table_name=table_name,
            db=db,
            x_user_name="Scheduler",
            x_user_role="Platform Administrator"
        )

        # Update next_scheduled_run based on frequency and time
        connector.next_scheduled_run = calculate_next_run(connector.schedule_frequency, connector.schedule_time)
        db.commit()
    except Exception as e:
        print(f"Scheduled test run failed for connector {connector_id}: {e}")
    finally:
        db.close()


def calculate_next_run(frequency: str, schedule_time: Optional[str]) -> datetime:
    now = datetime.utcnow()
    if frequency == "Hourly":
        return now + timedelta(hours=1)
    
    hour, minute = 0, 0
    if schedule_time and ":" in schedule_time:
        try:
            parts = schedule_time.split(":")
            hour = int(parts[0])
            minute = int(parts[1])
        except Exception:
            pass

    if frequency == "Daily":
        target = now.replace(hour=hour, minute=minute, second=0, microsecond=0)
        if target <= now:
            target = target + timedelta(days=1)
        return target
        
    elif frequency == "Weekly":
        # Target is next Monday at hour:minute
        days_ahead = 0 - now.weekday()
        if days_ahead <= 0:
            days_ahead += 7
        target = now + timedelta(days=days_ahead)
        target = target.replace(hour=hour, minute=minute, second=0, microsecond=0)
        if target <= now:
            target = target + timedelta(days=7)
        return target
        
    return now + timedelta(days=1)


def register_connector_schedule(connector_id: int, frequency: str, schedule_time: Optional[str] = None):
    """
    (Re)registers a recurring job for a connector. Removes any existing job
    for this connector first, so updating a schedule doesn't create duplicates.
    """
    from apscheduler.triggers.cron import CronTrigger
    
    job_id = f"connector_test_{connector_id}"
    existing = scheduler.get_job(job_id)
    if existing:
        scheduler.remove_job(job_id)

    if frequency == "Hourly":
        trigger = IntervalTrigger(hours=1)
    elif frequency in ["Daily", "Weekly"] and schedule_time and ":" in schedule_time:
        try:
            parts = schedule_time.split(":")
            hour = int(parts[0])
            minute = int(parts[1])
            if frequency == "Daily":
                trigger = CronTrigger(hour=hour, minute=minute)
            else:
                trigger = CronTrigger(day_of_week='mon', hour=hour, minute=minute)
        except Exception:
            interval_map = {"Daily": {"days": 1}, "Weekly": {"weeks": 1}}
            trigger = IntervalTrigger(**interval_map[frequency])
    else:
        interval_map = {
            "Hourly": {"hours": 1},
            "Daily": {"days": 1},
            "Weekly": {"weeks": 1}
        }
        interval_kwargs = interval_map.get(frequency)
        if not interval_kwargs:
            return
        trigger = IntervalTrigger(**interval_kwargs)

    scheduler.add_job(
        run_scheduled_test,
        trigger=trigger,
        args=[connector_id],
        id=job_id,
        replace_existing=True
    )


def unregister_connector_schedule(connector_id: int):
    job_id = f"connector_test_{connector_id}"
    existing = scheduler.get_job(job_id)
    if existing:
        scheduler.remove_job(job_id)


def run_cascade_retry_job():
    """
    Scheduled job to retry failed cascade actions across all active revocation events.
    """
    from app.database import SessionLocal
    from app.services.revocation_retry import retry_failed_cascade_actions

    db = SessionLocal()
    try:
        result = retry_failed_cascade_actions(db)
        print(f"Scheduled cascade retry job completed: {result}")
    except Exception as e:
        print(f"Scheduled cascade retry job failed: {e}")
    finally:
        db.close()


def run_orphaned_authority_sweep():
    """
    Scheduled job for weekly orphaned-authority safety net sweep.
    """
    from app.database import SessionLocal
    from app.services.orphaned_authority_report import find_orphaned_delegations, notify_if_orphaned_found

    db = SessionLocal()
    try:
        orphaned_list = find_orphaned_delegations(db)
        notify_if_orphaned_found(db, orphaned_list)
        print(f"Scheduled orphaned authority sweep completed: {len(orphaned_list)} orphaned links found.")
    except Exception as e:
        print(f"Scheduled orphaned authority sweep failed: {e}")
    finally:
        db.close()


def start_scheduler():
    if not scheduler.running:
        scheduler.start()
        # Register SoD exceptions expiry checker
        from app.services.sod_exception_service import check_and_expire_exceptions
        from app.database import SessionLocal
        from app.config import CASCADE_RETRY_INTERVAL_MINUTES, ORPHANED_SWEEP_INTERVAL_DAYS
        
        def run_expiry_checker():
            db = SessionLocal()
            try:
                check_and_expire_exceptions(db)
            finally:
                db.close()
                
        scheduler.add_job(
            run_expiry_checker,
            'cron',
            hour=0,
            minute=0,
            id='sod_exceptions_expiry_job',
            replace_existing=True
        )

        scheduler.add_job(
            run_cascade_retry_job,
            IntervalTrigger(minutes=CASCADE_RETRY_INTERVAL_MINUTES),
            id="cascade_retry_job",
            replace_existing=True
        )

        scheduler.add_job(
            run_orphaned_authority_sweep,
            IntervalTrigger(days=ORPHANED_SWEEP_INTERVAL_DAYS),
            id="orphaned_authority_sweep_job",
            replace_existing=True
        )


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
                register_connector_schedule(connector.id, connector.schedule_frequency, connector.schedule_time)
    finally:
        db.close()