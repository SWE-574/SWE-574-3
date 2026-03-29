"""
Integration tests for FR-12: View Events

Covers the public event browsing and discovery requirements:
  FR-12a  Anonymous and authenticated users can view the event feed
  FR-12c  Users can filter events by date range (date_from / date_to)
  FR-12e  Quota occupancy (participant_count / max_participants) appears in list response
  FR-12f  Unauthenticated join attempt returns 401
  FR-12g  Cancelled events excluded from browse; detail page exposes cancellation state

Tests for date-range filtering (FR-12c) will fail red until DateRangeStrategy is
implemented in search_filters.py and wired into ServiceViewSet.
"""
import pytest
from datetime import timedelta
from decimal import Decimal
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from api.tests.helpers.factories import UserFactory, ServiceFactory, HandshakeFactory
from api.tests.helpers.test_client import AuthenticatedAPIClient
from api.models import Service


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def make_event(user=None, title='Test Event', days_from_now=3, max_participants=10,
               status='Active', **kwargs):
    """Create an Active event Service scheduled `days_from_now` days in the future."""
    if user is None:
        user = UserFactory()
    return ServiceFactory(
        user=user,
        title=title,
        type='Event',
        status=status,
        max_participants=max_participants,
        scheduled_time=timezone.now() + timedelta(days=days_from_now),
        **kwargs,
    )


# ---------------------------------------------------------------------------
# FR-12a — Anonymous and authenticated access to the event feed
# ---------------------------------------------------------------------------

@pytest.mark.django_db
@pytest.mark.integration
class TestEventFeedAnonymousAccess:
    """FR-12a: public event feed is readable without authentication."""

    def test_anonymous_user_can_list_events(self):
        """FR-12a: unauthenticated GET /api/services/?type=Event returns 200."""
        make_event(title='Public Event')
        client = APIClient()

        response = client.get('/api/services/?type=Event')

        assert response.status_code == status.HTTP_200_OK
        assert 'results' in response.data

    def test_anonymous_user_sees_active_events(self):
        """FR-12a: anonymous feed includes Active events."""
        make_event(title='Visible Event')
        client = APIClient()

        response = client.get('/api/services/?type=Event')

        titles = [s['title'] for s in response.data['results']]
        assert 'Visible Event' in titles

    def test_authenticated_user_can_list_events(self):
        """FR-12a: authenticated user also gets the event feed."""
        user = UserFactory()
        make_event(user=user, title='Auth User Event')
        client = AuthenticatedAPIClient()
        client.authenticate_user(user)

        response = client.get('/api/services/?type=Event')

        assert response.status_code == status.HTTP_200_OK
        titles = [s['title'] for s in response.data['results']]
        assert 'Auth User Event' in titles


# ---------------------------------------------------------------------------
# FR-12c — Date range filtering
# (These tests will FAIL until DateRangeStrategy is implemented)
# ---------------------------------------------------------------------------

@pytest.mark.django_db
@pytest.mark.integration
@pytest.mark.xfail(reason="FR-12c: date_from/date_to filter not yet implemented", strict=False)
class TestEventDateRangeFilter:
    """FR-12c: users can filter events by date_from and date_to."""

    def test_date_from_excludes_past_events(self):
        """FR-12c: date_from param returns only events on or after that date."""
        make_event(title='Past Event', days_from_now=-2)
        make_event(title='Future Event', days_from_now=5)

        date_from = (timezone.now() + timedelta(days=1)).date().isoformat()
        client = APIClient()

        response = client.get(f'/api/services/?type=Event&date_from={date_from}')

        assert response.status_code == status.HTTP_200_OK
        titles = [s['title'] for s in response.data['results']]
        assert 'Future Event' in titles
        assert 'Past Event' not in titles

    def test_date_to_excludes_far_future_events(self):
        """FR-12c: date_to param returns only events on or before that date."""
        make_event(title='Near Event', days_from_now=2)
        make_event(title='Far Event', days_from_now=30)

        date_to = (timezone.now() + timedelta(days=7)).date().isoformat()
        client = APIClient()

        response = client.get(f'/api/services/?type=Event&date_to={date_to}')

        assert response.status_code == status.HTTP_200_OK
        titles = [s['title'] for s in response.data['results']]
        assert 'Near Event' in titles
        assert 'Far Event' not in titles

    def test_date_from_and_date_to_combined(self):
        """FR-12c: both params together form an inclusive date window."""
        make_event(title='Before Window', days_from_now=1)
        make_event(title='In Window', days_from_now=5)
        make_event(title='After Window', days_from_now=14)

        date_from = (timezone.now() + timedelta(days=3)).date().isoformat()
        date_to = (timezone.now() + timedelta(days=7)).date().isoformat()
        client = APIClient()

        response = client.get(
            f'/api/services/?type=Event&date_from={date_from}&date_to={date_to}'
        )

        assert response.status_code == status.HTTP_200_OK
        titles = [s['title'] for s in response.data['results']]
        assert 'In Window' in titles
        assert 'Before Window' not in titles
        assert 'After Window' not in titles

    def test_invalid_date_from_returns_400(self):
        """FR-12c: invalid date_from value should return 400, not silently ignored."""
        client = APIClient()

        response = client.get('/api/services/?type=Event&date_from=not-a-date')

        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_invalid_date_to_returns_400(self):
        """FR-12c: invalid date_to value should return 400, not silently ignored."""
        client = APIClient()

        response = client.get('/api/services/?type=Event&date_to=not-a-date')

        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_date_filter_does_not_affect_non_event_services(self):
        """FR-12c: date_from/date_to only applies when type=Event; other services unaffected."""
        ServiceFactory(type='Offer', status='Active', title='Regular Offer')
        date_from = (timezone.now() + timedelta(days=1)).date().isoformat()
        client = APIClient()

        # Query without type=Event — the date filter should not silently drop regular services
        response = client.get(f'/api/services/?type=Offer&date_from={date_from}')

        assert response.status_code == status.HTTP_200_OK
        titles = [s['title'] for s in response.data['results']]
        assert 'Regular Offer' in titles


# ---------------------------------------------------------------------------
# FR-12e — Quota occupancy in list response
# ---------------------------------------------------------------------------

@pytest.mark.django_db
@pytest.mark.integration
class TestEventQuotaDisplay:
    """FR-12e: event cards include occupancy data (participant_count and max_participants)."""

    def test_event_card_includes_participant_count(self):
        """FR-12e: list response includes participant_count field for events."""
        make_event(title='Quota Event', max_participants=5)
        client = APIClient()

        response = client.get('/api/services/?type=Event')

        assert response.status_code == status.HTTP_200_OK
        event_data = next(
            (s for s in response.data['results'] if s['title'] == 'Quota Event'), None
        )
        assert event_data is not None
        assert 'participant_count' in event_data

    def test_event_card_includes_max_participants(self):
        """FR-12e: list response includes max_participants for quota display."""
        make_event(title='Capped Event', max_participants=8)
        client = APIClient()

        response = client.get('/api/services/?type=Event')

        event_data = next(
            (s for s in response.data['results'] if s['title'] == 'Capped Event'), None
        )
        assert event_data is not None
        assert event_data['max_participants'] == 8

    def test_participant_count_reflects_accepted_handshakes(self):
        """FR-12e: participant_count increments when a user joins an event."""
        organizer = UserFactory()
        event = make_event(user=organizer, title='Joinable Event', max_participants=5)
        joiner = UserFactory()
        HandshakeFactory(service=event, requester=joiner, status='accepted',
                         provisioned_hours=Decimal('0'))

        client = APIClient()
        response = client.get('/api/services/?type=Event')

        event_data = next(
            (s for s in response.data['results'] if s['title'] == 'Joinable Event'), None
        )
        assert event_data is not None
        assert event_data['participant_count'] >= 1


# ---------------------------------------------------------------------------
# FR-12f — Unauthenticated join is blocked
# ---------------------------------------------------------------------------

@pytest.mark.django_db
@pytest.mark.integration
class TestEventJoinAuthGuard:
    """FR-12f: anonymous users cannot join events; they receive 401."""

    def test_unauthenticated_join_returns_401(self):
        """FR-12f: POST join-event without auth returns 401."""
        event = make_event(title='Auth Guard Event')
        client = APIClient()

        response = client.post(f'/api/services/{event.id}/join-event/')

        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_unauthenticated_user_can_still_view_event_detail(self):
        """FR-12f: read-only access to event detail is allowed anonymously."""
        event = make_event(title='Readable Event')
        client = APIClient()

        response = client.get(f'/api/services/{event.id}/')

        assert response.status_code == status.HTTP_200_OK


# ---------------------------------------------------------------------------
# FR-12g — Cancelled events excluded from browse; detail page shows state
# ---------------------------------------------------------------------------

@pytest.mark.django_db
@pytest.mark.integration
class TestCancelledEventVisibility:
    """FR-12g: cancelled events are hidden from browse results."""

    def test_cancelled_event_not_in_feed(self):
        """FR-12g: cancelled events must not appear in the public event feed."""
        make_event(title='Active Event', status='Active')
        make_event(title='Cancelled Event', status='Cancelled')
        client = APIClient()

        response = client.get('/api/services/?type=Event')

        assert response.status_code == status.HTTP_200_OK
        titles = [s['title'] for s in response.data['results']]
        assert 'Active Event' in titles
        assert 'Cancelled Event' not in titles

    def test_cancelled_event_detail_still_returns_object(self):
        """
        FR-12g edge case: direct fetch of a cancelled event's detail URL
        should return the object (so the frontend can render a cancellation notice)
        rather than 404.
        """
        cancelled = make_event(title='Gone Event', status='Cancelled')
        client = APIClient()

        response = client.get(f'/api/services/{cancelled.id}/')

        # Object should be retrievable so the frontend can show cancellation state
        assert response.status_code == status.HTTP_200_OK
        assert response.data['status'] == 'Cancelled'

    def test_cancelled_event_detail_exposes_cancelled_status_field(self):
        """
        FR-12g: the detail response for a cancelled event must include
        status='Cancelled' so the frontend can render the appropriate UI.
        """
        cancelled = make_event(title='Cancelled Detail Event', status='Cancelled')
        client = APIClient()

        response = client.get(f'/api/services/{cancelled.id}/')

        assert 'status' in response.data
        assert response.data['status'] == 'Cancelled'
