"""
Unit tests for User.featured_badges field and User.clean() validation.
"""
import pytest
from django.core.exceptions import ValidationError

from api.tests.helpers.factories import UserFactory
from api.models import Badge, UserBadge


def _create_badge_and_earn(user, badge_id='test_badge_1', name='Test Badge'):
    """Helper: create Badge and UserBadge, returning (badge, user_badge)."""
    badge, _ = Badge.objects.get_or_create(
        id=badge_id,
        defaults={'name': name, 'description': 'A test badge'},
    )
    ub, _ = UserBadge.objects.get_or_create(user=user, badge=badge)
    return badge, ub


@pytest.mark.django_db
@pytest.mark.unit
class TestUserFeaturedBadgesClean:
    """Tests for User.clean() validation of featured_badges."""

    def test_empty_list_is_valid(self):
        user = UserFactory(featured_badges=[])
        user.clean()  # should not raise

    def test_one_valid_badge_ok(self):
        user = UserFactory(featured_badges=[])
        badge, _ = _create_badge_and_earn(user, 'badge_1', 'Badge One')
        user.featured_badges = ['badge_1']
        user.clean()  # should not raise

    def test_two_valid_badges_ok(self):
        user = UserFactory(featured_badges=[])
        _create_badge_and_earn(user, 'badge_a', 'Badge A')
        _create_badge_and_earn(user, 'badge_b', 'Badge B')
        user.featured_badges = ['badge_a', 'badge_b']
        user.clean()  # should not raise

    def test_order_preserved(self):
        """featured_badges stores badges in insertion order."""
        user = UserFactory(featured_badges=[])
        _create_badge_and_earn(user, 'badge_a', 'Badge A')
        _create_badge_and_earn(user, 'badge_b', 'Badge B')
        user.featured_badges = ['badge_b', 'badge_a']
        user.clean()
        assert user.featured_badges == ['badge_b', 'badge_a']

    def test_rejects_more_than_two(self):
        user = UserFactory(featured_badges=[])
        _create_badge_and_earn(user, 'b1', 'B1')
        _create_badge_and_earn(user, 'b2', 'B2')
        _create_badge_and_earn(user, 'b3', 'B3')
        user.featured_badges = ['b1', 'b2', 'b3']
        with pytest.raises(ValidationError) as exc_info:
            user.clean()
        assert 'featured_badges' in exc_info.value.message_dict

    def test_rejects_unearned_badge_id(self):
        user = UserFactory(featured_badges=[])
        # Do not create a UserBadge for this badge
        Badge.objects.get_or_create(id='unearned_badge', defaults={'name': 'Unearned'})
        user.featured_badges = ['unearned_badge']
        with pytest.raises(ValidationError) as exc_info:
            user.clean()
        assert 'featured_badges' in exc_info.value.message_dict

    def test_rejects_duplicates(self):
        user = UserFactory(featured_badges=[])
        _create_badge_and_earn(user, 'dup_badge', 'Dup Badge')
        user.featured_badges = ['dup_badge', 'dup_badge']
        with pytest.raises(ValidationError) as exc_info:
            user.clean()
        assert 'featured_badges' in exc_info.value.message_dict

    def test_rejects_non_list(self):
        user = UserFactory(featured_badges=[])
        user.featured_badges = 'not_a_list'
        with pytest.raises(ValidationError) as exc_info:
            user.clean()
        assert 'featured_badges' in exc_info.value.message_dict

    def test_rejects_non_string_entries(self):
        user = UserFactory(featured_badges=[])
        user.featured_badges = [123, 456]
        with pytest.raises(ValidationError) as exc_info:
            user.clean()
        assert 'featured_badges' in exc_info.value.message_dict

    def test_rejects_partial_unearned(self):
        """When one badge is earned but the other is not, validation must fail."""
        user = UserFactory(featured_badges=[])
        _create_badge_and_earn(user, 'earned_one', 'Earned')
        Badge.objects.get_or_create(id='not_earned', defaults={'name': 'Not Earned'})
        user.featured_badges = ['earned_one', 'not_earned']
        with pytest.raises(ValidationError) as exc_info:
            user.clean()
        assert 'featured_badges' in exc_info.value.message_dict
