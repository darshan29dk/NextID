import os
import time
import logging
from typing import Dict, Tuple, Optional

logger = logging.getLogger(__name__)

class MultiTierRateLimiter:
    """
    Multi-Tier Distributed Token Bucket Rate Limiter.
    Uses Redis when REDIS_URL is configured for multi-worker distributed clusters,
    with process-local token-bucket fallback for single-node development.
    Enforces caps across (tenant_id, provider, account, region, operation).
    """

    def __init__(self):
        self.buckets: Dict[str, Tuple[float, float]] = {}  # key -> (tokens, last_update)
        self.redis_client = None
        
        redis_url = os.getenv("REDIS_URL")
        if redis_url:
            try:
                import redis
                self.redis_client = redis.from_url(redis_url, decode_responses=True)
                logger.info(f"[RATE LIMITER] Connected to distributed Redis cluster at '{redis_url}'.")
            except Exception as err:
                logger.warning(f"[RATE LIMITER] Redis connection failed ({err}). Falling back to process-local rate limiter.")

    def is_allowed(self, tenant_id: str, provider: str = "GENERIC", account: str = "default", region: str = "us-east-1", operation: str = "REVOKE", limit: int = 50) -> bool:
        key = f"ratelimit:{tenant_id}:{provider}:{account}:{region}:{operation}"
        now = time.time()

        if self.redis_client:
            try:
                pipe = self.redis_client.pipeline()
                pipe.incr(key)
                pipe.expire(key, 60)
                results = pipe.execute()
                current_count = results[0]
                if current_count > limit:
                    logger.warning(f"[RATE LIMITER - REDIS] Rate limit exceeded for '{key}' ({current_count}/{limit}). Throttling.")
                    return False
                return True
            except Exception as redis_err:
                logger.warning(f"[RATE LIMITER] Redis exception ({redis_err}). Falling back to local bucket.")

        # Process-Local Fallback
        tokens, last_update = self.buckets.get(key, (float(limit), now))
        elapsed = now - last_update
        tokens = min(float(limit), tokens + elapsed)
        
        if tokens >= 1.0:
            self.buckets[key] = (tokens - 1.0, now)
            return True
        else:
            self.buckets[key] = (tokens, now)
            logger.warning(f"[RATE LIMITER - LOCAL] Rate limit exceeded for '{key}'. Request throttled.")
            return False

rate_limiter = MultiTierRateLimiter()
