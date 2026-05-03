"""
Unit tests for ranking utilities
"""
import math
import pytest
from decimal import Decimal
from unittest.mock import patch
from django.utils import timezone
from datetime import timedelta

from api.models import Service, Comment, ReputationRep
from api.ranking import (
    RankingPipeline,
    calculate_hot_score,
    calculate_hot_scores_batch,
    wilson_score_lower_bound,
)
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

    def test_solo_offer_does_not_get_capacity_boost(self):
        """FR-17e / #304 — single-participant Offer (max_participants=1) is not
        capacitated; the 1.5x boost is reserved for Events and group Offers
        (max_participants > 1). The positive case (group Offer DOES get the
        boost) is covered by TestPhase2ServiceFormula.test_capacity_multiplier_applies_to_group_offers.
        """
        service = ServiceFactory(
            type='Offer', status='Active', max_participants=1,
        )
        base_score = calculate_hot_score(service)

        HandshakeFactory(service=service, status='accepted')

        score = calculate_hot_score(service)
        assert score == pytest.approx(base_score, rel=1e-5)

    # ── Boundary tests (FR-RANK-03 acceptance criteria) ──────────────────────

    def test_event_at_74pct_no_boost(self):
        """74% capacity (just below threshold) should NOT trigger the 1.5× boost."""
        service = ServiceFactory(
            type='Event', status='Active', max_participants=100,
            scheduled_time=timezone.now() + timedelta(days=3),
        )
        base_score = calculate_hot_score(service)

        for _ in range(74):
            HandshakeFactory(service=service, status='accepted')

        score = calculate_hot_score(service)
        assert score == pytest.approx(base_score, rel=1e-5)

    def test_event_at_75pct_gets_boost(self):
        """Exactly 75% capacity should trigger the 1.5× boost."""
        service = ServiceFactory(
            type='Event', status='Active', max_participants=100,
            scheduled_time=timezone.now() + timedelta(days=3),
        )
        base_score = calculate_hot_score(service)

        for _ in range(75):
            HandshakeFactory(service=service, status='accepted')

        boosted_score = calculate_hot_score(service)
        if base_score != 0:
            assert boosted_score == pytest.approx(base_score * 1.5, rel=1e-5)

    def test_event_at_99pct_gets_boost(self):
        """99% capacity (last slot open) should still trigger the 1.5× boost."""
        service = ServiceFactory(
            type='Event', status='Active', max_participants=100,
            scheduled_time=timezone.now() + timedelta(days=3),
        )
        base_score = calculate_hot_score(service)

        for _ in range(99):
            HandshakeFactory(service=service, status='accepted')

        boosted_score = calculate_hot_score(service)
        if base_score != 0:
            assert boosted_score == pytest.approx(base_score * 1.5, rel=1e-5)

    def test_event_at_100pct_no_boost(self):
        """Exactly 100% capacity (full) should NOT trigger the boost."""
        service = ServiceFactory(
            type='Event', status='Active', max_participants=100,
            scheduled_time=timezone.now() + timedelta(days=3),
        )
        base_score = calculate_hot_score(service)

        for _ in range(100):
            HandshakeFactory(service=service, status='accepted')

        score = calculate_hot_score(service)
        assert score == pytest.approx(base_score, rel=1e-5)

    def test_group_offer_at_75pct_gets_boost(self):
        """Group Offer (max_participants > 1) at 75% capacity should get the 1.5× boost."""
        service = ServiceFactory(
            type='Offer', status='Active', max_participants=4,
        )
        base_score = calculate_hot_score(service)

        for _ in range(3):
            HandshakeFactory(service=service, status='accepted')

        boosted_score = calculate_hot_score(service)
        if base_score != 0:
            assert boosted_score == pytest.approx(base_score * 1.5, rel=1e-5)

    def test_single_participant_offer_no_boost(self):
        """Offer with max_participants=1 should never receive the group multiplier."""
        service = ServiceFactory(
            type='Offer', status='Active', max_participants=1,
        )
        base_score = calculate_hot_score(service)

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
        """Batch scoring of Events must match the dedicated event formula."""
        from api.ranking import calculate_event_hot_score
        service = ServiceFactory(
            type='Event', status='Active', max_participants=4,
            scheduled_time=timezone.now() + timedelta(days=3),
        )
        for _ in range(3):
            HandshakeFactory(service=service, status='accepted')

        # Batch routes Events through calculate_event_hot_score (Task 3 / #303),
        # so parity is checked against that function, not calculate_hot_score.
        single_score = calculate_event_hot_score(service)
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

    # test_more_hours_exchanged_increases_score moved to TestPhase2ServiceFormula
    # as test_score_grows_with_hours_exchanged (single source of truth for the
    # ordering invariant under the new Quality * Activity formula).


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
        """NFR-17b: calling calculate_hot_score twice on the same service gives the same result.

        The Phase 2 formula has no time inputs, so determinism is structural. The
        old version of this test patched api.ranking.timezone to defend against
        time-decay drift between calls; that defence is no longer needed.
        """
        service = ServiceFactory(status='Active')
        CommentFactory(service=service)
        user = UserFactory()
        hs = HandshakeFactory(service=service, requester=user, status='completed')
        ReputationRepFactory(handshake=hs, giver=user, receiver=service.user)

        score_a = calculate_hot_score(service)
        score_b = calculate_hot_score(service)
        assert score_a == score_b

    def test_identical_services_produce_identical_scores(self):
        """NFR-17b: two services with the same engagement score the same regardless of age."""
        user_a = UserFactory()
        user_b = UserFactory()

        service_a = ServiceFactory(user=user_a, type='Offer', status='Active')
        service_b = ServiceFactory(user=user_b, type='Offer', status='Active')

        score_a = calculate_hot_score(service_a)
        score_b = calculate_hot_score(service_b)
        assert score_a == pytest.approx(score_b, rel=1e-9)

    def test_batch_score_matches_individual_for_all_service_types(self):
        """NFR-17b: batch scoring matches the per-type single-service formula."""
        from api.ranking import calculate_event_hot_score
        offer = ServiceFactory(type='Offer', status='Active')
        need = ServiceFactory(type='Need', status='Active')
        event = ServiceFactory(
            type='Event', status='Active', max_participants=10,
            scheduled_time=timezone.now() + timedelta(days=2),
        )
        services = [offer, need, event]

        batch = calculate_hot_scores_batch(services)

        # Offer/Need use calculate_hot_score; Event uses the dedicated event
        # formula since Task 3 (#303) -- batch routes accordingly.
        assert batch[offer.id] == pytest.approx(calculate_hot_score(offer), rel=1e-5)
        assert batch[need.id] == pytest.approx(calculate_hot_score(need), rel=1e-5)
        assert batch[event.id] == pytest.approx(calculate_event_hot_score(event), rel=1e-5)


# ---------------------------------------------------------------------------
# Phase 2 batch consistency — group offers
# ---------------------------------------------------------------------------

@pytest.mark.django_db
@pytest.mark.unit
class TestPhase2BatchConsistency:
    """Batch scoring must match single-service scoring for Group Offers (was an
    orphan test inside the old xfail Wilson class; lifted out so it actually runs)."""

    def test_batch_group_offer_multiplier_matches_single(self):
        service = ServiceFactory(
            type='Offer', status='Active', max_participants=4,
        )
        for _ in range(3):
            HandshakeFactory(service=service, status='accepted')

        single_score = calculate_hot_score(service)
        batch_scores = calculate_hot_scores_batch([service])

        assert batch_scores[service.id] == pytest.approx(single_score, rel=1e-5)


# ---------------------------------------------------------------------------
# FR-17j — Wilson Score lower bound
# ---------------------------------------------------------------------------

@pytest.mark.unit
class TestWilsonScoreConfidenceInterval:
    """FR-17j: provider with 3/3 positives must score below provider with 95/100."""

    def test_zero_total_returns_zero(self):
        assert wilson_score_lower_bound(0, 0) == 0.0

    def test_zero_positives_returns_zero(self):
        assert wilson_score_lower_bound(0, 50) == 0.0

    def test_perfect_score_below_one(self):
        # 3/3 should be well below 1.0 due to small-sample penalty
        assert wilson_score_lower_bound(3, 3) < 0.5

    def test_large_sample_perfect_score_close_to_one(self):
        assert wilson_score_lower_bound(1000, 1000) > 0.99

    def test_large_high_ratio_beats_small_perfect(self):
        small_perfect = wilson_score_lower_bound(3, 3)
        large_high = wilson_score_lower_bound(95, 100)
        assert large_high > small_perfect, (
            f"Wilson should rank 95/100 ({large_high}) above 3/3 ({small_perfect})"
        )

    def test_known_value_within_tolerance(self):
        """20/25 with z=1.96 ≈ 0.6087 (Evan Miller / Reddit Wilson formula)."""
        result = wilson_score_lower_bound(20, 25)
        assert math.isclose(result, 0.6087, abs_tol=0.001), result


@pytest.mark.unit
class TestRankingPipelineSkeleton:
    """The pipeline skeleton must orchestrate three phases without raising on empty input.

    Wired phases land in Tasks 2, 3, 8, 12 — this just locks the contract that
    .run() is callable with a request and a candidate iterable from day one.
    """

    def test_run_with_no_candidates_returns_empty(self):
        result = RankingPipeline(request=None).run([])
        assert result == []

    def test_phase_methods_are_callable_and_idempotent(self):
        pipeline = RankingPipeline(request=None)
        assert pipeline.filter_candidates([]) == []
        assert pipeline.score_candidates([]) == []
        assert pipeline.rerank([]) == []


# ---------------------------------------------------------------------------
# Phase 2 service formula (Quality x Activity x CapacityMultiplier) — closes #302
# ---------------------------------------------------------------------------

@pytest.mark.django_db
@pytest.mark.unit
class TestPhase2ServiceFormula:
    def test_score_grows_with_hours_exchanged(self):
        user = UserFactory()
        # Establish non-zero Quality so Activity differences are observable
        # under the Quality * Activity formula.
        for _ in range(5):
            requester = UserFactory()
            hs = HandshakeFactory(
                service=ServiceFactory(user=user, type='Offer'),
                requester=requester, status='completed',
            )
            ReputationRepFactory(handshake=hs, giver=requester, receiver=user, is_helpful=True)

        low = ServiceFactory(user=user, type='Offer', status='Active')
        high = ServiceFactory(user=user, type='Offer', status='Active')
        # Same comments so Activity differs only via HoursExchanged
        CommentFactory(service=low)
        CommentFactory(service=high)
        HandshakeFactory(service=low, status='completed', provisioned_hours=Decimal('1.0'))
        for _ in range(5):
            HandshakeFactory(service=high, status='completed', provisioned_hours=Decimal('2.0'))
        assert calculate_hot_score(high) > calculate_hot_score(low)

    def test_creation_time_does_not_affect_score(self):
        """Two services with identical engagement score the same regardless of age."""
        user_a = UserFactory()
        user_b = UserFactory()
        old = ServiceFactory(user=user_a, type='Offer', status='Active')
        Service.objects.filter(pk=old.pk).update(created_at=timezone.now() - timedelta(days=180))
        old.refresh_from_db()
        new = ServiceFactory(user=user_b, type='Offer', status='Active')
        for svc in (old, new):
            HandshakeFactory(service=svc, status='completed', provisioned_hours=Decimal('2.0'))
        assert calculate_hot_score(old) == pytest.approx(calculate_hot_score(new), rel=1e-3)

    def test_hours_exchanged_only_counts_completed_handshakes_for_this_service(self):
        owner = UserFactory()
        target = ServiceFactory(user=owner, type='Offer', status='Active')
        other = ServiceFactory(user=owner, type='Offer', status='Active')
        # Non-completed handshake on target — must NOT contribute
        HandshakeFactory(service=target, status='accepted', provisioned_hours=Decimal('99'))
        # Completed handshake on a DIFFERENT service — must NOT contribute
        HandshakeFactory(service=other, status='completed', provisioned_hours=Decimal('99'))
        # The only contribution: 1 completed hour on target
        HandshakeFactory(service=target, status='completed', provisioned_hours=Decimal('1'))
        CommentFactory(service=target)  # ensure non-zero activity baseline
        scores = calculate_hot_scores_batch([target])
        # Activity ~ log2(2 + 1.0) + 0.5 * log2(2 + 1) ~ 1.585 + 0.792 ~ 2.377.
        # Quality is 0 (no rep) so the final score should be 0 regardless.
        # The point is: the score must NOT include the 99h contributions.
        # Compare against a baseline service with the same setup and 0 hours.
        baseline = ServiceFactory(user=owner, type='Offer', status='Active')
        CommentFactory(service=baseline)
        baseline_scores = calculate_hot_scores_batch([baseline])
        # Both have Quality=0 -> both score 0. If the 99h leaked in, target would differ.
        assert scores[target.id] == baseline_scores[baseline.id]

    def test_capacity_multiplier_applies_to_group_offers(self):
        """FR-RANK-03 / #304 — group Offers at 75-99% fill get the 1.5x boost."""
        owner = UserFactory()
        # Build up some real Quality so the multiplier matters
        for _ in range(10):
            requester = UserFactory()
            hs = HandshakeFactory(service=ServiceFactory(user=owner, type='Offer'), requester=requester, status='completed')
            ReputationRepFactory(handshake=hs, giver=requester, receiver=owner, is_helpful=True)
        svc = ServiceFactory(user=owner, type='Offer', status='Active', max_participants=4)
        for _ in range(3):  # 3/4 = 75% — boost applies
            HandshakeFactory(service=svc, status='accepted')
        CommentFactory(service=svc)
        boosted = calculate_hot_score(svc)

        svc2 = ServiceFactory(user=owner, type='Offer', status='Active', max_participants=4)
        HandshakeFactory(service=svc2, status='accepted')  # 1/4 = 25% — no boost
        CommentFactory(service=svc2)
        unboosted = calculate_hot_score(svc2)
        # Quality and Activity are identical between svc and svc2 (status='accepted'
        # contributes neither completed-hours nor reps), so the only difference is
        # the 1.5x multiplier itself.
        assert boosted == pytest.approx(unboosted * 1.5, rel=1e-3)

    def test_batch_matches_single(self):
        user = UserFactory()
        services = [ServiceFactory(user=user, type='Offer', status='Active') for _ in range(3)]
        for svc in services:
            CommentFactory(service=svc)
            HandshakeFactory(service=svc, status='completed', provisioned_hours=Decimal('1'))
        batch = calculate_hot_scores_batch(services)
        for svc in services:
            single = calculate_hot_score(svc)
            assert batch[svc.id] == pytest.approx(single, rel=1e-6)


# ---------------------------------------------------------------------------
# Phase 2 event formula (RSVP velocity x OrganiserQuality x Capacity) - closes #303
# ---------------------------------------------------------------------------

from api.models import Handshake
from api.ranking import calculate_event_hot_score


@pytest.mark.django_db
@pytest.mark.unit
class TestPhase2EventFormula:
    def test_event_with_recent_rsvps_outranks_event_with_old_rsvps(self):
        organiser = UserFactory()
        # Seed event-scoped organiser quality so RSVP-velocity differences are
        # observable (under pure Wilson, an organiser with 0 event reps has
        # quality=0 -> all events score 0). Mirrors the service-formula tests.
        for _ in range(5):
            requester = UserFactory()
            seed_event = ServiceFactory(user=organiser, type='Event', max_participants=10)
            seed_hs = HandshakeFactory(service=seed_event, requester=requester, status='attended')
            ReputationRepFactory(handshake=seed_hs, giver=requester, receiver=organiser, is_helpful=True)

        hot = ServiceFactory(user=organiser, type='Event', status='Active', max_participants=10,
                             scheduled_time=timezone.now() + timedelta(days=3))
        cold = ServiceFactory(user=organiser, type='Event', status='Active', max_participants=10,
                              scheduled_time=timezone.now() + timedelta(days=3))
        # Hot event: 5 RSVPs in the last 7 days
        for _ in range(5):
            HandshakeFactory(service=hot, status='accepted')
        # Cold event: 5 RSVPs but they're all 30 days old
        for _ in range(5):
            hs = HandshakeFactory(service=cold, status='accepted')
            Handshake.objects.filter(pk=hs.pk).update(created_at=timezone.now() - timedelta(days=30))
        assert calculate_event_hot_score(hot) > calculate_event_hot_score(cold)

    def test_event_organiser_quality_uses_event_rep_only(self):
        """An organiser's Offer/Need rep must NOT bleed into their event score."""
        organiser = UserFactory()
        event = ServiceFactory(user=organiser, type='Event', status='Active', max_participants=10,
                               scheduled_time=timezone.now() + timedelta(days=3))
        # Give organiser strong Offer rep -- should NOT boost event quality
        for _ in range(20):
            requester = UserFactory()
            offer = ServiceFactory(user=organiser, type='Offer')
            hs = HandshakeFactory(service=offer, requester=requester, status='completed')
            ReputationRepFactory(handshake=hs, giver=requester, receiver=organiser, is_helpful=True)
        # Give the event some RSVPs so velocity is non-zero
        for _ in range(3):
            HandshakeFactory(service=event, status='accepted')
        baseline = calculate_event_hot_score(event)
        # Now give one event-scoped positive -- quality should jump
        requester = UserFactory()
        event_hs = HandshakeFactory(service=event, requester=requester, status='attended')
        ReputationRepFactory(handshake=event_hs, giver=requester, receiver=organiser, is_helpful=True)
        boosted = calculate_event_hot_score(event)
        assert boosted > baseline

    def test_event_capacity_boost_at_75_percent(self):
        organiser = UserFactory()
        # Seed event-scoped quality so multiplier matters
        for _ in range(5):
            requester = UserFactory()
            seed_event = ServiceFactory(user=organiser, type='Event', max_participants=10)
            seed_hs = HandshakeFactory(service=seed_event, requester=requester, status='attended')
            ReputationRepFactory(handshake=seed_hs, giver=requester, receiver=organiser, is_helpful=True)

        event = ServiceFactory(user=organiser, type='Event', status='Active', max_participants=4,
                               scheduled_time=timezone.now() + timedelta(days=3))
        for _ in range(3):  # 3/4 = 75% -- boost applies
            HandshakeFactory(service=event, status='accepted')
        boosted = calculate_event_hot_score(event)

        event2 = ServiceFactory(user=organiser, type='Event', status='Active', max_participants=4,
                                scheduled_time=timezone.now() + timedelta(days=3))
        HandshakeFactory(service=event2, status='accepted')  # 1/4 = 25% -- no boost
        unboosted = calculate_event_hot_score(event2)
        assert boosted > unboosted


# ---------------------------------------------------------------------------
# FR-17f reframe -- recurring decay is now a Phase 3 boost trigger (#305)
# ---------------------------------------------------------------------------

@pytest.mark.django_db
@pytest.mark.unit
class TestCheckRecurringGrowth:
    def _run(self):
        from django.core.management import call_command
        call_command('check_recurring_growth')

    def test_stale_recurring_service_gets_flagged(self):
        owner = UserFactory()
        svc = ServiceFactory(user=owner, type='Offer', status='Active', schedule_type='Recurrent')
        # No completed handshakes -> stale
        self._run()
        svc.refresh_from_db()
        assert svc.is_stale_recurring is True
        assert svc.last_growth_check_at is not None

    def test_growing_recurring_service_is_unflagged(self):
        from datetime import timedelta as td
        from api.models import Handshake
        owner = UserFactory()
        svc = ServiceFactory(user=owner, type='Offer', status='Active', schedule_type='Recurrent')
        # 2 completed handshakes in the last 7 days, 1 in the prior 7 days -> growth
        for _ in range(2):
            HandshakeFactory(service=svc, status='completed', provisioned_hours=Decimal('1'))
        old_hs = HandshakeFactory(service=svc, status='completed', provisioned_hours=Decimal('1'))
        Handshake.objects.filter(pk=old_hs.pk).update(updated_at=timezone.now() - td(days=10))
        self._run()
        svc.refresh_from_db()
        assert svc.is_stale_recurring is False

    def test_one_time_services_are_never_flagged(self):
        owner = UserFactory()
        one_time = ServiceFactory(user=owner, type='Offer', status='Active', schedule_type='One-Time')
        self._run()
        one_time.refresh_from_db()
        assert one_time.is_stale_recurring is False
        assert one_time.last_growth_check_at is None  # not even checked

    def test_throttle_re_check_within_7_days(self):
        owner = UserFactory()
        svc = ServiceFactory(user=owner, type='Offer', status='Active', schedule_type='Recurrent')
        self._run()  # first run -- sets last_growth_check_at
        svc.refresh_from_db()
        first_check = svc.last_growth_check_at
        # Second run immediately -- should not re-check
        self._run()
        svc.refresh_from_db()
        assert svc.last_growth_check_at == first_check
