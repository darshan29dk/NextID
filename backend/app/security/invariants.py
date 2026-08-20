import re
from typing import List, Dict, Any, Optional, Set, Tuple

class SecurityInvariantViolation(ValueError):
    """Raised when a formal security invariant is violated."""
    pass

class SecurityInvariantsEngine:
    """
    Formal Machine-Testable Security Invariants Engine (Phase 2):
    Validates core security bounds (INV-001 through INV-010).
    """

    @staticmethod
    def verify_inv_001_no_delegation_when_revoked_or_frozen(parent_identity, is_frozen: bool = False) -> bool:
        """
        INV-001: A revoked/frozen principal cannot create new delegations.
        """
        status = getattr(parent_identity, "status", "Active")
        frozen = getattr(parent_identity, "is_frozen", False) or is_frozen
        if status in ("Revoked", "Inactive") or frozen:
            raise SecurityInvariantViolation("INV-001: Revoked or frozen principal cannot create new delegations.")
        return True

    @staticmethod
    def verify_inv_002_privilege_containment(parent_permissions: List[str], child_permissions: List[str]) -> bool:
        """
        INV-002: Child permissions cannot exceed parent effective permissions (child_permissions ⊆ parent_permissions).
        """
        parent_set = set(parent_permissions)
        child_set = set(child_permissions)
        
        # Check wildcard parent permission
        if "*" in parent_set:
            return True
            
        exceeding = child_set - parent_set
        if exceeding:
            raise SecurityInvariantViolation(f"INV-002: Privilege escalation detected. Child requested permissions not held by parent: {exceeding}")
        return True

    @staticmethod
    def verify_inv_003_epoch_staleness(credential_epoch: int, principal_current_epoch: int, is_exempt: bool = False) -> bool:
        """
        INV-003: A credential issued under authority_epoch N cannot remain valid after the principal advances to epoch N+1 unless exempted.
        """
        if is_exempt:
            return True
        if credential_epoch < principal_current_epoch:
            raise SecurityInvariantViolation(
                f"INV-003: Credential authority epoch ({credential_epoch}) is stale relative to principal current epoch ({principal_current_epoch})."
            )
        return True

    @staticmethod
    def verify_inv_004_confirmed_requires_evidence(status: str, evidence: Optional[str]) -> bool:
        """
        INV-004: CONFIRMED requires acceptable external verification evidence.
        """
        if status == "CONFIRMED":
            if not evidence or len(evidence.strip()) < 10:
                raise SecurityInvariantViolation("INV-004: Status 'CONFIRMED' requires valid external verification evidence.")
        return True

    @staticmethod
    def verify_inv_005_ttfr_requires_all_mandatory_confirmed(
        mandatory_targets_total: int,
        mandatory_targets_confirmed: int,
        ttfr_ms: Optional[float]
    ) -> bool:
        """
        INV-005: TTFR cannot be populated while any MANDATORY revocation target remains unresolved.
        """
        if ttfr_ms is not None and ttfr_ms > 0:
            if mandatory_targets_confirmed < mandatory_targets_total:
                raise SecurityInvariantViolation(
                    f"INV-005: TTFR cannot be calculated while mandatory targets remain unconfirmed ({mandatory_targets_confirmed}/{mandatory_targets_total})."
                )
        return True

    @staticmethod
    def verify_inv_006_revoked_parent_no_active_descendants(parent_status: str, descendant_statuses: List[str], exceptions: Optional[List[str]] = None) -> bool:
        """
        INV-006: A revoked parent cannot retain ACTIVE descendant authority unless explicitly excepted.
        """
        if parent_status in ("Revoked", "REVOKED"):
            except_set = set(exceptions or [])
            for idx, desc_status in enumerate(descendant_statuses):
                if desc_status in ("Active", "ACTIVE") and str(idx) not in except_set:
                    raise SecurityInvariantViolation("INV-006: Active descendant authority detected under revoked parent without recorded exception.")
        return True

    @staticmethod
    def verify_inv_007_fencing_token_monotonicity(worker_token_seq: int, current_db_token_seq: int) -> bool:
        """
        INV-007: A stale fencing token cannot mutate newer job state.
        """
        if worker_token_seq < current_db_token_seq:
            raise SecurityInvariantViolation(
                f"INV-007: Stale fencing token sequence ({worker_token_seq}) rejected against DB token sequence ({current_db_token_seq})."
            )
        return True

    @staticmethod
    def verify_inv_008_cross_tenant_trust_contract(parent_tenant: str, child_tenant: str, active_trust_contracts: List[Tuple[str, str]]) -> bool:
        """
        INV-008: Cross-tenant authority edges are forbidden unless an active TrustContract explicitly permits them.
        """
        if parent_tenant != child_tenant:
            pair = (parent_tenant, child_tenant)
            rev_pair = (child_tenant, parent_tenant)
            if pair not in active_trust_contracts and rev_pair not in active_trust_contracts:
                raise SecurityInvariantViolation(
                    f"INV-008: Cross-tenant edge between '{parent_tenant}' and '{child_tenant}' rejected without active TrustContract."
                )
        return True

    @staticmethod
    def verify_inv_009_zero_raw_secret_persistence(content: str) -> bool:
        """
        INV-009: No raw credential secret may be persisted in DB, logs, audit evidence, exceptions or provider response history.
        """
        if not content:
            return True
        secret_patterns = [
            r"AKIA[0-9A-Z]{16}",                  # AWS Access Key ID
            r"aws_secret_access_key\s*=\s*[^\s]+", # AWS Secret Key
            r"scli_[a-zA-Z0-9_\-]{20,}",           # API keys / Session tokens
            r"ghp_[a-zA-Z0-9]{36}",                # GitHub Personal Token
            r"s\.[a-zA-Z0-9]{24}",                 # Vault Token
            r"Bearer\s+[a-zA-Z0-9\._\-]{30,}"      # OAuth Bearer Token
        ]
        for pattern in secret_patterns:
            if re.search(pattern, content, re.IGNORECASE):
                raise SecurityInvariantViolation(f"INV-009: Raw credential secret pattern detected in persisted artifact or log: '{pattern}'")
        return True

    @staticmethod
    def verify_inv_010_idempotent_event_delivery(processed_idempotency_keys: Set[str], incoming_key: str) -> bool:
        """
        INV-010: Duplicate delivery must not produce duplicate authority/provider mutations.
        """
        if incoming_key in processed_idempotency_keys:
            return False  # Idempotent skip signal
        return True

    @classmethod
    def validate_all(cls, state_dict: Dict[str, Any]) -> bool:
        """
        Validates all active security invariants for a composite system state dictionary.
        """
        if "parent_identity" in state_dict:
            cls.verify_inv_001_no_delegation_when_revoked_or_frozen(state_dict["parent_identity"])
            
        if "parent_perms" in state_dict and "child_perms" in state_dict:
            cls.verify_inv_002_privilege_containment(state_dict["parent_perms"], state_dict["child_perms"])
            
        if "cred_epoch" in state_dict and "principal_epoch" in state_dict:
            cls.verify_inv_003_epoch_staleness(state_dict["cred_epoch"], state_dict["principal_epoch"])
            
        if "job_status" in state_dict and "evidence" in state_dict:
            cls.verify_inv_004_confirmed_requires_evidence(state_dict["job_status"], state_dict["evidence"])
            
        if "worker_seq" in state_dict and "db_seq" in state_dict:
            cls.verify_inv_007_fencing_token_monotonicity(state_dict["worker_seq"], state_dict["db_seq"])

        if "persisted_text" in state_dict:
            cls.verify_inv_009_zero_raw_secret_persistence(state_dict["persisted_text"])

        return True
