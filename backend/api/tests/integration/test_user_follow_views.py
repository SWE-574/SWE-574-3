"""
Integration tests for follow/unfollow endpoints and follower/following list endpoints.

Endpoints:
  POST   /api/users/<uuid>/follow/      — follow a user
  DELETE /api/users/<uuid>/follow/      — unfollow a user
  GET    /api/users/<uuid>/followers/   — list users who follow the target
  GET    /api/users/<uuid>/following/   — list users that the target follows
"""
import uuid as _uuid

import pytest
from rest_framework import status

from api.models import UserFollow, UserFollowEvent
from api.tests.helpers.factories import UserFactory
from api.tests.helpers.test_client import AuthenticatedAPIClient


# ---------------------------------------------------------------------------
# POST /api/users/<id>/follow/
# ---------------------------------------------------------------------------

@pytest.mark.django_db
@pytest.mark.integration
class TestUserFollowViewPost:
    """POST /api/users/<id>/follow/ — follow a user."""

    def test_follow_success_returns_201(self):
        actor = UserFactory()
        target = UserFactory()
        client = AuthenticatedAPIClient().authenticate_user(actor)

        response = client.post(f'/api/users/{target.id}/follow/')

        assert response.status_code == status.HTTP_201_CREATED

    def test_follow_success_creates_userfollow_row(self):
        actor = UserFactory()
        target = UserFactory()
        client = AuthenticatedAPIClient().authenticate_user(actor)

        client.post(f'/api/users/{target.id}/follow/')

        assert UserFollow.objects.filter(follower=actor, following=target).exists()

    def test_follow_success_creates_follow_event(self):
        actor = UserFactory()
        target = UserFactory()
        client = AuthenticatedAPIClient().authenticate_user(actor)

        client.post(f'/api/users/{target.id}/follow/')

        assert UserFollowEvent.objects.filter(
            follower=actor,
            following=target,
            action=UserFollowEvent.ACTION_FOLLOW,
        ).exists()

    def test_follow_success_response_payload_has_follower_following_ids(self):
        actor = UserFactory()
        target = UserFactory()
        client = AuthenticatedAPIClient().authenticate_user(actor)

        response = client.post(f'/api/users/{target.id}/follow/')

        assert 'follow' in response.data
        assert response.data['follow']['follower_id'] == str(actor.id)
        assert response.data['follow']['following_id'] == str(target.id)

    def test_follow_self_returns_400(self):
        actor = UserFactory()
        client = AuthenticatedAPIClient().authenticate_user(actor)

        response = client.post(f'/api/users/{actor.id}/follow/')

        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_follow_self_creates_no_rows(self):
        actor = UserFactory()
        client = AuthenticatedAPIClient().authenticate_user(actor)

        client.post(f'/api/users/{actor.id}/follow/')

        assert not UserFollow.objects.filter(follower=actor).exists()
        assert not UserFollowEvent.objects.filter(follower=actor).exists()

    def test_follow_already_following_returns_400(self):
        actor = UserFactory()
        target = UserFactory()
        UserFollow.objects.create(follower=actor, following=target)
        client = AuthenticatedAPIClient().authenticate_user(actor)

        response = client.post(f'/api/users/{target.id}/follow/')

        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_follow_already_following_creates_no_extra_row(self):
        actor = UserFactory()
        target = UserFactory()
        UserFollow.objects.create(follower=actor, following=target)
        client = AuthenticatedAPIClient().authenticate_user(actor)

        client.post(f'/api/users/{target.id}/follow/')

        assert UserFollow.objects.filter(follower=actor, following=target).count() == 1

    def test_follow_target_not_found_returns_404(self):
        actor = UserFactory()
        client = AuthenticatedAPIClient().authenticate_user(actor)

        response = client.post(f'/api/users/{_uuid.uuid4()}/follow/')

        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_follow_unauthenticated_returns_401(self):
        target = UserFactory()
        client = AuthenticatedAPIClient()

        response = client.post(f'/api/users/{target.id}/follow/')

        assert response.status_code == status.HTTP_401_UNAUTHORIZED


# ---------------------------------------------------------------------------
# DELETE /api/users/<id>/follow/
# ---------------------------------------------------------------------------

@pytest.mark.django_db
@pytest.mark.integration
class TestUserFollowViewDelete:
    """DELETE /api/users/<id>/follow/ — unfollow a user."""

    def test_unfollow_success_returns_200(self):
        actor = UserFactory()
        target = UserFactory()
        UserFollow.objects.create(follower=actor, following=target)
        client = AuthenticatedAPIClient().authenticate_user(actor)

        response = client.delete(f'/api/users/{target.id}/follow/')

        assert response.status_code == status.HTTP_200_OK

    def test_unfollow_success_deletes_userfollow_row(self):
        actor = UserFactory()
        target = UserFactory()
        UserFollow.objects.create(follower=actor, following=target)
        client = AuthenticatedAPIClient().authenticate_user(actor)

        client.delete(f'/api/users/{target.id}/follow/')

        assert not UserFollow.objects.filter(follower=actor, following=target).exists()

    def test_unfollow_success_creates_unfollow_event(self):
        actor = UserFactory()
        target = UserFactory()
        UserFollow.objects.create(follower=actor, following=target)
        client = AuthenticatedAPIClient().authenticate_user(actor)

        client.delete(f'/api/users/{target.id}/follow/')

        assert UserFollowEvent.objects.filter(
            follower=actor,
            following=target,
            action=UserFollowEvent.ACTION_UNFOLLOW,
        ).exists()

    def test_unfollow_self_returns_400(self):
        actor = UserFactory()
        client = AuthenticatedAPIClient().authenticate_user(actor)

        response = client.delete(f'/api/users/{actor.id}/follow/')

        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_unfollow_not_following_returns_400(self):
        actor = UserFactory()
        target = UserFactory()
        client = AuthenticatedAPIClient().authenticate_user(actor)

        response = client.delete(f'/api/users/{target.id}/follow/')

        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_unfollow_not_following_creates_no_event(self):
        actor = UserFactory()
        target = UserFactory()
        client = AuthenticatedAPIClient().authenticate_user(actor)

        client.delete(f'/api/users/{target.id}/follow/')

        assert not UserFollowEvent.objects.filter(follower=actor, following=target).exists()

    def test_unfollow_target_not_found_returns_404(self):
        actor = UserFactory()
        client = AuthenticatedAPIClient().authenticate_user(actor)

        response = client.delete(f'/api/users/{_uuid.uuid4()}/follow/')

        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_unfollow_unauthenticated_returns_401(self):
        target = UserFactory()
        client = AuthenticatedAPIClient()

        response = client.delete(f'/api/users/{target.id}/follow/')

        assert response.status_code == status.HTTP_401_UNAUTHORIZED


# ---------------------------------------------------------------------------
# GET /api/users/<id>/followers/
# ---------------------------------------------------------------------------

@pytest.mark.django_db
@pytest.mark.integration
class TestUserFollowersListView:
    """GET /api/users/<id>/followers/"""

    def test_followers_success_returns_200(self):
        user = UserFactory()
        viewer = UserFactory()
        client = AuthenticatedAPIClient().authenticate_user(viewer)

        response = client.get(f'/api/users/{user.id}/followers/')

        assert response.status_code == status.HTTP_200_OK

    def test_followers_returns_correct_users(self):
        user = UserFactory()
        follower1 = UserFactory()
        follower2 = UserFactory()
        stranger = UserFactory()
        UserFollow.objects.create(follower=follower1, following=user)
        UserFollow.objects.create(follower=follower2, following=user)
        viewer = UserFactory()
        client = AuthenticatedAPIClient().authenticate_user(viewer)

        response = client.get(f'/api/users/{user.id}/followers/')

        results = response.data.get('results', response.data)
        ids = {item['id'] for item in results}
        assert str(follower1.id) in ids
        assert str(follower2.id) in ids
        assert str(stranger.id) not in ids

    def test_followers_empty_returns_empty_list(self):
        user = UserFactory()
        viewer = UserFactory()
        client = AuthenticatedAPIClient().authenticate_user(viewer)

        response = client.get(f'/api/users/{user.id}/followers/')

        results = response.data.get('results', response.data)
        assert results == []

    def test_followers_target_not_found_returns_404(self):
        viewer = UserFactory()
        client = AuthenticatedAPIClient().authenticate_user(viewer)

        response = client.get(f'/api/users/{_uuid.uuid4()}/followers/')

        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_followers_unauthenticated_returns_401(self):
        user = UserFactory()
        client = AuthenticatedAPIClient()

        response = client.get(f'/api/users/{user.id}/followers/')

        assert response.status_code == status.HTTP_401_UNAUTHORIZED


# ---------------------------------------------------------------------------
# GET /api/users/<id>/following/
# ---------------------------------------------------------------------------

@pytest.mark.django_db
@pytest.mark.integration
class TestUserFollowingListView:
    """GET /api/users/<id>/following/"""

    def test_following_success_returns_200(self):
        user = UserFactory()
        viewer = UserFactory()
        client = AuthenticatedAPIClient().authenticate_user(viewer)

        response = client.get(f'/api/users/{user.id}/following/')

        assert response.status_code == status.HTTP_200_OK

    def test_following_returns_correct_users(self):
        user = UserFactory()
        followed1 = UserFactory()
        followed2 = UserFactory()
        stranger = UserFactory()
        UserFollow.objects.create(follower=user, following=followed1)
        UserFollow.objects.create(follower=user, following=followed2)
        viewer = UserFactory()
        client = AuthenticatedAPIClient().authenticate_user(viewer)

        response = client.get(f'/api/users/{user.id}/following/')

        results = response.data.get('results', response.data)
        ids = {item['id'] for item in results}
        assert str(followed1.id) in ids
        assert str(followed2.id) in ids
        assert str(stranger.id) not in ids

    def test_following_empty_returns_empty_list(self):
        user = UserFactory()
        viewer = UserFactory()
        client = AuthenticatedAPIClient().authenticate_user(viewer)

        response = client.get(f'/api/users/{user.id}/following/')

        results = response.data.get('results', response.data)
        assert results == []

    def test_following_target_not_found_returns_404(self):
        viewer = UserFactory()
        client = AuthenticatedAPIClient().authenticate_user(viewer)

        response = client.get(f'/api/users/{_uuid.uuid4()}/following/')

        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_following_unauthenticated_returns_401(self):
        user = UserFactory()
        client = AuthenticatedAPIClient()

        response = client.get(f'/api/users/{user.id}/following/')

        assert response.status_code == status.HTTP_401_UNAUTHORIZED
