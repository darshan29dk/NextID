-- Phase 4 Migrations for NextID / rAnalyzer IGA Platform
ALTER TABLE identities ADD COLUMN max_delegation_depth INT NULL;
ALTER TABLE identities ADD COLUMN org VARCHAR(150) NULL;
ALTER TABLE delegation_links ADD COLUMN origin_org VARCHAR(150) NULL;
ALTER TABLE audit_logs ADD COLUMN record_hash VARCHAR(128) NULL;
ALTER TABLE cascade_actions ADD COLUMN action_type VARCHAR(50) NULL;
ALTER TABLE cascade_actions ADD COLUMN hop_depth INT NULL;
ALTER TABLE cascade_actions ADD COLUMN revocation_job_id VARCHAR(36) NULL;

CREATE TABLE IF NOT EXISTS provider_credentials (
    id INT AUTO_INCREMENT PRIMARY KEY,
    provider VARCHAR(50) NOT NULL,
    credential_name VARCHAR(150) NOT NULL UNIQUE,
    encrypted_secret TEXT NOT NULL,
    config JSON NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'Active',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    created_by VARCHAR(100) NOT NULL DEFAULT 'System',
    modified_by VARCHAR(100) NOT NULL DEFAULT 'System'
);
