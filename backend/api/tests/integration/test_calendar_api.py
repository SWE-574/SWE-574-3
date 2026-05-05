"""
Integration tests for GET /api/users/me/calendar/
"""
import pytest
from decimal import Decimal
from datetime import date, timedelta
from django.utils import timezone
from django.core.cache import cache
from rest_framework import status
from unittest.mock import patch

from api.tests.helpers.factories import UserFactory, ServiceFactory, HandshakeFactory
from api.tests.helpers.test_client import AuthenticatedAPIClient


CALENDAR_URL = '/api/users/me/calendar/'


@pytest.mark.django_db
@pytest.mark.integration
class TestMeCalendarAuth:
    def test_requires_auth_returns_401(self):
        client = AuthenticatedAPIClient()
        response = client.get(CALENDAR_URL)
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_authenticated_user_gets_200(self):
        user = UserFactory()
        client = AuthenticatedAPIClient().authenticate_user(user)
        response = client.get(CALENDAR_URL)
        assert response.status_code == status.HTTP_200_OK


@pytest.mark.django_db
@pytest.mark.integration
class TestMeCalendarResponseShape:
    def test_response_has_required_top_level_keys(self):
        user = UserFactory()
        client = AuthenticatedAPIClient().authenticate_user(user)
        response = client.get(CALENDAR_URL)
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert 'items' in data
        assert 'conflicts' in data
        assert 'range' in data

    def test_range_keys(self):
        user = UserFactory()
        client = AuthenticatedAPIClient().authenticate_user(user)
        response = client.get(CALENDAR_URL)
        r = response.json()['range']
        assert 'from' in r
        assert 'to' in r

    def test_default_window_is_today_plus_60_days(self):
        user = UserFactory()
        client = AuthenticatedAPIClient().authenticate_user(user)
        response = client.get(CALENDAR_URL)
        r = response.json()['range']
        today = date.today().isoformat()
        expected_to = (date.today() + timedelta(days=60)).isoformat()
        assert r['from'] == today
        assert r['to'] == expected_to


@pytest.mark.django_db
@pytest.mark.integration
class TestMeCalendarQueryParams:
    def test_custom_from_to(self):
        user = UserFactory()
        client = AuthenticatedAPIClient().authenticate_user(user)
        from_dt = '2026-06-01'
        to_dt = '2026-07-01'
        response = client.get(CALENDAR_URL, {'from': from_dt, 'to': to_dt})
        assert response.status_code == status.HTTP_200_OK
        r = response.json()['range']
        assert r['from'] == from_dt
        assert r['to'] == to_dt

    def test_window_over_120_days_returns_400(self):
        user = UserFactory()
        client = AuthenticatedAPIClient().authenticate_user(user)
        from_dt = '2026-01-01'
        to_dt = '2026-06-01'  # > 120 days
        response = client.get(CALENDAR_URL, {'from': from_dt, 'to': to_dt})
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        data = response.json()
        assert 'max_days' in data
        assert data['max_days'] == 120

    def test_invalid_from_date_returns_400(self):
        user = UserFactory()
        client = AuthenticatedAPIClient().authenticate_user(user)
        response = client.get(CALENDAR_URL, {'from': 'not-a-date'})
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_invalid_to_date_returns_400(self):
        user = UserFactory()
        client = AuthenticatedAPIClient().authenticate_user(user)
        response = client.get(CALENDAR_URL, {'to': 'not-a-date'})
        assert response.status_code == status.HTTP_400_BAD_REQUEST


@pytest.mark.django_db
@pytest.mark.integration
class TestMeCalendarItems:
    def test_only_returns_own_items(self):
        user1 = UserFactory()
        user2 = UserFactory()
        provider = UserFactory()
        svc = ServiceFactory(user=provider, type='Offer', duration=Decimal('2.00'))
        scheduled = timezone.now() + timedelta(hours=5)
        # user1 has an accepted handshake
        HandshakeFactory(
            service=svc, requester=user1, status='accepted',
            scheduled_time=scheduled, exact_duration=Decimal('2.00')
        )
        # user2 has no handshakes
        client1 = AuthenticatedAPIClient().authenticate_user(user1)
        client2 = AuthenticatedAPIClient().authenticate_user(user2)
        resp1 = client1.get(CALENDAR_URL)
        resp2 = client2.get(CALENDAR_URL)
        items1 = resp1.json()['items']
        items2 = resp2.json()['items']
        # user1 should see at least one item; user2 should see none from svc
        assert len(items1) >= 1
        assert len(items2) == 0

    def test_item_fields_present(self):
        provider = UserFactory()
        requester = UserFactory()
        svc = ServiceFactory(user=provider, type='Offer', duration=Decimal('2.00'))
        scheduled = timezone.now() + timedelta(hours=5)
        HandshakeFactory(
            service=svc, requester=requester, status='accepted',
            scheduled_time=scheduled, exact_duration=Decimal('2.00')
        )
        client = AuthenticatedAPIClient().authenticate_user(requester)
        resp = client.get(CALENDAR_URL)
        assert resp.status_code == status.HTTP_200_OK
        items = resp.json()['items']
        assert len(items) >= 1
        item = items[0]
        required_keys = [
            'id', 'kind', 'title', 'start', 'end', 'duration_hours',
            'location_type', 'location_label', 'service_type', 'service_id',
            'handshake_id', 'chat_id', 'counterpart', 'is_owner',
            'status', 'accent_token', 'link',
        ]
        for k in required_keys:
            assert k in item, f"Missing key: {k}"

    def test_excludes_completed_handshakes(self):
        provider = UserFactory()
        requester = UserFactory()
        svc = ServiceFactory(user=provider, type='Offer', duration=Decimal('2.00'))
        scheduled = timezone.now() + timedelta(hours=5)
        HandshakeFactory(
            service=svc, requester=requester, status='completed',
            scheduled_time=scheduled,
        )
        client = AuthenticatedAPIClient().authenticate_user(requester)
        resp = client.get(CALENDAR_URL)
        items = resp.json()['items']
        assert len(items) == 0

    def test_excludes_cancelled_handshakes(self):
        provider = UserFactory()
        requester = UserFactory()
        svc = ServiceFactory(user=provider, type='Offer', duration=Decimal('2.00'))
        scheduled = timezone.now() + timedelta(hours=5)
        HandshakeFactory(
            service=svc, requester=requester, status='cancelled',
            scheduled_time=scheduled,
        )
        client = AuthenticatedAPIClient().authenticate_user(requester)
        resp = client.get(CALENDAR_URL)
        items = resp.json()['items']
        assert len(items) == 0


@pytest.mark.django_db
@pytest.mark.integration
class TestMeCalendarConflicts:
    def test_conflicts_array_present(self):
        user = UserFactory()
        client = AuthenticatedAPIClient().authenticate_user(user)
        resp = client.get(CALENDAR_URL)
        data = resp.json()
        assert isinstance(data['conflicts'], list)

    def test_overlapping_items_produce_conflicts(self):
        provider = UserFactory()
        requester = UserFactory()
        # Two services, both overlapping with requester's handshakes
        svc1 = ServiceFactory(user=provider, type='Offer', duration=Decimal('3.00'))
        svc2 = ServiceFactory(user=provider, type='Offer', duration=Decimal('3.00'))
        scheduled1 = timezone.now() + timedelta(hours=2)
        scheduled2 = timezone.now() + timedelta(hours=3)  # overlaps with svc1 session
        hs1 = HandshakeFactory(
            service=svc1, requester=requester, status='accepted',
            scheduled_time=scheduled1, exact_duration=Decimal('3.00')
        )
        hs2 = HandshakeFactory(
            service=svc2, requester=requester, status='accepted',
            scheduled_time=scheduled2, exact_duration=Decimal('3.00')
        )
        client = AuthenticatedAPIClient().authenticate_user(requester)
        resp = client.get(CALENDAR_URL)
        data = resp.json()
        assert len(data['conflicts']) > 0
        conflict_item_ids = {c['item_id'] for c in data['conflicts']}
        # At least one of the handshake IDs should be in conflicts
        assert str(hs1.id) in conflict_item_ids or str(hs2.id) in conflict_item_ids


@pytest.mark.django_db
@pytest.mark.integration
class TestMeCalendarCaching:
    def test_second_call_with_no_changes_returns_same_data(self):
        """Two identical calls with no mutations in between return the same response.

        Note: with explicit cache invalidation on post_save signals, any handshake
        or service mutation will correctly bust the cache. This test verifies the
        cache hit path for repeated reads with no intervening changes.
        """
        provider = UserFactory()
        user = UserFactory()
        svc = ServiceFactory(user=provider, type='Offer', duration=Decimal('2.00'))
        scheduled = timezone.now() + timedelta(hours=5)
        HandshakeFactory(
            service=svc, requester=user, status='accepted',
            scheduled_time=scheduled, exact_duration=Decimal('2.00')
        )
        client = AuthenticatedAPIClient().authenticate_user(user)
        resp1 = client.get(CALENDAR_URL)
        assert resp1.status_code == status.HTTP_200_OK
        data1 = resp1.json()

        # Second call — no mutations, cache still valid
        resp2 = client.get(CALENDAR_URL)
        assert resp2.status_code == status.HTTP_200_OK
        data2 = resp2.json()
        # Same data: same item count and same item IDs
        assert len(data2['items']) == len(data1['items'])
        assert [item['id'] for item in data2['items']] == [item['id'] for item in data1['items']]


@pytest.mark.django_db
@pytest.mark.integration
class TestMeCalendarCacheInvalidation:
    """Spec §6.1: calendar cache must be explicitly invalidated on handshake state
    transitions and event create/cancel — not just rely on TTL."""

    def test_cancelled_handshake_disappears_after_status_change(self):
        """Cancelling an accepted handshake must invalidate the requester's calendar cache."""
        provider = UserFactory()
        requester = UserFactory()
        svc = ServiceFactory(user=provider, type='Offer', duration=Decimal('2.00'))
        scheduled = timezone.now() + timedelta(hours=5)
        hs = HandshakeFactory(
            service=svc, requester=requester, status='accepted',
            scheduled_time=scheduled, exact_duration=Decimal('2.00'),
        )
        client = AuthenticatedAPIClient().authenticate_user(requester)

        # First call: populates cache, handshake is visible
        resp1 = client.get(CALENDAR_URL)
        assert resp1.status_code == status.HTTP_200_OK
        assert len(resp1.json()['items']) >= 1

        # Transition handshake to cancelled (triggers post_save signal → invalidation)
        hs.status = 'cancelled'
        hs.save()

        # Second call: cache was invalidated, so fresh DB read — item gone
        resp2 = client.get(CALENDAR_URL)
        assert resp2.status_code == status.HTTP_200_OK
        item_ids = [item['id'] for item in resp2.json()['items']]
        assert str(hs.id) not in item_ids, (
            "Cancelled handshake still in calendar — cache was not invalidated"
        )

    def test_new_accepted_handshake_appears_after_status_change(self):
        """Accepting a handshake must invalidate the calendar cache so the new item is visible."""
        provider = UserFactory()
        requester = UserFactory()
        svc = ServiceFactory(user=provider, type='Offer', duration=Decimal('2.00'))
        scheduled = timezone.now() + timedelta(hours=6)
        hs = HandshakeFactory(
            service=svc, requester=requester, status='pending',
            scheduled_time=scheduled, exact_duration=Decimal('2.00'),
        )
        client = AuthenticatedAPIClient().authenticate_user(requester)

        # First call: pending handshake is NOT in calendar (only accepted statuses appear)
        resp1 = client.get(CALENDAR_URL)
        assert resp1.status_code == status.HTTP_200_OK
        item_ids_before = [item['id'] for item in resp1.json()['items']]
        assert str(hs.id) not in item_ids_before

        # Transition handshake to accepted (triggers post_save signal → invalidation)
        hs.status = 'accepted'
        hs.save()

        # Second call: cache invalidated, new accepted handshake is now visible
        resp2 = client.get(CALENDAR_URL)
        assert resp2.status_code == status.HTTP_200_OK
        item_ids_after = [item['id'] for item in resp2.json()['items']]
        assert str(hs.id) in item_ids_after, (
            "Newly accepted handshake not in calendar — cache was not invalidated"
        )

    def test_cancelled_event_disappears_from_organiser_calendar(self):
        """Cancelling an Event service must invalidate the organiser's calendar cache."""
        organiser = UserFactory()
        svc = ServiceFactory(
            user=organiser, type='Event', duration=Decimal('2.00'),
            scheduled_time=timezone.now() + timedelta(hours=8),
            status='Active',
        )
        client = AuthenticatedAPIClient().authenticate_user(organiser)

        # First call: event is visible for organiser
        resp1 = client.get(CALENDAR_URL)
        assert resp1.status_code == status.HTTP_200_OK
        assert len(resp1.json()['items']) >= 1

        # Cancel the event (triggers post_save signal → invalidation via invalidate_on_service_change)
        svc.status = 'Cancelled'
        svc.save()

        # Second call: cache invalidated, cancelled event no longer in calendar
        resp2 = client.get(CALENDAR_URL)
        assert resp2.status_code == status.HTTP_200_OK
        item_ids = [item['id'] for item in resp2.json()['items']]
        assert str(svc.id) not in item_ids, (
            "Cancelled event still in organiser's calendar — cache was not invalidated"
        )


@pytest.mark.django_db
@pytest.mark.integration
class TestMeCalendarCacheTrackingSet:
    """H2: Both cache keys from two different windows must be tracked and invalidated together."""

    def test_two_windows_both_tracked_and_invalidated(self):
        """Simulate two sequential fetches for different windows.

        Both cache keys must appear in the tracking set so that a handshake
        state change (which calls invalidate_user_calendar) wipes both windows.
        """
        provider = UserFactory()
        user = UserFactory()
        svc = ServiceFactory(user=provider, type='Offer', duration=Decimal('2.00'))
        # Handshake inside the first window (today + 5 h) and the second (far future)
        scheduled = timezone.now() + timedelta(hours=5)
        hs = HandshakeFactory(
            service=svc, requester=user, status='accepted',
            scheduled_time=scheduled, exact_duration=Decimal('2.00'),
        )

        client = AuthenticatedAPIClient().authenticate_user(user)

        from_w1 = date.today().isoformat()
        to_w1 = (date.today() + timedelta(days=30)).isoformat()
        from_w2 = date.today().isoformat()
        to_w2 = (date.today() + timedelta(days=60)).isoformat()

        # Fetch window 1 — populates cache and registers key
        resp1 = client.get(CALENDAR_URL, {'from': from_w1, 'to': to_w1})
        assert resp1.status_code == status.HTTP_200_OK

        # Fetch window 2 — populates cache and registers a different key
        resp2 = client.get(CALENDAR_URL, {'from': from_w2, 'to': to_w2})
        assert resp2.status_code == status.HTTP_200_OK

        # Both keys should be in the tracking set
        tracking_key = f"user_calendar_keys:{user.id}"
        tracked = cache.get(tracking_key, set())
        expected_key1 = f"user_calendar:{user.id}:{from_w1}:{to_w1}"
        expected_key2 = f"user_calendar:{user.id}:{from_w2}:{to_w2}"
        assert expected_key1 in tracked, "Window-1 cache key missing from tracking set"
        assert expected_key2 in tracked, "Window-2 cache key missing from tracking set"

        # Trigger invalidation via handshake state change
        hs.status = 'cancelled'
        hs.save()

        # Both windows must now be gone from cache (fresh DB read)
        assert cache.get(expected_key1) is None, "Window-1 cache still populated after invalidation"
        assert cache.get(expected_key2) is None, "Window-2 cache still populated after invalidation"

        # Verify fresh responses reflect the cancellation (handshake no longer in calendar)
        resp3 = client.get(CALENDAR_URL, {'from': from_w1, 'to': to_w1})
        assert resp3.status_code == status.HTTP_200_OK
        item_ids_w1 = [item['id'] for item in resp3.json()['items']]
        assert str(hs.id) not in item_ids_w1, (
            "Cancelled handshake still visible in window-1 after invalidation"
        )
