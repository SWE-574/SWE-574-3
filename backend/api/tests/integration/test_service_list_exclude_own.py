"""
Integration tests for the ?exclude_own=true query parameter on
GET /api/services/. Browse uses this so the viewer never sees their own
services in the discovery feed.
"""
import pytest
from rest_framework.test import APIClient

from api.tests.helpers.factories import UserFactory, ServiceFactory
from api.tests.helpers.test_client import AuthenticatedAPIClient
from api.tests.helpers.assertions import assert_api_response


@pytest.mark.django_db
@pytest.mark.integration
class TestServiceListExcludeOwn:
    def test_exclude_own_true_drops_viewers_services(self):
        viewer = UserFactory(is_verified=True)
        other = UserFactory(is_verified=True)
        own = ServiceFactory(user=viewer, status='Active', title='Mine')
        theirs = ServiceFactory(user=other, status='Active', title='Theirs')

        client = AuthenticatedAPIClient()
        client.authenticate_user(viewer)
        resp = client.get('/api/services/?exclude_own=true')
        assert_api_response(resp, 200, contains={'results'})

        ids = [s['id'] for s in resp.data['results']]
        assert str(theirs.id) in ids
        assert str(own.id) not in ids

    def test_exclude_own_false_keeps_viewers_services(self):
        viewer = UserFactory(is_verified=True)
        own = ServiceFactory(user=viewer, status='Active', title='Mine')

        client = AuthenticatedAPIClient()
        client.authenticate_user(viewer)
        resp = client.get('/api/services/?exclude_own=false')
        assert_api_response(resp, 200)

        ids = [s['id'] for s in resp.data['results']]
        assert str(own.id) in ids

    def test_exclude_own_default_keeps_viewers_services(self):
        """Without the param, behavior is unchanged: own services are included."""
        viewer = UserFactory(is_verified=True)
        own = ServiceFactory(user=viewer, status='Active', title='Mine')

        client = AuthenticatedAPIClient()
        client.authenticate_user(viewer)
        resp = client.get('/api/services/')
        assert_api_response(resp, 200)

        ids = [s['id'] for s in resp.data['results']]
        assert str(own.id) in ids

    def test_exclude_own_unauth_is_noop(self):
        """An unauthenticated viewer has no 'own' to exclude — param is a no-op."""
        owner = UserFactory(is_verified=True)
        svc = ServiceFactory(user=owner, status='Active', title='Public')

        client = APIClient()  # unauthenticated
        resp = client.get('/api/services/?exclude_own=true')
        assert_api_response(resp, 200)

        ids = [s['id'] for s in resp.data['results']]
        assert str(svc.id) in ids
