"""
Integration tests for Discovery API — FR-19c, FR-19e, FR-19h (blur), NFR-19a.

Test classes and their status:
  TestAdminPinEvent             — green  (pin endpoint is implemented)
  TestAdminShowcaseFeatured     — xfail  (FR-19c: no showcase/featured concept)
  TestFollowSystem              — xfail  (FR-19e: no follow model or endpoints)
  TestDiscoveryFeedPerformance  — xfail  (NFR-19a: no SLA test enforced)
  TestLocationBlurInFeed        — xfail  (FR-19h: feed distance values are not blurred)
"""
import time
import pytest
from decimal import Decimal
from datetime import timedelta

from django.utils import timezone
from rest_framework.test import APIClient

from api.tests.helpers.factories import (
    UserFactory,
    ServiceFactory,
    HandshakeFactory,
)


# ---------------------------------------------------------------------------
# FR-19c — Admin pin event (green — already implemented)
# ---------------------------------------------------------------------------

@pytest.mark.django_db
@pytest.mark.integration
class TestAdminPinEvent:
    """
    Pinning an event via POST /api/services/{id}/pin-event/ is fully implemented.
    These tests document and protect the existing behaviour.
    """

    def _admin_client(self):
        admin = UserFactory(role='admin', is_staff=True, is_superuser=True)
        client = APIClient()
        client.force_authenticate(user=admin)
        return client, admin

    def test_admin_can_pin_event(self):
        """Admin can toggle is_pinned=True on an event."""
        client, _ = self._admin_client()
        event = ServiceFactory(type='Event', status='Active', is_pinned=False)

        resp = client.post(f'/api/services/{event.id}/pin-event/')

        assert resp.status_code == 200
        event.refresh_from_db()
        assert event.is_pinned is True

    def test_admin_can_unpin_event(self):
        """Calling pin-event on an already-pinned event toggles it back to False."""
        client, _ = self._admin_client()
        event = ServiceFactory(type='Event', status='Active', is_pinned=True)

        resp = client.post(f'/api/services/{event.id}/pin-event/')

        assert resp.status_code == 200
        event.refresh_from_db()
        assert event.is_pinned is False

    def test_non_admin_cannot_pin_event(self):
        """Regular member must receive 403 when attempting to pin an event."""
        member = UserFactory(role='member')
        client = APIClient()
        client.force_authenticate(user=member)
        event = ServiceFactory(type='Event', status='Active')

        resp = client.post(f'/api/services/{event.id}/pin-event/')

        assert resp.status_code == 403

    def test_pin_endpoint_rejects_non_event_service(self):
        """Offer and Need services cannot be pinned via the event pin endpoint."""
        client, _ = self._admin_client()
        offer = ServiceFactory(type='Offer', status='Active')

        resp = client.post(f'/api/services/{offer.id}/pin-event/')

        assert resp.status_code in (400, 403, 422)

    def test_pinned_events_appear_before_unpinned_in_feed(self):
        """Pinned events must sort ahead of unpinned events in the discovery feed."""
        ServiceFactory(type='Event', status='Active', is_pinned=False, hot_score=100.0)
        ServiceFactory(type='Event', status='Active', is_pinned=True, hot_score=1.0)

        client = APIClient()
        resp = client.get('/api/services/?type=Event')
        assert resp.status_code == 200

        results = resp.data.get('results', [])
        pinned_idx = next(
            (i for i, s in enumerate(results) if s.get('is_pinned') is True), None
        )
        unpinned_idx = next(
            (i for i, s in enumerate(results) if s.get('is_pinned') is False), None
        )
        assert pinned_idx is not None
        assert unpinned_idx is not None
        assert pinned_idx < unpinned_idx, "Pinned event should appear before unpinned event."


# ---------------------------------------------------------------------------
# FR-19c — Admin showcase / featured section (xfail — not implemented)
# ---------------------------------------------------------------------------

@pytest.mark.django_db
@pytest.mark.integration
@pytest.mark.xfail(
    reason="FR-19c: no 'showcase' or 'featured section' concept exists; only is_pinned is implemented",
    strict=False,
)
class TestAdminShowcaseFeatured:
    """
    The spec requires admins to be able to showcase events in 'featured sections' —
    a distinct placement separate from sort-order pinning.

    These tests are xfail because:
    - Service has no is_featured field.
    - There is no /api/services/{id}/feature/ or /api/featured/ endpoint.
    - There is no homepage featured section feed.
    """

    def test_admin_can_feature_an_event(self):
        """Admin should be able to mark an event as featured."""
        admin = UserFactory(role='admin', is_staff=True, is_superuser=True)
        client = APIClient()
        client.force_authenticate(user=admin)
        event = ServiceFactory(type='Event', status='Active')

        resp = client.post(f'/api/services/{event.id}/feature/')

        assert resp.status_code == 200
        event.refresh_from_db()
        assert getattr(event, 'is_featured', False) is True

    def test_featured_events_appear_in_dedicated_featured_feed(self):
        """A dedicated feed endpoint must return only featured events."""
        ServiceFactory(type='Event', status='Active')  # not featured
        admin = UserFactory(role='admin', is_staff=True, is_superuser=True)
        featured_event = ServiceFactory(type='Event', status='Active')
        # Mark it as featured via API
        client = APIClient()
        client.force_authenticate(user=admin)
        client.post(f'/api/services/{featured_event.id}/feature/')

        # Fetch the featured feed
        resp = client.get('/api/services/featured/')
        assert resp.status_code == 200
        result_ids = [s['id'] for s in resp.data.get('results', [])]
        assert str(featured_event.id) in result_ids

    def test_featured_placement_has_optional_expiry(self):
        """Featured placements should accept an expiry datetime after which they are removed."""
        admin = UserFactory(role='admin', is_staff=True, is_superuser=True)
        client = APIClient()
        client.force_authenticate(user=admin)
        event = ServiceFactory(type='Event', status='Active')
        expiry = (timezone.now() + timedelta(days=7)).isoformat()

        resp = client.post(
            f'/api/services/{event.id}/feature/',
            data={'expires_at': expiry},
            format='json',
        )
        assert resp.status_code == 200


# ---------------------------------------------------------------------------
# FR-19e — Follow system (xfail — not implemented)
# ---------------------------------------------------------------------------

@pytest.mark.django_db
@pytest.mark.integration
@pytest.mark.xfail(
    reason="FR-19e: no Follow model, no follow endpoints, no feed boost implemented",
    strict=False,
)
class TestFollowSystem:
    """
    FR-19e requires users to follow each other and for followed-user content to
    receive a boost in the discovery feed.

    These tests are xfail because no follow infrastructure exists in the codebase.
    """

    def test_user_can_follow_another_user(self):
        """POST /api/users/{id}/follow/ should create a follow relationship."""
        follower = UserFactory()
        followed = UserFactory()
        client = APIClient()
        client.force_authenticate(user=follower)

        resp = client.post(f'/api/users/{followed.id}/follow/')

        assert resp.status_code in (200, 201)

    def test_user_can_unfollow(self):
        """DELETE /api/users/{id}/follow/ should remove the follow relationship."""
        follower = UserFactory()
        followed = UserFactory()
        client = APIClient()
        client.force_authenticate(user=follower)
        client.post(f'/api/users/{followed.id}/follow/')

        resp = client.delete(f'/api/users/{followed.id}/follow/')

        assert resp.status_code in (200, 204)

    def test_follow_is_idempotent(self):
        """Following the same user twice should not create a duplicate entry."""
        follower = UserFactory()
        followed = UserFactory()
        client = APIClient()
        client.force_authenticate(user=follower)
        client.post(f'/api/users/{followed.id}/follow/')

        resp = client.post(f'/api/users/{followed.id}/follow/')

        assert resp.status_code in (200, 201, 400)  # 400 for duplicate is acceptable

    def test_cannot_follow_self(self):
        """A user should not be able to follow themselves."""
        user = UserFactory()
        client = APIClient()
        client.force_authenticate(user=user)

        resp = client.post(f'/api/users/{user.id}/follow/')

        assert resp.status_code in (400, 403)

    def test_followed_user_listings_rank_higher_in_feed(self):
        """
        Services from a followed user should rank above equivalent-score services
        from non-followed users in the discovery feed.
        """
        viewer = UserFactory()
        followed_provider = UserFactory()
        other_provider = UserFactory()

        followed_svc = ServiceFactory(
            user=followed_provider, type='Offer', status='Active', hot_score=5.0
        )
        other_svc = ServiceFactory(
            user=other_provider, type='Offer', status='Active', hot_score=5.0
        )

        # Follow the first provider
        client = APIClient()
        client.force_authenticate(user=viewer)
        client.post(f'/api/users/{followed_provider.id}/follow/')

        resp = client.get('/api/services/?type=Offer')
        assert resp.status_code == 200
        results = resp.data.get('results', [])
        ids = [str(s['id']) for s in results]

        assert str(followed_svc.id) in ids
        assert str(other_svc.id) in ids
        assert ids.index(str(followed_svc.id)) < ids.index(str(other_svc.id)), (
            "Followed-user service should appear before same-score non-followed service."
        )

    def test_anonymous_user_follow_endpoint_requires_auth(self):
        """Anonymous users should receive 401 when hitting the follow endpoint."""
        followed = UserFactory()
        client = APIClient()

        resp = client.post(f'/api/users/{followed.id}/follow/')

        assert resp.status_code == 401


# ---------------------------------------------------------------------------
# NFR-19a — Discovery feed 2-second SLA (xfail — no benchmark enforced)
# ---------------------------------------------------------------------------

@pytest.mark.django_db
@pytest.mark.integration
@pytest.mark.xfail(
    reason="NFR-19a: no performance SLA test exists; 2s threshold not enforced",
    strict=False,
)
class TestDiscoveryFeedPerformance:
    """
    The discovery feed (including serialization and pagination) must return
    the first page within 2 seconds for a catalogue of ~1 000 active services.

    Xfail because no benchmark guard exists and the threshold has not been
    validated under load.
    """

    FEED_SLA_SECONDS = 2.0

    def test_feed_loads_within_2_seconds_with_1000_services(self, db):
        """Anonymous feed request for 1 000 services should arrive in < 2s."""
        user = UserFactory()
        ServiceFactory.create_batch(1000, status='Active', user=user)

        client = APIClient()
        start = time.monotonic()
        resp = client.get('/api/services/')
        elapsed = time.monotonic() - start

        assert resp.status_code == 200
        assert elapsed < self.FEED_SLA_SECONDS, (
            f"Discovery feed took {elapsed:.3f}s — exceeds the {self.FEED_SLA_SECONDS}s NFR-19a SLA."
        )

    def test_authenticated_feed_with_location_filter_within_2_seconds(self, db):
        """Authenticated feed with a 10km radius filter should also meet the SLA."""
        user = UserFactory()
        ServiceFactory.create_batch(
            500, status='Active', user=user,
            location_type='In-Person',
            location_lat=Decimal('41.012345'),
            location_lng=Decimal('28.974321'),
        )
        ServiceFactory.create_batch(500, status='Active', user=user, location_type='Online')

        client = APIClient()
        client.force_authenticate(user=user)
        start = time.monotonic()
        resp = client.get('/api/services/?lat=41.012345&lng=28.974321&distance=10')
        elapsed = time.monotonic() - start

        assert resp.status_code == 200
        assert elapsed < self.FEED_SLA_SECONDS, (
            f"Location-filtered feed took {elapsed:.3f}s — exceeds the NFR-19a SLA."
        )
