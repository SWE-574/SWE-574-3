"""
Integration tests for User profile update endpoint, including featured_badges.
"""
import pytest
from rest_framework import status

from api.tests.helpers.factories import UserFactory
from api.tests.helpers.test_client import AuthenticatedAPIClient
from api.models import Badge, UserBadge


ME_URL = '/api/users/me/'


def _create_badge(badge_id='b1', name='Badge One'):
    badge, _ = Badge.objects.get_or_create(id=badge_id, defaults={'name': name, 'description': 'Test'})
    return badge


def _earn_badge(user, badge):
    ub, _ = UserBadge.objects.get_or_create(user=user, badge=badge)
    return ub


@pytest.mark.django_db
@pytest.mark.integration
class TestFeaturedBadgesPatch:
    def test_patch_valid_earned_badges_succeeds(self):
        user = UserFactory()
        b1 = _create_badge('b1', 'Badge One')
        _earn_badge(user, b1)
        client = AuthenticatedAPIClient().authenticate_user(user)
        resp = client.patch(ME_URL, {'featured_badges': ['b1']}, format='json')
        assert resp.status_code == status.HTTP_200_OK
        data = resp.json()
        assert 'b1' in data['featured_badges']

    def test_patch_two_valid_badges_succeeds(self):
        user = UserFactory()
        b1 = _create_badge('b1', 'Badge One')
        b2 = _create_badge('b2', 'Badge Two')
        _earn_badge(user, b1)
        _earn_badge(user, b2)
        client = AuthenticatedAPIClient().authenticate_user(user)
        resp = client.patch(ME_URL, {'featured_badges': ['b1', 'b2']}, format='json')
        assert resp.status_code == status.HTTP_200_OK
        data = resp.json()
        assert set(data['featured_badges']) == {'b1', 'b2'}

    def _has_featured_badges_error(self, resp):
        """Check if featured_badges field error is present in any standard DRF error shape."""
        data = resp.json()
        # DRF standard: field errors at top level
        if 'featured_badges' in data:
            return True
        # Custom error handler wraps field errors under 'field_errors'
        if isinstance(data.get('field_errors'), dict) and 'featured_badges' in data['field_errors']:
            return True
        return False

    def test_patch_unearned_badge_returns_400(self):
        user = UserFactory()
        _create_badge('unearned', 'Unearned Badge')
        client = AuthenticatedAPIClient().authenticate_user(user)
        resp = client.patch(ME_URL, {'featured_badges': ['unearned']}, format='json')
        assert resp.status_code == status.HTTP_400_BAD_REQUEST
        assert self._has_featured_badges_error(resp)

    def test_patch_more_than_two_returns_400(self):
        user = UserFactory()
        b1 = _create_badge('b1', 'B1')
        b2 = _create_badge('b2', 'B2')
        b3 = _create_badge('b3', 'B3')
        _earn_badge(user, b1)
        _earn_badge(user, b2)
        _earn_badge(user, b3)
        client = AuthenticatedAPIClient().authenticate_user(user)
        resp = client.patch(ME_URL, {'featured_badges': ['b1', 'b2', 'b3']}, format='json')
        assert resp.status_code == status.HTTP_400_BAD_REQUEST
        assert self._has_featured_badges_error(resp)

    def test_patch_duplicates_returns_400(self):
        user = UserFactory()
        b1 = _create_badge('b1', 'B1')
        _earn_badge(user, b1)
        client = AuthenticatedAPIClient().authenticate_user(user)
        resp = client.patch(ME_URL, {'featured_badges': ['b1', 'b1']}, format='json')
        assert resp.status_code == status.HTTP_400_BAD_REQUEST
        assert self._has_featured_badges_error(resp)

    def test_patch_empty_list_succeeds(self):
        user = UserFactory()
        client = AuthenticatedAPIClient().authenticate_user(user)
        resp = client.patch(ME_URL, {'featured_badges': []}, format='json')
        assert resp.status_code == status.HTTP_200_OK
        assert resp.json()['featured_badges'] == []


@pytest.mark.django_db
@pytest.mark.integration
class TestFeaturedBadgesGet:
    def test_get_me_includes_featured_badges(self):
        user = UserFactory()
        b1 = _create_badge('b1', 'Badge One')
        _earn_badge(user, b1)
        user.featured_badges = ['b1']
        user.save()
        client = AuthenticatedAPIClient().authenticate_user(user)
        resp = client.get(ME_URL)
        assert resp.status_code == status.HTTP_200_OK
        data = resp.json()
        assert 'featured_badges' in data
        assert 'featured_badges_detail' in data

    def test_featured_badges_detail_contains_full_badge_info(self):
        user = UserFactory()
        b1 = _create_badge('b1', 'Badge One')
        _earn_badge(user, b1)
        user.featured_badges = ['b1']
        user.save()
        # Invalidate cache so fresh data is returned
        from django.core.cache import cache
        cache.delete(f'user_profile:{user.id}')
        client = AuthenticatedAPIClient().authenticate_user(user)
        resp = client.get(ME_URL)
        data = resp.json()
        detail = data.get('featured_badges_detail', [])
        assert len(detail) == 1
        badge_detail = detail[0]
        assert badge_detail['id'] == 'b1'
        assert 'name' in badge_detail
        assert 'description' in badge_detail
        assert 'earned_at' in badge_detail
        assert 'icon_url' in badge_detail

    def test_featured_badges_detail_order_matches_featured_badges(self):
        user = UserFactory()
        b1 = _create_badge('b1', 'Badge One')
        b2 = _create_badge('b2', 'Badge Two')
        _earn_badge(user, b1)
        _earn_badge(user, b2)
        user.featured_badges = ['b2', 'b1']
        user.save()
        from django.core.cache import cache
        cache.delete(f'user_profile:{user.id}')
        client = AuthenticatedAPIClient().authenticate_user(user)
        resp = client.get(ME_URL)
        data = resp.json()
        detail_ids = [d['id'] for d in data['featured_badges_detail']]
        assert detail_ids == ['b2', 'b1']
