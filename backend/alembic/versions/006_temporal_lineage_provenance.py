"""
Alembic Migration 006: Temporal Authority Graph and Credential Lineage.
Revision ID: 006_temporal_lineage_provenance
Revises: 005_m5_2_jit_leases
Create Date: 2026-08-20
"""

from alembic import op
import sqlalchemy as sa

revision = '006_temporal_lineage_provenance'
down_revision = '005_m5_2_jit_leases'
branch_labels = None
depends_on = None

def upgrade():
    op.create_table(
        'credential_lineage_nodes',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('tenant_id', sa.String(length=50), nullable=False),
        sa.Column('credential_id', sa.String(length=100), nullable=False),
        sa.Column('parent_credential_id', sa.String(length=100), nullable=True),
        sa.Column('issuer_principal_id', sa.String(length=100), nullable=False),
        sa.Column('holder_principal_id', sa.String(length=100), nullable=False),
        sa.Column('provider', sa.String(length=50), nullable=False),
        sa.Column('provider_reference', sa.String(length=255), nullable=True),
        sa.Column('credential_type', sa.String(length=50), nullable=False),
        sa.Column('scope', sa.String(length=255), nullable=True),
        sa.Column('resource', sa.String(length=255), nullable=False),
        sa.Column('issued_at', sa.DateTime(), nullable=False),
        sa.Column('expires_at', sa.DateTime(), nullable=False),
        sa.Column('revoked_at', sa.DateTime(), nullable=True),
        sa.Column('authority_epoch', sa.Integer(), nullable=False),
        sa.Column('policy_decision_id', sa.String(length=100), nullable=False),
        sa.Column('credential_fingerprint_sha256', sa.String(length=64), nullable=False),
        sa.Column('status', sa.String(length=30), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('credential_id')
    )
    op.create_index('idx_cred_lineage_tenant_holder', 'credential_lineage_nodes', ['tenant_id', 'holder_principal_id'])
    op.create_index('idx_cred_lineage_parent', 'credential_lineage_nodes', ['tenant_id', 'parent_credential_id'])

def downgrade():
    op.drop_table('credential_lineage_nodes')
