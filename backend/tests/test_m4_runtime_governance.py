import unittest
from fastapi.testclient import TestClient
from app.main import app
from app.services.runtime_auth import authorize_runtime_action, combine_governance_decisions

client = TestClient(app)

class TestM4RuntimeGovernance(unittest.TestCase):
    """
    Milestone M4 Comprehensive Governance Test Suite:
    Validates all edge cases:
    - Privilege expansion rejection & scope truncation fallback
    - Delegation depth caps & sub-delegation restrictions
    - Frozen/Revoking/Revoked principal override to DENY
    - Cross-org TrustContract validation (missing, active, expired, approval required)
    - Monotonic authority epoch freshness & task/purpose validation
    - Centrally enforced decision precedence hierarchy
    - REST API evaluation schema validation
    """

    def test_parent_read_child_read_write_denied(self):
        """Parent has [READ], Child requests [READ, WRITE] -> DENY."""
        res = authorize_runtime_action(
            db=None,
            tenant_id="tenant-m4",
            principal_id="agent-01",
            action="DELEGATE",
            resource="DOCUMENTS",
            parent_permissions=["READ"],
            requested_permissions=["READ", "WRITE"],
            allow_scope_reduction=False
        )
        self.assertEqual(res["decision"], "DENY")
        self.assertFalse(res["authorized"])
        self.assertEqual(res["reason_code"], "PRIVILEGE_AMPLIFICATION_DENIED")
        self.assertIn("WRITE", res["dropped_permissions"])
        self.assertEqual(res["effective_permissions"], [])

    def test_parent_read_child_read_write_scope_reduction(self):
        """Parent has [READ], Child requests [READ, WRITE], scope reduction enabled -> ALLOW_REDUCED_SCOPE."""
        res = authorize_runtime_action(
            db=None,
            tenant_id="tenant-m4",
            principal_id="agent-02",
            action="DELEGATE",
            resource="DOCUMENTS",
            parent_permissions=["READ"],
            requested_permissions=["READ", "WRITE"],
            allow_scope_reduction=True
        )
        self.assertEqual(res["decision"], "ALLOW_REDUCED_SCOPE")
        self.assertTrue(res["authorized"])
        self.assertEqual(res["reason_code"], "SCOPE_TRUNCATED_TO_PARENT")
        self.assertEqual(res["effective_permissions"], ["READ"])
        self.assertEqual(res["dropped_permissions"], ["WRITE"])

    def test_delegation_depth_equals_max_depth_denied(self):
        """delegation_depth == max_depth -> DENY."""
        res = authorize_runtime_action(
            db=None,
            tenant_id="tenant-m4",
            principal_id="agent-03",
            action="DELEGATE",
            resource="DB",
            delegation_depth=2,
            max_depth=2
        )
        self.assertEqual(res["decision"], "DENY")
        self.assertFalse(res["authorized"])
        self.assertEqual(res["reason_code"], "MAX_DELEGATION_DEPTH_EXCEEDED")

    def test_can_redelegate_false_denied(self):
        """parent can_redelegate=False at depth > 0 -> DENY."""
        res = authorize_runtime_action(
            db=None,
            tenant_id="tenant-m4",
            principal_id="agent-04",
            action="DELEGATE",
            resource="K8S",
            delegation_depth=1,
            max_depth=5,
            can_redelegate=False
        )
        self.assertEqual(res["decision"], "DENY")
        self.assertFalse(res["authorized"])
        self.assertEqual(res["reason_code"], "REDELEGATION_PROHIBITED")

    def test_frozen_revoking_revoked_always_denied(self):
        """Principal FROZEN, REVOKING, or REVOKED -> always DENY regardless of policy."""
        for status in ["FROZEN", "REVOKING", "REVOKED"]:
            res = authorize_runtime_action(
                db=None,
                tenant_id="tenant-m4",
                principal_id="agent-05",
                action="EXECUTE",
                resource="API",
                context={"status": status}
            )
            self.assertEqual(res["decision"], "DENY")
            self.assertFalse(res["authorized"])
            self.assertEqual(res["reason_code"], "PRINCIPAL_FROZEN_OR_REVOKED")

    def test_cross_org_missing_trust_contract_denied(self):
        """Cross-org request without valid TrustContract -> DENY."""
        res = authorize_runtime_action(
            db=None,
            tenant_id="org-a",
            principal_id="agent-06",
            action="DELEGATE",
            resource="EXTERNAL_API",
            cross_org=True,
            context={"target_tenant_id": "org-b", "trust_contract_valid": False}
        )
        self.assertEqual(res["decision"], "DENY")
        self.assertFalse(res["authorized"])
        self.assertEqual(res["reason_code"], "MISSING_TRUST_CONTRACT")

    def test_cross_org_valid_contract_requires_approval(self):
        """Cross-org request with valid TrustContract requiring approval -> REQUIRE_APPROVAL."""
        res = authorize_runtime_action(
            db=None,
            tenant_id="org-a",
            principal_id="agent-07",
            action="DELEGATE",
            resource="EXTERNAL_API",
            cross_org=True,
            context={"target_tenant_id": "org-b", "trust_contract_valid": True, "trust_contract_requires_approval": True}
        )
        self.assertEqual(res["decision"], "REQUIRE_APPROVAL")
        self.assertFalse(res["authorized"])
        self.assertEqual(res["reason_code"], "CROSS_ORG_APPROVAL_REQUIRED")
        self.assertTrue(res["requires_approval"])

    def test_expired_trust_contract_denied(self):
        """Expired TrustContract -> DENY."""
        res = authorize_runtime_action(
            db=None,
            tenant_id="org-a",
            principal_id="agent-08",
            action="DELEGATE",
            resource="EXTERNAL_API",
            cross_org=True,
            context={"target_tenant_id": "org-b", "trust_contract_expired": True}
        )
        self.assertEqual(res["decision"], "DENY")
        self.assertFalse(res["authorized"])
        self.assertEqual(res["reason_code"], "TRUST_CONTRACT_EXPIRED")

    def test_stale_authority_epoch_denied(self):
        """Requested epoch < current authority epoch -> DENY."""
        res = authorize_runtime_action(
            db=None,
            tenant_id="tenant-m4",
            principal_id="agent-09",
            action="EXECUTE",
            resource="DATABASE",
            context={"authority_epoch": 5, "requested_authority_epoch": 2}
        )
        self.assertEqual(res["decision"], "DENY")
        self.assertFalse(res["authorized"])
        self.assertEqual(res["reason_code"], "STALE_AUTHORITY_EPOCH")

    def test_missing_task_purpose_denied(self):
        """Missing required task/purpose -> DENY."""
        res = authorize_runtime_action(
            db=None,
            tenant_id="tenant-m4",
            principal_id="agent-10",
            action="EXECUTE",
            resource="SENSITIVE_RECORDS",
            task_purpose="",
            context={"require_task_purpose": True}
        )
        self.assertEqual(res["decision"], "DENY")
        self.assertFalse(res["authorized"])
        self.assertEqual(res["reason_code"], "MISSING_TASK_PURPOSE")

    def test_centralized_precedence_hierarchy(self):
        """Central decision combination must enforce DENY > REQUIRE_APPROVAL > ALLOW_REDUCED_SCOPE > ALLOW."""
        decisions = [
            {"decision": "ALLOW", "reason_code": "PERMITTED"},
            {"decision": "ALLOW_REDUCED_SCOPE", "reason_code": "SCOPE_TRUNCATED"},
            {"decision": "REQUIRE_APPROVAL", "reason_code": "APPROVAL_REQ"},
            {"decision": "DENY", "reason_code": "FROZEN"}
        ]
        comb = combine_governance_decisions(decisions)
        self.assertEqual(comb["decision"], "DENY")

    def test_api_endpoint_evaluate_complete_schema(self):
        """Integration test for POST /api/v1/runtime-auth/evaluate returning standard audit schema."""
        payload = {
            "tenant_id": "tenant-m4-api",
            "principal_id": 1,
            "action": "DELEGATE",
            "resource": "AWS_ROLE",
            "parent_permissions": ["READ"],
            "requested_permissions": ["READ", "EXECUTE"],
            "allow_scope_reduction": True
        }
        response = client.post("/api/v1/runtime-auth/evaluate", json=payload)
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["decision"], "ALLOW_REDUCED_SCOPE")
        self.assertEqual(data["reason_code"], "SCOPE_TRUNCATED_TO_PARENT")
        self.assertEqual(data["effective_permissions"], ["READ"])
        self.assertEqual(data["dropped_permissions"], ["EXECUTE"])
        self.assertIn("trace_id", data)
        self.assertIn("evaluated_at", data)
        self.assertIn("policy_version", data)

if __name__ == "__main__":
    unittest.main()
