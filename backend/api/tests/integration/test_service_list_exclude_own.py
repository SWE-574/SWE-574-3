"""
Integration tests for the ?exclude_own=true and ?skip_onboarding=true
query parameters on GET /api/services/. Browse uses both — the first to
hide the viewer's own services and the second so the All button bypasses
the implicit skill-based filter.
"""
import pytest
from rest_framework.test import APIClient

from api.models import Tag
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


@pytest.mark.django_db
@pytest.mark.integration
class TestServiceListSkipOnboarding:
    def test_skip_onboarding_returns_full_catalog_for_skilled_viewer(self):
        """Without `skip_onboarding`, an onboarded viewer with declared skills
        gets a skill-aware slice. With it, the full active catalog is visible."""
        viewer = UserFactory(is_verified=True, is_onboarded=True)
        # Tag the viewer with a niche skill that no service shares.
        niche_tag = Tag.objects.create(id='Q-niche-1', name='NicheSkill')
        viewer.skills.add(niche_tag)

        # Off-topic services with a different tag — skill filter would skip them.
        other = UserFactory(is_verified=True)
        unrelated_tag = Tag.objects.create(id='Q-unrelated-1', name='Unrelated')
        for i in range(3):
            svc = ServiceFactory(user=other, status='Active', title=f'Off-topic {i}')
            svc.tags.add(unrelated_tag)

        client = AuthenticatedAPIClient()
        client.authenticate_user(viewer)

        # Without skip_onboarding the off-topic services are filtered or topped
        # up via the explore pool — but with it, the full catalog comes through
        # untouched.
        resp = client.get('/api/services/?skip_onboarding=true')
        assert_api_response(resp, 200)
        titles = [s['title'] for s in resp.data['results']]
        assert any('Off-topic' in t for t in titles)
