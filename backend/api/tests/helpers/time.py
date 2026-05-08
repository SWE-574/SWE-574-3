"""
Time-travel helpers for tests that depend on evaluation windows, recurring
schedules, hot-score decay, or any other ``timezone.now()``-driven logic.

Wraps ``freezegun`` so callers don't have to remember to also tick the Django
cache or the channels layer when frozen time is required.

Usage:

    from api.tests.helpers.time import freeze, advance

    def test_evaluation_window_close():
        with freeze('2026-05-10T12:00:00Z') as clock:
            handshake = make_handshake(...)
            clock.move_to('2026-05-11T12:00:00Z')
            run_evaluation(handshake)
            assert handshake.refresh_from_db() and handshake.is_evaluated

The contextmanager yields the freezegun ``FrozenDateTimeFactory`` so you can
``move_to(...)`` or ``tick(timedelta(...))`` inside the block.
"""
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone

from freezegun import freeze_time


@contextmanager
def freeze(when: str | datetime):
    """Freeze ``timezone.now()`` to the given moment.

    Accepts an ISO-8601 string (with or without timezone) or a ``datetime``.
    Naive datetimes are interpreted as UTC.
    """
    if isinstance(when, str):
        target = datetime.fromisoformat(when.replace('Z', '+00:00'))
    else:
        target = when
    if target.tzinfo is None:
        target = target.replace(tzinfo=timezone.utc)

    with freeze_time(target) as clock:
        yield clock


def advance(clock, **kwargs):
    """Move a frozen clock forward by ``timedelta(**kwargs)``.

    Convenience wrapper so tests read like English::

        advance(clock, hours=1)
        advance(clock, days=7)
    """
    clock.tick(timedelta(**kwargs))
