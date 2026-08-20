import os
import uuid
import logging
import requests
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

class GitHubConnector(RevocationConnector):
    """
    GitHub Provider Connector:
    Handles member removal, API key/token revocation, and independent HTTP status read-back verification.
    """

    @property
    def capabilities(self) -> ConnectorCapabilities:
        return ConnectorCapabilities(
            supports_discover=True,
            supports_revoke=True,
            supports_verify=True,
            supports_session_kill=False,
            connector_version="1.0.0"
        )

    def execute(self, request: RevocationRequest) -> ExecutionResult:
        github_token = os.getenv("GITHUB_TOKEN")
        org_name = request.context.get("org_name") or os.getenv("GITHUB_ORG", "NextID-Org")
        req_id = f"gh-{uuid.uuid4().hex[:8]}"

        provider_mode = os.getenv("NEXTID_PROVIDER_MODE", "mock").lower()
        if not github_token:
            if provider_mode == "real":
                raise RuntimeError("[GITHUB CONNECTOR] NEXTID_PROVIDER_MODE='real' is configured, but GITHUB_TOKEN environment variable is missing.")
            return ExecutionResult(
                status="FAILED",
                provider_request_id=req_id,
                retryable=False,
                error_code="CONNECTOR_NOT_CONFIGURED",
                message="GITHUB_TOKEN environment secret is missing. Real API call rejected.",
                http_status=401
            )
            
        if os.getenv("TEST_MOCK_MODE") == "1" and os.getenv("TEST_CERTIFICATION_MODE") != "1":
            return ExecutionResult(
                status="SUCCESS",
                provider_request_id=req_id,
                retryable=False,
                http_status=200,
                sanitized_payload={"mock": True, "target": request.target_id, "action": "removed_from_org"}
            )

        headers = {
            "Authorization": f"token {github_token}",
            "Accept": "application/vnd.github.v3+json"
        }
        url = f"https://api.github.com/orgs/{org_name}/members/{request.target_id}"

        try:
            response = requests.delete(url, headers=headers, timeout=10)
            res_req_id = response.headers.get("X-GitHub-Request-Id", req_id)

            if response.status_code in [204, 404]:
                return ExecutionResult(
                    status="EXECUTED",
                    provider_request_id=res_req_id,
                    retryable=False,
                    message=f"GitHub removal command executed for user '{request.target_id}'.",
                    sanitized_payload={
                        "provider": "GITHUB",
                        "operation": "REMOVE_MEMBER",
                        "org": org_name,
                        "target_id": request.target_id,
                        "entitlement": request.target_entitlement,
                        "http_status": response.status_code
                    },
                    http_status=response.status_code
                )
            elif response.status_code == 429:
                return ExecutionResult(
                    status="FAILED",
                    provider_request_id=res_req_id,
                    retryable=True,
                    error_code="RATE_LIMITED",
                    message="GitHub API rate limit exceeded (429). Retryable.",
                    http_status=429
                )
            else:
                return ExecutionResult(
                    status="FAILED",
                    provider_request_id=res_req_id,
                    retryable=response.status_code in [500, 502, 503, 504],
                    error_code=f"HTTP_{response.status_code}",
                    message=f"GitHub API Error [{response.status_code}]: {response.text}",
                    http_status=response.status_code
                )
        except requests.RequestException as err:
            logger.error(f"GitHub API request exception for {request.target_id}: {err}")
            return ExecutionResult(
                status="FAILED",
                provider_request_id=req_id,
                retryable=True,
                error_code="NETWORK_ERROR",
                message=f"GitHub request exception: {str(err)}",
                http_status=503
            )

    def verify(self, request: RevocationRequest, execution_result: Optional[ExecutionResult] = None) -> VerificationResult:
        github_token = os.getenv("GITHUB_TOKEN")
        org_name = request.context.get("org_name") or os.getenv("GITHUB_ORG", "NextID-Org")
        req_id = f"gh-verify-{uuid.uuid4().hex[:8]}"

        if not github_token and os.getenv("TEST_MOCK_MODE") != "1":
            return VerificationResult(
                state=VerificationState.UNVERIFIABLE,
                verified=False,
                observed_state="UNKNOWN",
                provider_request_id=req_id,
                retryable=False,
                message="Cannot verify GitHub revocation: GITHUB_TOKEN missing."
            )

        if os.getenv("TEST_MOCK_MODE") == "1" and os.getenv("TEST_CERTIFICATION_MODE") != "1":
            return VerificationResult(
                state=VerificationState.VERIFIED_REVOKED if (execution_result and execution_result.status in ["EXECUTED", "SUCCESS"]) else VerificationState.ALREADY_ABSENT,
                verified=True,
                observed_state="REVOKED",
                provider_request_id=req_id,
                retryable=False,
                evidence={"mock": True, "target_id": request.target_id},
                message=f"GitHub membership mock verified absent for '{request.target_id}'."
            )

        headers = {
            "Authorization": f"token {github_token}",
            "Accept": "application/vnd.github.v3+json"
        }
        url = f"https://api.github.com/orgs/{org_name}/members/{request.target_id}"

        try:
            res = requests.get(url, headers=headers, timeout=5)
            res_req_id = res.headers.get("X-GitHub-Request-Id", req_id)

            if res.status_code == 404:
                return VerificationResult(
                    state=VerificationState.VERIFIED_REVOKED if (execution_result and execution_result.status in ["EXECUTED", "SUCCESS"]) else VerificationState.ALREADY_ABSENT,
                    verified=True,
                    observed_state="REVOKED",
                    provider_request_id=res_req_id,
                    retryable=False,
                    evidence={"org": org_name, "target_id": request.target_id, "http_status": 404},
                    message=f"GitHub membership verified absent (404) for user '{request.target_id}'."
                )
            elif res.status_code == 200:
                return VerificationResult(
                    state=VerificationState.STILL_ACTIVE,
                    verified=False,
                    observed_state="ACTIVE",
                    provider_request_id=res_req_id,
                    retryable=False,
                    evidence={"org": org_name, "target_id": request.target_id, "http_status": 200},
                    message=f"GitHub membership still active (200) for user '{request.target_id}'."
                )
            else:
                return VerificationResult(
                    state=VerificationState.PROVIDER_UNAVAILABLE,
                    verified=False,
                    observed_state="UNKNOWN",
                    provider_request_id=res_req_id,
                    retryable=res.status_code in [429, 500, 502, 503, 504],
                    message=f"GitHub verification returned unexpected HTTP status {res.status_code}."
                )
        except requests.RequestException as err:
            logger.error(f"GitHub verification exception for {request.target_id}: {err}")
            return VerificationResult(
                state=VerificationState.PROVIDER_UNAVAILABLE,
                verified=False,
                observed_state="UNKNOWN",
                provider_request_id=req_id,
                retryable=True,
                message=f"GitHub verification network error: {str(err)}"
            )

    def discover(self, target_identity: str) -> Dict[str, Any]:
        return {"provider": "GITHUB", "target_identity": target_identity, "status": "DISCOVERED"}

    def health_check(self) -> Dict[str, Any]:
        token = os.getenv("GITHUB_TOKEN")
        return {"provider": "GITHUB", "configured": bool(token), "healthy": bool(token)}
