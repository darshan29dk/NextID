import os
import random
import logging
from typing import Dict, Any, Optional

logger = logging.getLogger(__name__)

# Global chaos injection flag
CHAOS_ENABLED = os.environ.get("NEXTID_CHAOS_ENABLED", "false").lower() == "true"

class ChaosFaultException(Exception):
    """Raised when chaos engine injects a failure into execution path."""
    pass

class ChaosEngine:
    """
    Chaos Failure Injection Engine (Milestone M6):
    Simulates distributed failure modes to prove authority convergence guarantees under adversarial conditions.
    """

    def __init__(self, failure_rate: float = 0.0):
        self.failure_rate = failure_rate

    def inject_fault_if_enabled(self, fault_type: str, context_info: str = ""):
        """
        Injected failure gate. Triggers error if NEXTID_CHAOS_ENABLED=true or failure_rate met.
        """
        if not CHAOS_ENABLED and self.failure_rate <= 0.0:
            return

        if self.failure_rate > 0.0 and random.random() > self.failure_rate:
            return

        logger.warning(f"[CHAOS ENGINE] Injecting fault '{fault_type}' on context: {context_info}")

        if fault_type == "WORKER_CRASH":
            raise ChaosFaultException(f"[CHAOS WORKER CRASH] Worker process died unexpectedly during {context_info}")
        elif fault_type == "PROVIDER_429_THROTTLE":
            raise ChaosFaultException(f"[CHAOS PROVIDER 429] Provider rate limit exceeded (HTTP 429) for {context_info}")
        elif fault_type == "STALE_FENCING_TOKEN":
            raise ChaosFaultException(f"[CHAOS FENCING REJECTION] Stale worker epoch fencing token rejected for {context_info}")
        elif fault_type == "DB_TIMEOUT":
            raise ChaosFaultException(f"[CHAOS DB TIMEOUT] Database connection pool timed out during {context_info}")
        elif fault_type == "BROKER_REDELIVERY":
            logger.info(f"[CHAOS BROKER] Simulating duplicate message redelivery for {context_info}")
        else:
            raise ChaosFaultException(f"[CHAOS FAULT] Injected generic fault '{fault_type}' for {context_info}")

_global_chaos_engine = ChaosEngine()

def get_chaos_engine() -> ChaosEngine:
    return _global_chaos_engine
