import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database import SessionLocal
from app.models.identity import Identity
from app.services.runtime_auth import authorize_runtime_action
from app.services.jit_broker import issue_jit_credential
from app.services.kms_secret_manager import KMSSecretManagerService

class TestRuntimeAuthAndJIT(unittest.TestCase):

    def setUp(self):
        self.db = SessionLocal()
        self.ident = Identity(
            tenant_id="tenant_c",
            display_name="Test Runtime User",
            email="runtime.user@test.com",
            status="Active",
            authority_epoch=1,
            is_frozen=False
        )
        self.db.add(self.ident)
        self.db.commit()
        self.db.refresh(self.ident)

    def tearDown(self):
        self.db.query(Identity).filter(Identity.id == self.ident.id).delete()
        self.db.commit()
        self.db.close()

    def test_runtime_auth_and_kms_vault_reference(self):
        # 1. Test Runtime Auth (Active user -> Allow)
        res = authorize_runtime_action(self.db, "tenant_c", self.ident.id, "read", "dataset-prod")
        self.assertTrue(res["authorized"])

        # 2. Test KMS Secret Reference (Zero plaintext stored)
        kms_ref = KMSSecretManagerService.store_credential_reference("tenant_c", "API_KEY", "github-repo")
        self.assertTrue(kms_ref["vault_reference_uri"].startswith("vault://secret/data/tenant_c/"))
        self.assertEqual(len(kms_ref["credential_fingerprint_sha256"]), 64)

        # 3. Test JIT Credential Broker
        jit = issue_jit_credential("tenant_c", self.ident.id, "s3-bucket-logs", ttl_seconds=600)
        self.assertEqual(jit["identity_id"], self.ident.id)
        self.assertTrue(jit["renewable"])

if __name__ == "__main__":
    unittest.main()
