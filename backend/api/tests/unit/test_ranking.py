"""
Unit tests for ranking utilities
"""
import pytest
from decimal import Decimal
from unittest.mock import patch
from django.utils import timezone
from datetime import timedelta

from api.models import Service, Comment, ReputationRep
from api.ranking import calculate_hot_score, calculate_hot_scores_batch
from api.tests.helpers.factories import (
    ServiceFactory, UserFactory, CommentFactory, ReputationRepFactory,
    NegativeRepFactory, HandshakeFactory,
)

# ---------------------------------------------------------------------------
# Lazy imports for functions not yet implemented — prevents import errors
# from breaking the existing test suite.
# ---------------------------------------------------------------------------
try:
    from api.ranking import calculate_event_hot_score as _calculate_event_hot_score
except ImportError:
    _calculate_event_hot_score = None

try:
    from api.ranking import wilson_score_lower_bound as _wilson_score_lower_bound
except ImportError:
    _wilson_score_lower_bound = None

try:
    from api.ranking import apply_recurring_decay as _apply_recurring_decay
except ImportError:
    _apply_recurring_decay = None


@pytest.mark.django_db
@pytest.mark.unit
class TestCalculateHotScore:
    """Test calculate_hot_score function"""
    
    def test_hot_score_basic(self):
        """Test basic hot score calculation"""
        service = ServiceFactory(status='Active')
        score = calculate_hot_score(service)
        assert score >= 0
        assert isinstance(score, (int, float))
    
    def test_hot_score_with_comments(self):
        """Test hot score increases with comments"""
        service = ServiceFactory(status='Active')
        base_score = calculate_hot_score(service)
        
        CommentFactory(service=service)
        CommentFactory(service=service)
        service.refresh_from_db()
        
        new_score = calculate_hot_score(service)
        assert new_score >= base_score
    
    def test_hot_score_with_reputation(self):
        """Test hot score increases with reputation"""
        user = UserFactory()
        service = ServiceFactory(user=user, status='Active')
        base_score = calculate_hot_score(service)
        
        giver = UserFactory()
        handshake = HandshakeFactory(service=service, requester=giver, status='completed')
        ReputationRepFactory(handshake=handshake, giver=giver, receiver=user)
        
        service.refresh_from_db()
        new_score = calculate_hot_score(service)
        assert new_score >= base_score
    
    def test_hot_score_time_decay(self):
        """Test hot score decreases over time"""
        old_service = ServiceFactory(
            status='Active',
            created_at=timezone.now() - timedelta(days=30)
        )
        new_service = ServiceFactory(
            status='Active',
            created_at=timezone.now() - timedelta(days=1)
        )
        
        old_score = calculate_hot_score(old_service)
        new_score = calculate_hot_score(new_service)
        
        assert new_score >= old_score
    
    def test_hot_score_inactive_service(self):
        """Test inactive service has lower hot score"""
        active_service = ServiceFactory(status='Active')
        inactive_service = ServiceFactory(status='Completed')
        
        active_score = calculate_hot_score(active_service)
        inactive_score = calculate_hot_score(inactive_service)
        
        assert active_score >= inactive_score


    def test_event_nearly_full_gets_boost(self):
        """Event at 75-99% capacity should get a 1.5× multiplier."""
        service = ServiceFactory(
            type='Event', status='Active', max_participants=4,
            scheduled_time=timezone.now() + timedelta(days=3),
        )
        base_score = calculate_hot_score(service)

        # Fill to 75% (3 of 4)
        for _ in range(3):
            HandshakeFactory(service=service, status='accepted')

        boosted_score = calculate_hot_score(service)
        if base_score != 0:
            assert boosted_score == pytest.approx(base_score * 1.5, rel=1e-5)

    def test_event_below_75_pct_no_boost(self):
        """Event below 75% capacity should NOT receive the multiplier."""
        service = ServiceFactory(
            type='Event', status='Active', max_participants=10,
            scheduled_time=timezone.now() + timedelta(days=3),
        )
        base_score = calculate_hot_score(service)

        # Fill to 60% (6 of 10)
        for _ in range(6):
            HandshakeFactory(service=service, status='accepted')

        score = calculate_hot_score(service)
        assert score == pytest.approx(base_score, rel=1e-5)

    def test_event_full_no_boost(self):
        """Event at exactly 100% capacity should NOT receive the multiplier."""
        service = ServiceFactory(
            type='Event', status='Active', max_participants=4,
            scheduled_time=timezone.now() + timedelta(days=3),
        )
        base_score = calculate_hot_score(service)

        for _ in range(4):
            HandshakeFactory(service=service, status='accepted')

        score = calculate_hot_score(service)
        # At 100% capacity_ratio == 1.0  →  condition 0.75 <= ratio < 1.0 is False
        assert score == pytest.approx(base_score, rel=1e-5)

    def test_non_event_service_no_boost(self):
        """Non-Event services should never receive the event multiplier."""
        service = ServiceFactory(
            type='Offer', status='Active', max_participants=4,
        )
        base_score = calculate_hot_score(service)

        for _ in range(3):
            HandshakeFactory(service=service, status='accepted')

        score = calculate_hot_score(service)
        assert score == pytest.approx(base_score, rel=1e-5)

    def test_event_evaluations_do_not_affect_standard_service_hot_score(self):
        organizer = UserFactory()
        offer = ServiceFactory(user=organizer, type='Offer', status='Active')
        base_score = calculate_hot_score(offer)

        event = ServiceFactory(user=organizer, type='Event', status='Active')
        attendee = UserFactory()
        event_hs = HandshakeFactory(
            service=event,
            requester=attendee,
            status='attended',
            provisioned_hours=0,
        )
        ReputationRepFactory(
            handshake=event_hs,
            giver=attendee,
            receiver=organizer,
            is_punctual=True,
            is_helpful=True,
            is_kind=True,
        )

        updated_score = calculate_hot_score(offer)
        assert updated_score == pytest.approx(base_score, rel=1e-5)


@pytest.mark.django_db
@pytest.mark.unit
class TestCalculateHotScoresBatch:
    """Test calculate_hot_scores_batch function"""
    
    def test_batch_calculation(self):
        """Test batch hot score calculation"""
        services = [
            ServiceFactory(status='Active'),
            ServiceFactory(status='Active'),
            ServiceFactory(status='Active')
        ]
        
        calculate_hot_scores_batch(services)
        
        for service in services:
            service.refresh_from_db()
            assert service.hot_score is not None
            assert service.hot_score >= 0

    def test_batch_event_multiplier_matches_single(self):
        """Batch scoring must match single-service scoring for Events."""
        service = ServiceFactory(
            type='Event', status='Active', max_participants=4,
            scheduled_time=timezone.now() + timedelta(days=3),
        )
        for _ in range(3):
            HandshakeFactory(service=service, status='accepted')

        single_score = calculate_hot_score(service)
        batch_scores = calculate_hot_scores_batch([service])

        assert batch_scores[service.id] == pytest.approx(single_score, rel=1e-5)


# ---------------------------------------------------------------------------
# FR-17c, FR-17d — Event Hot Score formula (TDD — xfail until implemented)
# Formula: Score = (1+2)^1.5 × (Avg(PositiveTraits) − Avg(NegativeTraits))
#                  + VerifiedParticipants
# Denominator is a fixed constant; no time variable allowed (FR-17d).
# ---------------------------------------------------------------------------

@pytest.mark.django_db
@pytest.mark.unit
@pytest.mark.xfail(reason="FR-17c/17d: calculate_event_hot_score not yet implemented", strict=False)
class TestEventHotScoreFormula:
    """
    TDD tests for the dedicated Event Hot Score formula.

    These tests will stay red until calculate_event_hot_score() is added to
    ranking.py and wired into calculate_hot_score() for type='Event' services.
    """

    def setup_method(self):
        if _calculate_event_hot_score is None:
            pytest.xfail("calculate_event_hot_score not yet implemented — FR-17c")

    def _make_event_with_attendance(self, organizer, attendee_count=3,
                                    positive_traits=None, negative_traits=None):
        """Create a completed event with attended handshakes and evaluations."""
        event = ServiceFactory(
            user=organizer, type='Event', status='Completed',
            max_participants=10,
            scheduled_time=timezone.now() - timedelta(days=1),
        )
        attendees = [UserFactory() for _ in range(attendee_count)]
        handshakes = []
        for attendee in attendees:
            hs = HandshakeFactory(
                service=event, requester=attendee,
                status='attended', provisioned_hours=Decimal('0'),
            )
            handshakes.append((attendee, hs))

        positive_traits = positive_traits or {'is_punctual': True, 'is_helpful': True, 'is_kind': True}
        negative_traits = negative_traits or {'is_late': False, 'is_unhelpful': False, 'is_rude': False}

        for attendee, hs in handshakes:
            ReputationRepFactory(
                handshake=hs, giver=attendee, receiver=organizer, **positive_traits
            )
            NegativeRepFactory(
                handshake=hs, giver=attendee, receiver=organizer, **negative_traits
            )
        return event, attendees

    def test_event_score_increases_with_verified_participants(self):
        """FR-17c: more verified participants (attended) → higher score."""
        organizer = UserFactory()
        small_event, _ = self._make_event_with_attendance(organizer, attendee_count=2)
        large_event, _ = self._make_event_with_attendance(organizer, attendee_count=8)

        assert _calculate_event_hot_score(large_event) > _calculate_event_hot_score(small_event)

    def test_event_score_positive_traits_raise_score(self):
        """FR-17c: higher average positive traits → higher score."""
        organizer = UserFactory()
        good_event, _ = self._make_event_with_attendance(
            organizer, attendee_count=3,
            positive_traits={'is_punctual': True, 'is_helpful': True, 'is_kind': True},
        )
        poor_event, _ = self._make_event_with_attendance(
            organizer, attendee_count=3,
            positive_traits={'is_punctual': False, 'is_helpful': False, 'is_kind': False},
        )
        assert _calculate_event_hot_score(good_event) > _calculate_event_hot_score(poor_event)

    def test_event_score_negative_traits_lower_score(self):
        """FR-17c: higher average negative traits → lower score."""
        organizer = UserFactory()
        clean_event, _ = self._make_event_with_attendance(
            organizer, negative_traits={'is_late': False, 'is_unhelpful': False, 'is_rude': False},
        )
        bad_event, _ = self._make_event_with_attendance(
            organizer, negative_traits={'is_late': True, 'is_unhelpful': True, 'is_rude': True},
        )
        assert _calculate_event_hot_score(clean_event) > _calculate_event_hot_score(bad_event)

    def test_event_score_zero_with_no_attendees_and_no_feedback(self):
        """FR-17c: event with no attended handshakes scores 0."""
        organizer = UserFactory()
        event = ServiceFactory(user=organizer, type='Event', status='Active', max_participants=10)
        assert _calculate_event_hot_score(event) == 0.0

    def test_event_score_constant_denominator(self):
        """FR-17c: denominator is the fixed constant (1+2)^1.5 = ~5.196."""
        organizer = UserFactory()
        event, _ = self._make_event_with_attendance(
            organizer, attendee_count=1,
            positive_traits={'is_punctual': True, 'is_helpful': False, 'is_kind': False},
            negative_traits={'is_late': False, 'is_unhelpful': False, 'is_rude': False},
        )
        score = _calculate_event_hot_score(event)
        # AvgPos = 1/3, AvgNeg = 0, VerifiedParticipants = 1
        # Score = (1+2)^1.5 * (1/3 - 0) + 1 = 5.196 * 0.333 + 1 ≈ 2.732
        expected = (3 ** 1.5) * (1 / 3) + 1
        assert score == pytest.approx(expected, rel=1e-3)


@pytest.mark.django_db
@pytest.mark.unit
@pytest.mark.xfail(reason="FR-17d: event score must be time-independent (not yet enforced)", strict=False)
class TestEventHotScoreTimeIndependence:
    """FR-17d: event duration/time shall not be used as denominator input."""

    def setup_method(self):
        if _calculate_event_hot_score is None:
            pytest.xfail("calculate_event_hot_score not yet implemented — FR-17c/17d")

    def test_event_score_identical_regardless_of_creation_date(self):
        """FR-17d: two events with identical feedback but different ages score the same."""
        organizer = UserFactory()

        def make_attended_event(days_old):
            event = ServiceFactory(
                user=organizer, type='Event', status='Completed', max_participants=5,
            )
            Service.objects.filter(pk=event.pk).update(
                created_at=timezone.now() - timedelta(days=days_old)
            )
            event.refresh_from_db()
            attendee = UserFactory()
            hs = HandshakeFactory(service=event, requester=attendee, status='attended',
                                  provisioned_hours=Decimal('0'))
            ReputationRepFactory(handshake=hs, giver=attendee, receiver=organizer,
                                 is_punctual=True, is_helpful=True, is_kind=False)
            NegativeRepFactory(handshake=hs, giver=attendee, receiver=organizer,
                               is_late=False, is_unhelpful=False, is_rude=False)
            return event

        recent_event = make_attended_event(days_old=1)
        old_event = make_attended_event(days_old=90)

        assert _calculate_event_hot_score(recent_event) == pytest.approx(
            _calculate_event_hot_score(old_event), rel=1e-5
        )

    def test_event_score_unchanged_as_time_passes(self):
        """FR-17d: calling score today vs in the future gives same result (no clock dependency)."""
        organizer = UserFactory()
        event = ServiceFactory(user=organizer, type='Event', status='Completed', max_participants=5)
        attendee = UserFactory()
        hs = HandshakeFactory(service=event, requester=attendee, status='attended',
                              provisioned_hours=Decimal('0'))
        ReputationRepFactory(handshake=hs, giver=attendee, receiver=organizer,
                             is_punctual=True, is_helpful=True, is_kind=True)
        NegativeRepFactory(handshake=hs, giver=attendee, receiver=organizer,
                           is_late=False, is_unhelpful=False, is_rude=False)

        score_now = _calculate_event_hot_score(event)

        future = timezone.now() + timedelta(days=30)
        with patch('django.utils.timezone.now', return_value=future):
            score_later = _calculate_event_hot_score(event)

        assert score_now == pytest.approx(score_later, rel=1e-5)


# ---------------------------------------------------------------------------
# FR-17b correction — Service Hot Score should use HoursExchanged
# (TDD — xfail until formula variable is corrected)
# ---------------------------------------------------------------------------

@pytest.mark.django_db
@pytest.mark.unit
@pytest.mark.xfail(
    reason="FR-17b: Service Hot Score uses time-since-creation; should use HoursExchanged", strict=False
)
class TestServiceHotScoreUsesHoursExchanged:
    """
    FR-17b: the denominator/multiplier variable is HoursExchanged (sum of
    provisioned_hours from completed handshakes), not hours since creation.
    """

    def test_score_driven_by_hours_exchanged_not_creation_time(self):
        """Two services created at different times but with same HoursExchanged score identically."""
        user_a = UserFactory()
        user_b = UserFactory()

        old_service = ServiceFactory(user=user_a, type='Offer', status='Active')
        Service.objects.filter(pk=old_service.pk).update(
            created_at=timezone.now() - timedelta(days=60)
        )
        old_service.refresh_from_db()

        new_service = ServiceFactory(user=user_b, type='Offer', status='Active')
        # new_service was just created — created_at is near now()

        # Give both 2 hours exchanged via completed handshakes
        for svc in (old_service, new_service):
            hs = HandshakeFactory(service=svc, status='completed', provisioned_hours=Decimal('2.0'))

        score_old = calculate_hot_score(old_service)
        score_new = calculate_hot_score(new_service)

        # Under the HoursExchanged formula both have the same exchanged hours →
        # same denominator → same score (given no other engagement differences).
        assert score_old == pytest.approx(score_new, rel=1e-3)

    def test_more_hours_exchanged_increases_denominator(self):
        """Service with more completed hours has a different score than one with fewer hours."""
        user = UserFactory()
        low_hours_svc = ServiceFactory(user=user, type='Offer', status='Active')
        high_hours_svc = ServiceFactory(user=user, type='Offer', status='Active')

        HandshakeFactory(service=low_hours_svc, status='completed', provisioned_hours=Decimal('1.0'))
        for _ in range(5):
            HandshakeFactory(service=high_hours_svc, status='completed', provisioned_hours=Decimal('2.0'))

        score_low = calculate_hot_score(low_hours_svc)
        score_high = calculate_hot_score(high_hours_svc)

        # With multiplication formula: high hours → higher score
        # With division formula: high hours → lower score
        # Either way they must differ — this test just asserts they are not equal.
        assert score_low != pytest.approx(score_high, rel=1e-3)


# ---------------------------------------------------------------------------
# FR-17f — Recurring listing decay (TDD — xfail until implemented)
# ---------------------------------------------------------------------------

@pytest.mark.django_db
@pytest.mark.unit
@pytest.mark.xfail(reason="FR-17f: recurring decay not yet implemented", strict=False)
class TestRecurringDecay:
    """FR-17f: recurring listings without attendance/completion growth decay 10%/week."""

    def setup_method(self):
        if _apply_recurring_decay is None:
            pytest.xfail("apply_recurring_decay not yet implemented — FR-17f")

    def test_recurring_service_without_growth_decays_10pct(self):
        """FR-17f: recurring service with no new completions in 7 days loses 10% of hot_score."""
        service = ServiceFactory(
            type='Offer', status='Active', schedule_type='Recurrent',
        )
        Service.objects.filter(pk=service.pk).update(hot_score=1.0)
        service.refresh_from_db()

        # No completed handshakes in the last 7 days — simulate stale state
        _apply_recurring_decay(service)
        service.refresh_from_db()

        assert service.hot_score == pytest.approx(0.9, rel=1e-5)

    def test_recurring_service_with_recent_growth_not_decayed(self):
        """FR-17f: recurring service with a recent completion is not decayed."""
        user = UserFactory()
        service = ServiceFactory(user=user, type='Offer', status='Active', schedule_type='Recurrent')
        Service.objects.filter(pk=service.pk).update(hot_score=1.0)
        service.refresh_from_db()

        # Create a completed handshake within the last 7 days
        HandshakeFactory(service=service, status='completed', provisioned_hours=Decimal('1.0'))

        _apply_recurring_decay(service)
        service.refresh_from_db()

        assert service.hot_score == pytest.approx(1.0, rel=1e-5)

    def test_one_time_service_never_decayed(self):
        """FR-17f: One-Time services are never subject to recurrence decay."""
        service = ServiceFactory(type='Offer', status='Active', schedule_type='One-Time')
        Service.objects.filter(pk=service.pk).update(hot_score=1.0)
        service.refresh_from_db()

        _apply_recurring_decay(service)
        service.refresh_from_db()

        assert service.hot_score == pytest.approx(1.0, rel=1e-5)

    def test_decay_does_not_apply_twice_in_same_week(self):
        """FR-17f: calling apply_recurring_decay twice in one window should not double-decay."""
        service = ServiceFactory(type='Offer', status='Active', schedule_type='Recurrent')
        Service.objects.filter(pk=service.pk).update(hot_score=1.0)
        service.refresh_from_db()

        _apply_recurring_decay(service)
        _apply_recurring_decay(service)  # second call in same window
        service.refresh_from_db()

        # Should still be ~0.9, not ~0.81
        assert service.hot_score == pytest.approx(0.9, rel=1e-5)


# ---------------------------------------------------------------------------
# NFR-17b — Formula determinism (should pass with current implementation,
# but formalises the requirement and catches future regressions)
# ---------------------------------------------------------------------------

@pytest.mark.django_db
@pytest.mark.unit
class TestHotScoreDeterminism:
    """NFR-17b: formula execution shall be deterministic for identical inputs."""

    def test_same_service_same_score_on_repeated_calls(self):
        """NFR-17b: calling calculate_hot_score twice on the same service gives the same result."""
        service = ServiceFactory(status='Active')
        CommentFactory(service=service)
        user = UserFactory()
        hs = HandshakeFactory(service=service, requester=user, status='completed')
        ReputationRepFactory(handshake=hs, giver=user, receiver=service.user)

        fixed_time = timezone.now()
        with patch('api.ranking.timezone') as mock_tz:
            mock_tz.now.return_value = fixed_time
            score_a = calculate_hot_score(service)
            score_b = calculate_hot_score(service)

        assert score_a == score_b

    def test_identical_services_produce_identical_scores(self):
        """NFR-17b: two services with the same engagement and creation time score the same."""
        fixed_time = timezone.now() - timedelta(hours=5)
        user_a = UserFactory()
        user_b = UserFactory()

        service_a = ServiceFactory(user=user_a, type='Offer', status='Active')
        service_b = ServiceFactory(user=user_b, type='Offer', status='Active')
        for svc in (service_a, service_b):
            Service.objects.filter(pk=svc.pk).update(created_at=fixed_time)
            svc.refresh_from_db()

        with patch('api.ranking.timezone') as mock_tz:
            mock_tz.now.return_value = fixed_time + timedelta(hours=6)
            score_a = calculate_hot_score(service_a)
            score_b = calculate_hot_score(service_b)

        assert score_a == pytest.approx(score_b, rel=1e-9)

    def test_batch_score_matches_individual_for_all_service_types(self):
        """NFR-17b: batch and single-service scoring produce the same result for every type."""
        offer = ServiceFactory(type='Offer', status='Active')
        need = ServiceFactory(type='Need', status='Active')
        event = ServiceFactory(
            type='Event', status='Active', max_participants=10,
            scheduled_time=timezone.now() + timedelta(days=2),
        )
        services = [offer, need, event]

        batch = calculate_hot_scores_batch(services)

        for svc in services:
            assert batch[svc.id] == pytest.approx(calculate_hot_score(svc), rel=1e-5)


# ---------------------------------------------------------------------------
# NEW — Wilson Score confidence interval (TDD — xfail until implemented)
# ---------------------------------------------------------------------------

@pytest.mark.unit
@pytest.mark.xfail(reason="NEW: wilson_score_lower_bound not yet implemented", strict=False)
class TestWilsonScoreConfidenceInterval:
    """
    New requirement from HiveMind scratch: use Wilson Score lower-bound
    confidence interval for the reputation component to prevent a new user
    with few reviews from outranking a power user with many reviews.
    """

    def setup_method(self):
        if _wilson_score_lower_bound is None:
            pytest.xfail("wilson_score_lower_bound not yet implemented")

    def test_zero_interactions_returns_zero(self):
        """With no interactions, lower bound is 0 — no reputation established."""
        assert _wilson_score_lower_bound(positives=0, total=0) == 0.0

    def test_perfect_score_with_few_reviews_is_low(self):
        """3 positives out of 3 total should give a low confidence lower bound (~0.29)."""
        lb = _wilson_score_lower_bound(positives=3, total=3)
        assert lb < 0.70  # High uncertainty due to small sample

    def test_high_volume_high_rate_gives_high_lower_bound(self):
        """90% positive rate with 300 reviews should give a high lower bound (>0.85)."""
        lb = _wilson_score_lower_bound(positives=270, total=300)
        assert lb > 0.85

    def test_few_reviews_lower_bound_is_less_than_high_volume(self):
        """A new user with 3/3 positives must score BELOW a veteran with 270/300."""
        lb_new = _wilson_score_lower_bound(positives=3, total=3)
        lb_veteran = _wilson_score_lower_bound(positives=270, total=300)
        assert lb_new < lb_veteran

    def test_lower_bound_never_exceeds_1(self):
        """Confidence lower bound is always in [0, 1]."""
        lb = _wilson_score_lower_bound(positives=100, total=100)
        assert 0.0 <= lb <= 1.0

    def test_deterministic_for_same_inputs(self):
        """Same inputs always produce the same result (NFR-17b applies here too)."""
        assert _wilson_score_lower_bound(50, 100) == _wilson_score_lower_bound(50, 100)
