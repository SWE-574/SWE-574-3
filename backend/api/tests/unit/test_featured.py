"""Unit tests for the GET /api/featured/ endpoint."""
from datetime import timedelta
from unittest.mock import patch

import pytest
from django.core.cache import cache as django_cache
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from api.models import ReputationRep, Service, UserFollow
from api.tests.helpers.factories import (
    HandshakeFactory,
    ReputationRepFactory,
    ServiceFactory,
    UserFactory,
)

FEATURED_URL = "/api/featured/"


def _auth_client(user):
    """Return an APIClient authenticated as *user*."""
    client = APIClient()
    token = RefreshToken.for_user(user)
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token.access_token}")
    return client


@pytest.fixture(autouse=True)
def _clear_featured_cache():
    """Ensure no cached featured responses leak between tests."""
    django_cache.delete('featured:trending')
    django_cache.delete('featured:top_providers')
    yield
    django_cache.clear()


@pytest.mark.django_db
@pytest.mark.unit
class TestFeaturedEndpoint:
    """Tests for FeaturedView (GET /api/featured/)."""

    # ------------------------------------------------------------------ #
    # 1. Authenticated request returns 200 with correct shape
    # ------------------------------------------------------------------ #
    def test_authenticated_returns_200_with_correct_shape(self):
        user = UserFactory()
        client = _auth_client(user)

        response = client.get(FEATURED_URL)

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert "trending" in data
        assert "friends" in data
        assert "top_providers" in data
        assert isinstance(data["trending"], list)
        assert isinstance(data["friends"], list)
        assert isinstance(data["top_providers"], list)

    # ------------------------------------------------------------------ #
    # 2. Unauthenticated returns 401
    # ------------------------------------------------------------------ #
    def test_unauthenticated_returns_401(self):
        client = APIClient()

        response = client.get(FEATURED_URL)

        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    # ------------------------------------------------------------------ #
    # 3. Empty categories return empty arrays
    # ------------------------------------------------------------------ #
    def test_empty_categories_return_empty_arrays(self):
        user = UserFactory()
        client = _auth_client(user)

        response = client.get(FEATURED_URL)

        data = response.json()
        assert data["trending"] == []
        assert data["friends"] == []
        assert data["top_providers"] == []

    # ------------------------------------------------------------------ #
    # 4. Trending returns active visible services sorted by hot score
    # ------------------------------------------------------------------ #
    def test_trending_returns_active_visible_services_sorted_by_hot_score(self):
        user = UserFactory()
        s1 = ServiceFactory(title="Low Score", status="Active", is_visible=True)
        s2 = ServiceFactory(title="High Score", status="Active", is_visible=True)
        # Inactive / invisible services should be excluded
        ServiceFactory(title="Inactive", status="Inactive", is_visible=True)
        ServiceFactory(title="Hidden", status="Active", is_visible=False)

        # Mock hot scores so we control ordering
        fake_scores = {s1.id: 10, s2.id: 50}
        with patch("api.views_featured.calculate_hot_scores_batch", return_value=fake_scores):
            client = _auth_client(user)
            response = client.get(FEATURED_URL)

        data = response.json()
        trending = data["trending"]
        # Only active+visible services appear
        assert len(trending) == 2
        # Higher score first
        assert trending[0]["title"] == "High Score"
        assert trending[1]["title"] == "Low Score"

    # ------------------------------------------------------------------ #
    # 5. Friends category respects follow relationships
    # ------------------------------------------------------------------ #
    def test_friends_category_respects_follow_relationships(self):
        me = UserFactory()
        friend = UserFactory(first_name="Alice", last_name="Smith")
        stranger = UserFactory()

        # I follow Alice
        UserFollow.objects.create(follower=me, following=friend)

        # A service by a third-party provider
        service = ServiceFactory(
            title="Cooking Class",
            status="Active",
            is_visible=True,
        )

        # Alice has a handshake on the service
        HandshakeFactory(service=service, requester=friend, status="accepted")
        # Stranger also has a handshake — should NOT appear as a friend
        HandshakeFactory(service=service, requester=stranger, status="accepted")

        client = _auth_client(me)
        response = client.get(FEATURED_URL)

        data = response.json()
        friends_list = data["friends"]
        assert len(friends_list) == 1
        entry = friends_list[0]
        assert entry["title"] == "Cooking Class"
        assert entry["friend_count"] == 1
        assert len(entry["friend_names"]) == 1
        assert "Alice" in entry["friend_names"][0]

    # ------------------------------------------------------------------ #
    # 6. Friends category excludes current user's own services
    # ------------------------------------------------------------------ #
    def test_friends_excludes_own_services(self):
        me = UserFactory()
        friend = UserFactory()

        UserFollow.objects.create(follower=me, following=friend)

        # My own service — friend has a handshake on it
        my_service = ServiceFactory(
            user=me, title="My Service", status="Active", is_visible=True
        )
        HandshakeFactory(service=my_service, requester=friend, status="accepted")

        # Someone else's service — friend also has a handshake
        other_service = ServiceFactory(
            title="Other Service", status="Active", is_visible=True
        )
        HandshakeFactory(service=other_service, requester=friend, status="accepted")

        client = _auth_client(me)
        response = client.get(FEATURED_URL)

        data = response.json()
        friends_list = data["friends"]
        titles = [s["title"] for s in friends_list]
        assert "My Service" not in titles
        assert "Other Service" in titles

    # ------------------------------------------------------------------ #
    # 7. Top providers scoped to last 7 days
    # ------------------------------------------------------------------ #
    def test_top_providers_scoped_to_last_7_days(self):
        recent_provider = UserFactory(first_name="Recent")
        old_provider = UserFactory(first_name="Old")
        requester = UserFactory()

        # Recent reputation (within 7 days)
        recent_service = ServiceFactory(user=recent_provider, status="Active")
        recent_hs = HandshakeFactory(
            service=recent_service, requester=requester, status="completed"
        )
        ReputationRepFactory(
            handshake=recent_hs,
            giver=requester,
            receiver=recent_provider,
            is_punctual=True,
            is_helpful=True,
            is_kind=True,
        )

        # Old reputation (> 7 days ago)
        old_service = ServiceFactory(user=old_provider, status="Active")
        old_hs = HandshakeFactory(
            service=old_service, requester=requester, status="completed"
        )
        old_rep = ReputationRepFactory(
            handshake=old_hs,
            giver=requester,
            receiver=old_provider,
            is_punctual=True,
            is_helpful=True,
            is_kind=True,
        )
        # Backdate the old rep to 10 days ago (auto_now_add prevents setting at creation)
        ten_days_ago = timezone.now() - timedelta(days=10)
        ReputationRep.objects.filter(pk=old_rep.pk).update(created_at=ten_days_ago)

        client = _auth_client(requester)
        response = client.get(FEATURED_URL)

        data = response.json()
        top_providers = data["top_providers"]
        provider_ids = [p["id"] for p in top_providers]
        assert str(recent_provider.id) in provider_ids
        assert str(old_provider.id) not in provider_ids

    # ------------------------------------------------------------------ #
    # 8. Trending excludes services older than the time window
    # ------------------------------------------------------------------ #
    def test_trending_excludes_services_older_than_window(self):
        user = UserFactory()
        old_service = ServiceFactory(
            title="Old Service", status="Active", is_visible=True
        )
        # Backdate beyond the 30-day trending window
        thirty_five_days_ago = timezone.now() - timedelta(days=35)
        Service.objects.filter(pk=old_service.pk).update(created_at=thirty_five_days_ago)

        recent_service = ServiceFactory(
            title="Recent Service", status="Active", is_visible=True
        )

        fake_scores = {old_service.id: 100, recent_service.id: 10}
        with patch("api.views_featured.calculate_hot_scores_batch", return_value=fake_scores):
            client = _auth_client(user)
            response = client.get(FEATURED_URL)

        data = response.json()
        trending = data["trending"]
        titles = [s["title"] for s in trending]
        assert "Recent Service" in titles
        assert "Old Service" not in titles

    # ------------------------------------------------------------------ #
    # 9. Friends tab excludes pending-only handshakes
    # ------------------------------------------------------------------ #
    def test_friends_excludes_pending_only_handshakes(self):
        me = UserFactory()
        friend = UserFactory(first_name="Bob", last_name="Jones")
        UserFollow.objects.create(follower=me, following=friend)

        pending_service = ServiceFactory(
            title="Pending Only", status="Active", is_visible=True
        )
        HandshakeFactory(service=pending_service, requester=friend, status="pending")

        accepted_service = ServiceFactory(
            title="Accepted", status="Active", is_visible=True
        )
        HandshakeFactory(service=accepted_service, requester=friend, status="accepted")

        client = _auth_client(me)
        response = client.get(FEATURED_URL)

        data = response.json()
        friends_list = data["friends"]
        titles = [s["title"] for s in friends_list]
        assert "Accepted" in titles
        assert "Pending Only" not in titles

    # ------------------------------------------------------------------ #
    # 10. Top providers positive_rep_count counts distinct reps
    # ------------------------------------------------------------------ #
    def test_top_providers_counts_distinct_reps_not_flag_sum(self):
        provider = UserFactory(first_name="Multi")
        requester = UserFactory()

        service = ServiceFactory(user=provider, status="Active")
        hs = HandshakeFactory(service=service, requester=requester, status="completed")
        ReputationRepFactory(
            handshake=hs,
            giver=requester,
            receiver=provider,
            is_punctual=True,
            is_helpful=True,
            is_kind=True,
        )

        client = _auth_client(requester)
        response = client.get(FEATURED_URL)

        data = response.json()
        top_providers = data["top_providers"]
        entry = next(p for p in top_providers if p["id"] == str(provider.id))
        assert entry["positive_rep_count"] == 1
