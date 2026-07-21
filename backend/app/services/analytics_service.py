"""
AN-001: Executive Dashboard — platform-wide KPI aggregation for the
Analytics module. Mirrors the pattern already used in
sod_dashboard_service.py (dedicated aggregation functions returning plain
dicts, DB-side COUNT/GROUP BY instead of pulling full row sets into Python).

Everything here reads real, live data (Identity, Application, CandidateRole,
ApplicationAccountEntitlement, SodViolation, SodException) — no seeded or
fabricated numbers, consistent with the rest of the platform after the
Governance fake-seed cleanup.
"""

from sqlalchemy.orm import Session
from sqlalchemy import func

from app.models.identity import Identity
from app.models.application import Application
from app.models.application_account import ApplicationAccount
from app.models.candidate_role import CandidateRole
from app.models.candidate_role_member import CandidateRoleMember
from app.models.application_account_entitlement import ApplicationAccountEntitlement
from app.models.sod_violation import SodViolation
from app.models.sod_exception import SodException


def get_executive_kpis(db: Session) -> dict:
    """AN-001: top-line KPI counters for the Executive Dashboard."""
    total_identities = db.query(Identity).filter(Identity.is_deleted == False).count()
    total_applications = db.query(Application).filter(Application.is_deleted == False).count()

    role_base = db.query(CandidateRole).filter(CandidateRole.is_deleted == False)
    total_candidate_roles = role_base.count()
    published_roles = role_base.filter(CandidateRole.status == "Published").count()

    # Joined to both parents and filtered on is_deleted so entitlement
    # links belonging to an already-deleted Application/account (a
    # pre-existing data-hygiene gap - deleting an Application didn't used
    # to cascade to its accounts/entitlements) don't keep inflating this
    # count after the parent is gone.
    total_entitlements_mapped = db.query(ApplicationAccountEntitlement).join(
        Application, ApplicationAccountEntitlement.application_id == Application.id
    ).join(
        ApplicationAccount, ApplicationAccountEntitlement.account_id == ApplicationAccount.id
    ).filter(
        ApplicationAccountEntitlement.matched == True,
        Application.is_deleted == False,
        ApplicationAccount.is_deleted == False
    ).count()

    # Same reasoning - a violation tied to an identity that's since been
    # removed from the Identity Repository isn't an actionable finding
    # anymore, so it shouldn't count toward "Open SoD Violations".
    open_violations = db.query(SodViolation).join(
        Identity, SodViolation.user_id == Identity.id
    ).filter(
        SodViolation.status.in_(["OPEN", "UNDER_REVIEW"]),
        Identity.is_deleted == False
    ).count()
    active_exceptions = db.query(SodException).filter(
        SodException.status.in_(["APPROVED", "ACTIVE"])
    ).count()

    # Coverage: fraction of real identities that are a member of at least one
    # *active* candidate/engineered role. Joined back to CandidateRole and
    # filtered to is_deleted == False deliberately — CandidateRoleMember
    # rows can outlive a soft-deleted role (e.g. undone merges/splits), so
    # counting membership rows alone would inflate coverage with roles that
    # no longer functionally exist.
    covered_identities = db.query(CandidateRoleMember.identity_id).join(
        CandidateRole, CandidateRoleMember.candidate_role_id == CandidateRole.id
    ).filter(CandidateRole.is_deleted == False).distinct().count()
    overall_coverage_pct = (
        round((covered_identities / total_identities) * 100, 1) if total_identities > 0 else 0.0
    )

    return {
        "total_identities": total_identities,
        "total_applications": total_applications,
        "total_candidate_roles": total_candidate_roles,
        "published_roles": published_roles,
        "total_entitlements_mapped": total_entitlements_mapped,
        "open_violations": open_violations,
        "active_exceptions": active_exceptions,
        "overall_coverage_pct": overall_coverage_pct,
    }


def get_executive_charts(db: Session) -> dict:
    """AN-001: supporting chart data for the Executive Dashboard."""
    role_base = db.query(CandidateRole).filter(CandidateRole.is_deleted == False)

    roles_by_classification = dict(
        role_base.with_entities(CandidateRole.classification, func.count(CandidateRole.id))
        .group_by(CandidateRole.classification).all()
    )
    # Drop null/blank classification keys so the chart doesn't render an
    # unlabeled "None" bucket for roles that haven't been classified yet.
    roles_by_classification = {k: v for k, v in roles_by_classification.items() if k}

    roles_by_status = dict(
        role_base.with_entities(CandidateRole.status, func.count(CandidateRole.id))
        .group_by(CandidateRole.status).all()
    )

    identities_by_department = dict(
        db.query(Identity.department, func.count(Identity.id))
        .filter(Identity.is_deleted == False)
        .group_by(Identity.department).all()
    )
    identities_by_department = {(k or "Unassigned"): v for k, v in identities_by_department.items()}

    return {
        "roles_by_classification": roles_by_classification,
        "roles_by_status": roles_by_status,
        "identities_by_department": identities_by_department,
    }


def get_executive_dashboard_data(db: Session) -> dict:
    return {
        "kpis": get_executive_kpis(db),
        "charts": get_executive_charts(db),
    }


# ── AN-002: Role Analytics ────────────────────────────────────────────────

def get_role_analytics_kpis(db: Session) -> dict:
    """AN-002: role-focused metrics (as opposed to the platform-wide KPIs on
    the Executive Dashboard)."""
    role_base = db.query(CandidateRole).filter(CandidateRole.is_deleted == False)
    total = role_base.count()

    avg_confidence = db.query(func.avg(CandidateRole.confidence_score)).filter(
        CandidateRole.is_deleted == False
    ).scalar()
    avg_sod_violations = db.query(func.avg(CandidateRole.sod_violation_count)).filter(
        CandidateRole.is_deleted == False
    ).scalar()

    with_owner = role_base.filter(CandidateRole.primary_owner_name.isnot(None)).count()
    owner_coverage_pct = round((with_owner / total) * 100, 1) if total > 0 else 0.0

    return {
        "total_roles": total,
        "avg_confidence_score": round(avg_confidence, 1) if avg_confidence is not None else 0.0,
        "avg_sod_violation_count": round(avg_sod_violations, 2) if avg_sod_violations is not None else 0.0,
        "roles_with_owner_assigned": with_owner,
        "owner_coverage_pct": owner_coverage_pct,
    }


def get_role_analytics_charts(db: Session) -> dict:
    """AN-002: chart breakdowns of role metrics."""
    role_base = db.query(CandidateRole).filter(CandidateRole.is_deleted == False)

    roles_by_type = dict(
        role_base.with_entities(CandidateRole.role_type, func.count(CandidateRole.id))
        .group_by(CandidateRole.role_type).all()
    )
    roles_by_type = {(k or "Unspecified"): v for k, v in roles_by_type.items()}

    roles_by_risk_level = dict(
        role_base.with_entities(CandidateRole.risk_level, func.count(CandidateRole.id))
        .group_by(CandidateRole.risk_level).all()
    )
    roles_by_risk_level = {(k or "Unspecified"): v for k, v in roles_by_risk_level.items()}

    roles_by_source = dict(
        role_base.with_entities(CandidateRole.source, func.count(CandidateRole.id))
        .group_by(CandidateRole.source).all()
    )
    roles_by_source = {(k or "Unspecified"): v for k, v in roles_by_source.items()}

    roles_by_department = dict(
        role_base.with_entities(CandidateRole.department, func.count(CandidateRole.id))
        .group_by(CandidateRole.department).all()
    )
    roles_by_department = {(k or "Unassigned"): v for k, v in roles_by_department.items()}

    return {
        "roles_by_type": roles_by_type,
        "roles_by_risk_level": roles_by_risk_level,
        "roles_by_source": roles_by_source,
        "roles_by_department": roles_by_department,
    }


def get_role_analytics_data(db: Session) -> dict:
    return {
        "kpis": get_role_analytics_kpis(db),
        "charts": get_role_analytics_charts(db),
    }


# ── AN-003: Coverage Reports ──────────────────────────────────────────────

def get_coverage_report(db: Session) -> dict:
    """AN-003: identity/entitlement coverage — how much of the real,
    uploaded data has actually been captured into an active role, broken
    down by department, plus the specific identities still uncovered."""
    identities = db.query(Identity).filter(Identity.is_deleted == False).all()
    total_identities = len(identities)

    # Same join-and-filter pattern as the Executive Dashboard's coverage
    # calc — only count membership in roles that are still active.
    covered_ids = {
        row[0] for row in db.query(CandidateRoleMember.identity_id).join(
            CandidateRole, CandidateRoleMember.candidate_role_id == CandidateRole.id
        ).filter(CandidateRole.is_deleted == False).distinct().all()
    }

    covered_count = len(covered_ids)
    uncovered_count = total_identities - covered_count
    overall_coverage_pct = round((covered_count / total_identities) * 100, 1) if total_identities > 0 else 0.0

    # Per-department breakdown
    dept_totals = {}
    dept_covered = {}
    for i in identities:
        dept = i.department or "Unassigned"
        dept_totals[dept] = dept_totals.get(dept, 0) + 1
        if i.id in covered_ids:
            dept_covered[dept] = dept_covered.get(dept, 0) + 1

    coverage_by_department = {
        dept: {
            "total": total,
            "covered": dept_covered.get(dept, 0),
            "coverage_pct": round((dept_covered.get(dept, 0) / total) * 100, 1) if total > 0 else 0.0,
        }
        for dept, total in dept_totals.items()
    }

    # Entitlement coverage: what fraction of imported account entitlement
    # rows were successfully matched to a known ApplicationEntitlement
    # (vs. an unrecognized/unmapped raw entitlement name from the import).
    total_entitlement_rows = db.query(ApplicationAccountEntitlement).count()
    matched_entitlement_rows = db.query(ApplicationAccountEntitlement).filter(
        ApplicationAccountEntitlement.matched == True
    ).count()
    entitlement_match_pct = (
        round((matched_entitlement_rows / total_entitlement_rows) * 100, 1)
        if total_entitlement_rows > 0 else 0.0
    )

    uncovered_identities = [
        {
            "id": i.id,
            "name": i.display_name or f"{i.first_name or ''} {i.last_name or ''}".strip() or i.email,
            "email": i.email,
            "department": i.department or "Unassigned",
        }
        for i in identities if i.id not in covered_ids
    ]

    return {
        "kpis": {
            "total_identities": total_identities,
            "covered_identities": covered_count,
            "uncovered_identities": uncovered_count,
            "overall_coverage_pct": overall_coverage_pct,
            "total_entitlement_rows": total_entitlement_rows,
            "matched_entitlement_rows": matched_entitlement_rows,
            "entitlement_match_pct": entitlement_match_pct,
        },
        "coverage_by_department": coverage_by_department,
        "uncovered_identities": uncovered_identities,
    }
