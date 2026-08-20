import logging
from typing import Dict
from app.connectors.base import RevocationConnector

logger = logging.getLogger(__name__)

class ConnectorRegistry:
    """
    Central Registry for Provider Revocation Connectors.
    Routes requests by provider key (e.g. GITHUB, AWS_IAM, MCP, GENERIC).
    """
    _registry: Dict[str, RevocationConnector] = {}

    @classmethod
    def register(cls, provider: str, connector_instance: RevocationConnector) -> None:
        key = provider.upper()
        cls._registry[key] = connector_instance

    @classmethod
    def get_connector(cls, provider: str) -> RevocationConnector:
        key = (provider or "GENERIC").upper()
        if key in cls._registry:
            return cls._registry[key]
        
        # Check standard mappings
        if key in ["AWS", "AWS_IAM", "IAM"]:
            from app.connectors.aws import AWSConnector
            conn = AWSConnector()
            cls.register("AWS_IAM", conn)
            cls.register("AWS", conn)
            return conn
        elif key in ["GITHUB", "GITHUB_API"]:
            from app.connectors.github import GitHubConnector
            conn = GitHubConnector()
            cls.register("GITHUB", conn)
            return conn
        elif key in ["MCP", "MCP_SESSION", "AGENT_SESSION"]:
            from app.connectors.mcp import MCPConnector
            conn = MCPConnector()
            cls.register("MCP", conn)
            cls.register("MCP_SESSION", conn)
            return conn

        # Fallback to GenericConnector if provider not explicitly registered (Fails Closed)
        from app.connectors.generic import GenericConnector
        fallback = GenericConnector()
        cls._registry["GENERIC"] = fallback
        return fallback

    @classmethod
    def clear(cls) -> None:
        cls._registry.clear()
