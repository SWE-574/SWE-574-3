"""Integration tests for the is_dismissed serializer field."""
import pytest
from rest_framework.test import APIClient

from api.tests.helpers.factories import (
    ServiceFactory,
    UserFactory,
)


@pytest.mark.django_db
@pytest.mark.integration
class TestIsDismissedField:
    def test_default_false(self):
        viewer = UserFactory()
        svc = ServiceFactory(type='Offer', status='Active')
        client = APIClient()
        client.force_authenticate(user=viewer)
        body = client.get(f'/api/services/{svc.id}/').json()
        assert body['is_dismissed'] is False

    def test_true_after_dismiss(self):
        viewer = UserFactory()
        svc = ServiceFactory(type='Offer', status='Active')
        client = APIClient()
        client.force_authenticate(user=viewer)
        client.post(f'/api/services/{svc.id}/dismiss/')
        body = client.get(f'/api/services/{svc.id}/').json()
        assert body['is_dismissed'] is True

    def test_per_viewer(self):
        viewer_a = UserFactory()
        viewer_b = UserFactory()
        svc = ServiceFactory(type='Offer', status='Active')

        APIClient().force_authenticate(user=viewer_a)
        client_a = APIClient()
        client_a.force_authenticate(user=viewer_a)
        client_a.post(f'/api/services/{svc.id}/dismiss/')

        client_b = APIClient()
        client_b.force_authenticate(user=viewer_b)
        body = client_b.get(f'/api/services/{svc.id}/').json()
        assert body['is_dismissed'] is False
