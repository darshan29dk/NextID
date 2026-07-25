"""
Read-only diagnostic: why does Scan History show violations_found > 0 on
some past scans while the live Violations page (Governance > Violations,
sod_dashboard_service.get_governance_kpis -> total_violations) shows 0?

Hypothesis being checked: Scan History's violations_found is a point-in-time
snapshot (how many violations that specific scan detected when it ran),
while the Violations page queries the live sod_violations table right now.
If the violations counted by an old scan belonged to a policy (e.g. the
stale "SOD-001") that was later deleted, the live table would correctly now
show 0 while the old scan's historical count stays whatever it was - that's
expected audit-trail behavior, not a bug. This script checks the actual
data to confirm or refute that, instead of guessing.

Makes no changes - purely reads and prints. Run from the backend/ directory:
    python check_violations_history.py
"""
import app.main  # noqa: F401 - populate full SQLAlchemy registry first

from app.database import SessionLocal
from app.models.sod_violation import SodScanHistory, SodViolation
from app.models.audit_log import AuditLog

db = SessionLocal()
try:
    print("=" * 70)
    print("1. Scan History rows that recorded violations_found > 0")
    print("=" * 70)
    scans_with_violations = db.query(SodScanHistory).filter(
        SodScanHistory.violations_found > 0
    ).order_by(SodScanHistory.start_time.asc()).all()

    if not scans_with_violations:
        print("None. No scan in history ever recorded a nonzero violations_found.")
    else:
        for s in scans_with_violations:
            print(
                f"  Scan #{s.id} '{s.scan_name}' ({s.scan_type}, {s.status}) "
                f"started_by={s.started_by} start={s.start_time} end={s.end_time} "
                f"violations_found={s.violations_found}"
            )

    print()
    print("=" * 70)
    print("2. Live sod_violations table right now")
    print("=" * 70)
    total_live = db.query(SodViolation).count()
    print(f"  Total rows in sod_violations: {total_live}")
    if total_live > 0:
        by_status = {}
        for (status,) in db.query(SodViolation.status).all():
            by_status[status] = by_status.get(status, 0) + 1
        for status, count in by_status.items():
            print(f"    {status}: {count}")

    print()
    print("=" * 70)
    print("3. Policy deletions in the audit log (checking for SOD-001 specifically)")
    print("=" * 70)
    policy_deletions = db.query(AuditLog).filter(
        AuditLog.module.in_(["SoD Policy", "Governance", "SoD Governance"]),
        AuditLog.action.ilike("%delet%")
    ).order_by(AuditLog.timestamp.asc()).all()

    if not policy_deletions:
        print("  No matching 'delete' audit log rows found under SoD Policy/Governance modules.")
        print("  (If SOD-001's deletion predates this system's audit logging for that action,")
        print("  it may not show up here - the timing comparison in section 4 is still useful.)")
    else:
        for a in policy_deletions:
            print(f"  [{a.timestamp}] {a.module} / {a.action} by {a.performed_by}")
            if a.old_value:
                print(f"    old_value: {a.old_value[:200]}")

    print()
    print("=" * 70)
    print("4. Interpretation")
    print("=" * 70)
    if scans_with_violations and total_live == 0:
        latest_violating_scan = scans_with_violations[-1]
        print(
            f"  The most recent scan that found violations was #{latest_violating_scan.id} "
            f"({latest_violating_scan.start_time}), which recorded "
            f"{latest_violating_scan.violations_found} violation(s)."
        )
        print(
            "  The live table is empty now, so those violation rows were deleted at some "
            "point after that scan ran - most likely via the SOD-001 policy delete-cascade "
            "fix from earlier tonight. Scan History intentionally keeps its historical count "
            "as a record of what was true when the scan ran; it is not expected to change "
            "retroactively just because the underlying violations were later cleaned up."
        )
    elif total_live > 0:
        print(f"  There are still {total_live} live violation(s) - the KPI card showing 0 would be unexpected; investigate the dashboard query/filters directly.")
    else:
        print("  No scan ever recorded violations, and none exist live - both numbers are consistently 0, no mismatch.")
finally:
    db.close()
