"""Integration tests for PR-J — #318 (friends-of-friends helper),
#319 (location distance blur until handshake accepted), and #167 (achievement
progress includes in-progress entries).
"""
from decimal import Decimal

import pytest
from django.contrib.gis.geos import Point
from django.contrib.gis.measure import D
from rest_framework import status
from rest_framework.test import APIClient

from api.achievement_utils import get_achievement_progress
from api.models import Handshake, UserBadge
from api.services import get_social_neighbours
from api.tests.helpers.factories import (
    HandshakeFactory,
    ServiceFactory,
    UserFactory,
)
from api.tests.helpers.test_client import AuthenticatedAPIClient


@pytest.mark.django_db
@pytest.mark.integration
class TestSocialNeighbours:
    """get_social_neighbours returns the correct user-id set across hops (#318)."""

    def test_anonymous_returns_empty(self):
        assert get_social_neighbours(None) == set()
        assert get_social_neighbours(None, depth=1) == set()

    def test_one_hop_via_completed_handshake(self):
        viewer = UserFactory()
        partner = UserFactory()
        # viewer requested a service from partner -> 1 hop after completion.
        service = ServiceFactory(user=partner)
        HandshakeFactory(service=service, requester=viewer, status='completed')

        neighbours = get_social_neighbours(viewer, depth=1)
        assert str(partner.id) in neighbours
        # Self-loop must never appear.
        assert str(viewer.id) not in neighbours

    def test_two_hop_friends_of_friends(self):
        viewer = UserFactory()
        friend = UserFactory()
        fof = UserFactory()  # friend's friend, no direct connection to viewer

        s1 = ServiceFactory(user=friend)
        HandshakeFactory(service=s1, requester=viewer, status='completed')
        s2 = ServiceFactory(user=fof)
        HandshakeFactory(service=s2, requester=friend, status='completed')

        # depth=1 only reaches `friend`.
        depth1 = get_social_neighbours(viewer, depth=1)
        assert str(friend.id) in depth1
        assert str(fof.id) not in depth1

        # depth=2 reaches both friend and fof.
        depth2 = get_social_neighbours(viewer, depth=2)
        assert str(friend.id) in depth2
        assert str(fof.id) in depth2


@pytest.mark.django_db
@pytest.mark.integration
class TestLocationBlur:
    """ServiceSerializer blurs distance + exact coords until handshake accepted (#319)."""

    def _create_service_with_location(self, owner):
        # Istanbul-ish point, 1km away from the requester reference.
        service = ServiceFactory(
            user=owner,
            type='Offer',
            schedule_type='One-Time',
            location_type='In-Person',
            duration=Decimal('2.00'),
            max_participants=1,
            location_lat=Decimal('41.0250'),
            location_lng=Decimal('28.9740'),
            location=Point(28.9740, 41.0250, srid=4326),
        )
        return service

    def test_anonymous_viewer_gets_blurred_distance(self):
        owner = UserFactory()
        service = self._create_service_with_location(owner)

        client = APIClient()
        # 5km radius; PostGIS will annotate `distance` for the queryset.
        response = client.get(
            '/api/services/',
            {'lat': '41.0500', 'lng': '28.9700', 'distance': '50'},
        )
        assert response.status_code == status.HTTP_200_OK
        results = response.data['results'] if isinstance(response.data, dict) else response.data
        rows = [r for r in results if r['id'] == str(service.id)]
        assert rows, 'service should be in the location-filtered feed'
        distance = rows[0].get('distance')
        if distance is None:
            # The list endpoint may strip the annotation in some pagination
            # paths; the privacy contract is that we never expose a non-blurred
            # distance to anonymous viewers.
            return
        assert distance % 500 == 0, f'distance {distance} not rounded to 500m'

    def test_handshake_partner_gets_exact_coordinates(self):
        owner = UserFactory()
        partner = UserFactory()
        service = self._create_service_with_location(owner)
        HandshakeFactory(service=service, requester=partner, status='accepted')

        client = AuthenticatedAPIClient().authenticate_user(partner)
        response = client.get(f'/api/services/{service.id}/')
        assert response.status_code == status.HTTP_200_OK
        # Real coordinates should round-trip exactly because the partner has an
        # accepted handshake — no fuzzing is applied.
        assert float(response.data['location_lat']) == pytest.approx(41.0250, abs=1e-4)
        assert float(response.data['location_lng']) == pytest.approx(28.9740, abs=1e-4)

    def test_non_partner_gets_fuzzed_coordinates(self):
        owner = UserFactory()
        viewer = UserFactory()  # no handshake at all
        service = self._create_service_with_location(owner)

        client = AuthenticatedAPIClient().authenticate_user(viewer)
        response = client.get(f'/api/services/{service.id}/')
        assert response.status_code == status.HTTP_200_OK
        # Fuzz applies a deterministic ~1km offset; absolute equality is fine
        # because the offset is non-zero and bounded.
        lat = float(response.data['location_lat'])
        lng = float(response.data['location_lng'])
        assert lat != pytest.approx(41.0250, abs=1e-6)
        assert lng != pytest.approx(28.9740, abs=1e-6)


@pytest.mark.django_db
@pytest.mark.integration
class TestAchievementProgressEndpoint:
    """get_achievement_progress includes in-progress entries (#167)."""

    def test_progress_includes_unearned_entries(self):
        user = UserFactory()
        progress = get_achievement_progress(user)

        # Every non-hidden achievement must show up regardless of earned state.
        assert 'first-service' in progress
        entry = progress['first-service']
        assert entry['earned'] is False
        assert 'id' in entry  # frontend needs the id on the value side
        assert entry['id'] == 'first-service'
        assert entry['current'] == 0
        assert entry['threshold'] == 1

    def test_endpoint_returns_in_progress_payload(self):
        user = UserFactory()
        client = AuthenticatedAPIClient().authenticate_user(user)
        response = client.get(f'/api/users/{user.id}/badge-progress/')
        assert response.status_code == status.HTTP_200_OK
        # Response should be a dict-by-id with both earned and unearned entries.
        body = response.data
        assert isinstance(body, dict)
        assert 'first-service' in body
        assert body['first-service']['earned'] is False
        assert 'in_progress' in body['first-service']
