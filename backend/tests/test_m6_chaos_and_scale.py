import sys
import os
import unittest
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app.main import app
from app.connectors.aws_sts import AWSSTSConnector
from app.connectors.vault import VaultConnector
from app.services.chaos_engine import ChaosEngine, ChaosFaultException, get_chaos_engine
from app.services.metrics_engine import calculate_ttfr_percentiles, get_system_health_metrics
from app.services.scale_simulator import generate_scale_benchmark, run_concurrent_cascades

client = TestClient(app)

class TestM6ChaosAndScale(unittest.TestCase):
    """
    Milestone M6 Chaos, Scale & Enterprise Certification Test Suite:
    - Environment-Gated Provider Modes (NEXTID_PROVIDER_MODE=real|mock)
    - Chaos Fault Injection (Worker Crashes, 429 Throttling, Stale Fencing, DB Timeouts)
    - TTFR Percentile Calculation (p50 / p95 / p99)
    - 10,000 Principal & 100,000 Edge Scale Benchmarks
    - Certification Matrix REST API Verification
    """

    def test_env_gated_provider_mode_real_fails_without_creds(self):
        """In NEXTID_PROVIDER_MODE='real', missing AWS/Vault credentials raise RuntimeError."""
        with patch.dict(os.environ, {"NEXTID_PROVIDER_MODE": "real", "AWS_ACCESS_KEY_ID": "", "AWS_ROLE_ARN": ""}):
            with self.assertRaises(RuntimeError) as ctx:
                AWSSTSConnector()
            self.assertIn("NEXTID_PROVIDER_MODE='real' is configured", str(ctx.exception))

    def test_env_gated_vault_provider_mode_real_fails(self):
        """In NEXTID_PROVIDER_MODE='real', missing VAULT_TOKEN raises RuntimeError."""
        with patch.dict(os.environ, {"NEXTID_PROVIDER_MODE": "real", "VAULT_TOKEN": ""}):
            with self.assertRaises(RuntimeError) as ctx:
                VaultConnector(vault_token="")
            self.assertIn("VAULT_TOKEN environment variable is missing", str(ctx.exception))

    def test_chaos_engine_worker_crash_injection(self):
        """ChaosEngine injects WORKER_CRASH exception when fault simulation is active."""
        engine = ChaosEngine(failure_rate=1.0)
        with patch.dict(os.environ, {"NEXTID_CHAOS_ENABLED": "true"}):
            with self.assertRaises(ChaosFaultException) as ctx:
                engine.inject_fault_if_enabled("WORKER_CRASH", "RevocationWorker-01")
            self.assertIn("Worker process died unexpectedly", str(ctx.exception))

    def test_chaos_engine_provider_429_throttle_injection(self):
        """ChaosEngine injects PROVIDER_429_THROTTLE exception."""
        engine = ChaosEngine(failure_rate=1.0)
        with patch.dict(os.environ, {"NEXTID_CHAOS_ENABLED": "true"}):
            with self.assertRaises(ChaosFaultException) as ctx:
                engine.inject_fault_if_enabled("PROVIDER_429_THROTTLE", "AWS STS API")
            self.assertIn("Provider rate limit exceeded", str(ctx.exception))

    def test_ttfr_percentiles_calculation(self):
        """TTFR Percentiles calculation returns p50, p95, and p99 values."""
        ttfr = calculate_ttfr_percentiles(db=None, tenant_id="tenant-m6-test")
        self.assertIn("ttfr_p50_seconds", ttfr)
        self.assertIn("ttfr_p95_seconds", ttfr)
        self.assertIn("ttfr_p99_seconds", ttfr)
        self.assertTrue(ttfr["ttfr_p50_seconds"] <= ttfr["ttfr_p95_seconds"])

    def test_scale_benchmark_10k_principals(self):
        """Generates 10,000 principal & 100,000 edge graph benchmark."""
        bench = generate_scale_benchmark(principal_count=10000, edge_count=100000)
        self.assertEqual(bench["principal_count"], 10000)
        self.assertEqual(bench["edge_count"], 100000)
        self.assertEqual(bench["status"], "READY_FOR_BENCHMARK")

    def test_concurrent_cascades_scale_benchmark(self):
        """Simulates 100 concurrent cascades (1,000+ revocation jobs) with zero false confirmations."""
        cascades = run_concurrent_cascades(cascade_count=100)
        self.assertEqual(cascades["concurrent_cascades_simulated"], 100)
        self.assertEqual(cascades["total_revocation_jobs"], 1000)
        self.assertEqual(cascades["false_confirmations"], 0)
        self.assertEqual(cascades["unresolved_authority_count"], 0)

    def test_api_certification_matrix_endpoint(self):
        """Integration test for GET /api/v1/certification/matrix endpoint."""
        res = client.get("/api/v1/certification/matrix")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertIn("connectors", data)
        self.assertTrue(len(data["connectors"]) >= 4)
        aws_conn = next(c for c in data["connectors"] if c["provider"] == "AWS STS")
        self.assertTrue(aws_conn["zero_secret_storage_verified"])
        self.assertEqual(aws_conn["status"], "CERTIFIED_PRODUCTION_READY")

    def test_api_metrics_ttfr_endpoint(self):
        """Integration test for GET /api/v1/metrics/ttfr endpoint."""
        res = client.get("/api/v1/metrics/ttfr?tenant_id=tenant-m6-api")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertIn("ttfr_metrics", data)
        self.assertEqual(data["system_status"], "HEALTHY_CONVERGED")

if __name__ == "__main__":
    unittest.main()
