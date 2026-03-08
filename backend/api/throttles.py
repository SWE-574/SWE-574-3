"""
Custom throttle classes for rate limiting sensitive operations
"""
import os

from rest_framework.throttling import AnonRateThrottle, ScopedRateThrottle, UserRateThrottle


def _is_truthy_env(*names: str) -> bool:
    for name in names:
        value = os.environ.get(name) or ''
        if str(value).strip().lower() in {'1', 'true', 'yes', 'y', 'on'}:
            return True
    return False


def _should_bypass_throttling() -> bool:
    # E2E mode should bypass throttling to keep tests deterministic.
    # DISABLE_THROTTLING/NO_THROTTLE are explicit overrides (use carefully).
    return _is_truthy_env('DJANGO_E2E', 'E2E', 'DISABLE_THROTTLING', 'NO_THROTTLE')


class E2EAwareAnonRateThrottle(AnonRateThrottle):
    def allow_request(self, request, view):
        if _should_bypass_throttling():
            return True
        return super().allow_request(request, view)


class E2EAwareUserRateThrottle(UserRateThrottle):
    def allow_request(self, request, view):
        if _should_bypass_throttling():
            return True
        return super().allow_request(request, view)


class E2EAwareScopedRateThrottle(ScopedRateThrottle):
    def allow_request(self, request, view):
        if _should_bypass_throttling():
            return True
        return super().allow_request(request, view)


class ConfirmationThrottle(E2EAwareUserRateThrottle):
    """
    Throttle for service confirmation operations.
    Rate is controlled by REST_FRAMEWORK['DEFAULT_THROTTLE_RATES']['confirm'].
    """
    scope = 'confirm'


class HandshakeThrottle(E2EAwareUserRateThrottle):
    """
    Throttle for handshake creation and initiation operations.
    Rate is controlled by REST_FRAMEWORK['DEFAULT_THROTTLE_RATES']['handshake'].
    """
    scope = 'handshake'


class SensitiveOperationThrottle(E2EAwareUserRateThrottle):
    """
    Throttle for sensitive operations (password changes, account modifications).
    Rate is controlled by REST_FRAMEWORK['DEFAULT_THROTTLE_RATES']['sensitive'].
    """
    scope = 'sensitive'


class ReputationThrottle(E2EAwareUserRateThrottle):
    """
    Throttle for reputation submissions.
    Rate is controlled by REST_FRAMEWORK['DEFAULT_THROTTLE_RATES']['reputation'].
    """
    scope = 'reputation'


class ProgressiveRateThrottle(E2EAwareUserRateThrottle):
    """
    Progressive rate limiting based on user reputation (karma_score).
    Users with higher karma get higher rate limits.
    
    Rate tiers:
    - New users (karma < 10): 50/hour
    - Regular users (karma 10-50): 100/hour
    - Trusted users (karma 51-100): 200/hour
    - Highly trusted (karma > 100): 300/hour
    """
    scope = 'user'
    
    def get_rate(self):
        """
        Determine rate based on user's karma_score.
        Falls back to default if user is not authenticated or has no karma.
        """
        if not self.request or not self.request.user or not self.request.user.is_authenticated:
            return '20/hour'  # Default for unauthenticated
        
        karma = getattr(self.request.user, 'karma_score', 0)
        
        if karma < 10:
            return '50/hour'
        elif karma < 50:
            return '100/hour'
        elif karma < 100:
            return '200/hour'
        else:
            return '300/hour'
