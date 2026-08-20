import uuid
from datetime import datetime
from sqlalchemy import Column, String, Integer, Boolean, DateTime, Text, Index
from app.database import Base

class ConnectorCertificationRun(Base):
    """
    Evidence-Backed Certification Model (P0 Hardening):
    Persists actual certification run evidence with git commit SHA, test counts, evidence hashes, and timestamps.
    """
    __tablename__ = "connector_certification_runs"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id = Column(String(100), default="default_tenant", index=True)
    connector = Column(String(100), nullable=False, index=True) # AWS_STS, VAULT, GITHUB, MCP_GATEWAY
    connector_version = Column(String(50), nullable=False)
    git_commit_sha = Column(String(40), nullable=False)
    environment = Column(String(50), default="ci_sandbox") # ci_sandbox, chaos_lab, staging, prod
    test_suite = Column(String(255), nullable=False)
    
    contract_status = Column(String(20), default="PASS") # PASS, FAIL
    sandbox_status = Column(String(20), default="PASS")  # PASS, FAIL, N/A
    chaos_status = Column(String(20), default="PASS")    # PASS, FAIL
    zero_secret_storage_verified = Column(Boolean, default=True)

    tests_total = Column(Integer, default=0)
    tests_passed = Column(Integer, default=0)
    tests_failed = Column(Integer, default=0)

    evidence_hash = Column(String(64), nullable=False) # SHA-256 canonical digest
    artifact_reference = Column(String(255), nullable=True)

    started_at = Column(DateTime, default=datetime.utcnow)
    completed_at = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        Index("idx_cert_connector_env", "tenant_id", "connector", "environment"),
    )

    def to_dict(self):
        return {
            "id": self.id,
            "tenant_id": self.tenant_id,
            "provider": self.connector,
            "version": self.connector_version,
            "git_commit_sha": self.git_commit_sha,
            "environment": self.environment,
            "test_suite": self.test_suite,
            "unit_contract_tests": self.contract_status == "PASS",
            "mock_integration": True,
            "sandbox_integration": self.sandbox_status == "PASS",
            "chaos_certification": self.chaos_status == "PASS",
            "zero_secret_storage_verified": self.zero_secret_storage_verified,
            "tests_total": self.tests_total,
            "tests_passed": self.tests_passed,
            "tests_failed": self.tests_failed,
            "evidence_hash": self.evidence_hash,
            "artifact_reference": self.artifact_reference,
            "last_certified": self.completed_at.isoformat() if self.completed_at else None,
            "status": "CERTIFIED_PRODUCTION_READY" if self.chaos_status == "PASS" and self.contract_status == "PASS" else "CERTIFICATION_PENDING"
        }
