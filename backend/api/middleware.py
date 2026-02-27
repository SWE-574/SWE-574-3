import logging
import time
from django.utils.deprecation import MiddlewareMixin
from django.http import JsonResponse
from rest_framework import status
from .performance import get_query_count, log_query_performance

logger = logging.getLogger(__name__)


class RequestValidationMiddleware(MiddlewareMixin):
    """
    Middleware to validate and log API requests
    """
    
    def process_request(self, request):
        # Log request start time
        request._start_time = time.time()
        request._start_queries = get_query_count()
        
        # Validate request size (prevent large payload attacks)
        if request.method in ['POST', 'PUT', 'PATCH']:
            content_length = request.META.get('CONTENT_LENGTH', 0)
            try:
                content_length = int(content_length)
                # Limit to 10MB
                if content_length > 10 * 1024 * 1024:
                    logger.warning(
                        f"Request too large: {content_length} bytes from {request.META.get('REMOTE_ADDR')}"
                    )
                    return JsonResponse(
                        {'error': 'Request payload too large. Maximum size is 10MB.'},
                        status=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE
                    )
            except (ValueError, TypeError):
                pass
        
        # Validate content type for POST/PUT/PATCH
        if request.method in ['POST', 'PUT', 'PATCH']:
            content_type = request.META.get('CONTENT_TYPE', '')
            if content_type and not content_type.startswith(('application/json', 'multipart/form-data', 'application/x-www-form-urlencoded')):
                logger.warning(
                    f"Invalid content type: {content_type} from {request.META.get('REMOTE_ADDR')}"
                )
                return JsonResponse(
                    {'error': 'Invalid content type. Expected application/json.'},
                    status=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE
                )
        
        return None
    
    def process_response(self, request, response):
        # Calculate request duration
        if hasattr(request, '_start_time'):
            duration = time.time() - request._start_time
            query_count = get_query_count() - getattr(request, '_start_queries', 0)
            
            # Log request details
            log_data = {
                'method': request.method,
                'path': request.path,
                'status': response.status_code,
                'duration': f"{duration:.3f}s",
                'queries': query_count,
                'ip': request.META.get('REMOTE_ADDR'),
                'user': getattr(request.user, 'email', 'anonymous') if hasattr(request, 'user') else 'anonymous',
            }
            
            # Define thresholds for query performance warnings
            SLOW_REQUEST_THRESHOLD = 0.5  # seconds
            HIGH_QUERY_COUNT_THRESHOLD = 10
            EXCESSIVE_QUERY_COUNT_THRESHOLD = 20
            
            # Log based on status code
            if response.status_code >= 500:
                logger.error(f"Request error: {log_data}")
            elif response.status_code >= 400:
                logger.warning(f"Request warning: {log_data}")
            elif duration > 1.0:  # Log slow requests
                logger.warning(f"Slow request: {log_data}")
            elif query_count > EXCESSIVE_QUERY_COUNT_THRESHOLD:
                # Log excessive query count with detailed query info
                logger.warning(f"Excessive query count: {log_data}")
                log_query_performance()
            elif query_count > HIGH_QUERY_COUNT_THRESHOLD:
                # Log high query count
                logger.warning(f"High query count: {log_data}")
            elif duration > SLOW_REQUEST_THRESHOLD:
                # Log slow requests with query details
                logger.warning(f"Slow request: {log_data}")
                log_query_performance()
            else:
                logger.info(f"Request: {log_data}")
        
        return response


class SecurityHeadersMiddleware(MiddlewareMixin):
    """
    Add security headers to responses
    """
    
    def process_response(self, request, response):
        # Add security headers
        response['X-Content-Type-Options'] = 'nosniff'
        response['X-Frame-Options'] = 'DENY'
        response['X-XSS-Protection'] = '1; mode=block'
        response['Referrer-Policy'] = 'strict-origin-when-cross-origin'
        
        # Remove server header
        if 'Server' in response:
            del response['Server']
        
        return response
