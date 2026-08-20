import os
import sys
from sqlalchemy import text

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.database import engine, Base
from app.models.outbox import OutboxEvent
from app.models.inbox import InboxMessage
from app.models.revocation_dlq import RevocationDLQ
from app.models.delegation_policy import DelegationPolicy
from app.models.principal import Principal
from app.models.trust_contract import TrustContract
from app.models.cascade_snapshot import CascadeSnapshot
from app.models.attempt_history import RevocationJobAttempt
from app.models.poison_message import PoisonMessage
from app.models.provider_credential import ProviderCredential

def migrate_database():
    print("[MIGRATION] Creating any missing tables...")
    Base.metadata.create_all(bind=engine)

    print("[MIGRATION] Adding missing columns to existing tables...")
    migrations = [
        "ALTER TABLE identities ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(50) DEFAULT 'default_tenant';",
        "ALTER TABLE identities ADD COLUMN IF NOT EXISTS authority_epoch INT DEFAULT 1;",
        "ALTER TABLE identities ADD COLUMN IF NOT EXISTS is_frozen BOOLEAN DEFAULT FALSE;",
        
        "ALTER TABLE delegation_links ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(50) DEFAULT 'default_tenant';",
        "ALTER TABLE delegation_links ADD COLUMN IF NOT EXISTS authority_epoch INT DEFAULT 1;",
        "ALTER TABLE delegation_links ADD COLUMN IF NOT EXISTS is_frozen BOOLEAN DEFAULT FALSE;",
        "ALTER TABLE delegation_links ADD COLUMN IF NOT EXISTS can_redelegate BOOLEAN DEFAULT TRUE;",
        "ALTER TABLE delegation_links ADD COLUMN IF NOT EXISTS max_depth INT DEFAULT 5;",
        
        "ALTER TABLE revocation_events ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(50) DEFAULT 'default_tenant';",
        "ALTER TABLE revocation_events ADD COLUMN IF NOT EXISTS propagation_lag_ms FLOAT;",
        "ALTER TABLE revocation_events ADD COLUMN IF NOT EXISTS automated_ttfr_ms FLOAT;",
        "ALTER TABLE revocation_events ADD COLUMN IF NOT EXISTS manually_resolved_time_ms FLOAT;",
        "ALTER TABLE revocation_events ADD COLUMN IF NOT EXISTS incomplete_revocation_count INT DEFAULT 0;",
        "ALTER TABLE revocation_events ADD COLUMN IF NOT EXISTS unconfirmed_target_ids TEXT;",
        "ALTER TABLE revocation_events ADD COLUMN IF NOT EXISTS graph_snapshot_id VARCHAR(36);",
        "ALTER TABLE revocation_events ADD COLUMN IF NOT EXISTS graph_diff_json TEXT;",
        "ALTER TABLE revocation_events ADD COLUMN IF NOT EXISTS policy_version_id VARCHAR(36);",
        
        "ALTER TABLE revocation_jobs ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(50) DEFAULT 'default_tenant';",
        "ALTER TABLE revocation_jobs ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(128);",
        "ALTER TABLE revocation_jobs ADD COLUMN IF NOT EXISTS fencing_token VARCHAR(100);",
        "ALTER TABLE revocation_jobs ADD COLUMN IF NOT EXISTS fencing_token_seq INT DEFAULT 0;",
        "ALTER TABLE revocation_jobs ADD COLUMN IF NOT EXISTS lease_expires_at TIMESTAMP;",
        "ALTER TABLE revocation_jobs ADD COLUMN IF NOT EXISTS execution_group INT DEFAULT 1;",
        "ALTER TABLE revocation_jobs ADD COLUMN IF NOT EXISTS priority INT DEFAULT 10;",
        "ALTER TABLE revocation_jobs ADD COLUMN IF NOT EXISTS verification_evidence TEXT;",
        "ALTER TABLE revocation_jobs ADD COLUMN IF NOT EXISTS target_class VARCHAR(30) DEFAULT 'MANDATORY';",
        
        "ALTER TABLE cascade_actions ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(50) DEFAULT 'default_tenant';",
        "ALTER TABLE cascade_actions ADD COLUMN IF NOT EXISTS target_class VARCHAR(30) DEFAULT 'MANDATORY';",
        "ALTER TABLE cascade_actions ADD COLUMN IF NOT EXISTS depends_on_action_id INT;",
        "ALTER TABLE cascade_actions ADD COLUMN IF NOT EXISTS execution_group INT DEFAULT 1;",
        "ALTER TABLE cascade_actions ADD COLUMN IF NOT EXISTS priority INT DEFAULT 10;",

        "ALTER TABLE outbox_events ADD COLUMN IF NOT EXISTS claimed_by VARCHAR(100);",
        "ALTER TABLE outbox_events ADD COLUMN IF NOT EXISTS lease_expires_at TIMESTAMP;",

        "ALTER TABLE inbox_messages ADD COLUMN IF NOT EXISTS lease_expires_at TIMESTAMP;",

        "ALTER TABLE provider_credentials ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(50) DEFAULT 'default_tenant';",
        "ALTER TABLE provider_credentials ADD COLUMN IF NOT EXISTS provider VARCHAR(50);",
        "ALTER TABLE provider_credentials ADD COLUMN IF NOT EXISTS credential_name VARCHAR(150);",
        "ALTER TABLE provider_credentials ADD COLUMN IF NOT EXISTS credential_type VARCHAR(50) DEFAULT 'API_KEY';",
        "ALTER TABLE provider_credentials ADD COLUMN IF NOT EXISTS target_resource VARCHAR(200) DEFAULT 'global';",
        "ALTER TABLE provider_credentials ADD COLUMN IF NOT EXISTS vault_reference_uri VARCHAR(250);",
        "ALTER TABLE provider_credentials ADD COLUMN IF NOT EXISTS credential_fingerprint_sha256 VARCHAR(64);",
        "ALTER TABLE provider_credentials ADD COLUMN IF NOT EXISTS status VARCHAR(30) DEFAULT 'ACTIVE';",
        "ALTER TABLE provider_credentials ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP;",

        "ALTER TABLE revocation_job_attempts ADD COLUMN IF NOT EXISTS provider VARCHAR(50);",
        "ALTER TABLE revocation_job_attempts ADD COLUMN IF NOT EXISTS operation VARCHAR(50);",
        "ALTER TABLE revocation_job_attempts ADD COLUMN IF NOT EXISTS http_status INT;",
        "ALTER TABLE revocation_job_attempts ADD COLUMN IF NOT EXISTS error_code VARCHAR(50);",
        "ALTER TABLE revocation_job_attempts ADD COLUMN IF NOT EXISTS started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;",
        "ALTER TABLE revocation_job_attempts ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP;",

        "ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(50) DEFAULT 'default_tenant';",
        "ALTER TABLE notifications ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(50) DEFAULT 'default_tenant';"
    ]

    for stmt in migrations:
        with engine.begin() as conn:
            try:
                conn.execute(text(stmt))
            except Exception as e:
                print(f"[MIGRATION WARNING] {stmt} -> {e}")

    print("[MIGRATION] Migration complete! All columns and tables are up to date.")

if __name__ == "__main__":
    migrate_database()
