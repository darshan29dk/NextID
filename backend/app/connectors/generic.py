import os
import uuid
import logging
from typing import Dict, Any, Optional
from app.connectors.base import (
    RevocationConnector,
    RevocationRequest,
    ExecutionResult,
    VerificationResult,
    VerificationState,
    ConnectorCapabilities
)

logger = logging.getLogger(__name__)

class GenericConnector(RevocationConnector):
    """
    Generic Provider Connector:
    Fails closed by default for unknown/unconfigured providers unless explicit test mock mode is enabled.
    """

    @property
    def capabilities(self) -> ConnectorCapabilities:
        return ConnectorCapabilities(
            supports_discover=False,
            supports_revoke=False,
            supports_verify=False,
            supports_session_kill=False,
            connector_version="1.0.0-failclosed"
        )

    def execute(self, request: RevocationRequest) -> ExecutionResult:
        req_id = f"gen-{uuid.uuid4().hex[:8]}"

        # Explicit test mock mode support for unit tests
        if request.context.get("allow_mock") or os.getenv("TEST_MOCK_MODE") == "1":
            return ExecutionResult(
                status="EXECUTED",
                provider_request_id=req_id,
                retryable=False,
                message=f"Generic mock revocation executed for '{request.target_id}'.",
                sanitized_payload={"provider": "GENERIC", "target_id": request.target_id, "mock": True},
                http_status=200
            )

        logger.warning(f"[GENERIC CONNECTOR] Execution requested for unsupported provider '{request.provider}' ({request.target_id}). Failing closed.")
        
        return ExecutionResult(
            status="UNSUPPORTED",
            provider_request_id=req_id,
            retryable=False,
            error_code="PROVIDER_UNSUPPORTED",
            message=f"No active provider connector registered for '{request.provider}'. Manual action required.",
            sanitized_payload={
                "provider": request.provider,
                "target_id": request.target_id,
                "target_entitlement": request.target_entitlement,
                "fail_closed": True
            },
            http_status=400
        )

    def verify(self, request: RevocationRequest, execution_result: Optional[ExecutionResult] = None) -> VerificationResult:
        req_id = f"gen-verify-{uuid.uuid4().hex[:8]}"

        if request.context.get("allow_mock") or os.getenv("TEST_MOCK_MODE") == "1":
            return VerificationResult(
                state=VerificationState.VERIFIED_REVOKED,
                verified=True,
                observed_state="REVOKED",
                provider_request_id=req_id,
                retryable=False,
                evidence={"mock": True},
                message=f"Generic mock verified for '{request.target_id}'."
            )

        logger.warning(f"[GENERIC CONNECTOR] Post-revocation verification for '{request.provider}' ({request.target_id}) failed closed: No provider verification engine configured.")
        
        return VerificationResult(
            state=VerificationState.UNSUPPORTED,
            verified=False,
            observed_state="UNKNOWN",
            provider_request_id=req_id,
            retryable=False,
            evidence={
                "provider": request.provider,
                "target_id": request.target_id,
                "verified": False,
                "reason": "PROVIDER_UNSUPPORTED"
            },
            message=f"Cannot verify revocation for unsupported provider '{request.provider}'."
        )

    def discover(self, target_identity: str) -> Dict[str, Any]:
        return {"target_identity": target_identity, "entitlements": [], "status": "UNSUPPORTED"}

    def health_check(self) -> Dict[str, Any]:
        return {"status": "UNSUPPORTED", "healthy": False, "message": "Generic fallback connector (Fails closed by default)."}
