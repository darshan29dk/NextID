import os
import time
import logging
from typing import Dict, Any

logger = logging.getLogger(__name__)

class ScopedCircuitBreaker:
    """
    Region-Scoped Circuit Breaker with Half-Open Trial Probe rules.
    Uses Redis when REDIS_URL is configured for multi-worker distributed state,
    falling back to process-local state for single-node development.
    Scoped key: (tenant_id, provider, account, region, operation)
    """

    def __init__(self, failure_threshold: int = 5, recovery_timeout: float = 30.0):
        self.failure_threshold = failure_threshold
        self.recovery_timeout = recovery_timeout
        self.state_map: Dict[str, Dict[str, Any]] = {}
        self.redis_client = None

        redis_url = os.getenv("REDIS_URL")
        if redis_url:
            try:
                import redis
                self.redis_client = redis.from_url(redis_url, decode_responses=True)
                logger.info(f"[CIRCUIT BREAKER] Connected to distributed Redis cluster at '{redis_url}'.")
            except Exception as err:
                logger.warning(f"[CIRCUIT BREAKER] Redis connection failed ({err}). Falling back to process-local circuit breaker.")

    def get_scoped_key(self, tenant_id: str, provider: str, account: str, region: str, operation: str) -> str:
        return f"cb:{tenant_id}:{provider}:{account}:{region}:{operation}"

    def can_execute(self, tenant_id: str, provider: str, account: str, region: str = "us-east-1", operation: str = "REVOKE") -> bool:
        key = self.get_scoped_key(tenant_id, provider, account, region, operation)
        now = time.time()

        if self.redis_client:
            try:
                state = self.redis_client.get(f"{key}:state") or "CLOSED"
                last_fail = float(self.redis_client.get(f"{key}:last_fail") or 0)

                if state == "OPEN":
                    if now - last_fail >= self.recovery_timeout:
                        logger.info(f"[CIRCUIT BREAKER - REDIS] Transitioning '{key}' from OPEN to HALF_OPEN (Trial probe permitted).")
                        self.redis_client.set(f"{key}:state", "HALF_OPEN")
                        return True
                    logger.warning(f"[CIRCUIT BREAKER - REDIS] Fast-failing request for '{key}' (Circuit is OPEN).")
                    return False
                return True
            except Exception as r_err:
                logger.warning(f"[CIRCUIT BREAKER] Redis exception ({r_err}). Falling back to local state.")

        st = self.state_map.get(key, {"state": "CLOSED", "failures": 0, "last_failure": 0})
        if st["state"] == "OPEN":
            if now - st["last_failure"] >= self.recovery_timeout:
                logger.info(f"[CIRCUIT BREAKER - LOCAL] Transitioning '{key}' from OPEN to HALF_OPEN (Trial probe permitted).")
                st["state"] = "HALF_OPEN"
                self.state_map[key] = st
                return True
            logger.warning(f"[CIRCUIT BREAKER - LOCAL] Fast-failing request for '{key}' (Circuit is OPEN).")
            return False
            
        return True

    def record_result(self, tenant_id: str, provider: str, account: str, region: str, operation: str, success: bool):
        key = self.get_scoped_key(tenant_id, provider, account, region, operation)
        now = time.time()

        if self.redis_client:
            try:
                if success:
                    self.redis_client.set(f"{key}:state", "CLOSED")
                    self.redis_client.set(f"{key}:failures", 0)
                else:
                    fails = self.redis_client.incr(f"{key}:failures")
                    self.redis_client.set(f"{key}:last_fail", now)
                    if fails >= self.failure_threshold:
                        logger.error(f"[CIRCUIT BREAKER - REDIS] Failure threshold reached for '{key}'. Transitioning to OPEN.")
                        self.redis_client.set(f"{key}:state", "OPEN")
                return
            except Exception as r_err:
                logger.warning(f"[CIRCUIT BREAKER] Redis exception ({r_err}). Falling back to local state.")

        st = self.state_map.get(key, {"state": "CLOSED", "failures": 0, "last_failure": 0})
        if success:
            if st["state"] == "HALF_OPEN":
                logger.info(f"[CIRCUIT BREAKER - LOCAL] Trial probe succeeded for '{key}'. Transitioning to CLOSED.")
            st["state"] = "CLOSED"
            st["failures"] = 0
        else:
            st["failures"] += 1
            st["last_failure"] = now
            if st["failures"] >= self.failure_threshold or st["state"] == "HALF_OPEN":
                logger.error(f"[CIRCUIT BREAKER - LOCAL] Failure threshold reached for '{key}'. Transitioning to OPEN.")
                st["state"] = "OPEN"
                
        self.state_map[key] = st

circuit_breaker = ScopedCircuitBreaker()
