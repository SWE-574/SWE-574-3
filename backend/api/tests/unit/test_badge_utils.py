"""
Unit tests for badge_utils.py

Covers:
- check_and_assign_badges() — the main orchestrator
- assign_badge() — idempotency and karma awarding
- get_user_stats() — stat computation correctness
- get_badge_progress() — progress percentage and hidden badge handling
"""
import pytest
from decimal import Decimal

from api.badge_utils import (
    check_and_assign_badges,
    assign_badge,
    get_user_stats,
    get_badge_progress,
    BADGE_DEFAULTS,
    BADGE_REQUIREMENTS,
)
from api.models import Badge, NegativeRep, UserBadge
from api.tests.helpers.factories import (
    UserFactory,
    ServiceFactory,
    HandshakeFactory,
    ReputationRepFactory,
    CommentFactory,
    TransactionHistoryFactory,
)



# ---------------------------------------------------------------------------
# assign_badge
# ---------------------------------------------------------------------------

@pytest.mark.django_db
@pytest.mark.unit
class TestAssignBadge:
    def test_creates_badge_and_user_badge(self):
        user = UserFactory(karma_score=0)
        created = assign_badge(user, 'first-service')
        assert created is True
        assert UserBadge.objects.filter(user=user, badge_id='first-service').exists()

    def test_awards_karma_on_first_assignment(self):
        user = UserFactory(karma_score=0)
        assign_badge(user, 'first-service')
        user.refresh_from_db()
        expected_karma = BADGE_DEFAULTS['first-service']['karma_points']
        assert user.karma_score == expected_karma

    def test_idempotent_second_assignment(self):
        user = UserFactory(karma_score=0)
        assign_badge(user, 'first-service')
        user.refresh_from_db()
        karma_after_first = user.karma_score

        created = assign_badge(user, 'first-service')
        assert created is False
        user.refresh_from_db()
        assert user.karma_score == karma_after_first  # no double karma

    def test_unknown_badge_id_fails_on_create(self):
        """
        Known limitation: assign_badge() for unknown badge IDs will raise a
        FieldError because the fallback defaults dict includes 'karma_points'
        and 'is_hidden', which are not Badge model fields.
        All real badge IDs are pre-seeded so get_or_create never creates new rows.
        """
        import django.core.exceptions
        user = UserFactory()
        with pytest.raises(django.core.exceptions.FieldError):
            assign_badge(user, 'custom-mystery-badge')


# ---------------------------------------------------------------------------
# get_user_stats — first-service (completed_services)
# ---------------------------------------------------------------------------

@pytest.mark.django_db
@pytest.mark.unit
class TestGetUserStatsCompletedServices:
    def test_zero_completed_services_for_new_user(self):
        user = UserFactory()
        stats = get_user_stats(user)
        assert stats['completed_services'] == 0

    def test_counts_completed_as_requester(self):
        user = UserFactory()
        service = ServiceFactory()
        HandshakeFactory(requester=user, service=service, status='completed')
        stats = get_user_stats(user)
        assert stats['completed_services'] >= 1

    def test_counts_completed_as_provider(self):
        user = UserFactory()
        service = ServiceFactory(user=user)
        HandshakeFactory(service=service, status='completed')
        stats = get_user_stats(user)
        assert stats['completed_services'] >= 1

    def test_does_not_count_pending_handshakes(self):
        user = UserFactory()
        service = ServiceFactory()
        HandshakeFactory(requester=user, service=service, status='pending')
        stats = get_user_stats(user)
        assert stats['completed_services'] == 0


# ---------------------------------------------------------------------------
# get_user_stats — offer_count (10-offers badge)
# ---------------------------------------------------------------------------

@pytest.mark.django_db
@pytest.mark.unit
class TestGetUserStatsOfferCount:
    def test_counts_active_and_completed_offers(self):
        user = UserFactory()
        ServiceFactory(user=user, type='Offer', status='Active')
        ServiceFactory(user=user, type='Offer', status='Completed')
        ServiceFactory(user=user, type='Need', status='Active')   # must not count

        stats = get_user_stats(user)
        assert stats['offer_count'] == 2

    def test_excludes_other_users_offers(self):
        user = UserFactory()
        other = UserFactory()
        ServiceFactory(user=other, type='Offer', status='Active')
        stats = get_user_stats(user)
        assert stats['offer_count'] == 0


# ---------------------------------------------------------------------------
# get_user_stats — reputation counts
# ---------------------------------------------------------------------------

@pytest.mark.django_db
@pytest.mark.unit
class TestGetUserStatsReputation:
    def test_helpful_kindness_punctual_counts(self):
        user = UserFactory()
        handshake = HandshakeFactory(status='completed')
        ReputationRepFactory(
            receiver=user, handshake=handshake,
            is_helpful=True, is_kind=True, is_punctual=False
        )
        stats = get_user_stats(user)
        assert stats['helpful_count'] == 1
        assert stats['kindness_count'] == 1
        assert stats['punctual_count'] == 0

    def test_total_positive_reputation_is_sum(self):
        user = UserFactory()
        handshake = HandshakeFactory(status='completed')
        ReputationRepFactory(
            receiver=user, handshake=handshake,
            is_helpful=True, is_kind=True, is_punctual=True
        )
        stats = get_user_stats(user)
        assert stats['total_positive_reputation'] == 3

    def test_negative_rep_count(self):
        user = UserFactory()
        giver = UserFactory()
        handshake = HandshakeFactory(status='completed')
        NegativeRep.objects.create(
            handshake=handshake,
            giver=giver,
            receiver=user,
            is_late=True,
        )
        stats = get_user_stats(user)
        assert stats['negative_rep_count'] == 1


# ---------------------------------------------------------------------------
# get_user_stats — hours_given
# ---------------------------------------------------------------------------

@pytest.mark.django_db
@pytest.mark.unit
class TestGetUserStatsHoursGiven:
    def test_counts_positive_transfer_transactions(self):
        user = UserFactory()
        TransactionHistoryFactory(user=user, transaction_type='transfer', amount=Decimal('4.00'))
        TransactionHistoryFactory(user=user, transaction_type='transfer', amount=Decimal('3.00'))
        # Provision (debit) must not count
        TransactionHistoryFactory(user=user, transaction_type='provision', amount=Decimal('-2.00'))

        stats = get_user_stats(user)
        assert stats['hours_given'] == 7

    def test_zero_hours_for_new_user(self):
        user = UserFactory()
        stats = get_user_stats(user)
        assert stats['hours_given'] == 0


# ---------------------------------------------------------------------------
# get_user_stats — perfect-record (completed_no_negative)
# ---------------------------------------------------------------------------

@pytest.mark.django_db
@pytest.mark.unit
class TestGetUserStatsPerfectRecord:
    def test_completed_no_negative_equals_completed_services_when_clean(self):
        user = UserFactory()
        service = ServiceFactory()
        HandshakeFactory(requester=user, service=service, status='completed')

        stats = get_user_stats(user)
        assert stats['completed_no_negative'] == stats['completed_services']

    def test_completed_no_negative_is_zero_when_has_negative_rep(self):
        user = UserFactory()
        giver = UserFactory()
        service = ServiceFactory()
        hs = HandshakeFactory(requester=user, service=service, status='completed')
        NegativeRep.objects.create(handshake=hs, giver=giver, receiver=user, is_late=True)

        stats = get_user_stats(user)
        assert stats['completed_no_negative'] == 0


# ---------------------------------------------------------------------------
# check_and_assign_badges — core orchestration
# ---------------------------------------------------------------------------

@pytest.mark.django_db
@pytest.mark.unit
class TestCheckAndAssignBadges:
    def test_assigns_first_service_badge_after_one_completion(self):
        user = UserFactory()
        service = ServiceFactory()
        HandshakeFactory(requester=user, service=service, status='completed')

        newly_assigned = check_and_assign_badges(user)
        assert 'first-service' in newly_assigned
        assert UserBadge.objects.filter(user=user, badge_id='first-service').exists()

    def test_does_not_reassign_existing_badge(self):
        user = UserFactory()
        service = ServiceFactory()
        HandshakeFactory(requester=user, service=service, status='completed')

        check_and_assign_badges(user)  # first call assigns
        newly_assigned_second = check_and_assign_badges(user)  # second call must not reassign
        assert 'first-service' not in newly_assigned_second

    def test_returns_empty_list_when_no_thresholds_met(self):
        user = UserFactory()
        newly_assigned = check_and_assign_badges(user)
        assert newly_assigned == []

    def test_assigns_community_voice_badge_after_10_comments(self):
        user = UserFactory()
        for _ in range(10):
            CommentFactory(user=user, is_deleted=False)

        newly_assigned = check_and_assign_badges(user)
        assert 'community-voice' in newly_assigned

    def test_perfect_record_not_assigned_with_negative_rep(self):
        user = UserFactory()
        giver = UserFactory()
        service = ServiceFactory()
        # Create enough completed handshakes (threshold = 10)
        handshakes = [
            HandshakeFactory(requester=user, service=service, status='completed')
            for _ in range(10)
        ]
        NegativeRep.objects.create(
            handshake=handshakes[0], giver=giver, receiver=user, is_late=True
        )

        newly_assigned = check_and_assign_badges(user)
        assert 'perfect-record' not in newly_assigned


# ---------------------------------------------------------------------------
# get_badge_progress
# ---------------------------------------------------------------------------

@pytest.mark.django_db
@pytest.mark.unit
class TestGetBadgeProgress:
    def test_returns_all_badge_ids(self):
        user = UserFactory()
        progress = get_badge_progress(user)
        for badge_id in BADGE_REQUIREMENTS:
            assert badge_id in progress

    def test_earned_false_when_not_assigned(self):
        user = UserFactory()
        progress = get_badge_progress(user)
        assert progress['first-service']['earned'] is False

    def test_earned_true_after_assignment(self):
        user = UserFactory()
        assign_badge(user, 'first-service')
        progress = get_badge_progress(user)
        assert progress['first-service']['earned'] is True

    def test_progress_percent_capped_at_100(self):
        user = UserFactory()
        # Create more completions than the threshold requires
        service = ServiceFactory()
        for _ in range(30):
            HandshakeFactory(requester=user, service=service, status='completed')

        progress = get_badge_progress(user)
        assert progress['first-service']['progress_percent'] == 100

    def test_hidden_badge_current_and_threshold_none_for_unearned(self):
        """Hidden badges that haven't been earned should expose None for current/threshold."""
        user = UserFactory()
        progress = get_badge_progress(user)
        # 'perfect-record' is marked is_hidden=True in BADGE_DEFAULTS
        assert progress['perfect-record']['current'] is None
        assert progress['perfect-record']['threshold'] is None

    def test_hidden_badge_reveals_progress_after_earning(self):
        user = UserFactory()
        assign_badge(user, 'perfect-record')
        progress = get_badge_progress(user)
        assert progress['perfect-record']['current'] is not None
