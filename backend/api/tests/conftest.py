import pytest


@pytest.fixture(autouse=True)
def clear_django_cache():
    from django.core.cache import cache
    cache.clear()


@pytest.fixture(autouse=True)
def disable_drf_throttling(settings):
    """Disable DRF throttling for test stability.

    The production settings use tight rate limits (e.g., anon: 20/hour), which
    makes the full backend test suite flaky because it exercises many public
    endpoints in quick succession.
    """
    settings.REST_FRAMEWORK = dict(settings.REST_FRAMEWORK)
    rates = dict(settings.REST_FRAMEWORK.get('DEFAULT_THROTTLE_RATES', {}))
    for scope in list(rates.keys()):
        rates[scope] = '1000000/hour'
    # Ensure base scopes always exist for DRF throttles.
    rates.setdefault('anon', '1000000/hour')
    rates.setdefault('user', '1000000/hour')
    settings.REST_FRAMEWORK['DEFAULT_THROTTLE_RATES'] = rates

    settings.DEBUG = True
    settings.DEBUG_PROPAGATE_EXCEPTIONS = True
