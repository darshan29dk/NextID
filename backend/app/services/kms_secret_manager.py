import os
import hashlib
import logging
from typing import Dict, Any

logger = logging.getLogger(__name__)

class KMSSecretManagerService:
    """
    KMS & HashiCorp Vault Secret Manager Interface.
    [DEV/MOCK INTERFACE CONTRACT]: Generates HashiCorp Vault URIs (vault://...) and SHA-256 fingerprints.
    For production deployments, replace store_credential_reference() with hvac (Vault client) or boto3 (AWS Secrets Manager) calls.
    Raw secrets are NEVER persisted in NextID databases.
    """

    @staticmethod
    def store_credential_reference(tenant_id: str, credential_type: str, target_resource: str, raw_token_optional: str = None) -> Dict[str, Any]:
        """
        Derives SHA-256 fingerprint and returns a Vault reference URI without persisting raw credentials.
        """
        token_src = raw_token_optional or f"{tenant_id}:{credential_type}:{target_resource}"
        fingerprint = hashlib.sha256(token_src.encode('utf-8')).hexdigest()
        vault_uri = f"vault://secret/data/{tenant_id}/{credential_type.lower()}/{fingerprint[:12]}"

        logger.info(f"[KMS SECRET MANAGER - MOCK/DEV] Vault reference URI derived: '{vault_uri}' (SHA256 Fingerprint: {fingerprint[:16]}).")

        return {
            "vault_reference_uri": vault_uri,
            "credential_fingerprint_sha256": fingerprint,
            "tenant_id": tenant_id,
            "credential_type": credential_type,
            "target_resource": target_resource,
            "is_vault_mock": True
        }

    @staticmethod
    def get_vault_reference(vault_uri: str) -> Dict[str, Any]:
        """
        Retrieves secret reference metadata from Vault.
        """
        return {
            "vault_uri": vault_uri,
            "status": "VALID",
            "provider_key_version": "v1.0",
            "is_vault_mock": True
        }
