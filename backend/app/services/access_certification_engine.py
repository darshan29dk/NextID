"""
Phase 9 — Access Certification Engine
Creates and manages campaigns. REVOKE decisions route through
the existing RevocationJob engine (fail-closed, provider-verified).
NO AI/ML. Reviewer sees all facts, makes a deterministic decision.
"""
import uuid
import json
from datetime import datetime
from typing import List, Dict, Any, Optional
from sqlalchemy.orm import Session

from app.models.certification_campaign import CertificationCampaign, CertificationItem
from app.models.account import Account
from app.models.account_entitlement import AccountEntitlement
from app.models.principal import Principal


class AccessCertificationEngine:

    @staticmethod
    def create_campaign(
        db: Session,
        tenant_id: str,
        name: str,
        campaign_type: str,
        created_by: str,
        starts_at: datetime,
        due_at: datetime,
        scope: Dict = None
    ) -> CertificationCampaign:
        """
        Create a new access certification campaign.
        campaign_type: MANAGER | APPLICATION_OWNER | PRIVILEGED_ACCESS |
                       SERVICE_ACCOUNT | AGENT_AUTHORITY | ENTITLEMENT_OWNER
        """
        campaign = CertificationCampaign(
            id=str(uuid.uuid4()),
            tenant_id=tenant_id,
            name=name,
            campaign_type=campaign_type,
            created_by=created_by,
            starts_at=starts_at,
            due_at=due_at,
            scope=json.dumps(scope or {}),
            status="DRAFT",
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow()
        )
        db.add(campaign)
        db.commit()
        db.refresh(campaign)
        return campaign

    @staticmethod
    def populate_items(
        db: Session,
        tenant_id: str,
        campaign_id: str
    ) -> int:
        """
        Populate certification items for a campaign based on current
        AccountEntitlement data. Returns item count.
        """
        campaign = db.query(CertificationCampaign).filter(
            CertificationCampaign.tenant_id == tenant_id,
            CertificationCampaign.id == campaign_id
        ).first()
        if not campaign:
            raise ValueError(f"Campaign '{campaign_id}' not found.")
        if campaign.status != "DRAFT":
            raise ValueError(f"Campaign is not in DRAFT status.")

        # Gather all ACTIVE entitlements for the campaign scope
        entries = db.query(AccountEntitlement, Account).join(
            Account, AccountEntitlement.account_id == Account.id
        ).filter(
            AccountEntitlement.tenant_id == tenant_id,
            AccountEntitlement.status == "ACTIVE"
        ).all()

        count = 0
        for ae, acc in entries:
            # reviewer = manager (simplified: campaign owner in this implementation)
            item = CertificationItem(
                id=str(uuid.uuid4()),
                tenant_id=tenant_id,
                campaign_id=campaign_id,
                principal_id=acc.principal_id,
                account_id=ae.account_id,
                entitlement_id=ae.entitlement_id,
                reviewer_id=campaign.created_by,
                status="PENDING",
                created_at=datetime.utcnow(),
                updated_at=datetime.utcnow()
            )
            db.add(item)
            count += 1

        campaign.total_items = count
        campaign.status = "ACTIVE"
        campaign.updated_at = datetime.utcnow()
        db.commit()
        return count

    @staticmethod
    def decide_item(
        db: Session,
        tenant_id: str,
        item_id: str,
        decision: str,
        reviewer_id: str,
        reason: str = None
    ) -> Dict[str, Any]:
        """
        Apply reviewer decision to a certification item.
        decision: KEEP | REVOKE | REDUCE | DELEGATE_REVIEW | EXCEPTION
        REVOKE → caller must route to RevocationJob engine.
        """
        VALID_DECISIONS = {"KEEP", "REVOKE", "REDUCE", "DELEGATE_REVIEW", "EXCEPTION"}
        if decision not in VALID_DECISIONS:
            raise ValueError(f"Invalid decision '{decision}'. Must be one of {VALID_DECISIONS}.")

        item = db.query(CertificationItem).filter(
            CertificationItem.tenant_id == tenant_id,
            CertificationItem.id == item_id,
            CertificationItem.status == "PENDING"
        ).first()

        if not item:
            raise ValueError(f"Item '{item_id}' not found or already decided.")

        item.decision = decision
        item.decision_reason = reason
        item.decided_at = datetime.utcnow()
        item.status = "REVIEWED"
        item.updated_at = datetime.utcnow()

        # Update campaign counters
        campaign = db.query(CertificationCampaign).filter(
            CertificationCampaign.id == item.campaign_id
        ).first()
        if campaign:
            campaign.reviewed_items += 1
            if decision == "REVOKE":
                campaign.revoked_items += 1
            elif decision == "KEEP":
                campaign.kept_items += 1
            campaign.updated_at = datetime.utcnow()

        db.commit()

        return {
            "item_id": item.id,
            "campaign_id": item.campaign_id,
            "decision": decision,
            "decided_at": item.decided_at.isoformat(),
            "requires_revocation": decision == "REVOKE"
        }
