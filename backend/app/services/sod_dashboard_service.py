from datetime import datetime, timedelta
from sqlalchemy.orm import Session
from sqlalchemy import func, or_, and_
import time

from app.models.sod_policy import SodPolicy
from app.models.sod_violation import SodViolation
from app.models.sod_exception import SodException, SodExceptionApproval
from app.models.identity import Identity

# 60-Second memory cache storage
_dashboard_cache = {}
_last_cached_time = 0

def get_governance_kpis(db: Session, filters: dict = None) -> dict:
    """Calculates all compliance counters and trend metrics."""
    now = datetime.utcnow()
    p1_start = now - timedelta(days=30)
    p2_start = now - timedelta(days=60)
    
    # ── Policies ──
    pol_q = db.query(SodPolicy)
    if filters and filters.get("risk_level"):
        pol_q = pol_q.filter(SodPolicy.risk_level == filters["risk_level"])
        
    total_policies = pol_q.count()
    active_policies = pol_q.filter(SodPolicy.status == "ACTIVE").count()
    inactive_policies = pol_q.filter(SodPolicy.status == "INACTIVE").count()
    critical_policies = pol_q.filter(SodPolicy.status == "ACTIVE", SodPolicy.risk_level == "CRITICAL").count()

    # ── Violations ──
    viol_q = db.query(SodViolation)
    if filters:
        if filters.get("department"):
            viol_q = viol_q.filter(SodViolation.department == filters["department"])
        if filters.get("application"):
            viol_q = viol_q.filter(SodViolation.application_name == filters["application"])
        if filters.get("risk_level"):
            viol_q = viol_q.filter(SodViolation.severity == filters["risk_level"])
        if filters.get("status"):
            viol_q = viol_q.filter(SodViolation.status == filters["status"])

    total_violations = viol_q.count()
    open_violations = viol_q.filter(SodViolation.status.in_(["OPEN", "UNDER_REVIEW"])).count()
    critical_violations = viol_q.filter(
        SodViolation.status.in_(["OPEN", "UNDER_REVIEW"]), 
        SodViolation.severity == "CRITICAL"
    ).count()
    resolved_violations = viol_q.filter(SodViolation.status.in_(["CLOSED", "MITIGATED"])).count()

    # Trend calculations for violations. Scoped to the same OPEN/UNDER_REVIEW
    # status filter as the "Open Violations" KPI card this trend is attached
    # to in the UI — previously this counted ALL violations detected in the
    # period regardless of status, which diffed an unrelated metric against
    # a status-scoped headline number.
    v_curr_period = viol_q.filter(
        SodViolation.status.in_(["OPEN", "UNDER_REVIEW"]),
        SodViolation.detected_date >= p1_start
    ).count()
    v_prev_period = viol_q.filter(
        SodViolation.status.in_(["OPEN", "UNDER_REVIEW"]),
        SodViolation.detected_date >= p2_start,
        SodViolation.detected_date < p1_start
    ).count()

    violation_trend_pct = 0
    if v_prev_period > 0:
        violation_trend_pct = round(((v_curr_period - v_prev_period) / v_prev_period) * 100)
    elif v_curr_period > 0:
        # No prior-period baseline to compare against (e.g. freshly seeded
        # data) — percent change is undefined, not "curr_period * 100"
        # (which produced nonsensical values like +2000%). Cap at a flat
        # +100% to signal "new activity" without an inflated number.
        violation_trend_pct = 100

    # ── Exceptions ──
    exc_q = db.query(SodException)
    if filters:
        if filters.get("department"):
            exc_q = exc_q.filter(SodException.department == filters["department"])
        if filters.get("application"):
            exc_q = exc_q.filter(SodException.application_name == filters["application"])
        if filters.get("status"):
            exc_q = exc_q.filter(SodException.status == filters["status"])
            
    total_exceptions = exc_q.count()
    pending_exceptions = exc_q.filter(SodException.status == "PENDING").count()
    approved_exceptions = exc_q.filter(SodException.status.in_(["APPROVED", "ACTIVE"])).count()
    expired_exceptions = exc_q.filter(SodException.status == "EXPIRED").count()
    revoked_exceptions = exc_q.filter(SodException.status == "REVOKED").count()

    # Trend calculations for exceptions. Scoped to the same APPROVED/ACTIVE
    # status filter as the "Active Exceptions" KPI card this trend is
    # attached to in the UI (same fix rationale as violations above).
    e_curr_period = exc_q.filter(
        SodException.status.in_(["APPROVED", "ACTIVE"]),
        SodException.requested_date >= p1_start
    ).count()
    e_prev_period = exc_q.filter(
        SodException.status.in_(["APPROVED", "ACTIVE"]),
        SodException.requested_date >= p2_start,
        SodException.requested_date < p1_start
    ).count()

    exception_trend_pct = 0
    if e_prev_period > 0:
        exception_trend_pct = round(((e_curr_period - e_prev_period) / e_prev_period) * 100)
    elif e_curr_period > 0:
        # Same rationale as violation_trend_pct above — no baseline to
        # compare against, so cap at a flat +100% instead of an inflated
        # curr_period * 100 value (previously produced +3000%).
        exception_trend_pct = 100

    # ── High Risk Entities ──
    high_risk_users = db.query(SodViolation.user_id).filter(
        SodViolation.status.in_(["OPEN", "UNDER_REVIEW"])
    ).distinct().count()
    
    high_risk_departments = db.query(SodViolation.department).filter(
        SodViolation.status.in_(["OPEN", "UNDER_REVIEW"])
    ).distinct().count()
    
    high_risk_applications = db.query(SodViolation.application_name).filter(
        SodViolation.status.in_(["OPEN", "UNDER_REVIEW"])
    ).distinct().count()

    # ── SLA & Pending action metrics ──
    overdue_sla_violations = viol_q.filter(
        SodViolation.status.in_(["OPEN", "UNDER_REVIEW"]),
        SodViolation.detected_date <= now - timedelta(days=30)
    ).count()

    pending_actions = pending_exceptions + open_violations

    # ── Configurable Governance Risk Score Formula ──
    raw_risk = (
        (critical_policies * 5.0) +
        (critical_violations * 15.0) +
        (expired_exceptions * 10.0) +
        (pending_exceptions * 5.0) +
        (high_risk_users * 8.0)
    )
    risk_score = min(100, (raw_risk / 250.0) * 100)
    governance_score = round(100 - risk_score)

    return {
        "total_policies": total_policies,
        "active_policies": active_policies,
        "inactive_policies": inactive_policies,
        "critical_policies": critical_policies,
        "total_violations": total_violations,
        "open_violations": open_violations,
        "critical_violations": critical_violations,
        "resolved_violations": resolved_violations,
        "total_exceptions": total_exceptions,
        "pending_exceptions": pending_exceptions,
        "approved_exceptions": approved_exceptions,
        "expired_exceptions": expired_exceptions,
        "revoked_exceptions": revoked_exceptions,
        "high_risk_users": high_risk_users,
        "high_risk_departments": high_risk_departments,
        "high_risk_applications": high_risk_applications,
        "overdue_sla_violations": overdue_sla_violations,
        "pending_actions": pending_actions,
        "violation_trend_pct": violation_trend_pct,
        "exception_trend_pct": exception_trend_pct,
        "governance_score": governance_score
    }

def get_governance_charts(db: Session, filters: dict = None) -> dict:
    """Aggregates data distributions for SVG charts."""
    # Severity Donut
    sev_q = db.query(SodViolation.severity, func.count(SodViolation.id)).filter(
        SodViolation.status.in_(["OPEN", "UNDER_REVIEW"])
    )
    if filters and filters.get("department"):
        sev_q = sev_q.filter(SodViolation.department == filters["department"])
    severity_dist = dict(sev_q.group_by(SodViolation.severity).all())

    # Department Horizontal
    dept_q = db.query(SodViolation.department, func.count(SodViolation.id)).filter(
        SodViolation.status.in_(["OPEN", "UNDER_REVIEW"])
    )
    if filters and filters.get("application"):
        dept_q = dept_q.filter(SodViolation.application_name == filters["application"])
    dept_dist = dict(dept_q.group_by(SodViolation.department).all())

    # Application Vertical
    app_q = db.query(SodViolation.application_name, func.count(SodViolation.id)).filter(
        SodViolation.status.in_(["OPEN", "UNDER_REVIEW"])
    )
    if filters and filters.get("department"):
        app_q = app_q.filter(SodViolation.department == filters["department"])
    app_dist = dict(app_q.group_by(SodViolation.application_name).all())

    # Policy Risk Pie
    pol_dist = dict(db.query(SodPolicy.risk_level, func.count(SodPolicy.id)).group_by(SodPolicy.risk_level).all())

    # Stacked Open vs Closed
    open_count = db.query(SodViolation).filter(SodViolation.status.in_(["OPEN", "UNDER_REVIEW"])).count()
    closed_count = db.query(SodViolation).filter(SodViolation.status.in_(["CLOSED", "MITIGATED", "EXCEPTION_APPROVED"])).count()
    stacked_viol = {"OPEN": open_count, "CLOSED": closed_count}

    # Temporary vs Permanent Exceptions
    temp_exc = db.query(SodException).filter(SodException.exception_type == "TEMPORARY").count()
    perm_exc = db.query(SodException).filter(SodException.exception_type == "PERMANENT").count()
    exc_type_dist = {"TEMPORARY": temp_exc, "PERMANENT": perm_exc}

    # 30-Day Trends
    now = datetime.utcnow()
    viol_trend = {}
    exc_trend = {}
    
    for i in range(30):
        date_str = (now - timedelta(days=29 - i)).strftime("%Y-%m-%d")
        # Initialize
        viol_trend[date_str] = 0
        exc_trend[date_str] = 0
        
    # Group counts
    viol_rows = db.query(func.date(SodViolation.detected_date), func.count(SodViolation.id)).filter(
        SodViolation.detected_date >= now - timedelta(days=30)
    ).group_by(func.date(SodViolation.detected_date)).all()
    for row in viol_rows:
        viol_trend[str(row[0])] = row[1]
        
    exc_rows = db.query(func.date(SodException.requested_date), func.count(SodException.id)).filter(
        SodException.requested_date >= now - timedelta(days=30)
    ).group_by(func.date(SodException.requested_date)).all()
    for row in exc_rows:
        exc_trend[str(row[0])] = row[1]

    return {
        "severity": severity_dist,
        "department": dept_dist,
        "application": app_dist,
        "policy": pol_dist,
        "stacked_violation": stacked_viol,
        "exception_type": exc_type_dist,
        "violation_trend": [{"date": k, "count": v} for k, v in sorted(viol_trend.items())],
        "exception_trend": [{"date": k, "count": v} for k, v in sorted(exc_trend.items())]
    }

def get_governance_heatmap(db: Session, filters: dict = None) -> list:
    """Risk Matrix mapping open violations: Department vs Connected Application."""
    rows = db.query(
        SodViolation.department,
        SodViolation.application_name,
        func.count(SodViolation.id),
        func.sum(SodViolation.risk_score)
    ).filter(
        SodViolation.status.in_(["OPEN", "UNDER_REVIEW"])
    )
    
    if filters:
        if filters.get("department"):
            rows = rows.filter(SodViolation.department == filters["department"])
        if filters.get("application"):
            rows = rows.filter(SodViolation.application_name == filters["application"])

    rows = rows.group_by(SodViolation.department, SodViolation.application_name).all()
    
    heatmap = []
    for dept, app, count, total_risk in rows:
        dept_name = dept or "General"
        avg_risk = round(total_risk / count) if count > 0 else 0
        
        # Color Scale mapping
        if avg_risk <= 25:
            color = "green"
        elif avg_risk <= 50:
            color = "yellow"
        elif avg_risk <= 75:
            color = "orange"
        else:
            color = "red"
            
        heatmap.append({
            "department": dept_name,
            "application": app,
            "violations_count": count,
            "risk_score": avg_risk,
            "color_scale": color
        })
    return heatmap

def get_executive_summary(db: Session, filters: dict = None) -> dict:
    """Prepares critical risks summary tables."""
    # Top 5 Critical Risks (open critical violations)
    top_risks = db.query(SodViolation).filter(
        SodViolation.status.in_(["OPEN", "UNDER_REVIEW"]),
        SodViolation.severity == "CRITICAL"
    ).order_by(SodViolation.risk_score.desc()).limit(5).all()

    # Top 5 Violated Policies
    violated_policies = db.query(
        SodViolation.policy_code,
        SodViolation.policy_name,
        func.count(SodViolation.id)
    ).filter(
        SodViolation.status.in_(["OPEN", "UNDER_REVIEW"])
    ).group_by(SodViolation.policy_code, SodViolation.policy_name).order_by(func.count(SodViolation.id).desc()).limit(5).all()

    # Top 10 High Risk Users
    top_users = db.query(
        SodViolation.username,
        SodViolation.display_name,
        SodViolation.department,
        func.count(SodViolation.id),
        func.max(SodViolation.risk_score)
    ).filter(
        SodViolation.status.in_(["OPEN", "UNDER_REVIEW"])
    ).group_by(SodViolation.username, SodViolation.display_name, SodViolation.department).order_by(func.count(SodViolation.id).desc()).limit(10).all()

    # Recently Closed Risks (last 7 days)
    recent_closed = db.query(SodViolation).filter(
        SodViolation.status.in_(["CLOSED", "MITIGATED"]),
        SodViolation.resolved_date >= datetime.utcnow() - timedelta(days=7)
    ).order_by(SodViolation.resolved_date.desc()).limit(5).all()

    return {
        "critical_risks": [
            {
                "id": v.id,
                "username": v.username,
                "policy_code": v.policy_code,
                "severity": v.severity,
                "risk_score": v.risk_score,
                "detected_date": v.detected_date.isoformat()
            } for v in top_risks
        ],
        "violated_policies": [
            {
                "policy_code": row[0],
                "policy_name": row[1],
                "open_violations": row[2]
            } for row in violated_policies
        ],
        "high_risk_users": [
            {
                "username": row[0],
                "display_name": row[1],
                "department": row[2] or "-",
                "violations_count": row[3],
                "max_risk_score": row[4]
            } for row in top_users
        ],
        "recently_closed": [
            {
                "id": v.id,
                "username": v.username,
                "policy_code": v.policy_code,
                "resolved_by": v.resolved_by or "System",
                "resolved_date": v.resolved_date.isoformat() if v.resolved_date else None
            } for v in recent_closed
        ]
    }

def get_governance_dashboard_data(db: Session, filters: dict = None, force_refresh: bool = False) -> dict:
    """Retrieves full aggregated payload, managing 60s memory caching."""
    global _dashboard_cache, _last_cached_time
    now_ts = time.time()
    
    # Check cache validity (skip if force_refresh or filter arguments present)
    if not force_refresh and not filters and (now_ts - _last_cached_time < 60) and _dashboard_cache:
        return _dashboard_cache
        
    kpis = get_governance_kpis(db, filters)
    charts = get_governance_charts(db, filters)
    heatmap = get_governance_heatmap(db, filters)
    exec_summary = get_executive_summary(db, filters)
    
    payload = {
        "kpis": kpis,
        "charts": charts,
        "heatmap": heatmap,
        "executive_summary": exec_summary,
        "cached_at": datetime.utcnow().isoformat()
    }
    
    # Save cache only for default dashboard queries (no custom filter overrides)
    if not filters:
        _dashboard_cache = payload
        _last_cached_time = now_ts
        
    return payload
