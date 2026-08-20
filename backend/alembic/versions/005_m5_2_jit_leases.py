"""Create jit_leases table with security hardening and idempotency unique constraint

Revision ID: 005_m5_2_jit_leases
Revises: 004_m4_governance
Create Date: 2026-08-20 18:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '005_m5_2_jit_leases'
down_revision = '004_m4_governance'
branch_labels = None
depends_on = None

def upgrade():
    op.create_table(
        'jit_leases',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('lease_id', sa.String(length=100), nullable=False),
        sa.Column('tenant_id', sa.String(length=50), nullable=False, server_default='default_tenant'),
        sa.Column('principal_id', sa.String(length=100), nullable=False),
        sa.Column('provider_type', sa.String(length=50), nullable=False, server_default='AWS_STS'),
        sa.Column('provider_account_id', sa.String(length=100), nullable=True),
        sa.Column('resource', sa.String(length=255), nullable=False),
        sa.Column('policy_decision_id', sa.String(length=100), nullable=False, server_default='PD-M4-001'),
        sa.Column('policy_version', sa.String(length=50), nullable=False, server_default='v4.0-m4-governance'),
        sa.Column('requested_permissions_json', sa.Text(), nullable=False, server_default='[]'),
        sa.Column('effective_permissions_json', sa.Text(), nullable=False, server_default='[]'),
        sa.Column('permissions_granted_json', sa.Text(), nullable=True, server_default='[]'),
        sa.Column('provider_lease_reference', sa.String(length=255), nullable=True),
        sa.Column('aws_assumed_role_arn', sa.String(length=255), nullable=True),
        sa.Column('vault_lease_id', sa.String(length=255), nullable=True),
        sa.Column('secret_reference', sa.String(length=255), nullable=True),
        sa.Column('credential_fingerprint_sha256', sa.String(length=64), nullable=True),
        sa.Column('issued_at', sa.DateTime(), nullable=False),
        sa.Column('expires_at', sa.DateTime(), nullable=False),
        sa.Column('revoked_at', sa.DateTime(), nullable=True),
        sa.Column('status', sa.String(length=50), nullable=False, server_default='ACTIVE'),
        sa.Column('renewable', sa.Boolean(), nullable=False, server_default=sa.text('false')),
        sa.Column('renewal_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('max_renewals', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('trace_id', sa.String(length=100), nullable=True),
        sa.Column('idempotency_key', sa.String(length=64), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('lease_id'),
        sa.UniqueConstraint('tenant_id', 'idempotency_key', name='uq_jit_leases_tenant_idempotency')
    )
    op.create_index('ix_jit_leases_id', 'jit_leases', ['id'], unique=False)
    op.create_index('ix_jit_leases_lease_id', 'jit_leases', ['lease_id'], unique=True)
    op.create_index('ix_jit_leases_tenant_id', 'jit_leases', ['tenant_id'], unique=False)
    op.create_index('ix_jit_leases_principal_id', 'jit_leases', ['principal_id'], unique=False)
    op.create_index('ix_jit_leases_status', 'jit_leases', ['status'], unique=False)
    op.create_index('ix_jit_leases_idempotency_key', 'jit_leases', ['idempotency_key'], unique=False)

def downgrade():
    op.drop_table('jit_leases')
