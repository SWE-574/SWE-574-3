"""Integration tests for the service dismissal endpoint (Pulse Not-interested)."""
import pytest
from rest_framework.test import APIClient

from api.tests.helpers.factories import ServiceFactory, UserFactory


@pytest.mark.django_db
@pytest.mark.integration
class TestServiceDismissal:
    def test_dismiss_creates_row_and_returns_state(self):
        from api.models import ServiceDismissal

        viewer = UserFactory()
        svc = ServiceFactory(type='Offer', status='Active')
        client = APIClient()
        client.force_authenticate(user=viewer)
        resp = client.post(f'/api/services/{svc.id}/dismiss/')
        assert resp.status_code == 200
        assert resp.json()['is_dismissed'] is True
        assert ServiceDismissal.objects.filter(viewer=viewer, service=svc).exists()

    def test_dismiss_is_idempotent(self):
        from api.models import ServiceDismissal

        viewer = UserFactory()
        svc = ServiceFactory(type='Offer', status='Active')
        client = APIClient()
        client.force_authenticate(user=viewer)
        client.post(f'/api/services/{svc.id}/dismiss/')
        client.post(f'/api/services/{svc.id}/dismiss/')
        assert ServiceDismissal.objects.filter(viewer=viewer, service=svc).count() == 1

    def test_undismiss_removes_row(self):
        from api.models import ServiceDismissal

        viewer = UserFactory()
        svc = ServiceFactory(type='Offer', status='Active')
        client = APIClient()
        client.force_authenticate(user=viewer)
        client.post(f'/api/services/{svc.id}/dismiss/')
        resp = client.delete(f'/api/services/{svc.id}/dismiss/')
        assert resp.status_code == 200
        assert resp.json()['is_dismissed'] is False
        assert not ServiceDismissal.objects.filter(viewer=viewer, service=svc).exists()

    def test_anonymous_blocked(self):
        svc = ServiceFactory(type='Offer', status='Active')
        client = APIClient()
        resp = client.post(f'/api/services/{svc.id}/dismiss/')
        assert resp.status_code == 401

    def test_dismissal_is_per_viewer(self):
        from api.models import ServiceDismissal

        viewer_a = UserFactory()
        viewer_b = UserFactory()
        svc = ServiceFactory(type='Offer', status='Active')

        client_a = APIClient()
        client_a.force_authenticate(user=viewer_a)
        client_a.post(f'/api/services/{svc.id}/dismiss/')

        # Other viewer is unaffected
        assert ServiceDismissal.objects.filter(viewer=viewer_a, service=svc).count() == 1
        assert ServiceDismissal.objects.filter(viewer=viewer_b, service=svc).count() == 0
