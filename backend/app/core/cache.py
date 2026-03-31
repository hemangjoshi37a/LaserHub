"""
Caching utilities for LaserHub
"""

import asyncio
import functools
import hashlib
import json
import pickle
from datetime import timedelta
from typing import Any, Callable, Optional, Union

from redis.asyncio import Redis

from app.core.config import settings


class CacheManager:
    """Redis-based caching manager"""
    
    def __init__(self):
        self.redis: Optional[Redis] = None
        self.enabled = False
    
    async def init(self):
        """Initialize Redis connection if configured"""
        try:
            # Try to connect to Redis (use memory if not available)
            self.redis = Redis(
                host=getattr(settings, 'REDIS_HOST', 'localhost'),
                port=getattr(settings, 'REDIS_PORT', 6379),
                db=getattr(settings, 'REDIS_DB', 0),
                decode_responses=False,
                socket_connect_timeout=2,
                socket_timeout=2,
            )
            # Test connection
            await self.redis.ping()
            self.enabled = True
        except Exception:
            # Fallback: use in-memory dict for caching
            self.redis = None  # type: ignore
            self.enabled = False
    
    async def close(self):
        """Close Redis connection"""
        if self.redis:
            await self.redis.close()
    
    def _make_key(self, key: str, prefix: str = "lh") -> str:
        """Create cache key with prefix"""
        return f"{prefix}:{key}"
    
    def _make_func_key(self, func_name: str, *args, **kwargs) -> str:
        """Create cache key from function arguments"""
        key_data = {
            "func": func_name,
            "args": args,
            "kwargs": kwargs
        }
        key_str = json.dumps(key_data, sort_keys=True, default=str)
        return hashlib.md5(key_str.encode()).hexdigest()
    
    async def get(self, key: str, prefix: str = "lh") -> Optional[Any]:
        """Get value from cache"""
        if not self.enabled or not self.redis:
            return None
        
        try:
            value = await self.redis.get(self._make_key(key, prefix))
            if value:
                return pickle.loads(value)
            return None
        except Exception:
            return None
    
    async def set(
        self,
        key: str,
        value: Any,
        expire: Union[int, timedelta, None] = None,
        prefix: str = "lh"
    ) -> bool:
        """Set value in cache"""
        if not self.enabled or not self.redis:
            return False
        
        try:
            serialized = pickle.dumps(value)
            if isinstance(expire, timedelta):
                expire = int(expire.total_seconds())
            return await self.redis.set(self._make_key(key, prefix), serialized, ex=expire)
        except Exception:
            return False
    
    async def delete(self, key: str, prefix: str = "lh") -> int:
        """Delete value from cache"""
        if not self.enabled or not self.redis:
            return 0
        
        try:
            return await self.redis.delete(self._make_key(key, prefix))
        except Exception:
            return 0
    
    async def delete_pattern(self, pattern: str, prefix: str = "lh") -> int:
        """Delete all keys matching pattern"""
        if not self.enabled or not self.redis:
            return 0
        
        try:
            keys = await self.redis.keys(self._make_key(pattern, prefix))
            if keys:
                return await self.redis.delete(*keys)
            return 0
        except Exception:
            return 0
    
    async def clear(self) -> bool:
        """Clear all cache"""
        if not self.enabled or not self.redis:
            return False
        
        try:
            await self.delete_pattern("*")
            return True
        except Exception:
            return False


# Global cache instance
cache = CacheManager()


def cached(expire: Union[int, timedelta, None] = 300):
    """
    Decorator to cache function results
    
    Args:
        expire: Cache expiration time in seconds or timedelta
    """
    def decorator(func: Callable) -> Callable:
        @functools.wraps(func)
        async def wrapper(*args, **kwargs):
            # Skip caching if not enabled
            if not cache.enabled:
                return await func(*args, **kwargs)
            
            # Create cache key
            key = cache._make_func_key(func.__name__, *args, **kwargs)
            
            # Try to get from cache
            cached_result = await cache.get(key)
            if cached_result is not None:
                return cached_result
            
            # Execute function
            result = await func(*args, **kwargs)
            
            # Store in cache
            await cache.set(key, result, expire=expire)
            
            return result
        
        return wrapper
    
    return decorator


class InMemoryCache:
    """Fallback in-memory cache implementation"""
    
    def __init__(self):
        self._store = {}
        self._expiry = {}
    
    async def get(self, key: str, prefix: str = "lh") -> Optional[Any]:
        full_key = f"{prefix}:{key}"
        if full_key not in self._store:
            return None
        
        # Check expiry
        if full_key in self._expiry and self._expiry[full_key] < asyncio.get_event_loop().time():
            del self._store[full_key]
            del self._expiry[full_key]
            return None
        
        return self._store[full_key]
    
    async def set(
        self,
        key: str,
        value: Any,
        expire: Union[int, timedelta, None] = None,
        prefix: str = "lh"
    ) -> bool:
        full_key = f"{prefix}:{key}"
        self._store[full_key] = value
        
        if expire:
            if isinstance(expire, timedelta):
                expire_seconds = expire.total_seconds()
            else:
                expire_seconds = expire
            self._expiry[full_key] = asyncio.get_event_loop().time() + expire_seconds
        
        return True
    
    async def delete(self, key: str, prefix: str = "lh") -> int:
        full_key = f"{prefix}:{key}"
        if full_key in self._store:
            del self._store[full_key]
            if full_key in self._expiry:
                del self._expiry[full_key]
            return 1
        return 0


# Fallback in-memory cache
memory_cache = InMemoryCache()


async def get_cache() -> Union[CacheManager, InMemoryCache]:
    """Get active cache instance"""
    return cache if cache.enabled else memory_cache


__all__ = ['cache', 'memory_cache', 'cached', 'get_cache', 'CacheManager', 'InMemoryCache']