"""Cache service — Redis-backed caching with graceful degradation."""

import logging
import json
from typing import Optional, Dict, Any
import redis.asyncio as aioredis
from redis.exceptions import ConnectionError, TimeoutError

logger = logging.getLogger(__name__)


class CacheService:
    """Redis cache with graceful degradation — app works fine without Redis.
    
    All Redis errors are caught and logged; methods return None/pass on failure
    so the app continues to function even if Redis is unavailable.
    """

    def __init__(self, redis_url: str):
        self.redis = aioredis.from_url(redis_url, decode_responses=True)

    async def get(self, key: str) -> Optional[Dict[str, Any]]:
        """Get a value from cache, deserialized from JSON."""
        try:
            val = await self.redis.get(key)
            if val:
                return json.loads(val)
            return None
        except (ConnectionError, TimeoutError) as e:
            logger.warning(f"Redis connection error on GET '{key}': {e}")
            return None
        except Exception as e:
            logger.error(f"Unexpected Redis error on GET '{key}': {e}")
            return None

    async def set(self, key: str, value: Dict[str, Any], ttl: int = 900) -> None:
        """Set a value in cache with TTL (default 15 minutes)."""
        try:
            serialized = json.dumps(value)
            await self.redis.set(key, serialized, ex=ttl)
        except (ConnectionError, TimeoutError) as e:
            logger.warning(f"Redis connection error on SET '{key}': {e}")
        except Exception as e:
            logger.error(f"Unexpected Redis error on SET '{key}': {e}")

    async def invalidate(self, key: str) -> None:
        """Delete a key from cache."""
        try:
            await self.redis.delete(key)
        except (ConnectionError, TimeoutError) as e:
            logger.warning(f"Redis connection error on DELETE '{key}': {e}")
        except Exception as e:
            logger.error(f"Unexpected Redis error on DELETE '{key}': {e}")

    async def get_cached_summary(self, category: str = "general") -> Optional[Dict[str, Any]]:
        """Convenience: get a cached news summary by category."""
        key = f"news_summary:{category}"
        return await self.get(key)

    async def set_cached_summary(
        self, summary: Dict[str, Any], category: str = "general", ttl: int = 900
    ) -> None:
        """Convenience: cache a news summary by category."""
        key = f"news_summary:{category}"
        await self.set(key, summary, ttl)

    async def close(self) -> None:
        """Close the Redis connection."""
        try:
            await self.redis.aclose()
            logger.info("Redis connection closed.")
        except Exception as e:
            logger.warning(f"Error closing Redis connection: {e}")
