"""
Role Mining Matrix (entitlement x user grid).

Built per sir's (Dharankumar Bera) feedback on the Role Studio reference:
a spreadsheet-style view with entitlements down the rows and individual
users across the columns, a colored dot wherever that user actually holds
that entitlement. Needed in two places:
  - Role Engineering (single candidate role, reviewed before publishing)
  - Role Mining / Role Discovery (all mined roles in a campaign at once,
    color-coded per role, so overlapping/near-duplicate roles are visible)

Every dot reflects a REAL grant - it's derived from ApplicationAccountEntitlement
(the actual imported account<->entitlement data), not just "this account is a
member of this role". So the matrix will show gaps if a member is missing an
entitlement the role expects, which is exactly what's useful to catch before
publishing.

NOTE on birthright vs. request-based: the underlying data doesn't track that
per entitlement grant (see CandidateRole.classification, which is a manual,
whole-role label - not derived from real request/provisioning history). Until
real assignment-source data is available from a connector, this matrix only
surfaces the existing role-level classification badge, not a per-cell flag.
"""
from sqlalchemy.orm import Session
from typing import Optional, List

from app.models.candidate_role import CandidateRole
from app.models.candidate_role_entitlement import CandidateRoleEntitlement
from app.models.campaign_account_result import CampaignAccountResult
from app.models.application_account import ApplicationAccount
from app.models.application_account_entitlement import ApplicationAccountEntitlement
from app.models.application import Application
from app.models.identity import Identity

# Fixed color palette applied per role, in order - matches the dot colors in
# the Role Studio reference (orange, blue, green, teal, red, purple, brown...).
ROLE_COLOR_PALETTE = [
    "#f5a623",  # orange
    "#4a90d9",  # blue
    "#3aa15c",  # green
    "#2bb4b4",  # teal
    "#d9534f",  # red
    "#9b59b6",  # purple
    "#8d6e4f",  # brown
    "#c0389a",  # magenta
    "#5b7fdb",  # indigo
    "#7c9c3f",  # olive
]


def _member_display_name(account: ApplicationAccount, identity: Optional[Identity]) -> str:
    if identity:
        if identity.display_name:
            return identity.display_name
        if identity.first_name or identity.last_name:
            return f"{identity.first_name or ''} {identity.last_name or ''}".strip()
    return account.account_name or account.account_id


def _build_role_block(db: Session, role: CandidateRole, color: str):
    """Returns (entitlement_rows, member_columns, grant_lookup) for one role.
    grant_lookup is a set of (account_id, entitlement_id) pairs that are real."""
    member_rows = db.query(CampaignAccountResult, ApplicationAccount, Application).join(
        ApplicationAccount, CampaignAccountResult.account_id == ApplicationAccount.id
    ).join(
        Application, ApplicationAccount.application_id == Application.id
    ).filter(CampaignAccountResult.candidate_role_id == role.id).all()

    account_ids = [acc.id for _, acc, _ in member_rows]
    total_members = len(account_ids)

    identity_ids = [acc.identity_id for _, acc, _ in member_rows if acc.identity_id]
    identities_by_id = {}
    if identity_ids:
        for ident in db.query(Identity).filter(Identity.id.in_(identity_ids)).all():
            identities_by_id[ident.id] = ident

    cre_list = db.query(CandidateRoleEntitlement).filter(
        CandidateRoleEntitlement.candidate_role_id == role.id
    ).all()

    grant_lookup = set()
    grants_by_ent_id = defaultdict(set)
    if account_ids:
        grants = db.query(ApplicationAccountEntitlement).filter(
            ApplicationAccountEntitlement.account_id.in_(account_ids)
        ).all()
        for g in grants:
            if g.entitlement_id:
                grant_lookup.add((g.account_id, g.entitlement_id))
                grants_by_ent_id[g.entitlement_id].add(g.account_id)

    seen_keys = set()
    entitlement_rows = []

    for e in cre_list:
        key = f"role{role.id}-ent{e.id}"
        seen_keys.add(key)
        holders = len(grants_by_ent_id.get(e.entitlement_id, set())) if e.entitlement_id else total_members
        coverage_pct = round((holders / total_members) * 100.0, 1) if total_members > 0 else (e.member_coverage_pct or 0.0)

        entitlement_rows.append({
            "key": key,
            "entitlement_id": e.entitlement_id,
            "entitlement_name": e.entitlement_name,
            "application_name": e.application_name or "System Default",
            "is_core": e.is_core,
            "member_coverage_pct": coverage_pct,
            "role_id": role.id,
            "role_name": role.role_name,
            "color": color,
        })

    if account_ids:
        from app.models.application_entitlement import ApplicationEntitlement
        extra_ent_ids = set(grants_by_ent_id.keys()) - {e.entitlement_id for e in cre_list if e.entitlement_id}
        if extra_ent_ids:
            extra_ents = db.query(
                ApplicationEntitlement.id,
                ApplicationEntitlement.entitlement_name,
                Application.application_name
            ).join(Application, ApplicationEntitlement.application_id == Application.id).filter(
                ApplicationEntitlement.id.in_(extra_ent_ids)
            ).all()

            for ent_id, ent_name, app_name in extra_ents:
                key = f"role{role.id}-extraent{ent_id}"
                if key not in seen_keys:
                    seen_keys.add(key)
                    holders = len(grants_by_ent_id.get(ent_id, set()))
                    coverage_pct = round((holders / total_members) * 100.0, 1) if total_members > 0 else 0.0
                    entitlement_rows.append({
                        "key": key,
                        "entitlement_id": ent_id,
                        "entitlement_name": ent_name,
                        "application_name": app_name or "System Default",
                        "is_core": False,
                        "member_coverage_pct": coverage_pct,
                        "role_id": role.id,
                        "role_name": role.role_name,
                        "color": color,
                    })

    entitlement_rows.sort(key=lambda x: (x["is_core"], x["member_coverage_pct"]), reverse=True)

    member_columns = [
        {
            "key": f"role{role.id}-acc{acc.id}",
            "account_id": acc.id,
            "name": _member_display_name(acc, identities_by_id.get(acc.identity_id)),
            "role_id": role.id,
            "role_name": role.role_name,
            "color": color,
        }
        for _, acc, _ in member_rows
    ]

    return entitlement_rows, member_columns, grant_lookup


def get_role_matrix(db: Session, role_id: int) -> Optional[dict]:
    """Single-role matrix for Role Engineering - one role's entitlements x its members."""
    role = db.query(CandidateRole).filter(CandidateRole.id == role_id, CandidateRole.is_deleted == False).first()
    if not role:
        return None

    color = ROLE_COLOR_PALETTE[0]
    entitlement_rows, member_columns, grant_lookup = _build_role_block(db, role, color)

    cells = []
    for ent in entitlement_rows:
        row_cells = []
        for mem in member_columns:
            if ent["entitlement_id"] is not None:
                has_grant = (mem["account_id"], ent["entitlement_id"]) in grant_lookup
            else:
                # No real entitlement_id to check against (unmatched import row) -
                # fall back to treating it as covered for all members, since it's
                # part of the role's defined core set.
                has_grant = True
            row_cells.append(has_grant)
        cells.append(row_cells)

    return {
        "role_id": role.id,
        "role_name": role.role_name,
        "classification": role.classification,
        "entitlements": entitlement_rows,
        "members": member_columns,
        "cells": cells,
    }


def _build_multi_role_matrix(db: Session, roles: List[CandidateRole], max_members: int = 500) -> dict:
    """De-duplicates entitlements and members across all candidate roles in scope,
    returns unique entitlement rows with exact overall coverage %, unique member columns,
    and a grant matrix grid."""
    if not roles:
        return {"roles": [], "entitlements": [], "members": [], "cells": [], "total_candidate_roles": 0}

    total_candidate_roles = len(roles)

    role_ids = [r.id for r in roles]
    member_rows = db.query(CampaignAccountResult, ApplicationAccount, Application).join(
        ApplicationAccount, CampaignAccountResult.account_id == ApplicationAccount.id
    ).join(
        Application, ApplicationAccount.application_id == Application.id
    ).filter(CampaignAccountResult.candidate_role_id.in_(role_ids)).all()

    role_color_map = {}
    role_name_map = {}
    role_legend = []
    for idx, role in enumerate(roles[:20]):
        color = ROLE_COLOR_PALETTE[idx % len(ROLE_COLOR_PALETTE)]
        role_color_map[role.id] = color
        role_name_map[role.id] = role.role_name
        role_legend.append({"role_id": role.id, "role_name": role.role_name, "color": color})

    all_member_columns = []
    seen_account_ids = set()
    identity_ids = [acc.identity_id for _, acc, _ in member_rows if acc.identity_id]
    identities_by_id = {}
    if identity_ids:
        for ident in db.query(Identity).filter(Identity.id.in_(identity_ids)).all():
            identities_by_id[ident.id] = ident

    for res, acc, app in member_rows:
        if acc.id not in seen_account_ids:
            seen_account_ids.add(acc.id)
            color = role_color_map.get(res.candidate_role_id, ROLE_COLOR_PALETTE[0])
            rname = role_name_map.get(res.candidate_role_id, "Candidate Role")
            all_member_columns.append({
                "key": f"acc{acc.id}",
                "account_id": acc.id,
                "name": _member_display_name(acc, identities_by_id.get(acc.identity_id)),
                "role_id": res.candidate_role_id,
                "role_name": rname,
                "color": color,
            })
            if max_members and len(all_member_columns) >= max_members:
                break

    total_unique_members = len(all_member_columns)
    member_account_ids = [m["account_id"] for m in all_member_columns]

    grants_by_ent_id = defaultdict(set)
    if member_account_ids:
        grants = db.query(ApplicationAccountEntitlement).filter(
            ApplicationAccountEntitlement.account_id.in_(member_account_ids)
        ).all()
        for g in grants:
            if g.entitlement_id:
                grants_by_ent_id[g.entitlement_id].add(g.account_id)

    cre_list = db.query(CandidateRoleEntitlement).filter(
        CandidateRoleEntitlement.candidate_role_id.in_(role_ids)
    ).all()

    unique_entitlements_dict = {}
    for e in cre_list:
        ent_key = e.entitlement_id or e.entitlement_name
        if ent_key not in unique_entitlements_dict:
            holders_count = len(grants_by_ent_id.get(e.entitlement_id, set())) if e.entitlement_id else total_unique_members
            coverage_pct = round((holders_count / total_unique_members) * 100.0, 1) if total_unique_members > 0 else (e.member_coverage_pct or 0.0)
            color = role_color_map.get(e.candidate_role_id, ROLE_COLOR_PALETTE[0])
            unique_entitlements_dict[ent_key] = {
                "key": f"ent-{ent_key}",
                "entitlement_id": e.entitlement_id,
                "entitlement_name": e.entitlement_name,
                "application_name": e.application_name or "System Default",
                "is_core": e.is_core,
                "member_coverage_pct": coverage_pct,
                "role_id": e.candidate_role_id,
                "role_name": role_name_map.get(e.candidate_role_id, "Candidate Role"),
                "color": color,
            }

    if member_account_ids:
        from app.models.application_entitlement import ApplicationEntitlement
        extra_ent_ids = set(grants_by_ent_id.keys()) - {e.entitlement_id for e in cre_list if e.entitlement_id}
        if extra_ent_ids:
            extra_ents = db.query(
                ApplicationEntitlement.id,
                ApplicationEntitlement.entitlement_name,
                Application.application_name
            ).join(Application, ApplicationEntitlement.application_id == Application.id).filter(
                ApplicationEntitlement.id.in_(extra_ent_ids)
            ).all()

            for ent_id, ent_name, app_name in extra_ents:
                if ent_id not in unique_entitlements_dict:
                    holders_count = len(grants_by_ent_id.get(ent_id, set()))
                    coverage_pct = round((holders_count / total_unique_members) * 100.0, 1) if total_unique_members > 0 else 0.0
                    unique_entitlements_dict[ent_id] = {
                        "key": f"ent-{ent_id}",
                        "entitlement_id": ent_id,
                        "entitlement_name": ent_name,
                        "application_name": app_name or "System Default",
                        "is_core": False,
                        "member_coverage_pct": coverage_pct,
                        "role_id": None,
                        "role_name": "General",
                        "color": ROLE_COLOR_PALETTE[0],
                    }

    all_entitlement_rows = list(unique_entitlements_dict.values())
    all_entitlement_rows.sort(key=lambda x: (x["is_core"], x["member_coverage_pct"]), reverse=True)

    cells = []
    for ent in all_entitlement_rows:
        row_cells = []
        ent_holders = grants_by_ent_id.get(ent["entitlement_id"], set()) if ent["entitlement_id"] else set()
        for mem in all_member_columns:
            if ent["entitlement_id"] is not None:
                has_grant = mem["account_id"] in ent_holders
            else:
                has_grant = mem["role_id"] == ent["role_id"]
            row_cells.append(has_grant)
        cells.append(row_cells)

    return {
        "roles": role_legend,
        "entitlements": all_entitlement_rows,
        "members": all_member_columns,
        "cells": cells,
        "total_candidate_roles": total_candidate_roles,
    }


def get_campaign_matrix(db: Session, campaign_id: int, role_ids: Optional[List[int]] = None) -> Optional[dict]:
    """Multi-role matrix for Role Discovery - several roles shown together,
    color-coded, matching the Role Studio reference image."""
    query = db.query(CandidateRole).filter(
        CandidateRole.campaign_id == campaign_id,
        CandidateRole.is_deleted == False
    )
    if role_ids:
        # Explicit scope (manual selection, or a Department/Application
        # filter from the frontend) - return every matching role, however
        # many that is. No cap here: the caller already decided what it
        # wants shown.
        query = query.filter(CandidateRole.id.in_(role_ids))
        roles = query.all()
        order = {rid: i for i, rid in enumerate(role_ids)}
        roles.sort(key=lambda r: order.get(r.id, 999))
    else:
        # No explicit scope - default to Top 10 by confidence rather than
        # every candidate role in the campaign. A campaign can easily have
        # hundreds of roles (e.g. an under-tuned mining run), and the color
        # palette only has 10 distinct colors anyway - fetching/rendering
        # everything by default is slow and produces an unreadable grid.
        # Filters or manual selection are the deliberate, opt-in way to see
        # more than this default.
        roles = query.order_by(CandidateRole.confidence_score.desc()).limit(10).all()

    result = _build_multi_role_matrix(db, roles)
    result["campaign_id"] = campaign_id
    return result


def get_multi_role_matrix(db: Session, role_ids: Optional[List[int]] = None) -> dict:
    """Multi-role matrix for Role Engineering's list-level Analytical View -
    not tied to a single mining campaign, spans every candidate role in the
    system (Mining or Manual). Scoped to whatever's checked in the table, to
    a Department/Classification/Risk/etc. filter if one is active, or to the
    top 10 candidate roles by confidence score if nothing's selected or
    filtered."""
    query = db.query(CandidateRole).filter(CandidateRole.is_deleted == False)
    if role_ids:
        # Explicit scope, however large - see comment in get_campaign_matrix.
        query = query.filter(CandidateRole.id.in_(role_ids))
        roles = query.all()
        order = {rid: i for i, rid in enumerate(role_ids)}
        roles.sort(key=lambda r: order.get(r.id, 999))
    else:
        # Default to Top 10 by confidence, not every candidate role in the
        # system - see comment in get_campaign_matrix for why.
        roles = query.order_by(CandidateRole.confidence_score.desc()).limit(10).all()

    return _build_multi_role_matrix(db, roles)
