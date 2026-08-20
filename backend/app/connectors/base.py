from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Optional, Dict, Any
from enum import Enum

class VerificationState(str, Enum):
    VERIFIED_REVOKED = "VERIFIED_REVOKED"
    ALREADY_ABSENT = "ALREADY_ABSENT"
    STILL_ACTIVE = "STILL_ACTIVE"
    UNVERIFIABLE = "UNVERIFIABLE"
    PROVIDER_UNAVAILABLE = "PROVIDER_UNAVAILABLE"
    UNSUPPORTED = "UNSUPPORTED"
    VERIFYING_DELAYED = "VERIFYING_DELAYED"

@dataclass
class RevocationRequest:
    tenant_id: str
    provider: str
    target_id: str
    target_type: str
    target_entitlement: str
    provider_account_id: Optional[str] = None
    operation: Optional[str] = "REVOKE"
    credential_reference: Optional[str] = None
    authority_epoch: Optional[int] = 1
    trace_id: Optional[str] = None
    idempotency_key: Optional[str] = None
    context: Dict[str, Any] = field(default_factory=dict)

@dataclass
class ExecutionResult:
    status: str  # EXECUTED, FAILED, UNSUPPORTED
    provider_request_id: str
    retryable: bool
    error_code: Optional[str] = None
    message: Optional[str] = None
    sanitized_payload: Dict[str, Any] = field(default_factory=dict)
    http_status: int = 200

@dataclass
class VerificationResult:
    state: VerificationState
    verified: bool
    observed_state: str  # REVOKED, ACTIVE, UNKNOWN
    provider_request_id: str
    retryable: bool
    evidence: Dict[str, Any] = field(default_factory=dict)
    message: Optional[str] = None

@dataclass
class ConnectorCapabilities:
    supports_discover: bool = True
    supports_revoke: bool = True
    supports_verify: bool = True
    supports_session_kill: bool = False
    connector_version: str = "1.0.0"

class RevocationConnector(ABC):
    @property
    @abstractmethod
    def capabilities(self) -> ConnectorCapabilities:
        """Returns the capabilities metadata for this connector."""
        pass

    @abstractmethod
    def execute(self, request: RevocationRequest) -> ExecutionResult:
        """Executes a single revocation action against the provider."""
        pass

    @abstractmethod
    def verify(self, request: RevocationRequest, execution_result: Optional[ExecutionResult] = None) -> VerificationResult:
        """Independently verifies whether the entitlement is revoked in the target system."""
        pass

    @abstractmethod
    def discover(self, target_identity: str) -> Dict[str, Any]:
        """Discovers current entitlements or authority nodes for the target identity."""
        pass

    @abstractmethod
    def health_check(self) -> Dict[str, Any]:
        """Checks provider API connectivity/credentials status."""
        pass
