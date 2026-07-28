"""
Diagnoses "Lock wait timeout exceeded" errors on mining_campaigns /
candidate_role_entitlements: finds any MySQL connection sitting on an
uncommitted transaction (likely a dangling connection from a previous
backend process that was killed abruptly, e.g. by --reload restarting
mid-request) and holding row locks other requests are now blocked on.

Read-only by default - only PRINTS what it finds. Run from backend/:
    python check_db_locks.py

If it finds a stale/idle transaction blocking things, it will also print
the exact KILL command to run yourself in a MySQL client (it will NOT run
it automatically - killing a connection should be a deliberate, informed
choice, not something a script does silently).
"""
import app.main  # noqa: F401
from sqlalchemy import text
from app.database import engine

with engine.connect() as conn:
    print("=" * 70)
    print("1. Current InnoDB transactions (look for old 'started' times)")
    print("=" * 70)
    try:
        rows = conn.execute(text("""
            SELECT trx_id, trx_state, trx_started, trx_mysql_thread_id,
                   trx_query, trx_rows_locked, trx_rows_modified
            FROM information_schema.innodb_trx
            ORDER BY trx_started ASC
        """)).fetchall()
        if not rows:
            print("  No active InnoDB transactions right now.")
        for r in rows:
            print(f"  trx_id={r.trx_id} thread_id={r.trx_mysql_thread_id} state={r.trx_state} "
                  f"started={r.trx_started} rows_locked={r.trx_rows_locked} "
                  f"rows_modified={r.trx_rows_modified} query={r.trx_query!r}")
    except Exception as e:
        print(f"  Could not read innodb_trx (may need PROCESS privilege): {e}")

    print()
    print("=" * 70)
    print("2. Full process list (look for 'Sleep' with a huge Time = idle-in-transaction)")
    print("=" * 70)
    try:
        rows = conn.execute(text("SHOW FULL PROCESSLIST")).fetchall()
        for r in rows:
            d = r._mapping
            print(f"  Id={d.get('Id')} User={d.get('User')} Host={d.get('Host')} db={d.get('db')} "
                  f"Command={d.get('Command')} Time={d.get('Time')}s State={d.get('State')} Info={d.get('Info')}")
    except Exception as e:
        print(f"  Could not run SHOW FULL PROCESSLIST: {e}")

    print()
    print("=" * 70)
    print("3. Interpretation")
    print("=" * 70)
    print("  Look for a connection with Command=Sleep and a large Time (many minutes)")
    print("  that also shows up in innodb_trx above with rows_locked > 0 - that's the")
    print("  dangling transaction holding the locks. To clear it, run in a MySQL client:")
    print("    KILL <Id>;")
    print("  using the Id from the process list (not the trx_id). This only ends that")
    print("  one stuck connection/transaction - it does not touch any committed data.")
