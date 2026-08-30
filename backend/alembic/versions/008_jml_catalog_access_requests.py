"""
Alembic Migration 008: Create JML, Account, Entitlement, Access Catalog, and Access Request Tables.
Revision ID: 008_jml_catalog_access_requests
Revises: 007_enable_row_level_security
Create Date: 2026-08-20
"""

from alembic import op
import sqlalchemy as sa

revision = '008_jml_catalog_access_requests'
down_revision = '007_enable_row_level_security'
branch_labels = None
depends_on = None

NEW_TENANT_TABLES = [
    'accounts',
    'entitlements',
    'account_entitlements',
    'lifecycle_events',
    'catalog_items',
    'access_requests'
]

def upgrade():
    op.create_table(
        'accounts',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('tenant_id', sa.String(50), nullable=False, index=True),
        sa.Column('principal_id', sa.String(36), sa.ForeignKey('principals.id', ondelete='CASCADE'), nullable=True, index=True),
        sa.Column('application_id', sa.String(36), nullable=True, index=True),
        sa.Column('external_account_id', sa.String(200), nullable=False, index=True),
        sa.Column('username', sa.String(200), nullable=False, index=True),
        sa.Column('status', sa.String(50), nullable=False, server_default='ACTIVE'),
        sa.Column('account_type', sa.String(50), nullable=False, server_default='HUMAN'),
        sa.Column('raw_attributes', sa.JSON(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('disabled_at', sa.DateTime(), nullable=True),
        sa.Column('last_seen_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=False)
    )

    op.create_table(
        'entitlements',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('tenant_id', sa.String(50), nullable=False, index=True),
        sa.Column('application_id', sa.String(36), nullable=True, index=True),
        sa.Column('external_entitlement_id', sa.String(200), nullable=True, index=True),
        sa.Column('name', sa.String(200), nullable=False, index=True),
        sa.Column('type', sa.String(50), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('owner_principal_id', sa.String(36), nullable=True, index=True),
        sa.Column('risk_level', sa.String(50), nullable=False, server_default='LOW'),
        sa.Column('privileged', sa.Boolean(), nullable=False, server_default=sa.text('false')),
        sa.Column('requestable', sa.Boolean(), nullable=False, server_default=sa.text('true')),
        sa.Column('birthright_eligible', sa.Boolean(), nullable=False, server_default=sa.text('false')),
        sa.Column('expires_allowed', sa.Boolean(), nullable=False, server_default=sa.text('true')),
        sa.Column('status', sa.String(50), nullable=False, server_default='ACTIVE'),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False)
    )

    op.create_table(
        'account_entitlements',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('tenant_id', sa.String(50), nullable=False, index=True),
        sa.Column('account_id', sa.String(36), sa.ForeignKey('accounts.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('entitlement_id', sa.String(36), sa.ForeignKey('entitlements.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('source', sa.String(50), nullable=False),
        sa.Column('valid_from', sa.DateTime(), nullable=False),
        sa.Column('valid_until', sa.DateTime(), nullable=True),
        sa.Column('granted_by', sa.String(200), nullable=True),
        sa.Column('policy_decision_id', sa.String(100), nullable=True),
        sa.Column('status', sa.String(50), nullable=False, server_default='ACTIVE'),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False)
    )

    op.create_table(
        'lifecycle_events',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('tenant_id', sa.String(50), nullable=False, index=True),
        sa.Column('principal_id', sa.String(36), nullable=False, index=True),
        sa.Column('event_type', sa.String(50), nullable=False, index=True),
        sa.Column('source', sa.String(100), nullable=False, server_default='HRMS'),
        sa.Column('external_event_id', sa.String(200), nullable=True, index=True),
        sa.Column('effective_at', sa.DateTime(), nullable=False),
        sa.Column('payload_hash', sa.String(64), nullable=True),
        sa.Column('payload', sa.JSON(), nullable=True),
        sa.Column('status', sa.String(50), nullable=False, server_default='PROCESSED'),
        sa.Column('error_details', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False)
    )

    op.create_table(
        'catalog_items',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('tenant_id', sa.String(50), nullable=False, index=True),
        sa.Column('application_id', sa.String(36), nullable=True, index=True),
        sa.Column('entitlement_id', sa.String(36), nullable=True, index=True),
        sa.Column('name', sa.String(200), nullable=False, index=True),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('risk_level', sa.String(50), nullable=False, server_default='LOW'),
        sa.Column('requestable', sa.Boolean(), nullable=False, server_default=sa.text('true')),
        sa.Column('approval_policy_id', sa.String(100), nullable=True),
        sa.Column('sod_policy_id', sa.String(100), nullable=True),
        sa.Column('default_ttl_hours', sa.Integer(), nullable=False, server_default='24'),
        sa.Column('max_ttl_hours', sa.Integer(), nullable=False, server_default='720'),
        sa.Column('requires_business_justification', sa.Boolean(), nullable=False, server_default=sa.text('true')),
        sa.Column('owner_principal_id', sa.String(36), nullable=True, index=True),
        sa.Column('status', sa.String(50), nullable=False, server_default='ACTIVE'),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False)
    )

    op.create_table(
        'access_requests',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('tenant_id', sa.String(50), nullable=False, index=True),
        sa.Column('requester_principal_id', sa.String(36), nullable=False, index=True),
        sa.Column('target_principal_id', sa.String(36), nullable=False, index=True),
        sa.Column('catalog_item_id', sa.String(36), nullable=False, index=True),
        sa.Column('requested_entitlement_id', sa.String(36), nullable=True, index=True),
        sa.Column('business_justification', sa.Text(), nullable=True),
        sa.Column('requested_ttl_hours', sa.Integer(), nullable=False, server_default='24'),
        sa.Column('status', sa.String(50), nullable=False, server_default='SUBMITTED', index=True),
        sa.Column('policy_decision_id', sa.String(100), nullable=True),
        sa.Column('error_message', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False)
    )

    bind = op.get_bind()
    if bind.dialect.name == 'postgresql':
        for table in NEW_TENANT_TABLES:
            op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY;")
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
        for table in reversed(NEW_TENANT_TABLES):
            op.execute(f"DROP POLICY IF EXISTS tenant_isolation_{table} ON {table};")
            op.execute(f"ALTER TABLE {table} DISABLE ROW LEVEL SECURITY;")

    for table in reversed(NEW_TENANT_TABLES):
        op.drop_table(table)
