"""
Alembic Migration 009: Phase 7-12 IGA tables
- access_request_approval_steps (Phase 7)
- sod_conflict_checks (Phase 8)
- certification_campaigns (Phase 9)
- certification_items (Phase 9)
- break_glass_requests (Phase 10)
- birthright_policies (Phase 11)
- birthright_evaluations (Phase 11)
- account_correlation_records (Phase 12)

All tables:
- Scoped by tenant_id
- PostgreSQL RLS enabled with tenant isolation policy
- No runtime ALTER TABLE — Alembic only

Revision ID: 009_phase_7_to_12_iga
Revises: 008_jml_catalog_access_requests
"""

from alembic import op
import sqlalchemy as sa

revision = '009_phase_7_to_12_iga'
down_revision = '008_jml_catalog_access_requests'
branch_labels = None
depends_on = None

NEW_TABLES = [
    'access_request_approval_steps',
    'sod_conflict_checks',
    'certification_campaigns',
    'certification_items',
    'break_glass_requests',
    'birthright_policies',
    'birthright_evaluations',
    'account_correlation_records',
]


def upgrade():
    # Phase 7 — Approval Workflow Steps
    op.create_table(
        'access_request_approval_steps',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('tenant_id', sa.String(50), nullable=False, index=True),
        sa.Column('access_request_id', sa.String(36), nullable=False, index=True),
        sa.Column('step_order', sa.Integer(), nullable=False),
        sa.Column('approver_type', sa.String(50), nullable=False),
        sa.Column('approver_principal_id', sa.String(36), nullable=True, index=True),
        sa.Column('approver_role', sa.String(100), nullable=True),
        sa.Column('status', sa.String(30), nullable=False, server_default='PENDING', index=True),
        sa.Column('decision', sa.String(30), nullable=True),
        sa.Column('decision_reason', sa.Text(), nullable=True),
        sa.Column('decided_by_principal_id', sa.String(36), nullable=True),
        sa.Column('decided_at', sa.DateTime(), nullable=True),
        sa.Column('due_at', sa.DateTime(), nullable=True),
        sa.Column('timeout_hours', sa.Integer(), nullable=False, server_default='48'),
        sa.Column('escalated', sa.Boolean(), nullable=False, server_default=sa.text('false')),
        sa.Column('escalated_at', sa.DateTime(), nullable=True),
        sa.Column('policy_decision_id', sa.String(100), nullable=True),
        sa.Column('trace_id', sa.String(100), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
    )

    # Phase 8 — SoD Conflict Checks
    op.create_table(
        'sod_conflict_checks',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('tenant_id', sa.String(50), nullable=False, index=True),
        sa.Column('trigger_type', sa.String(50), nullable=False),
        sa.Column('trigger_id', sa.String(36), nullable=True, index=True),
        sa.Column('principal_id', sa.String(36), nullable=False, index=True),
        sa.Column('requested_entitlement_id', sa.String(36), nullable=True, index=True),
        sa.Column('requested_entitlement_name', sa.String(200), nullable=True),
        sa.Column('conflicting_entitlement_ids', sa.Text(), nullable=True),
        sa.Column('conflicting_policy_ids', sa.Text(), nullable=True),
        sa.Column('result', sa.String(30), nullable=False, index=True),
        sa.Column('risk_level', sa.String(20), nullable=True),
        sa.Column('exception_id', sa.String(36), nullable=True, index=True),
        sa.Column('exception_valid', sa.Boolean(), nullable=True),
        sa.Column('evaluated_at', sa.DateTime(), nullable=False),
        sa.Column('authority_epoch', sa.Integer(), nullable=True),
        sa.Column('policy_version', sa.Integer(), nullable=True),
        sa.Column('trace_id', sa.String(100), nullable=True),
    )

    # Phase 9 — Certification Campaigns
    op.create_table(
        'certification_campaigns',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('tenant_id', sa.String(50), nullable=False, index=True),
        sa.Column('name', sa.String(200), nullable=False),
        sa.Column('campaign_type', sa.String(50), nullable=False, index=True),
        sa.Column('scope', sa.Text(), nullable=True),
        sa.Column('created_by', sa.String(36), nullable=False),
        sa.Column('starts_at', sa.DateTime(), nullable=False),
        sa.Column('due_at', sa.DateTime(), nullable=False),
        sa.Column('completed_at', sa.DateTime(), nullable=True),
        sa.Column('status', sa.String(30), nullable=False, server_default='DRAFT', index=True),
        sa.Column('total_items', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('reviewed_items', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('revoked_items', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('kept_items', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
    )

    # Phase 9 — Certification Items
    op.create_table(
        'certification_items',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('tenant_id', sa.String(50), nullable=False, index=True),
        sa.Column('campaign_id', sa.String(36), nullable=False, index=True),
        sa.Column('principal_id', sa.String(36), nullable=False, index=True),
        sa.Column('account_id', sa.String(36), nullable=True, index=True),
        sa.Column('entitlement_id', sa.String(36), nullable=True, index=True),
        sa.Column('delegation_id', sa.String(36), nullable=True, index=True),
        sa.Column('credential_id', sa.String(36), nullable=True, index=True),
        sa.Column('reviewer_id', sa.String(36), nullable=False, index=True),
        sa.Column('decision', sa.String(30), nullable=True, index=True),
        sa.Column('decision_reason', sa.Text(), nullable=True),
        sa.Column('decided_at', sa.DateTime(), nullable=True),
        sa.Column('status', sa.String(30), nullable=False, server_default='PENDING', index=True),
        sa.Column('revocation_job_id', sa.String(36), nullable=True, index=True),
        sa.Column('provider_verified', sa.Boolean(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
    )

    # Phase 10 — Break Glass
    op.create_table(
        'break_glass_requests',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('tenant_id', sa.String(50), nullable=False, index=True),
        sa.Column('principal_id', sa.String(36), nullable=False, index=True),
        sa.Column('authenticated_with', sa.String(100), nullable=True),
        sa.Column('resource', sa.String(300), nullable=False),
        sa.Column('requested_permissions', sa.Text(), nullable=True),
        sa.Column('target_application_id', sa.String(36), nullable=True, index=True),
        sa.Column('reason', sa.Text(), nullable=False),
        sa.Column('incident_ticket', sa.String(100), nullable=True),
        sa.Column('requested_ttl_hours', sa.Integer(), nullable=False),
        sa.Column('max_ttl_hours', sa.Integer(), nullable=False, server_default='4'),
        sa.Column('approved_ttl_hours', sa.Integer(), nullable=True),
        sa.Column('status', sa.String(30), nullable=False, server_default='REQUESTED', index=True),
        sa.Column('approver_principal_id', sa.String(36), nullable=True, index=True),
        sa.Column('approved_at', sa.DateTime(), nullable=True),
        sa.Column('denied_reason', sa.Text(), nullable=True),
        sa.Column('checker_principal_id', sa.String(36), nullable=True, index=True),
        sa.Column('checker_approved_at', sa.DateTime(), nullable=True),
        sa.Column('requires_maker_checker', sa.Boolean(), nullable=False, server_default=sa.text('false')),
        sa.Column('jit_lease_id', sa.String(36), nullable=True, index=True),
        sa.Column('activated_at', sa.DateTime(), nullable=True),
        sa.Column('expires_at', sa.DateTime(), nullable=True),
        sa.Column('revoked_at', sa.DateTime(), nullable=True),
        sa.Column('provider_verified', sa.Boolean(), nullable=True),
        sa.Column('post_use_reviewed', sa.Boolean(), nullable=False, server_default=sa.text('false')),
        sa.Column('post_use_reviewer_id', sa.String(36), nullable=True),
        sa.Column('post_use_review_at', sa.DateTime(), nullable=True),
        sa.Column('post_use_findings', sa.Text(), nullable=True),
        sa.Column('authority_epoch', sa.Integer(), nullable=True),
        sa.Column('trace_id', sa.String(100), nullable=True),
        sa.Column('policy_decision_id', sa.String(100), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
    )

    # Phase 11 — Birthright Policies
    op.create_table(
        'birthright_policies',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('tenant_id', sa.String(50), nullable=False, index=True),
        sa.Column('name', sa.String(200), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('conditions', sa.Text(), nullable=False),
        sa.Column('entitlement_id', sa.String(36), nullable=False, index=True),
        sa.Column('entitlement_name', sa.String(200), nullable=True),
        sa.Column('version', sa.Integer(), nullable=False, server_default='1'),
        sa.Column('status', sa.String(30), nullable=False, server_default='DRAFT', index=True),
        sa.Column('effective_from', sa.DateTime(), nullable=True),
        sa.Column('effective_to', sa.DateTime(), nullable=True),
        sa.Column('created_by', sa.String(36), nullable=False),
        sa.Column('approved_by', sa.String(36), nullable=True),
        sa.Column('approved_at', sa.DateTime(), nullable=True),
        sa.Column('policy_hash', sa.String(64), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
    )

    # Phase 11 — Birthright Evaluations
    op.create_table(
        'birthright_evaluations',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('tenant_id', sa.String(50), nullable=False, index=True),
        sa.Column('principal_id', sa.String(36), nullable=False, index=True),
        sa.Column('trigger_type', sa.String(20), nullable=False),
        sa.Column('trigger_event_id', sa.String(36), nullable=True),
        sa.Column('evaluated_attributes', sa.Text(), nullable=True),
        sa.Column('matched_policy_ids', sa.Text(), nullable=True),
        sa.Column('granted_entitlement_ids', sa.Text(), nullable=True),
        sa.Column('removed_entitlement_ids', sa.Text(), nullable=True),
        sa.Column('authority_epoch', sa.Integer(), nullable=True),
        sa.Column('evaluated_at', sa.DateTime(), nullable=False),
        sa.Column('trace_id', sa.String(100), nullable=True),
    )

    # Phase 12 — Account Correlation Records
    op.create_table(
        'account_correlation_records',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('tenant_id', sa.String(50), nullable=False, index=True),
        sa.Column('external_account_id', sa.String(200), nullable=False, index=True),
        sa.Column('external_system', sa.String(100), nullable=False, index=True),
        sa.Column('username', sa.String(200), nullable=True, index=True),
        sa.Column('matched_principal_id', sa.String(36), nullable=True, index=True),
        sa.Column('candidate_principal_ids', sa.Text(), nullable=True),
        sa.Column('status', sa.String(30), nullable=False, server_default='UNMATCHED', index=True),
        sa.Column('correlation_evidence', sa.Text(), nullable=True),
        sa.Column('rule_confidence', sa.Float(), nullable=True),
        sa.Column('confidence_explanation', sa.Text(), nullable=True),
        sa.Column('risk_level', sa.String(20), nullable=True),
        sa.Column('requires_manual_review', sa.Boolean(), nullable=False, server_default=sa.text('false')),
        sa.Column('reviewed_by', sa.String(36), nullable=True),
        sa.Column('reviewed_at', sa.DateTime(), nullable=True),
        sa.Column('review_decision', sa.String(30), nullable=True),
        sa.Column('authority_epoch', sa.Integer(), nullable=True),
        sa.Column('trace_id', sa.String(100), nullable=True),
        sa.Column('correlation_rule_version', sa.String(20), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
    )

    # Enable PostgreSQL RLS on all new tenant-scoped tables
    bind = op.get_bind()
    if bind.dialect.name == 'postgresql':
        for table in NEW_TABLES:
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
        for table in reversed(NEW_TABLES):
            op.execute(f"DROP POLICY IF EXISTS tenant_isolation_{table} ON {table};")
            op.execute(f"ALTER TABLE {table} DISABLE ROW LEVEL SECURITY;")

    for table in reversed(NEW_TABLES):
        op.drop_table(table)
