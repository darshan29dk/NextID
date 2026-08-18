-- Phase 4 Migrations for NextID / rAnalyzer IGA Platform
ALTER TABLE identities ADD COLUMN max_delegation_depth INT NULL;
ALTER TABLE identities ADD COLUMN org VARCHAR(150) NULL;
ALTER TABLE delegation_links ADD COLUMN origin_org VARCHAR(150) NULL;
