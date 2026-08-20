"""
Alembic Migration 007: Enable Row Level Security (RLS) on Tenant Tables.
Revision ID: 007_enable_row_level_security
Revises: 006_temporal_lineage_provenance
Create Date: 2026-08-20
"""

from alembic import op
import sqlalchemy as sa

revision = '007_enable_row_level_security'
down_revision = '006_temporal_lineage_provenance'
branch_labels = None
depends_on = None

TENANT_TABLES = [
    'jit_leases',
    'connector_certification_runs',
    'credential_lineage_nodes',
    'revocation_jobs',
    'revocation_events',
    'delegation_links',
    'identities'
]

def upgrade():
    bind = op.get_bind()
    # Apply PostgreSQL RLS only if running on PostgreSQL database engine
    if bind.dialect.name == 'postgresql':
        for table in TENANT_TABLES:
            op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY;")
            op.execute(f"DROP POLICY IF EXISTS tenant_isolation_{table} ON {table};")
            op.execute(
                f"""
                CREATE POLICY tenant_isolation_{table} ON {table}
                FOR ALL
                USING (
                    tenant_id = current_setting('app.current_tenant', true)
                    OR current_setting('app.current_tenant', true) IS NULL
                    OR current_setting('app.current_tenant', true) = ''
                );
                """
            )

def downgrade():
    bind = op.get_bind()
    if bind.dialect.name == 'postgresql':
        for table in TENANT_TABLES:
            op.execute(f"DROP POLICY IF EXISTS tenant_isolation_{table} ON {table};")
            op.execute(f"ALTER TABLE {table} DISABLE ROW LEVEL SECURITY;")
