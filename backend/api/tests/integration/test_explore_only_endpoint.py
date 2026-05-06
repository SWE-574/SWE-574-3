"""Integration tests for ?explore_only=true and is_newcomer_owner.

Bundles two related concerns that landed concurrently:

- #481 (For You feed): the ?explore_only=true list path surfaces Phase 3
  candidates (cold-start, under-shown quality, stale recurring) flat with
  their pool tag, powering the web "Try something new" carousel.
- #480 (mobile rec parity): the is_newcomer_owner serializer field powers
  the Newcomer badge on mobile cards, and the same explore_only filter
  drives the mobile discovery carousel.
"""
from datetime import timedelta

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from api.tests.helpers.factories import (
    HandshakeFactory,
    ReputationRepFactory,
    ServiceFactory,
    UserFactory,
)


@pytest.mark.django_db
@pytest.mark.integration
class TestNewcomerOwnerSerializerField:
    def test_newcomer_owner_field_true_for_newcomer(self):
        viewer = UserFactory()
        newcomer = UserFactory(date_joined=timezone.now() - timedelta(days=10))
        svc = ServiceFactory(user=newcomer, type='Offer', status='Active')

        client = APIClient()
        client.force_authenticate(user=viewer)
        resp = client.get(f'/api/services/{svc.id}/')

        assert resp.status_code == 200
        assert resp.json()['is_newcomer_owner'] is True

    def test_newcomer_owner_field_false_for_veteran(self):
        viewer = UserFactory()
        veteran = UserFactory(date_joined=timezone.now() - timedelta(days=200))
        svc = ServiceFactory(user=veteran, type='Offer', status='Active')

        client = APIClient()
        client.force_authenticate(user=viewer)
        resp = client.get(f'/api/services/{svc.id}/')

        assert resp.status_code == 200
        assert resp.json()['is_newcomer_owner'] is False


@pytest.mark.django_db
@pytest.mark.integration
class TestExploreOnlyEndpoint:
    def test_cold_start_owner_is_returned_with_cold_start_pool(self):
        # Owner with zero completed handshakes -> cold_start eligible.
        owner = UserFactory()
        ServiceFactory(user=owner, type='Offer', status='Active')

        viewer = UserFactory()
        client = APIClient()
        client.force_authenticate(user=viewer)
        resp = client.get('/api/services/?explore_only=true')

        assert resp.status_code == 200
        data = resp.json()
        assert data['count'] >= 1
        first = data['results'][0]
        assert first['source'] == 'explore'
        assert first['explore_pool'] in {
            'cold_start', 'undershown_quality', 'stale_recurring',
        }

    def test_returns_empty_when_no_eligible_candidates(self):
        # No services at all -> nothing to surface.
        viewer = UserFactory()
        client = APIClient()
        client.force_authenticate(user=viewer)
        resp = client.get('/api/services/?explore_only=true')

        assert resp.status_code == 200
        assert resp.json()['count'] == 0

    def test_explore_pool_field_is_none_on_regular_list(self):
        # Without ?explore_only the field exists but is None for every card.
        owner = UserFactory()
        ServiceFactory(user=owner, type='Offer', status='Active')

        viewer = UserFactory()
        client = APIClient()
        client.force_authenticate(user=viewer)
        resp = client.get('/api/services/')

        assert resp.status_code == 200
        results = resp.json().get('results', resp.json())
        assert len(results) >= 1
        assert results[0]['explore_pool'] is None


@pytest.mark.django_db
@pytest.mark.integration
class TestExploreOnlyQueryParam:
    def test_explore_only_returns_only_phase3_eligible_services(self):
        viewer = UserFactory()
        # Cold-start owner (no completed handshakes) -> eligible for explore.
        cold_owner = UserFactory(date_joined=timezone.now() - timedelta(days=60))
        cold_svc = ServiceFactory(user=cold_owner, type='Offer', status='Active')
        # Veteran owner with many completed handshakes -> NOT eligible.
        veteran_owner = UserFactory(date_joined=timezone.now() - timedelta(days=200))
        established_svc = ServiceFactory(
            user=veteran_owner, type='Offer', status='Active',
        )
        for _ in range(8):
            giver = UserFactory(date_joined=timezone.now() - timedelta(days=200))
            HandshakeFactory(
                service=established_svc, requester=giver, status='completed',
            )
            ReputationRepFactory(receiver=veteran_owner, giver=giver)

        client = APIClient()
        client.force_authenticate(user=viewer)
        resp = client.get('/api/services/?explore_only=true')

        assert resp.status_code == 200
        ids = {item['id'] for item in resp.json()['results']}
        assert str(cold_svc.id) in ids
        assert str(established_svc.id) not in ids

    def test_explore_only_default_false_returns_all_services(self):
        viewer = UserFactory()
        a = ServiceFactory(type='Offer', status='Active')
        b = ServiceFactory(type='Offer', status='Active')

        client = APIClient()
        client.force_authenticate(user=viewer)
        resp = client.get('/api/services/')

        assert resp.status_code == 200
        ids = {item['id'] for item in resp.json()['results']}
        assert str(a.id) in ids
        assert str(b.id) in ids
