import os
import unittest
from sqlalchemy import text
from app.database import engine

class TestRowLevelSecurity(unittest.TestCase):

    def test_rls_migration_definitions(self):
        migration_path = os.path.join(os.path.dirname(__file__), "..", "alembic", "versions", "007_enable_row_level_security.py")
        self.assertTrue(os.path.exists(migration_path))
        with open(migration_path, "r", encoding="utf-8") as f:
            content = f.read()
        self.assertIn("jit_leases", content)
        self.assertIn("connector_certification_runs", content)
        self.assertIn("credential_lineage_nodes", content)
        self.assertIn("ENABLE ROW LEVEL SECURITY", content)

    def test_postgresql_rls_policy_syntax(self):
        if engine.dialect.name == "postgresql":
            with engine.connect() as conn:
                res = conn.execute(
                    text("SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public' AND tablename IN ('jit_leases', 'connector_certification_runs', 'credential_lineage_nodes');")
                ).fetchall()
                for row in res:
                    self.assertTrue(row[1], f"RLS should be enabled for table {row[0]}")

if __name__ == "__main__":
    unittest.main()
