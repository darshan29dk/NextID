"""
Role Mining Engine (RD-002 execution, backing RD-003/005/006/007).

Implements the approach described in the project's BRD/TRD: candidate
business roles are discovered by analyzing access patterns "within each
job function" (BRD Step 3), using clustering (TRD 5.6: "Scikit-learn —
user clustering, permission similarity analysis, candidate role
generation, access pattern discovery").

Algorithm, per campaign run:
  1. Scope accounts (by Application, or all) to those that are correlated
     to an Identity with a non-empty job_title — job function is the
     required scoping dimension per the BRD.
  2. Group accounts by job_title.
  3. Within each job-function group, build a binary account x entitlement
     matrix and run DBSCAN with Jaccard distance. DBSCAN was chosen over
     e.g. KMeans specifically because it does not force every point into
     a cluster — points that don't fit anywhere are left as "noise",
     which maps directly onto Outlier Analysis (RD-007) instead of
     needing a separate heuristic.
  4. Each non-noise cluster becomes a CandidateRole. Its entitlement
     definition is whichever entitlements at least CORE_THRESHOLD% of
     members hold. Confidence score (RD-006) is the average Jaccard
     similarity of each member's own entitlement set to that core set.
  5. Coverage (RD-005) is computed campaign-wide: the percentage of all
     scoped accounts that landed in a candidate role versus were left as
     outliers.
"""

from collections import defaultdict
from datetime import datetime
from typing import Dict, List, Set

import numpy as np
from sklearn.cluster import DBSCAN

from sqlalchemy.orm import Session

from app.models.application import Application
from app.models.application_account import ApplicationAccount
from app.models.application_account_entitlement import ApplicationAccountEntitlement
from app.models.application_entitlement import ApplicationEntitlement
from app.models.identity import Identity
from app.models.mining_campaign import MiningCampaign
from app.models.candidate_role import CandidateRole
from app.models.candidate_role_entitlement import CandidateRoleEntitlement
from app.models.candidate_role_member import CandidateRoleMember
from app.models.campaign_account_result import CampaignAccountResult

CORE_THRESHOLD_PCT = 60.0  # an entitlement must be held by >= this % of a cluster's members to count as "core"


def _jaccard_similarity(a: Set[str], b: Set[str]) -> float:
    if not a and not b:
        return 0.0
    union = a | b
    if not union:
        return 0.0
    return len(a & b) / len(union) * 100.0


class RoleMiningEngine:
    @staticmethod
    def run_campaign(db: Session, campaign: MiningCampaign) -> MiningCampaign:
        # Clear any previous run's results, in delete-child-before-parent
        # order (CampaignAccountResult and CandidateRoleEntitlement both
        # reference CandidateRole, so they must go first or MySQL rejects
        # the delete with a foreign key constraint error).
        old_role_ids = [
            r.id for r in db.query(CandidateRole.id).filter(CandidateRole.campaign_id == campaign.id).all()
        ]
        if old_role_ids:
            db.query(CandidateRoleEntitlement).filter(
                CandidateRoleEntitlement.candidate_role_id.in_(old_role_ids)
            ).delete(synchronize_session=False)
        db.query(CampaignAccountResult).filter(CampaignAccountResult.campaign_id == campaign.id).delete(
            synchronize_session=False
        )
        db.query(CandidateRole).filter(CandidateRole.campaign_id == campaign.id).delete(synchronize_session=False)
        db.commit()

        # 1. Scope accounts: must be correlated to an identity with a job title.
        query = db.query(ApplicationAccount, Identity).join(
            Identity, ApplicationAccount.identity_id == Identity.id
        ).filter(
            ApplicationAccount.is_deleted == False,
            Identity.is_deleted == False,
            Identity.job_title.isnot(None),
            Identity.job_title != ""
        )
        if campaign.scope_type == "Application" and campaign.application_id:
            query = query.filter(ApplicationAccount.application_id == campaign.application_id)

        scoped = query.all()

        if not scoped:
            campaign.total_accounts_analyzed = 0
            campaign.total_candidate_roles = 0
            campaign.total_outliers = 0
            campaign.coverage_percentage = 0.0
            campaign.status = "Completed"
            campaign.last_run_at = datetime.utcnow()
            db.commit()
            return campaign

        # 2. Group by job function.
        groups: Dict[str, List[ApplicationAccount]] = defaultdict(list)
        for acc, ident in scoped:
            groups[ident.job_title].append(acc)

        account_ids = [acc.id for acc, _ in scoped]
        acc_id_to_identity: Dict[int, Identity] = {acc.id: ident for acc, ident in scoped}

        # Load details of all entitlements with their application name and risk level
        ent_details = db.query(
            ApplicationEntitlement.id,
            ApplicationEntitlement.entitlement_name,
            ApplicationEntitlement.risk_level,
            Application.application_name
        ).join(Application, ApplicationEntitlement.application_id == Application.id).all()

        ent_id_to_app_name = {ent.id: ent.application_name for ent in ent_details}
        ent_id_to_risk = {ent.id: ent.risk_level for ent in ent_details}

        # Pull every entitlement link for these accounts in one query.
        links = db.query(ApplicationAccountEntitlement).filter(
            ApplicationAccountEntitlement.account_id.in_(account_ids)
        ).all()
        entitlement_names = {
            e.id: e.entitlement_name
            for e in db.query(ApplicationEntitlement.id, ApplicationEntitlement.entitlement_name).all()
        }

        account_entitlements: Dict[int, Set[str]] = defaultdict(set)
        key_to_display: Dict[str, str] = {}
        key_to_entitlement_id: Dict[str, int] = {}
        for link in links:
            if link.entitlement_id:
                key = f"id:{link.entitlement_id}"
                display = entitlement_names.get(link.entitlement_id, link.entitlement_name_raw)
                key_to_entitlement_id[key] = link.entitlement_id
            else:
                key = f"raw:{link.entitlement_name_raw.strip().lower()}"
                display = link.entitlement_name_raw
            key_to_display[key] = display
            account_entitlements[link.account_id].add(key)

        total_candidate_roles = 0
        total_outliers = 0
        account_result_rows = []

        for job_function, accounts in groups.items():
            clusterable = [acc for acc in accounts if account_entitlements.get(acc.id)]
            unclusterable = [acc for acc in accounts if not account_entitlements.get(acc.id)]

            # Accounts with zero recorded entitlements can't be meaningfully
            # clustered — they're automatic outliers for this run.
            for acc in unclusterable:
                total_outliers += 1
                account_result_rows.append(CampaignAccountResult(
                    campaign_id=campaign.id, account_id=acc.id, identity_id=acc.identity_id,
                    job_function=job_function, candidate_role_id=None, similarity_score=0.0
                ))

            if len(clusterable) < max(2, campaign.min_samples):
                for acc in clusterable:
                    total_outliers += 1
                    account_result_rows.append(CampaignAccountResult(
                        campaign_id=campaign.id, account_id=acc.id, identity_id=acc.identity_id,
                        job_function=job_function, candidate_role_id=None, similarity_score=0.0
                    ))
                continue

            all_keys = sorted({key for acc in clusterable for key in account_entitlements[acc.id]})
            key_index = {key: i for i, key in enumerate(all_keys)}
            matrix = np.zeros((len(clusterable), len(all_keys)), dtype=bool)
            for row_i, acc in enumerate(clusterable):
                for key in account_entitlements[acc.id]:
                    matrix[row_i, key_index[key]] = True

            labels = DBSCAN(eps=campaign.eps, min_samples=campaign.min_samples, metric="jaccard").fit_predict(matrix)

            cluster_number = 0
            for label in sorted(set(labels)):
                member_idxs = [i for i, l in enumerate(labels) if l == label]
                members = [clusterable[i] for i in member_idxs]

                if label == -1:
                    for acc in members:
                        total_outliers += 1
                        account_result_rows.append(CampaignAccountResult(
                            campaign_id=campaign.id, account_id=acc.id, identity_id=acc.identity_id,
                            job_function=job_function, candidate_role_id=None, similarity_score=0.0
                        ))
                    continue

                cluster_number += 1
                # Coverage of each entitlement across this cluster's members
                coverage: Dict[str, float] = {}
                for key in all_keys:
                    held = sum(1 for acc in members if key in account_entitlements[acc.id])
                    pct = held / len(members) * 100.0
                    if pct > 0:
                        coverage[key] = pct

                core_set = {key for key, pct in coverage.items() if pct >= CORE_THRESHOLD_PCT}

                # Determine unique applications in the core set
                core_app_names = set()
                for key in core_set:
                    ent_id = key_to_entitlement_id.get(key)
                    if ent_id:
                        app_name = ent_id_to_app_name.get(ent_id)
                        if app_name:
                            core_app_names.add(app_name)

                # Get the most common department among members
                member_depts = [acc_id_to_identity[acc.id].department for acc in members if acc_id_to_identity[acc.id].department]
                role_dept = max(set(member_depts), key=member_depts.count) if member_depts else None

                # Count unique users
                unique_identities = {acc_id_to_identity[acc.id] for acc in members}
                user_count = len(unique_identities)

                # Calculate SoD violations on the core set
                from app.services.classification_service import ClassificationService
                core_entitlement_names = [key_to_display.get(key, key) for key in core_set]
                sod_violations = ClassificationService.validate_sod_policies(core_entitlement_names)

                role = CandidateRole(
                    campaign_id=campaign.id,
                    role_name=f"{job_function} - Candidate Role {cluster_number}",
                    role_description=f"Auto-generated candidate role for {job_function} with {len(members)} users and {len(core_set)} entitlements.",
                    role_type="Business",
                    risk_level="Low",
                    classification=None,
                    status="Draft",
                    job_function=job_function,
                    cluster_label=int(label),
                    member_count=len(members),
                    user_count=user_count,
                    entitlement_count=len(core_set),
                    application_count=len(core_app_names),
                    department=role_dept,
                    source="Mining",
                    generated_by="System",
                    generated_on=datetime.utcnow(),
                    sod_violation_count=len(sod_violations),
                    confidence_score=0.0,
                    is_deleted=False
                )
                db.add(role)
                db.flush()  # get role.id

                added_identities = set()
                similarities = []
                for acc in members:
                    sim = _jaccard_similarity(account_entitlements[acc.id], core_set)
                    similarities.append(sim)
                    account_result_rows.append(CampaignAccountResult(
                        campaign_id=campaign.id, account_id=acc.id, identity_id=acc.identity_id,
                        job_function=job_function, candidate_role_id=role.id, similarity_score=round(sim, 1)
                    ))
                    
                    # Seed members into candidate_role_members
                    ident = acc_id_to_identity[acc.id]
                    if ident.id not in added_identities:
                        db.add(CandidateRoleMember(
                            candidate_role_id=role.id,
                            identity_id=ident.id,
                            employee_id=ident.employee_id,
                            employee_name=ident.display_name or f"{ident.first_name or ''} {ident.last_name or ''}".strip(),
                            department=ident.department,
                            created_at=datetime.utcnow()
                        ))
                        added_identities.add(ident.id)

                role.confidence_score = round(sum(similarities) / len(similarities), 1) if similarities else 0.0

                for key, pct in coverage.items():
                    ent_id = key_to_entitlement_id.get(key)
                    app_name = ent_id_to_app_name.get(ent_id) if ent_id else None
                    ent_risk = ent_id_to_risk.get(ent_id, "Low") if ent_id else "Low"
                    db.add(CandidateRoleEntitlement(
                        candidate_role_id=role.id,
                        entitlement_id=ent_id,
                        application_name=app_name,
                        entitlement_name=key_to_display.get(key, key),
                        risk=ent_risk,
                        member_coverage_pct=round(pct, 1),
                        is_core=key in core_set,
                        created_at=datetime.utcnow()
                    ))

                total_candidate_roles += 1

        db.add_all(account_result_rows)

        total_accounts_analyzed = len(scoped)
        campaign.total_accounts_analyzed = total_accounts_analyzed
        campaign.total_candidate_roles = total_candidate_roles
        campaign.total_outliers = total_outliers
        campaign.coverage_percentage = round(
            (total_accounts_analyzed - total_outliers) / total_accounts_analyzed * 100.0, 1
        ) if total_accounts_analyzed > 0 else 0.0
        campaign.status = "Completed"
        campaign.last_run_at = datetime.utcnow()
        campaign.error_message = None

        db.commit()
        db.refresh(campaign)
        return campaign
