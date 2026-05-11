"""Integration tests for the Save action on services (#483)."""
import pytest
from rest_framework.test import APIClient

from api.tests.helpers.factories import ServiceFactory, UserFactory
from api.tests.helpers.assertions import assert_api_response, assert_problem_detail


@pytest.mark.django_db
@pytest.mark.integration
class TestSaveService:
    def test_save_creates_row_and_returns_state(self):
        from api.models import SavedService

        viewer = UserFactory()
        svc = ServiceFactory(type='Offer', status='Active')
        client = APIClient()
        client.force_authenticate(user=viewer)
        resp = client.post(f'/api/services/{svc.id}/save/')
        assert_api_response(resp, 200)
        assert resp.json()['is_saved'] is True
        assert SavedService.objects.filter(user=viewer, service=svc).exists()

    def test_save_is_idempotent(self):
        from api.models import SavedService

        viewer = UserFactory()
        svc = ServiceFactory(type='Offer', status='Active')
        client = APIClient()
        client.force_authenticate(user=viewer)
        client.post(f'/api/services/{svc.id}/save/')
        client.post(f'/api/services/{svc.id}/save/')
        assert SavedService.objects.filter(user=viewer, service=svc).count() == 1

    def test_unsave_removes_row(self):
        from api.models import SavedService

        viewer = UserFactory()
        svc = ServiceFactory(type='Offer', status='Active')
        client = APIClient()
        client.force_authenticate(user=viewer)
        client.post(f'/api/services/{svc.id}/save/')
        resp = client.delete(f'/api/services/{svc.id}/save/')
        assert_api_response(resp, 200)
        assert resp.json()['is_saved'] is False
        assert not SavedService.objects.filter(user=viewer, service=svc).exists()

    def test_anonymous_blocked(self):
        svc = ServiceFactory(type='Offer', status='Active')
        client = APIClient()
        resp = client.post(f'/api/services/{svc.id}/save/')
        assert_problem_detail(resp, 401)

    def test_saved_list_returns_only_my_saves(self):
        viewer = UserFactory()
        other = UserFactory()
        mine = ServiceFactory(type='Offer', status='Active')
        not_mine = ServiceFactory(type='Offer', status='Active')

        client = APIClient()
        client.force_authenticate(user=viewer)
        client.post(f'/api/services/{mine.id}/save/')
        # other user saves a different service
        other_client = APIClient()
        other_client.force_authenticate(user=other)
        other_client.post(f'/api/services/{not_mine.id}/save/')

        resp = client.get('/api/services/saved/')
        assert_api_response(resp, 200)
        body = resp.json()
        results = body.get('results', body) if isinstance(body, dict) else body
        ids = {row['id'] for row in results}
        assert str(mine.id) in ids
        assert str(not_mine.id) not in ids

    def test_serializer_returns_is_saved_per_viewer(self):
        viewer_a = UserFactory()
        viewer_b = UserFactory()
        svc = ServiceFactory(type='Offer', status='Active')

        client_a = APIClient()
        client_a.force_authenticate(user=viewer_a)
        client_a.post(f'/api/services/{svc.id}/save/')

        # viewer_a sees is_saved=True; viewer_b sees is_saved=False
        resp_a = client_a.get(f'/api/services/{svc.id}/')
        assert resp_a.json()['is_saved'] is True

        client_b = APIClient()
        client_b.force_authenticate(user=viewer_b)
        resp_b = client_b.get(f'/api/services/{svc.id}/')
        assert resp_b.json()['is_saved'] is False


@pytest.mark.django_db
@pytest.mark.integration
class TestSaveListPerformance:
    """Regression guard for the per-card N+1 that the save serializer field
    could regress into. The list response should issue O(1) queries for
    is_saved, not O(N).
    """

    def test_list_query_count_does_not_scale_with_service_count(self):
        from django.db import connection
        from django.test.utils import CaptureQueriesContext

        viewer = UserFactory()
        for _ in range(5):
            ServiceFactory(type='Offer', status='Active')

        client = APIClient()
        client.force_authenticate(user=viewer)
        with CaptureQueriesContext(connection) as ctx_5:
            resp = client.get('/api/services/')
            assert_api_response(resp, 200)
        small = len(ctx_5)

        for _ in range(15):
            ServiceFactory(type='Offer', status='Active')

        with CaptureQueriesContext(connection) as ctx_20:
            resp = client.get('/api/services/')
            assert_api_response(resp, 200)
        large = len(ctx_20)

        # Allow some growth from prefetch sub-queries that scale with row
        # count, but per-card N+1 would balloon by ~3 per extra service.
        assert large - small < 30, (
            f'list query count grew from {small} to {large} for 5 -> 20 '
            f'services; per-card N+1 likely back'
        )
