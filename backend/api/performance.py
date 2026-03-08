"""
Performance monitoring utilities
"""
import time
import logging
from functools import wraps
from django.core.cache import cache
from django.db import connection

logger = logging.getLogger(__name__)


def track_performance(func):
    """
    Decorator to track function execution time and log slow operations
    """
    @wraps(func)
    def wrapper(*args, **kwargs):
        start_time = time.time()
        start_queries = len(connection.queries)
        
        try:
            result = func(*args, **kwargs)
            return result
        finally:
            duration = time.time() - start_time
            query_count = len(connection.queries) - start_queries
            
            # Log slow operations
            if duration > 1.0:
                logger.warning(
                    f"Slow operation: {func.__name__} took {duration:.3f}s "
                    f"({query_count} queries)"
                )
            
            # Log high query count
            if query_count > 10:
                logger.warning(
                    f"High query count: {func.__name__} executed {query_count} queries"
                )
    
    return wrapper


def cache_result(timeout=300):
    """
    Decorator to cache function results
    """
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            cache_key = f"{func.__name__}:{str(args)}:{str(kwargs)}"
            result = cache.get(cache_key)
            
            if result is None:
                result = func(*args, **kwargs)
                cache.set(cache_key, result, timeout)
            
            return result
        return wrapper
    return decorator


def get_query_count():
    """Get current query count for the request"""
    return len(connection.queries)


def log_query_performance():
    """Log all queries executed in the current request with detailed analysis"""
    queries = connection.queries
    if queries:
        total_time = sum(float(q['time']) for q in queries)
        logger.info(
            f"Query performance: {len(queries)} queries in {total_time:.3f}s"
        )
        
        # Identify slow queries (> 100ms)
        slow_queries = [q for q in queries if float(q['time']) > 0.1]
        if slow_queries:
            logger.warning(f"Found {len(slow_queries)} slow queries (>100ms)")
            for query in slow_queries:
                logger.warning(f"Slow query ({query['time']}s): {query['sql'][:200]}...")
        
        # Identify duplicate queries (potential N+1 issue)
        query_patterns = {}
        for query in queries:
            # Extract query pattern (remove specific values)
            sql = query['sql']
            # Simple pattern matching - remove numbers and quoted strings
            import re
            pattern = re.sub(r"'[^']*'", "'?'", sql)
            pattern = re.sub(r'\b\d+\b', '?', pattern)
            
            if pattern in query_patterns:
                query_patterns[pattern] += 1
            else:
                query_patterns[pattern] = 1
        
        # Log patterns that appear more than 3 times (likely N+1)
        duplicate_patterns = {k: v for k, v in query_patterns.items() if v > 3}
        if duplicate_patterns:
            logger.warning(f"Potential N+1 queries detected:")
            for pattern, count in sorted(duplicate_patterns.items(), key=lambda x: x[1], reverse=True)[:3]:
                logger.warning(f"  Query executed {count} times: {pattern[:150]}...")
        
        # Log last 5 queries for debugging
        for query in queries[-5:]:
            logger.debug(f"Query: {query['sql'][:100]}... ({query['time']}s)")

