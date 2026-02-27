from django.core.cache import cache
from django.conf import settings
from functools import wraps
import hashlib
import json
from typing import Any, Optional, Callable

CACHE_TTL_SHORT = 60 * 5
CACHE_TTL_MEDIUM = 60 * 15
CACHE_TTL_LONG = 60 * 60


def generate_cache_key(prefix: str, *args, **kwargs) -> str:
    key_data = f"{prefix}:{args}:{sorted(kwargs.items())}"
    key_hash = hashlib.md5(key_data.encode()).hexdigest()
    return f"{prefix}:{key_hash}"


def cache_result(ttl: int = CACHE_TTL_MEDIUM, key_prefix: str = None):
    def decorator(func: Callable) -> Callable:
        @wraps(func)
        def wrapper(*args, **kwargs):
            prefix = key_prefix or f"{func.__module__}.{func.__name__}"
            cache_key = generate_cache_key(prefix, *args, **kwargs)
            cached_value = cache.get(cache_key)
            if cached_value is not None:
                return cached_value
            result = func(*args, **kwargs)
            cache.set(cache_key, result, ttl)
            return result
        return wrapper
    return decorator


class CacheManager:
    @staticmethod
    def get(key: str) -> Optional[Any]:
        return cache.get(key)
    
    @staticmethod
    def set(key: str, value: Any, ttl: int = CACHE_TTL_MEDIUM) -> None:
        cache.set(key, value, ttl)
    
    @staticmethod
    def delete(key: str) -> None:
        cache.delete(key)
    
    @staticmethod
    def delete_pattern(pattern: str) -> None:
        """Best-effort delete for cache backends that support pattern deletes.

        - If using django-redis, use its connection helper.
        - If using Django's built-in RedisCache, connect via redis-py.
        - Otherwise, fall back to clearing the whole cache (better than leaving stale data).
        """

        # Try django-redis first if present.
        try:
            from django_redis import get_redis_connection  # type: ignore

            conn = get_redis_connection("default")
            match = f"*{pattern}*"
            keys = conn.keys(match)
            if keys:
                conn.delete(*keys)
            return
        except Exception:
            pass

        # Try Django's built-in RedisCache (django.core.cache.backends.redis.RedisCache).
        try:
            backend = settings.CACHES.get('default', {}).get('BACKEND', '')
            location = settings.CACHES.get('default', {}).get('LOCATION')

            if isinstance(location, (list, tuple)):
                location = location[0] if location else None

            if location and 'redis' in str(backend).lower():
                import redis  # type: ignore

                client = redis.Redis.from_url(str(location))
                match = f"*{pattern}*"

                # Use SCAN to avoid blocking Redis on large keyspaces.
                batch: list[bytes] = []
                for key in client.scan_iter(match=match, count=500):
                    batch.append(key)
                    if len(batch) >= 500:
                        client.delete(*batch)
                        batch.clear()
                if batch:
                    client.delete(*batch)
                return
        except Exception:
            pass

        # Fallback: clear cache to avoid serving stale data.
        try:
            cache.clear()
        except Exception:
            pass
    
    @staticmethod
    def clear_all() -> None:
        cache.clear()


def cache_user_profile(user_id: str, data: dict, ttl: int = CACHE_TTL_LONG) -> None:
    key = f"user_profile:{user_id}"
    CacheManager.set(key, data, ttl)


def get_cached_user_profile(user_id: str) -> Optional[dict]:
    key = f"user_profile:{user_id}"
    return CacheManager.get(key)


def invalidate_user_profile(user_id: str) -> None:
    key = f"user_profile:{user_id}"
    CacheManager.delete(key)


def cache_service_list(filters: dict, data: list, ttl: int = CACHE_TTL_SHORT) -> None:
    filter_str = json.dumps(filters, sort_keys=True)
    key = generate_cache_key("service_list", filter_str)
    CacheManager.set(key, data, ttl)


def get_cached_service_list(filters: dict) -> Optional[list]:
    filter_str = json.dumps(filters, sort_keys=True)
    key = generate_cache_key("service_list", filter_str)
    return CacheManager.get(key)


def invalidate_service_lists() -> None:
    CacheManager.delete_pattern("service_list")


def cache_tag_list(data: list, ttl: int = CACHE_TTL_LONG) -> None:
    key = "tag_list:all"
    CacheManager.set(key, data, ttl)


def get_cached_tag_list() -> Optional[list]:
    key = "tag_list:all"
    return CacheManager.get(key)


def invalidate_tag_list() -> None:
    key = "tag_list:all"
    CacheManager.delete(key)


def cache_user_services(user_id: str, data: list, ttl: int = CACHE_TTL_MEDIUM) -> None:
    key = f"user_services:{user_id}"
    CacheManager.set(key, data, ttl)


def get_cached_user_services(user_id: str) -> Optional[list]:
    key = f"user_services:{user_id}"
    return CacheManager.get(key)


def invalidate_user_services(user_id: str) -> None:
    key = f"user_services:{user_id}"
    CacheManager.delete(key)


def invalidate_on_service_change(service) -> None:
    invalidate_service_lists()
    invalidate_hot_services()
    if hasattr(service, 'id') and service.id:
        invalidate_service_detail(str(service.id))
    if hasattr(service, 'user') and service.user:
        invalidate_user_services(str(service.user.id))


def invalidate_on_user_change(user) -> None:
    invalidate_user_profile(str(user.id))
    invalidate_user_services(str(user.id))


def invalidate_on_tag_change() -> None:
    invalidate_tag_list()
    invalidate_service_lists()


def cache_conversations(user_id: str, data: list, ttl: int = CACHE_TTL_SHORT) -> None:
    key = f"conversations:{user_id}"
    CacheManager.set(key, data, ttl)


def get_cached_conversations(user_id: str) -> Optional[list]:
    key = f"conversations:{user_id}"
    return CacheManager.get(key)


def invalidate_conversations(user_id: str) -> None:
    key = f"conversations:{user_id}"
    CacheManager.delete(key)


def cache_transactions(user_id: str, data: list, ttl: int = CACHE_TTL_SHORT) -> None:
    key = f"transactions:{user_id}"
    CacheManager.set(key, data, ttl)


def get_cached_transactions(user_id: str) -> Optional[list]:
    key = f"transactions:{user_id}"
    return CacheManager.get(key)


def invalidate_transactions(user_id: str) -> None:
    key = f"transactions:{user_id}"
    CacheManager.delete(key)


def cache_service_detail(service_id: str, data: dict, ttl: int = CACHE_TTL_MEDIUM) -> None:
    """Cache individual service detail"""
    key = f"service_detail:{service_id}"
    CacheManager.set(key, data, ttl)


def get_cached_service_detail(service_id: str) -> Optional[dict]:
    """Get cached service detail"""
    key = f"service_detail:{service_id}"
    return CacheManager.get(key)


def invalidate_service_detail(service_id: str) -> None:
    """Invalidate cached service detail"""
    key = f"service_detail:{service_id}"
    CacheManager.delete(key)


def cache_hot_services(data: list, ttl: int = CACHE_TTL_SHORT) -> None:
    """Cache hot/trending services list"""
    key = "hot_services:list"
    CacheManager.set(key, data, ttl)


def get_cached_hot_services() -> Optional[list]:
    """Get cached hot services list"""
    key = "hot_services:list"
    return CacheManager.get(key)


def invalidate_hot_services() -> None:
    """Invalidate cached hot services"""
    key = "hot_services:list"
    CacheManager.delete(key)


def warm_cache_popular_services() -> None:
    """Pre-load popular services into cache."""
    from .models import Service
    from .serializers import ServiceSerializer
    from rest_framework.request import Request
    from django.test import RequestFactory
    
    try:
        # Warm cache for active services sorted by hot_score
        popular_services = Service.objects.filter(
            status='Active',
            is_visible=True
        ).select_related('user').prefetch_related('tags', 'media').order_by('-hot_score')[:50]
        
        factory = RequestFactory()
        request = factory.get('/')
        
        serializer = ServiceSerializer(popular_services, many=True, context={'request': request})
        cache_hot_services(serializer.data, ttl=CACHE_TTL_SHORT)
        
    except Exception:
        pass


def invalidate_on_handshake_change(handshake) -> None:
    """Invalidate caches when handshake changes."""
    # Invalidate conversations for both users
    if hasattr(handshake, 'requester') and handshake.requester:
        invalidate_conversations(str(handshake.requester.id))
    if hasattr(handshake, 'service') and hasattr(handshake.service, 'user') and handshake.service.user:
        invalidate_conversations(str(handshake.service.user.id))
        invalidate_service_detail(str(handshake.service.id))
        invalidate_service_lists()


def invalidate_on_comment_change(comment) -> None:
    """Invalidate caches when comment changes."""
    if hasattr(comment, 'service') and comment.service:
        invalidate_service_detail(str(comment.service.id))
        invalidate_service_lists()
        invalidate_hot_services()


def invalidate_on_reputation_change(reputation) -> None:
    """Invalidate caches when reputation changes."""
    if hasattr(reputation, 'receiver') and reputation.receiver:
        invalidate_user_profile(str(reputation.receiver.id))
        # Invalidate hot services since reputation affects hot_score
        invalidate_hot_services()
        invalidate_service_lists()
