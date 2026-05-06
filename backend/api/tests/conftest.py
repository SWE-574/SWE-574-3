import pytest


@pytest.fixture(autouse=True)
def seed_badges(db):
    """Pre-create all badge rows so that check_and_assign_badges() never hits
    Badge.objects.get_or_create with non-model fields from BADGE_DEFAULTS."""
    from api.badge_utils import BADGE_DEFAULTS
    from api.models import Badge

    MODEL_FIELDS = {'name', 'description', 'icon_url'}
    for badge_id, meta in BADGE_DEFAULTS.items():
        Badge.objects.get_or_create(
            id=badge_id,
            defaults={k: v for k, v in meta.items() if k in MODEL_FIELDS},
        )


@pytest.fixture(autouse=True)
def clear_django_cache():
    from django.core.cache import cache
    cache.clear()


@pytest.fixture(autouse=True)
def _propagate_api_security_logs():
    """Production has propagate=False on the api / api.security loggers so
    Docker log scraping does not see duplicates. pytest's caplog only attaches
    a handler to root, so without propagation the security-signal tests cannot
    observe the records they emit. Restore propagation for the test only."""
    import logging
    loggers = [logging.getLogger(name) for name in ('api', 'api.security')]
    originals = [logger.propagate for logger in loggers]
    for logger in loggers:
        logger.propagate = True
    yield
    for logger, original in zip(loggers, originals):
        logger.propagate = original


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
