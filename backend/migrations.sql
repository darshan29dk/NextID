-- Phase 4 Migrations for NextID / rAnalyzer IGA Platform
ALTER TABLE identities ADD COLUMN max_delegation_depth INT NULL;
ALTER TABLE identities ADD COLUMN org VARCHAR(150) NULL;
ALTER TABLE delegation_links ADD COLUMN origin_org VARCHAR(150) NULL;
ALTER TABLE audit_logs ADD COLUMN record_hash VARCHAR(128) NULL;
ALTER TABLE cascade_actions ADD COLUMN action_type VARCHAR(50) NULL;
ALTER TABLE cascade_actions ADD COLUMN hop_depth INT NULL;
