from sqlalchemy.orm import Session
from typing import Optional, List
from app.models.application_account import ApplicationAccount
from app.models.identity import Identity
from app.models.correlation_rule import CorrelationRule

AUTO_ACCEPT_THRESHOLD = 85
REVIEW_THRESHOLD = 70

class CorrelationEngine:
    @staticmethod
    def run_auto_correlation(db: Session, application_id: Optional[int] = None) -> List[ApplicationAccount]:
        """
        Runs the rule-based auto-correlation process for all accounts or accounts of a specific application.
        Uses active correlation rules queried dynamically from the database.
        Only runs on accounts that have not been manually linked.
        """
        # Fetch target accounts
        from sqlalchemy import or_
        query = db.query(ApplicationAccount).filter(
            ApplicationAccount.is_deleted == False,
            or_(
                ApplicationAccount.correlation_method != "Manual",
                ApplicationAccount.correlation_method.is_(None)
            )
        )
        if application_id is not None:
            query = query.filter(ApplicationAccount.application_id == application_id)
        
        accounts = query.all()

        # Fetch active correlation rules
        rules = db.query(CorrelationRule).filter(CorrelationRule.is_active == True).all()
        if not rules:
            print("[INFO] No active correlation rules found. Skipping auto-correlation.")
            return []

        # Fetch all active identities to build lookup map in memory for speed
        identities = db.query(Identity).filter(Identity.is_deleted == False).all()

        # For "Exact" rules, pre-build a value -> identity map once per rule so each
        # account does an O(1) dict lookup instead of scanning every identity.
        # "Partial" rules can't be hashed (substring match), so they keep a flat list
        # of (normalized_value, identity) pairs, but that list is still only built once.
        exact_rules = []
        partial_rules = []
        for rule in rules:
            if rule.match_type == "Partial":
                pairs = []
                for identity in identities:
                    id_val = getattr(identity, rule.identity_attribute, None)
                    if id_val is None:
                        continue
                    id_val_str = str(id_val).strip().lower()
                    if id_val_str:
                        pairs.append((id_val_str, identity))
                partial_rules.append((rule, pairs))
            else:
                value_map = {}
                for identity in identities:
                    id_val = getattr(identity, rule.identity_attribute, None)
                    if id_val is None:
                        continue
                    id_val_str = str(id_val).strip().lower()
                    if id_val_str and id_val_str not in value_map:
                        value_map[id_val_str] = identity
                exact_rules.append((rule, value_map))

        updated_accounts = []

        for account in accounts:
            matched_identity = None
            best_confidence = 0

            for rule, value_map in exact_rules:
                acc_val = getattr(account, rule.account_attribute, None)
                if acc_val is None:
                    continue
                acc_val_str = str(acc_val).strip().lower()
                if not acc_val_str:
                    continue
                identity = value_map.get(acc_val_str)
                if identity is not None and rule.confidence_score > best_confidence:
                    best_confidence = rule.confidence_score
                    matched_identity = identity

            for rule, pairs in partial_rules:
                acc_val = getattr(account, rule.account_attribute, None)
                if acc_val is None:
                    continue
                acc_val_str = str(acc_val).strip().lower()
                if not acc_val_str:
                    continue
                if rule.confidence_score <= best_confidence:
                    # Can't possibly beat the current best, skip the scan entirely.
                    continue
                for id_val_str, identity in pairs:
                    if acc_val_str in id_val_str or id_val_str in acc_val_str:
                        if rule.confidence_score > best_confidence:
                            best_confidence = rule.confidence_score
                            matched_identity = identity
                        break

            # Apply Threshold Logic
            if matched_identity and best_confidence >= REVIEW_THRESHOLD:
                account.identity_id = matched_identity.id
                account.correlation_confidence = best_confidence
                account.correlation_method = "Automatic"
                
                if best_confidence >= AUTO_ACCEPT_THRESHOLD:
                    account.correlation_status = "Correlated"
                else:
                    account.correlation_status = "Needs Review"
            else:
                # No match or confidence is below review threshold
                account.identity_id = None
                account.correlation_confidence = 0
                account.correlation_status = "Uncorrelated"
                account.correlation_method = None
                
            updated_accounts.append(account)
            
        db.commit()
        return updated_accounts
