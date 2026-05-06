"""Integration tests for /api/users/suggested/ — discovery endpoint that
ranks candidates by shared skills, karma, and recency."""
import pytest

from api.models import UserFollow
from api.tests.helpers.factories import TagFactory, UserFactory
from api.tests.helpers.test_client import AuthenticatedAPIClient


@pytest.mark.django_db
@pytest.mark.integration
class TestSuggestedUsersView:
    def test_unauthenticated_returns_401(self):
        client = AuthenticatedAPIClient()
        resp = client.get('/api/users/suggested/')
        assert resp.status_code == 401

    def test_excludes_self(self):
        viewer = UserFactory()
        UserFactory()
        client = AuthenticatedAPIClient().authenticate_user(viewer)
        resp = client.get('/api/users/suggested/')
        assert resp.status_code == 200
        ids = {row['id'] for row in resp.data['results']}
        assert str(viewer.id) not in ids

    def test_excludes_already_followed(self):
        viewer = UserFactory()
        followed = UserFactory()
        candidate = UserFactory()
        UserFollow.objects.create(follower=viewer, following=followed)
        client = AuthenticatedAPIClient().authenticate_user(viewer)
        resp = client.get('/api/users/suggested/')
        ids = {row['id'] for row in resp.data['results']}
        assert str(followed.id) not in ids
        assert str(candidate.id) in ids

    def test_excludes_inactive_users(self):
        viewer = UserFactory()
        inactive = UserFactory(is_active=False)
        active = UserFactory()
        client = AuthenticatedAPIClient().authenticate_user(viewer)
        resp = client.get('/api/users/suggested/')
        ids = {row['id'] for row in resp.data['results']}
        assert str(inactive.id) not in ids
        assert str(active.id) in ids

    def test_ranks_by_shared_skill_count_desc(self):
        tag_a = TagFactory(id='Q-suggested-a')
        tag_b = TagFactory(id='Q-suggested-b')
        viewer = UserFactory()
        viewer.skills.add(tag_a, tag_b)

        two_overlap = UserFactory()
        two_overlap.skills.add(tag_a, tag_b)
        one_overlap = UserFactory()
        one_overlap.skills.add(tag_a)
        zero_overlap = UserFactory()

        client = AuthenticatedAPIClient().authenticate_user(viewer)
        resp = client.get('/api/users/suggested/')
        order = [row['id'] for row in resp.data['results']]
        assert order.index(str(two_overlap.id)) < order.index(str(one_overlap.id))
        assert order.index(str(one_overlap.id)) < order.index(str(zero_overlap.id))

    def test_ties_break_by_karma_desc(self):
        viewer = UserFactory()
        low = UserFactory(karma_score=1)
        high = UserFactory(karma_score=99)
        client = AuthenticatedAPIClient().authenticate_user(viewer)
        resp = client.get('/api/users/suggested/')
        order = [row['id'] for row in resp.data['results']]
        assert order.index(str(high.id)) < order.index(str(low.id))
