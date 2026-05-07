"""Integration tests for the Feature 11/12/19 events bundle.

Covers:
- DateRangeStrategy (#285 / FR-12c) — date_from / date_to filtering for events
- ServiceSerializer.edit_locked / edit_lock_reason (#267 / FR-11f, FR-11n)
- Cancelled event detail still returns 200 (#288 / FR-12g)
"""
from datetime import timedelta
from decimal import Decimal

import pytest
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from api.tests.helpers.factories import ServiceFactory, UserFactory


def _event(scheduled_time, **overrides):
    """Build an Active event with a scheduled_time."""
    defaults = dict(
        type='Event',
        status='Active',
        scheduled_time=scheduled_time,
        max_participants=10,
        duration=Decimal('2.00'),
    )
    defaults.update(overrides)
    return ServiceFactory(**defaults)


@pytest.mark.django_db
@pytest.mark.integration
class TestDateRangeStrategyAPI:
    """GET /api/services/?type=Event&date_from=...&date_to=... narrows by scheduled_time."""

    def test_filter_returns_only_events_in_range(self):
        now = timezone.now()
        in_range = _event(now + timedelta(days=2), title='In range')
        out_of_range = _event(now + timedelta(days=20), title='Out of range')

        client = APIClient()
        response = client.get(
            '/api/services/',
            {
                'type': 'Event',
                'date_from': (now + timedelta(days=1)).date().isoformat(),
                'date_to': (now + timedelta(days=5)).date().isoformat(),
            },
        )
        assert response.status_code == status.HTTP_200_OK
        results = response.data['results'] if isinstance(response.data, dict) else response.data
        ids = {r['id'] for r in results}
        assert str(in_range.id) in ids
        assert str(out_of_range.id) not in ids

    def test_filter_excludes_events_without_scheduled_time(self):
        now = timezone.now()
        # Event without scheduled_time should be excluded when filter is active.
        no_time = ServiceFactory(
            type='Event', status='Active', scheduled_time=None,
            max_participants=10, duration=Decimal('2.00'), title='No time',
        )
        with_time = _event(now + timedelta(days=2), title='With time')

        client = APIClient()
        response = client.get(
            '/api/services/',
            {
                'type': 'Event',
                'date_from': (now + timedelta(days=1)).date().isoformat(),
            },
        )
        assert response.status_code == status.HTTP_200_OK
        results = response.data['results'] if isinstance(response.data, dict) else response.data
        ids = {r['id'] for r in results}
        assert str(with_time.id) in ids
        assert str(no_time.id) not in ids

    def test_invalid_date_returns_400(self):
        client = APIClient()
        response = client.get(
            '/api/services/',
            {'type': 'Event', 'date_from': 'not-a-real-date'},
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        # Field-level error so the frontend can attach it to the right input.
        assert 'date_from' in response.data.get('field_errors', {})

    def test_filter_silently_skipped_for_non_event_type(self):
        """date_from/to on a non-Event query is ignored, not an error."""
        ServiceFactory(type='Offer', status='Active', title='Some offer', max_participants=1, duration=Decimal('1.00'))

        client = APIClient()
        response = client.get(
            '/api/services/',
            {'type': 'Offer', 'date_from': '2026-01-01', 'date_to': '2026-12-31'},
        )
        assert response.status_code == status.HTTP_200_OK


@pytest.mark.django_db
@pytest.mark.integration
class TestEditLockSerializer:
    """ServiceSerializer exposes edit_locked / edit_lock_reason (#267)."""

    def test_event_outside_window_is_not_locked(self):
        event = _event(timezone.now() + timedelta(days=10))
        client = APIClient()
        response = client.get(f'/api/services/{event.id}/')
        assert response.status_code == status.HTTP_200_OK
        assert response.data['edit_locked'] is False
        assert response.data['edit_lock_reason'] is None

    def test_event_inside_24h_window_is_locked(self):
        event = _event(timezone.now() + timedelta(hours=12))
        client = APIClient()
        response = client.get(f'/api/services/{event.id}/')
        assert response.status_code == status.HTTP_200_OK
        assert response.data['edit_locked'] is True
        assert 'lockdown' in (response.data['edit_lock_reason'] or '').lower()

    def test_started_event_is_locked(self):
        event = _event(timezone.now() - timedelta(hours=1))
        client = APIClient()
        response = client.get(f'/api/services/{event.id}/')
        assert response.status_code == status.HTTP_200_OK
        assert response.data['edit_locked'] is True

    def test_terminal_status_service_is_locked(self):
        owner = UserFactory()
        service = ServiceFactory(
            user=owner, type='Offer', status='Cancelled',
            max_participants=1, duration=Decimal('1.00'),
        )
        client = APIClient()
        response = client.get(f'/api/services/{service.id}/')
        assert response.status_code == status.HTTP_200_OK
        assert response.data['edit_locked'] is True


@pytest.mark.django_db
@pytest.mark.integration
class TestCancelledEventDetail:
    """Direct GET on a cancelled event still returns 200 (#288 / FR-12g)."""

    def test_cancelled_event_detail_returns_200(self):
        event = ServiceFactory(
            type='Event', status='Cancelled',
            scheduled_time=timezone.now() + timedelta(days=2),
            max_participants=10, duration=Decimal('2.00'),
        )
        client = APIClient()
        response = client.get(f'/api/services/{event.id}/')
        assert response.status_code == status.HTTP_200_OK
        assert response.data['status'] == 'Cancelled'
