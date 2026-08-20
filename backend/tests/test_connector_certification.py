import os
import sys
import unittest
from unittest.mock import patch, MagicMock

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.connectors.base import (
    RevocationRequest,
    ExecutionResult,
    VerificationResult,
    VerificationState
)
from app.connectors.github import GitHubConnector
from app.connectors.aws import AWSConnector
from app.connectors.mcp import MCPConnector
from app.connectors.generic import GenericConnector
from app.connectors.registry import ConnectorRegistry

class TestConnectorCertificationFramework(unittest.TestCase):

    def setUp(self):
        os.environ["TEST_MOCK_MODE"] = "1"
        os.environ["TEST_CERTIFICATION_MODE"] = "1"
        self.github = GitHubConnector()
        self.aws = AWSConnector()
        self.mcp = MCPConnector()
        self.generic = GenericConnector()

    def tearDown(self):
        os.environ.pop("TEST_CERTIFICATION_MODE", None)

    # --- 1. GENERIC CONNECTOR FAILS CLOSED CONTRACT ---
    def test_generic_fails_closed(self):
        old_mock_mode = os.environ.pop("TEST_MOCK_MODE", None)
        try:
            req = RevocationRequest(tenant_id="t1", provider="UNKNOWN_SAAS", target_id="u-123", target_type="GENERIC", target_entitlement="admin")
            exec_res = self.generic.execute(req)
            self.assertEqual(exec_res.status, "UNSUPPORTED")
            self.assertEqual(exec_res.http_status, 400)

            ver_res = self.generic.verify(req, exec_res)
            self.assertEqual(ver_res.state, VerificationState.UNSUPPORTED)
            self.assertFalse(ver_res.verified)
        finally:
            if old_mock_mode:
                os.environ["TEST_MOCK_MODE"] = old_mock_mode

    # --- 2. GITHUB CONTRACT CERTIFICATION ---
    @patch("requests.delete")
    @patch("requests.get")
    def test_github_certification_contract(self, mock_get, mock_delete):
        os.environ["GITHUB_TOKEN"] = "ghp_mocktoken"
        req = RevocationRequest(tenant_id="t1", provider="GITHUB", target_id="dev-user", target_type="GITHUB", target_entitlement="NextID-Org")

        # 2a. Revoke (204)
        mock_delete_res = MagicMock()
        mock_delete_res.status_code = 204
        mock_delete_res.headers = {"X-GitHub-Request-Id": "req-gh-100"}
        mock_delete.return_value = mock_delete_res

        exec_res = self.github.execute(req)
        self.assertIn(exec_res.status, ["SUCCESS", "EXECUTED"])
        self.assertEqual(exec_res.provider_request_id, "req-gh-100")

        # 2b. Verify (404 - Verified Revoked)
        mock_get_res = MagicMock()
        mock_get_res.status_code = 404
        mock_get_res.headers = {"X-GitHub-Request-Id": "req-gh-101"}
        mock_get.return_value = mock_get_res

        ver_res = self.github.verify(req, exec_res)
        self.assertTrue(ver_res.verified)
        self.assertEqual(ver_res.state, VerificationState.VERIFIED_REVOKED)

        # 2c. Already Absent
        ver_res_absent = self.github.verify(req, None)
        self.assertTrue(ver_res_absent.verified)
        self.assertEqual(ver_res_absent.state, VerificationState.ALREADY_ABSENT)

        # 2d. Still Active (200)
        mock_get_res.status_code = 200
        ver_res_active = self.github.verify(req, exec_res)
        self.assertFalse(ver_res_active.verified)
        self.assertEqual(ver_res_active.state, VerificationState.STILL_ACTIVE)

        # 2e. Rate Limited (429)
        mock_delete_res.status_code = 429
        exec_res_429 = self.github.execute(req)
        self.assertEqual(exec_res_429.status, "FAILED")
        self.assertTrue(exec_res_429.retryable)

    # --- 3. AWS IAM CONTRACT CERTIFICATION ---
    def test_aws_certification_contract(self):
        req = RevocationRequest(tenant_id="t1", provider="AWS_IAM", target_id="iam-user", target_type="AWS_IAM", target_entitlement="arn:aws:iam::123:policy/Admin")

        # 3a. Missing Credentials -> FAILED (CONNECTOR_NOT_CONFIGURED)
        with patch.dict(os.environ, {}, clear=True):
            exec_res = self.aws.execute(req)
            self.assertEqual(exec_res.status, "FAILED")
            self.assertEqual(exec_res.error_code, "CONNECTOR_NOT_CONFIGURED")

            ver_res = self.aws.verify(req, exec_res)
            self.assertEqual(ver_res.state, VerificationState.UNVERIFIABLE)

    # --- 4. MCP SESSION CONTRACT CERTIFICATION ---
    @patch("requests.post")
    @patch("requests.get")
    def test_mcp_certification_contract(self, mock_get, mock_post):
        req = RevocationRequest(tenant_id="t1", provider="MCP", target_id="mcp-sess-99", target_type="MCP_SESSION", target_entitlement="mcp-token")

        mock_post_res = MagicMock()
        mock_post_res.status_code = 200
        mock_post.return_value = mock_post_res

        exec_res = self.mcp.execute(req)
        self.assertEqual(exec_res.status, "EXECUTED")

        mock_get_res = MagicMock()
        mock_get_res.status_code = 404
        mock_get.return_value = mock_get_res

        ver_res = self.mcp.verify(req, exec_res)
        self.assertTrue(ver_res.verified)
        self.assertEqual(ver_res.state, VerificationState.VERIFIED_REVOKED)

    # --- 5. CONNECTOR REGISTRY ROUTING ---
    def test_registry_routing(self):
        gh = ConnectorRegistry.get_connector("GITHUB")
        self.assertIsInstance(gh, GitHubConnector)

        aws = ConnectorRegistry.get_connector("AWS_IAM")
        self.assertIsInstance(aws, AWSConnector)

        mcp = ConnectorRegistry.get_connector("MCP")
        self.assertIsInstance(mcp, MCPConnector)

        gen = ConnectorRegistry.get_connector("SOME_UNREGISTERED_PROVIDER")
        self.assertIsInstance(gen, GenericConnector)

if __name__ == "__main__":
    unittest.main()
