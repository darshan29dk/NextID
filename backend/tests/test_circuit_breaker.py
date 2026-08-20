import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.services.circuit_breaker import ScopedCircuitBreaker
from app.services.rate_limiter import MultiTierRateLimiter

class TestResilienceCircuitBreakerAndRateLimiter(unittest.TestCase):

    def test_region_scoped_circuit_breaker_and_half_open_probe(self):
        cb = ScopedCircuitBreaker(failure_threshold=2, recovery_timeout=0.1)
        
        # 1. Circuit is CLOSED initially
        self.assertTrue(cb.can_execute("tenant_1", "GITHUB", "acc_1", "us-east-1", "REVOKE"))

        # 2. Record 2 failures -> OPEN
        cb.record_result("tenant_1", "GITHUB", "acc_1", "us-east-1", "REVOKE", success=False)
        cb.record_result("tenant_1", "GITHUB", "acc_1", "us-east-1", "REVOKE", success=False)

        # Fast fail when OPEN
        self.assertFalse(cb.can_execute("tenant_1", "GITHUB", "acc_1", "us-east-1", "REVOKE"))

        # 3. Wait for recovery timeout (0.1s) -> HALF_OPEN probe
        import time; time.sleep(0.15)
        self.assertTrue(cb.can_execute("tenant_1", "GITHUB", "acc_1", "us-east-1", "REVOKE"))

        # Probe success -> CLOSED
        cb.record_result("tenant_1", "GITHUB", "acc_1", "us-east-1", "REVOKE", success=True)
        self.assertTrue(cb.can_execute("tenant_1", "GITHUB", "acc_1", "us-east-1", "REVOKE"))

    def test_multi_tier_rate_limiter(self):
        limiter = MultiTierRateLimiter()
        self.assertTrue(limiter.is_allowed("tenant_1", "acc_1", limit=10))

if __name__ == "__main__":
    unittest.main()
