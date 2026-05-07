"""Tests for the extended ranking debug payload (issue #476).

The admin debug bar should surface the actual three-phase pipeline factors
(Wilson quality, log2 activity blend, capacity multiplier, newcomer boost)
with substituted values, plus a Phase 3 trace explaining whether a card was
served from the regular hot list or the explore bucket and which pool.
"""
from datetime import timedelta

import pytest
from django.utils import timezone

from api.tests.helpers.factories import (
    HandshakeFactory,
    ReputationRepFactory,
    ServiceFactory,
    UserFactory,
)


@pytest.mark.django_db
@pytest.mark.unit
class TestServiceDebugPayloadFactors:
    def _seed_service_with_quality(self, owner, **kwargs):
        from api.models import ReputationRep  # noqa: F401

        svc = ServiceFactory(user=owner, type='Offer', status='Active', **kwargs)
        giver = UserFactory(date_joined=timezone.now() - timedelta(days=365))
        hs = HandshakeFactory(service=svc, requester=giver, status='completed')
        ReputationRepFactory(
            handshake=hs, giver=giver, receiver=owner, is_punctual=True,
        )
        return svc

    def _build_payload(self, service, viewer):
        from api.ranking_debug import build_service_debug_payload

        return build_service_debug_payload(
            service_ids=[str(service.id)],
            selected_service_id=str(service.id),
            request_user=viewer,
        )

    def test_payload_exposes_wilson_quality_factor(self):
        viewer = UserFactory()
        owner = UserFactory(date_joined=timezone.now() - timedelta(days=365))
        svc = self._seed_service_with_quality(owner)

        payload = self._build_payload(svc, viewer)
        factors = payload['selected_service']['factors']

        assert 'quality' in factors
        assert isinstance(factors['quality'], float)
        assert factors['quality'] > 0
        # Inputs should be present for the substituted formula. The factory
        # ReputationRep sets is_punctual, is_helpful, is_kind all to True so
        # the per-trait counter aggregates to 3.
        assert factors['positive_count'] == 3
        assert factors['negative_count'] == 0

    def test_payload_exposes_activity_blend_factor(self):
        viewer = UserFactory()
        owner = UserFactory(date_joined=timezone.now() - timedelta(days=365))
        svc = self._seed_service_with_quality(owner)

        payload = self._build_payload(svc, viewer)
        factors = payload['selected_service']['factors']

        assert 'activity' in factors
        assert isinstance(factors['activity'], float)
        # The activity formula uses hours_exchanged and comment_count
        assert 'hours_exchanged' in factors
        assert 'comment_count' in factors

    def test_payload_exposes_newcomer_boost_with_eligibility_flag(self):
        viewer = UserFactory()
        newcomer = UserFactory(date_joined=timezone.now() - timedelta(days=10))
        svc = self._seed_service_with_quality(newcomer)

        payload = self._build_payload(svc, viewer)
        factors = payload['selected_service']['factors']

        assert factors['newcomer_boost'] == 1.2
        assert factors['is_newcomer'] is True

    def test_payload_marks_veteran_owner_as_not_newcomer(self):
        viewer = UserFactory()
        owner = UserFactory(date_joined=timezone.now() - timedelta(days=200))
        svc = self._seed_service_with_quality(owner)

        payload = self._build_payload(svc, viewer)
        factors = payload['selected_service']['factors']

        assert factors['newcomer_boost'] == 1.0
        assert factors['is_newcomer'] is False

    def test_payload_capacity_multiplier_for_filled_group_offer(self):
        viewer = UserFactory()
        owner = UserFactory(date_joined=timezone.now() - timedelta(days=365))
        svc = self._seed_service_with_quality(owner, max_participants=4)
        for _ in range(3):
            HandshakeFactory(service=svc, status='accepted')

        payload = self._build_payload(svc, viewer)
        factors = payload['selected_service']['factors']

        assert factors['capacity_multiplier'] == 1.5

    def test_formula_lines_show_substituted_factor_values(self):
        viewer = UserFactory()
        owner = UserFactory(date_joined=timezone.now() - timedelta(days=365))
        svc = self._seed_service_with_quality(owner)

        payload = self._build_payload(svc, viewer)
        lines = payload['selected_service']['formula_lines']

        joined = '\n'.join(lines)
        assert 'Wilson' in joined or 'quality' in joined.lower()
        assert 'log2' in joined or 'activity' in joined.lower()
        # Final score line shows the multiplicative product
        assert any('=' in line for line in lines)


@pytest.mark.django_db
@pytest.mark.unit
class TestEventDebugPayloadFactors:
    def test_event_payload_uses_event_factor_set(self):
        from api.ranking_debug import build_service_debug_payload

        viewer = UserFactory()
        organiser = UserFactory(date_joined=timezone.now() - timedelta(days=365))
        ev = ServiceFactory(
            user=organiser, type='Event', status='Active',
            scheduled_time=timezone.now() + timedelta(days=3),
        )
        HandshakeFactory(service=ev, status='accepted')

        payload = build_service_debug_payload(
            service_ids=[str(ev.id)],
            selected_service_id=str(ev.id),
            request_user=viewer,
        )
        factors = payload['selected_service']['factors']

        # Event-specific factors
        assert 'velocity' in factors
        assert 'organiser_quality' in factors
        assert 'rsvps_last_7d' in factors


@pytest.mark.django_db
@pytest.mark.unit
class TestPhase3Trace:
    def test_payload_includes_phase3_trace_with_pool_membership(self):
        from api.ranking_debug import build_service_debug_payload

        viewer = UserFactory()
        owner = UserFactory(date_joined=timezone.now() - timedelta(days=365))
        # Owner with no completed handshakes is in the cold-start pool.
        svc = ServiceFactory(user=owner, type='Offer', status='Active')

        payload = build_service_debug_payload(
            service_ids=[str(svc.id)],
            selected_service_id=str(svc.id),
            request_user=viewer,
        )
        phase3 = payload['selected_service']['phase3']

        assert 'exploration_rate' in phase3
        assert 'pool' in phase3
        assert phase3['pool'] in ('cold_start', 'undershown_quality', 'stale_recurring', None)
        assert 'lifetime_completed_handshakes' in phase3

    def test_cold_start_owner_lands_in_cold_start_pool(self):
        from api.ranking_debug import build_service_debug_payload

        viewer = UserFactory()
        owner = UserFactory(date_joined=timezone.now() - timedelta(days=365))
        svc = ServiceFactory(user=owner, type='Offer', status='Active')

        payload = build_service_debug_payload(
            service_ids=[str(svc.id)],
            selected_service_id=str(svc.id),
            request_user=viewer,
        )
        phase3 = payload['selected_service']['phase3']

        assert phase3['pool'] == 'cold_start'
