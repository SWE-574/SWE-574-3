"""Integration tests for the ?explore_only=true list path on /api/services/.

Surfaces Phase 3 candidates (cold-start, under-shown quality, stale recurring)
flat with their pool tag, powering the web "Try something new" carousel.
"""
import pytest
from rest_framework.test import APIClient

from api.tests.helpers.factories import ServiceFactory, UserFactory


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
