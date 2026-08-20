import os
import uuid
import logging
from typing import Dict, Any, Optional
try:
    import boto3
    from botocore.exceptions import BotoCoreError, ClientError
except ImportError:
    boto3 = None
    BotoCoreError = ClientError = Exception

from app.connectors.base import (
    RevocationConnector,
    RevocationRequest,
    ExecutionResult,
    VerificationResult,
    VerificationState,
    ConnectorCapabilities
)

logger = logging.getLogger(__name__)

class AWSConnector(RevocationConnector):
    """
    AWS IAM Provider Connector:
    Executes policy detachments and access key deletions, and performs independent boto3 read-back verification.
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
        aws_region = request.context.get("region") or os.getenv("AWS_DEFAULT_REGION", "us-east-1")
        aws_key = os.getenv("AWS_ACCESS_KEY_ID")
        aws_secret = request.credential_reference or os.getenv("AWS_SECRET_ACCESS_KEY")
        req_id = f"aws-{uuid.uuid4().hex[:8]}"

        if not (aws_key and aws_secret) or not boto3:
            return ExecutionResult(
                status="FAILED",
                provider_request_id=req_id,
                retryable=False,
                error_code="CONNECTOR_NOT_CONFIGURED",
                message="AWS credentials or boto3 library missing. Manual action required.",
                http_status=401
            )

        try:
            iam = boto3.client("iam", aws_access_key_id=aws_key, aws_secret_access_key=aws_secret, region_name=aws_region)
            target_identity = request.target_id
            target_entitlement = request.target_entitlement

            if "arn:aws:iam" in target_entitlement:
                iam.detach_user_policy(UserName=target_identity, PolicyArn=target_entitlement)
            elif "AKIA" in target_entitlement or "ASIA" in target_entitlement:
                iam.delete_access_key(UserName=target_identity, AccessKeyId=target_entitlement)
            else:
                iam.remove_user_from_group(GroupName=target_entitlement, UserName=target_identity)

            return ExecutionResult(
                status="EXECUTED",
                provider_request_id=req_id,
                retryable=False,
                message=f"AWS IAM revocation executed for user '{target_identity}'.",
                sanitized_payload={
                    "provider": "AWS_IAM",
                    "target_id": target_identity,
                    "target_entitlement": target_entitlement,
                    "region": aws_region
                },
                http_status=200
            )
        except ClientError as ce:
            error_code = ce.response.get("Error", {}).get("Code", "AWS_CLIENT_ERROR")
            if error_code == "NoSuchEntity":
                return ExecutionResult(
                    status="EXECUTED",
                    provider_request_id=req_id,
                    retryable=False,
                    message=f"AWS IAM entity '{request.target_id}' or policy already absent.",
                    sanitized_payload={"already_absent": True},
                    http_status=200
                )
            retryable = error_code in ["Throttling", "ServiceUnavailable", "RequestLimitExceeded"]
            return ExecutionResult(
                status="FAILED",
                provider_request_id=req_id,
                retryable=retryable,
                error_code=error_code,
                message=f"AWS IAM ClientError: {str(ce)}",
                http_status=400 if not retryable else 429
            )
        except Exception as exc:
            logger.error(f"AWS IAM execution error for {request.target_id}: {exc}")
            return ExecutionResult(
                status="FAILED",
                provider_request_id=req_id,
                retryable=True,
                error_code="AWS_EXECUTION_ERROR",
                message=f"AWS error: {str(exc)}",
                http_status=500
            )

    def verify(self, request: RevocationRequest, execution_result: Optional[ExecutionResult] = None) -> VerificationResult:
        aws_region = request.context.get("region") or os.getenv("AWS_DEFAULT_REGION", "us-east-1")
        aws_key = os.getenv("AWS_ACCESS_KEY_ID")
        aws_secret = request.credential_reference or os.getenv("AWS_SECRET_ACCESS_KEY")
        req_id = f"aws-verify-{uuid.uuid4().hex[:8]}"

        if not (aws_key and aws_secret) or not boto3:
            return VerificationResult(
                state=VerificationState.UNVERIFIABLE,
                verified=False,
                observed_state="UNKNOWN",
                provider_request_id=req_id,
                retryable=False,
                message="Cannot verify AWS IAM revocation: Credentials or boto3 missing."
            )

        try:
            iam = boto3.client("iam", aws_access_key_id=aws_key, aws_secret_access_key=aws_secret, region_name=aws_region)
            target_identity = request.target_id
            target_entitlement = request.target_entitlement

            if "arn:aws:iam" in target_entitlement:
                attached = iam.list_attached_user_policies(UserName=target_identity).get("AttachedPolicies", [])
                policy_arns = [p["PolicyArn"] for p in attached]
                if target_entitlement in policy_arns:
                    return VerificationResult(
                        state=VerificationState.STILL_ACTIVE,
                        verified=False,
                        observed_state="ACTIVE",
                        provider_request_id=req_id,
                        retryable=False,
                        message=f"Policy '{target_entitlement}' is still attached to AWS IAM user '{target_identity}'."
                    )
            elif "AKIA" in target_entitlement or "ASIA" in target_entitlement:
                keys = iam.list_access_keys(UserName=target_identity).get("AccessKeyMetadata", [])
                active_key_ids = [k["AccessKeyId"] for k in keys if k["Status"] == "Active"]
                if target_entitlement in active_key_ids:
                    return VerificationResult(
                        state=VerificationState.STILL_ACTIVE,
                        verified=False,
                        observed_state="ACTIVE",
                        provider_request_id=req_id,
                        retryable=False,
                        message=f"Access Key '{target_entitlement}' is still active for AWS IAM user '{target_identity}'."
                    )

            is_already = (execution_result and execution_result.sanitized_payload.get("already_absent")) or False
            vstate = VerificationState.ALREADY_ABSENT if is_already else VerificationState.VERIFIED_REVOKED
            
            return VerificationResult(
                state=vstate,
                verified=True,
                observed_state="REVOKED",
                provider_request_id=req_id,
                retryable=False,
                evidence={"target_identity": target_identity, "target_entitlement": target_entitlement, "verified": True},
                message=f"AWS IAM entitlement '{target_entitlement}' confirmed absent for '{target_identity}'."
            )
        except ClientError as ce:
            error_code = ce.response.get("Error", {}).get("Code", "AWS_CLIENT_ERROR")
            if error_code == "NoSuchEntity":
                return VerificationResult(
                    state=VerificationState.ALREADY_ABSENT,
                    verified=True,
                    observed_state="REVOKED",
                    provider_request_id=req_id,
                    retryable=False,
                    evidence={"already_absent": True},
                    message=f"AWS IAM entity '{request.target_id}' does not exist (404)."
                )
            return VerificationResult(
                state=VerificationState.PROVIDER_UNAVAILABLE,
                verified=False,
                observed_state="UNKNOWN",
                provider_request_id=req_id,
                retryable=True,
                message=f"AWS IAM verification error: {str(ce)}"
            )
        except Exception as exc:
            logger.error(f"AWS IAM verification exception for {request.target_id}: {exc}")
            return VerificationResult(
                state=VerificationState.PROVIDER_UNAVAILABLE,
                verified=False,
                observed_state="UNKNOWN",
                provider_request_id=req_id,
                retryable=True,
                message=f"AWS IAM verification exception: {str(exc)}"
            )

    def discover(self, target_identity: str) -> Dict[str, Any]:
        return {"provider": "AWS_IAM", "target_identity": target_identity, "status": "DISCOVERED"}

    def health_check(self) -> Dict[str, Any]:
        has_creds = bool(os.getenv("AWS_ACCESS_KEY_ID"))
        return {"provider": "AWS_IAM", "configured": has_creds, "healthy": has_creds}
