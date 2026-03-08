from rest_framework.views import exception_handler
from rest_framework.exceptions import ValidationError, PermissionDenied, NotFound, AuthenticationFailed
from rest_framework.response import Response
from rest_framework import status
from django.conf import settings
from django.core.exceptions import ObjectDoesNotExist
from django.http import Http404
import logging


logger = logging.getLogger(__name__)


class ErrorCodes:
    VALIDATION_ERROR = 'VALIDATION_ERROR'
    INSUFFICIENT_BALANCE = 'INSUFFICIENT_BALANCE'
    INVALID_STATE = 'INVALID_STATE'
    PERMISSION_DENIED = 'PERMISSION_DENIED'
    NOT_FOUND = 'NOT_FOUND'
    AUTHENTICATION_FAILED = 'AUTHENTICATION_FAILED'
    CONFLICT = 'CONFLICT'
    ALREADY_EXISTS = 'ALREADY_EXISTS'
    UNAUTHORIZED = 'UNAUTHORIZED'
    INVALID_INPUT = 'INVALID_INPUT'
    RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED'
    SERVER_ERROR = 'SERVER_ERROR'


def custom_exception_handler(exc, context):
    if isinstance(exc, (ObjectDoesNotExist, Http404)):
        return Response(
            {
                'detail': 'Resource not found.',
                'code': ErrorCodes.NOT_FOUND
            },
            status=status.HTTP_404_NOT_FOUND
        )
    
    response = exception_handler(exc, context)
    
    if response is None:
        logger.exception('Unhandled exception in API request', exc_info=exc)
        if getattr(settings, 'DEBUG_PROPAGATE_EXCEPTIONS', False) or getattr(settings, 'DEBUG', False):
            raise exc
        return Response(
            {
                'detail': 'An unexpected error occurred.',
                'code': ErrorCodes.SERVER_ERROR
            },
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )
    
    if response is not None:
        error_data = {}
        
        if isinstance(exc, ValidationError):
            error_data['detail'] = 'Validation failed.'
            error_data['code'] = ErrorCodes.VALIDATION_ERROR
            
            if hasattr(exc, 'detail') and isinstance(exc.detail, dict):
                field_errors = {}
                for field, errors in exc.detail.items():
                    if isinstance(errors, list):
                        field_errors[field] = [str(e) for e in errors]
                    else:
                        field_errors[field] = [str(errors)]
                error_data['field_errors'] = field_errors
            elif hasattr(exc, 'detail') and isinstance(exc.detail, list):
                error_data['detail'] = ' '.join([str(e) for e in exc.detail])
            elif hasattr(exc, 'detail'):
                error_data['detail'] = str(exc.detail)
        
        elif isinstance(exc, PermissionDenied):
            error_data['detail'] = str(exc.detail) if hasattr(exc, 'detail') else 'Permission denied.'
            error_data['code'] = ErrorCodes.PERMISSION_DENIED
        
        elif isinstance(exc, NotFound):
            error_data['detail'] = str(exc.detail) if hasattr(exc, 'detail') else 'Resource not found.'
            error_data['code'] = ErrorCodes.NOT_FOUND
        
        elif isinstance(exc, AuthenticationFailed):
            error_data['detail'] = str(exc.detail) if hasattr(exc, 'detail') else 'Authentication failed.'
            error_data['code'] = ErrorCodes.AUTHENTICATION_FAILED
        
        elif hasattr(exc, 'default_code') and exc.default_code == 'throttled':
            error_data['detail'] = str(exc.detail) if hasattr(exc, 'detail') else 'Rate limit exceeded.'
            error_data['code'] = ErrorCodes.RATE_LIMIT_EXCEEDED
        
        else:
            if hasattr(exc, 'detail'):
                if isinstance(exc.detail, dict):
                    error_data['detail'] = exc.detail.get('detail', str(exc.detail))
                else:
                    error_data['detail'] = str(exc.detail)
            else:
                error_data['detail'] = 'An error occurred.'
            
            if 'code' not in error_data:
                error_data['code'] = ErrorCodes.SERVER_ERROR
        
        response.data = error_data
    
    return response


def create_error_response(message, code=ErrorCodes.INVALID_INPUT, status_code=status.HTTP_400_BAD_REQUEST, **extra):
    error_data = {
        'detail': message,
        'code': code
    }
    error_data.update(extra)
    return Response(error_data, status=status_code)
