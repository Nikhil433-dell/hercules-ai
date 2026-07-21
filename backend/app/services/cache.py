class CacheService:
    """Service for caching data."""
    
    def get(self, key: str):
        """Get value from cache."""
        raise NotImplementedError
        
    def set(self, key: str, value: any, ttl: int = None):
        """Set value in cache."""
        raise NotImplementedError
        
    def invalidate(self, key: str):
        """Invalidate a cache key."""
        raise NotImplementedError
        
    def get_cached_summary(self, category: str):
        """Get a cached news summary."""
        raise NotImplementedError
