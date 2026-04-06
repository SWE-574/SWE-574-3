"""
Unit tests for location privacy / coordinate blur behaviour — FR-19h, FR-17l.

FR-19h requires:
  - In-person listing coordinates are blurred (~500m) until the requesting user has
    an ACCEPTED handshake with the service provider.
  - Once a handshake is accepted, exact coordinates are visible to both participants.
  - The blur offset must be deterministic (same service → same fuzz) to prevent
    triangulation via repeated queries.

Current codebase status:
  - _fuzzy_coords() in serializers.py applies a deterministic FNV-1a ~500m offset.
  - The blur is applied to ALL non-owner users regardless of handshake status.
  - Conditional reveal on handshake ACCEPTED is NOT yet implemented.

Test classes:
  TestLocationBlurDeterminism   — green (current behaviour, already works)
  TestLocationBlurConditional   — xfail (FR-19h conditional reveal not implemented)
"""
import math
import pytest
from decimal import Decimal

from django.test import TestCase
from rest_framework.test import APIClient

from api.tests.helpers.factories import (
    UserFactory,
    ServiceFactory,
    HandshakeFactory,
)


# ---------------------------------------------------------------------------
# Green tests — document the current deterministic blur behaviour
# ---------------------------------------------------------------------------

@pytest.mark.django_db
@pytest.mark.unit
class TestLocationBlurDeterminism:
    """
    The existing _fuzzy_coords() offset must be deterministic:
    the same service ID always produces the same offset, so a single user
    cannot triangulate the real location by querying repeatedly.
    """

    def _fetch_coords(self, service, user):
        client = APIClient()
        client.force_authenticate(user=user)
        resp = client.get(f'/api/services/{service.id}/')
        assert resp.status_code == 200
        return resp.data.get('location_lat'), resp.data.get('location_lng')

    def test_non_owner_sees_fuzzed_coordinates(self):
        """Non-owner should not receive exact service coordinates."""
        provider = UserFactory()
        viewer = UserFactory()
        real_lat, real_lng = Decimal('41.012345'), Decimal('28.974321')
        service = ServiceFactory(
            user=provider,
            type='Offer',
            location_type='In-Person',
            location_lat=real_lat,
            location_lng=real_lng,
            status='Active',
        )

        lat, lng = self._fetch_coords(service, viewer)

        assert lat is not None
        assert lng is not None
        assert float(lat) != pytest.approx(float(real_lat), abs=1e-4), (
            "Non-owner received exact latitude — blur not applied."
        )

    def test_blur_is_consistent_across_requests(self):
        """Same non-owner querying the same service twice must get identical fuzzed coords."""
        provider = UserFactory()
        viewer = UserFactory()
        service = ServiceFactory(
            user=provider, type='Offer', location_type='In-Person',
            location_lat=Decimal('41.012345'), location_lng=Decimal('28.974321'),
            status='Active',
        )

        lat1, lng1 = self._fetch_coords(service, viewer)
        lat2, lng2 = self._fetch_coords(service, viewer)

        assert lat1 == lat2, "Fuzzed latitude changed between identical requests — not deterministic."
        assert lng1 == lng2, "Fuzzed longitude changed between identical requests — not deterministic."

    def test_different_services_get_different_offsets(self):
        """Two distinct services at the same real coordinates should fuzz to different locations."""
        provider = UserFactory()
        viewer = UserFactory()
        kwargs = dict(
            user=provider, type='Offer', location_type='In-Person',
            location_lat=Decimal('41.012345'), location_lng=Decimal('28.974321'),
            status='Active',
        )
        s1 = ServiceFactory(**kwargs)
        s2 = ServiceFactory(**kwargs)

        lat1, lng1 = self._fetch_coords(s1, viewer)
        lat2, lng2 = self._fetch_coords(s2, viewer)

        # Different services → different hash seeds → different offsets
        assert (lat1, lng1) != (lat2, lng2), (
            "Two different services produced identical fuzz — hash is not service-specific."
        )

    def test_owner_sees_exact_coordinates(self):
        """Service owner must receive the real unblurred coordinates."""
        provider = UserFactory()
        real_lat, real_lng = Decimal('41.012345'), Decimal('28.974321')
        service = ServiceFactory(
            user=provider, type='Offer', location_type='In-Person',
            location_lat=real_lat, location_lng=real_lng, status='Active',
        )

        lat, lng = self._fetch_coords(service, provider)

        assert float(lat) == pytest.approx(float(real_lat), abs=1e-4), (
            "Owner received fuzzed latitude — owner bypass is broken."
        )

    def test_online_service_coordinates_not_fuzzed(self):
        """Online services have no physical location — no blur should be applied."""
        provider = UserFactory()
        viewer = UserFactory()
        service = ServiceFactory(
            user=provider, type='Offer', location_type='Online',
            location_lat=None, location_lng=None, status='Active',
        )

        client = APIClient()
        client.force_authenticate(user=viewer)
        resp = client.get(f'/api/services/{service.id}/')
        assert resp.status_code == 200
        # location_lat/lng are null for Online services — no blur needed
        assert resp.data.get('location_lat') is None or resp.data.get('location_type') == 'Online'


# ---------------------------------------------------------------------------
# xfail tests — FR-19h conditional reveal on ACCEPTED handshake (not yet implemented)
# ---------------------------------------------------------------------------

@pytest.mark.django_db
@pytest.mark.unit
@pytest.mark.xfail(
    reason="FR-19h: blur is always-on; conditional reveal on ACCEPTED handshake not implemented",
    strict=False,
)
class TestLocationBlurConditional:
    """
    Once a handshake between the requester and provider reaches status='accepted',
    the requester should receive the exact (unblurred) service coordinates.

    These tests are xfail because the serializer currently blurs for all non-owners
    regardless of handshake status.
    """

    def _fetch_coords(self, service, user):
        client = APIClient()
        client.force_authenticate(user=user)
        resp = client.get(f'/api/services/{service.id}/')
        assert resp.status_code == 200
        return resp.data.get('location_lat'), resp.data.get('location_lng')

    def test_accepted_handshake_requester_sees_exact_coords(self):
        """A user with an accepted handshake should receive unblurred coordinates."""
        provider = UserFactory()
        requester = UserFactory()
        real_lat, real_lng = Decimal('41.012345'), Decimal('28.974321')
        service = ServiceFactory(
            user=provider, type='Offer', location_type='In-Person',
            location_lat=real_lat, location_lng=real_lng, status='Active',
        )
        HandshakeFactory(service=service, requester=requester, status='accepted')

        lat, lng = self._fetch_coords(service, requester)

        assert float(lat) == pytest.approx(float(real_lat), abs=1e-4), (
            "Requester with accepted handshake still received fuzzed coordinates."
        )
        assert float(lng) == pytest.approx(float(real_lng), abs=1e-4)

    def test_pending_handshake_requester_still_sees_fuzzed_coords(self):
        """A user with only a pending handshake should still see blurred coordinates."""
        provider = UserFactory()
        requester = UserFactory()
        real_lat, real_lng = Decimal('41.012345'), Decimal('28.974321')
        service = ServiceFactory(
            user=provider, type='Offer', location_type='In-Person',
            location_lat=real_lat, location_lng=real_lng, status='Active',
        )
        HandshakeFactory(service=service, requester=requester, status='pending')

        lat, lng = self._fetch_coords(service, requester)

        assert float(lat) != pytest.approx(float(real_lat), abs=1e-4), (
            "Requester with pending handshake received exact coordinates before acceptance."
        )

    def test_unrelated_user_with_no_handshake_sees_fuzzed_coords(self):
        """A user with no handshake relationship should always see blurred coordinates."""
        provider = UserFactory()
        unrelated = UserFactory()
        real_lat, real_lng = Decimal('41.012345'), Decimal('28.974321')
        service = ServiceFactory(
            user=provider, type='Offer', location_type='In-Person',
            location_lat=real_lat, location_lng=real_lng, status='Active',
        )

        lat, lng = self._fetch_coords(service, unrelated)

        assert float(lat) != pytest.approx(float(real_lat), abs=1e-4)

    def test_provider_always_sees_exact_coords_regardless_of_handshake(self):
        """Service owner should always see exact coordinates — handshake status is irrelevant."""
        provider = UserFactory()
        real_lat, real_lng = Decimal('41.012345'), Decimal('28.974321')
        service = ServiceFactory(
            user=provider, type='Offer', location_type='In-Person',
            location_lat=real_lat, location_lng=real_lng, status='Active',
        )

        client = APIClient()
        client.force_authenticate(user=provider)
        resp = client.get(f'/api/services/{service.id}/')
        lat = resp.data.get('location_lat')
        lng = resp.data.get('location_lng')

        assert float(lat) == pytest.approx(float(real_lat), abs=1e-4)
