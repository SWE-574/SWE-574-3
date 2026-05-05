"""Tests for stochastic boost application (issue #477).

Default behavior (probability 1.0) must match the deterministic baseline
exactly so existing tests continue to pass. With probability < 1.0 a boost
applies on a fraction of scoring events matching the configured probability,
and when applied the effective multiplier is amplified so the expected value
across impressions equals the configured target.
"""
import random
from datetime import timedelta

import pytest
from django.test import override_settings
from django.utils import timezone

from api.tests.helpers.factories import (
    HandshakeFactory,
    ReputationRepFactory,
    ServiceFactory,
    UserFactory,
)


class TestSampleBoost:
    """Unit tests for the sample_boost helper. No DB needed."""

    def test_probability_one_returns_target_and_applied(self):
        from api.ranking import sample_boost

        effective, applied = sample_boost(target_multiplier=1.2, probability=1.0)
        assert effective == 1.2
        assert applied is True

    def test_probability_above_one_clamps_to_deterministic(self):
        from api.ranking import sample_boost

        effective, applied = sample_boost(target_multiplier=1.5, probability=1.5)
        assert effective == 1.5
        assert applied is True

    def test_probability_zero_never_applies(self):
        from api.ranking import sample_boost

        effective, applied = sample_boost(target_multiplier=1.2, probability=0.0)
        assert effective == 1.0
        assert applied is False

    def test_when_applied_effective_multiplier_is_amplified(self):
        """With prob 0.5 and target 1.2, an applied event uses 1 + 0.2/0.5 = 1.4."""
        from api.ranking import sample_boost

        rng = random.Random(42)
        amplified_seen = False
        not_applied_seen = False
        for _ in range(200):
            effective, applied = sample_boost(1.2, 0.5, rng=rng)
            if applied:
                assert effective == pytest.approx(1.4)
                amplified_seen = True
            else:
                assert effective == 1.0
                not_applied_seen = True
        assert amplified_seen and not_applied_seen

    def test_application_rate_matches_probability_within_tolerance(self):
        from api.ranking import sample_boost

        rng = random.Random(42)
        applied = sum(
            1 for _ in range(10000)
            if sample_boost(1.2, 0.5, rng=rng)[1]
        )
        rate = applied / 10000
        assert 0.48 <= rate <= 0.52

    def test_expected_multiplier_matches_deterministic_baseline(self):
        """E[effective] over many trials must equal target_multiplier."""
        from api.ranking import sample_boost

        rng = random.Random(123)
        n = 10000
        total = sum(sample_boost(1.5, 0.4, rng=rng)[0] for _ in range(n))
        avg = total / n
        assert 1.46 <= avg <= 1.54


@pytest.mark.django_db
@pytest.mark.unit
class TestServiceFactorsStochastic:
    """Integration of sample_boost into the service-factor computation."""

    def _seed_quality(self, owner):
        from api.models import ReputationRep  # noqa: F401

        svc = ServiceFactory(user=owner, type='Offer', status='Active')
        giver = UserFactory(date_joined=timezone.now() - timedelta(days=365))
        hs = HandshakeFactory(service=svc, requester=giver, status='completed')
        ReputationRepFactory(
            handshake=hs, giver=giver, receiver=owner, is_punctual=True,
        )
        return svc

    def test_default_probability_preserves_deterministic_behavior(self):
        """Probability 1.0 (default) must give the legacy newcomer multiplier."""
        from api.ranking import _compute_service_factors

        newcomer = UserFactory(date_joined=timezone.now() - timedelta(days=10))
        svc = self._seed_quality(newcomer)
        factors = _compute_service_factors(svc)
        assert factors['newcomer_boost'] == 1.2
        assert factors['newcomer_boost_applied'] is True

    def test_zero_probability_disables_newcomer_boost(self):
        from api.ranking import _compute_service_factors

        newcomer = UserFactory(date_joined=timezone.now() - timedelta(days=10))
        svc = self._seed_quality(newcomer)
        with override_settings(RANKING_NEWCOMER_BOOST_PROBABILITY=0.0):
            factors = _compute_service_factors(svc)
        assert factors['newcomer_boost'] == 1.0
        assert factors['newcomer_boost_applied'] is False

    def test_non_newcomer_never_applied(self):
        from api.ranking import _compute_service_factors

        veteran = UserFactory(date_joined=timezone.now() - timedelta(days=365))
        svc = self._seed_quality(veteran)
        with override_settings(RANKING_NEWCOMER_BOOST_PROBABILITY=0.5):
            factors = _compute_service_factors(svc)
        assert factors['newcomer_boost'] == 1.0
        assert factors['newcomer_boost_applied'] is False

    def test_capacity_boost_default_probability_preserves_behavior(self):
        from api.ranking import _compute_service_factors

        owner = UserFactory(date_joined=timezone.now() - timedelta(days=365))
        svc = ServiceFactory(
            user=owner, type='Offer', status='Active', max_participants=4,
        )
        # Quality
        giver = UserFactory(date_joined=timezone.now() - timedelta(days=365))
        hs = HandshakeFactory(service=svc, requester=giver, status='completed')
        ReputationRepFactory(
            handshake=hs, giver=giver, receiver=owner, is_punctual=True,
        )
        # 75% fill
        for _ in range(3):
            HandshakeFactory(service=svc, status='accepted')
        factors = _compute_service_factors(svc)
        assert factors['capacity_multiplier'] == 1.5
        assert factors['capacity_boost_applied'] is True

    def test_capacity_boost_zero_probability_disables(self):
        from api.ranking import _compute_service_factors

        owner = UserFactory(date_joined=timezone.now() - timedelta(days=365))
        svc = ServiceFactory(
            user=owner, type='Offer', status='Active', max_participants=4,
        )
        giver = UserFactory(date_joined=timezone.now() - timedelta(days=365))
        hs = HandshakeFactory(service=svc, requester=giver, status='completed')
        ReputationRepFactory(
            handshake=hs, giver=giver, receiver=owner, is_punctual=True,
        )
        for _ in range(3):
            HandshakeFactory(service=svc, status='accepted')
        with override_settings(RANKING_CAPACITY_BOOST_PROBABILITY=0.0):
            factors = _compute_service_factors(svc)
        assert factors['capacity_multiplier'] == 1.0
        assert factors['capacity_boost_applied'] is False


@pytest.mark.django_db
@pytest.mark.unit
class TestEventFactorsStochastic:
    """Stochastic boosts also flow through the event scoring formula."""

    def _seed_event(self, organiser):
        ev = ServiceFactory(
            user=organiser, type='Event', status='Active',
            scheduled_time=timezone.now() + timedelta(days=3),
        )
        HandshakeFactory(service=ev, status='accepted')
        qual_event = ServiceFactory(
            user=organiser, type='Event', status='Active',
            scheduled_time=timezone.now() - timedelta(days=10),
        )
        giver = UserFactory(date_joined=timezone.now() - timedelta(days=365))
        hs = HandshakeFactory(service=qual_event, requester=giver, status='completed')
        ReputationRepFactory(
            handshake=hs, giver=giver, receiver=organiser, is_punctual=True,
        )
        return ev

    def test_default_probability_preserves_deterministic_behavior(self):
        from api.ranking import _compute_event_factors

        newcomer = UserFactory(date_joined=timezone.now() - timedelta(days=5))
        ev = self._seed_event(newcomer)
        factors = _compute_event_factors(ev)
        assert factors['newcomer_boost'] == 1.2
        assert factors['newcomer_boost_applied'] is True

    def test_zero_probability_disables_newcomer_boost_on_event(self):
        from api.ranking import _compute_event_factors

        newcomer = UserFactory(date_joined=timezone.now() - timedelta(days=5))
        ev = self._seed_event(newcomer)
        with override_settings(RANKING_NEWCOMER_BOOST_PROBABILITY=0.0):
            factors = _compute_event_factors(ev)
        assert factors['newcomer_boost'] == 1.0
        assert factors['newcomer_boost_applied'] is False


class TestSocialProximityStochastic:
    """Stochastic application of the social proximity boost map (no DB)."""

    def test_default_probability_returns_unchanged(self):
        from api.ranking import apply_stochastic_social_proximity

        boosts = {'a': 1.0, 'b': 0.5}
        assert apply_stochastic_social_proximity(boosts, 1.0) == boosts

    def test_probability_above_one_returns_unchanged(self):
        from api.ranking import apply_stochastic_social_proximity

        boosts = {'a': 1.0, 'b': 0.5}
        assert apply_stochastic_social_proximity(boosts, 1.5) == boosts

    def test_zero_probability_returns_empty(self):
        from api.ranking import apply_stochastic_social_proximity

        assert apply_stochastic_social_proximity({'a': 1.0}, 0.0) == {}

    def test_when_applied_boost_is_amplified(self):
        from api.ranking import apply_stochastic_social_proximity

        rng = random.Random(7)
        seen_amplified = False
        seen_zero = False
        for _ in range(200):
            out = apply_stochastic_social_proximity({'a': 1.0}, 0.5, rng=rng)
            value = out['a']
            if value == pytest.approx(2.0):
                seen_amplified = True
            elif value == 0.0:
                seen_zero = True
            else:
                pytest.fail(f'unexpected value {value}')
        assert seen_amplified and seen_zero

    def test_expected_boost_matches_deterministic_baseline(self):
        from api.ranking import apply_stochastic_social_proximity

        rng = random.Random(1)
        n = 5000
        total = 0.0
        for _ in range(n):
            out = apply_stochastic_social_proximity({'a': 1.0}, 0.5, rng=rng)
            total += out['a']
        avg = total / n
        assert 0.95 <= avg <= 1.05


@pytest.mark.django_db
@pytest.mark.unit
class TestAuditLogStochastic:
    """ScoreAuditLog must record whether each boost actually applied
    (AC #5 of issue #477)."""

    def _seed_quality(self, owner):
        svc = ServiceFactory(user=owner, type='Offer', status='Active')
        giver = UserFactory(date_joined=timezone.now() - timedelta(days=365))
        hs = HandshakeFactory(service=svc, requester=giver, status='completed')
        ReputationRepFactory(
            handshake=hs, giver=giver, receiver=owner, is_punctual=True,
        )
        return svc

    def test_audit_log_records_newcomer_boost_applied_true_for_newcomer(self):
        from api.models import ScoreAuditLog
        from api.signals import _update_service_hot_score

        newcomer = UserFactory(date_joined=timezone.now() - timedelta(days=10))
        svc = self._seed_quality(newcomer)
        _update_service_hot_score(svc)
        latest = ScoreAuditLog.objects.filter(service=svc).latest('recorded_at')
        assert latest.newcomer_boost_applied is True

    def test_audit_log_records_newcomer_boost_applied_false_for_veteran(self):
        from api.models import ScoreAuditLog
        from api.signals import _update_service_hot_score

        veteran = UserFactory(date_joined=timezone.now() - timedelta(days=200))
        svc = self._seed_quality(veteran)
        _update_service_hot_score(svc)
        latest = ScoreAuditLog.objects.filter(service=svc).latest('recorded_at')
        assert latest.newcomer_boost_applied is False

    def test_audit_log_records_capacity_boost_applied(self):
        from api.models import ScoreAuditLog
        from api.signals import _update_service_hot_score

        owner = UserFactory(date_joined=timezone.now() - timedelta(days=365))
        svc = ServiceFactory(
            user=owner, type='Offer', status='Active', max_participants=4,
        )
        giver = UserFactory(date_joined=timezone.now() - timedelta(days=365))
        hs = HandshakeFactory(service=svc, requester=giver, status='completed')
        ReputationRepFactory(
            handshake=hs, giver=giver, receiver=owner, is_punctual=True,
        )
        for _ in range(3):
            HandshakeFactory(service=svc, status='accepted')
        _update_service_hot_score(svc)
        latest = ScoreAuditLog.objects.filter(service=svc).latest('recorded_at')
        assert latest.capacity_boost_applied is True


@pytest.mark.django_db
@pytest.mark.unit
class TestBatchPathStochastic:
    """The batch path mirrors the per-service path."""

    def _seed_quality(self, owner):
        svc = ServiceFactory(user=owner, type='Offer', status='Active')
        giver = UserFactory(date_joined=timezone.now() - timedelta(days=365))
        hs = HandshakeFactory(service=svc, requester=giver, status='completed')
        ReputationRepFactory(
            handshake=hs, giver=giver, receiver=owner, is_punctual=True,
        )
        return svc

    def test_batch_zero_probability_disables_newcomer_boost(self):
        """Batch result for a newcomer-owned service equals the no-boost score."""
        from api.ranking import calculate_hot_score, calculate_hot_scores_batch

        newcomer = UserFactory(date_joined=timezone.now() - timedelta(days=10))
        svc = self._seed_quality(newcomer)
        with override_settings(RANKING_NEWCOMER_BOOST_PROBABILITY=0.0):
            single = calculate_hot_score(svc)
            batch = calculate_hot_scores_batch([svc])
        assert batch[svc.id] == pytest.approx(single, rel=1e-5)
        # And the score should equal what a non-newcomer would get (no 1.2x).
        veteran = UserFactory(date_joined=timezone.now() - timedelta(days=365))
        veteran_svc = self._seed_quality(veteran)
        with override_settings(RANKING_NEWCOMER_BOOST_PROBABILITY=0.0):
            veteran_score = calculate_hot_score(veteran_svc)
        assert batch[svc.id] == pytest.approx(veteran_score, rel=1e-5)
