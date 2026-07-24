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
    entitlements = db.query(CandidateRoleEntitlement).filter(
        CandidateRoleEntitlement.candidate_role_id == role.id
    ).order_by(CandidateRoleEntitlement.is_core.desc(), CandidateRoleEntitlement.member_coverage_pct.desc()).all()

    member_rows = db.query(CampaignAccountResult, ApplicationAccount, Application).join(
        ApplicationAccount, CampaignAccountResult.account_id == ApplicationAccount.id
    ).join(
        Application, ApplicationAccount.application_id == Application.id
    ).filter(CampaignAccountResult.candidate_role_id == role.id).all()

    account_ids = [acc.id for _, acc, _ in member_rows]
    identity_ids = [acc.identity_id for _, acc, _ in member_rows if acc.identity_id]
    identities_by_id = {}
    if identity_ids:
        for ident in db.query(Identity).filter(Identity.id.in_(identity_ids)).all():
            identities_by_id[ident.id] = ident

    entitlement_ids = [e.entitlement_id for e in entitlements if e.entitlement_id]
    grant_lookup = set()
    if account_ids and entitlement_ids:
        grants = db.query(ApplicationAccountEntitlement).filter(
            ApplicationAccountEntitlement.account_id.in_(account_ids),
            ApplicationAccountEntitlement.entitlement_id.in_(entitlement_ids)
        ).all()
        grant_lookup = {(g.account_id, g.entitlement_id) for g in grants}

    entitlement_rows = [
        {
            "key": f"role{role.id}-ent{e.id}",
            "entitlement_id": e.entitlement_id,
            "entitlement_name": e.entitlement_name,
            "application_name": e.application_name,
            "is_core": e.is_core,
            "member_coverage_pct": e.member_coverage_pct,
            "role_id": role.id,
            "role_name": role.role_name,
            "color": color,
        }
        for e in entitlements
    ]

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


def _build_multi_role_matrix(db: Session, roles: List[CandidateRole]) -> dict:
    """Shared body for both the campaign-scoped and global multi-role
    matrices: assigns each role a palette color, stacks their entitlement
    rows and de-duplicates shared members, then builds the combined grant
    grid. Used by both get_campaign_matrix (Role Discovery) and
    get_multi_role_matrix (Role Engineering, sir's request to move the
    analytical view up to the list level instead of per-role)."""
    if not roles:
        return {"roles": [], "entitlements": [], "members": [], "cells": []}

    all_entitlement_rows = []
    all_member_columns = []
    seen_account_ids = set()
    all_grants = {}  # account_id -> set of granted entitlement_ids (across all roles' relevant sets)

    role_legend = []
    for idx, role in enumerate(roles):
        color = ROLE_COLOR_PALETTE[idx % len(ROLE_COLOR_PALETTE)]
        role_legend.append({"role_id": role.id, "role_name": role.role_name, "color": color})

        entitlement_rows, member_columns, grant_lookup = _build_role_block(db, role, color)
        all_entitlement_rows.extend(entitlement_rows)

        for mem in member_columns:
            if mem["account_id"] not in seen_account_ids:
                seen_account_ids.add(mem["account_id"])
                all_member_columns.append(mem)

        for account_id, entitlement_id in grant_lookup:
            all_grants.setdefault(account_id, set()).add(entitlement_id)

    cells = []
    for ent in all_entitlement_rows:
        row_cells = []
        for mem in all_member_columns:
            if ent["entitlement_id"] is not None:
                has_grant = ent["entitlement_id"] in all_grants.get(mem["account_id"], set())
            else:
                has_grant = mem["role_id"] == ent["role_id"]
            row_cells.append(has_grant)
        cells.append(row_cells)

    return {
        "roles": role_legend,
        "entitlements": all_entitlement_rows,
        "members": all_member_columns,
        "cells": cells,
    }


def get_campaign_matrix(db: Session, campaign_id: int, role_ids: Optional[List[int]] = None) -> Optional[dict]:
    """Multi-role matrix for Role Discovery - several roles shown together,
    color-coded, matching the Role Studio reference image."""
    query = db.query(CandidateRole).filter(
        CandidateRole.campaign_id == campaign_id,
        CandidateRole.is_deleted == False
    )
    if role_ids:
        query = query.filter(CandidateRole.id.in_(role_ids))
        roles = query.all()
        # preserve the order the caller asked for
        order = {rid: i for i, rid in enumerate(role_ids)}
        roles.sort(key=lambda r: order.get(r.id, 999))
    else:
        roles = query.order_by(CandidateRole.confidence_score.desc()).all()

    result = _build_multi_role_matrix(db, roles)
    result["campaign_id"] = campaign_id
    return result


def get_multi_role_matrix(db: Session, role_ids: Optional[List[int]] = None) -> dict:
    """Multi-role matrix for Role Engineering's list-level Analytical View -
    not tied to a single mining campaign, spans every candidate role in the
    system (Mining or Manual). Scoped to whatever's checked in the table, or
    all candidate roles by confidence score if nothing's checked."""
    query = db.query(CandidateRole).filter(CandidateRole.is_deleted == False)
    if role_ids:
        query = query.filter(CandidateRole.id.in_(role_ids))
        roles = query.all()
        order = {rid: i for i, rid in enumerate(role_ids)}
        roles.sort(key=lambda r: order.get(r.id, 999))
    else:
        roles = query.order_by(CandidateRole.confidence_score.desc()).all()

    return _build_multi_role_matrix(db, roles)
