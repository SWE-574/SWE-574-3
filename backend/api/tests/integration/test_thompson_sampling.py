"""
Phase 3 -- Thompson Sampling integration tests (FR-17i / #316).

Covers:
- should_explore() returns True ~RANKING_EXPLORATION_RATE of the time.
- select_exploration_candidate() draws from the three sub-buckets.
- inject_exploration_slot() lands the explore item at the configured index.
"""
from collections import Counter
from datetime import timedelta

import pytest
from django.utils import timezone

from api.models import Handshake, ReputationRep, Service
from api.ranking import (
    inject_exploration_slot,
    select_exploration_candidate,
    should_explore,
)
from api.tests.helpers.factories import (
    HandshakeFactory,
    ServiceFactory,
    UserFactory,
)


class _Req:
    pass


@pytest.mark.django_db
@pytest.mark.integration
class TestShouldExplore:
    def test_fires_at_configured_rate(self, settings):
        settings.RANKING_EXPLORATION_RATE = 0.20
        request = _Req()
        trues = sum(should_explore(request) for _ in range(2000))
        rate = trues / 2000
        assert 0.15 < rate < 0.25, f'expected ~0.20, got {rate:.3f}'

    def test_zero_rate_never_fires(self, settings):
        settings.RANKING_EXPLORATION_RATE = 0.0
        request = _Req()
        assert not any(should_explore(request) for _ in range(200))

    def test_full_rate_always_fires(self, settings):
        settings.RANKING_EXPLORATION_RATE = 1.0
        request = _Req()
        assert all(should_explore(request) for _ in range(200))


@pytest.mark.django_db
@pytest.mark.integration
class TestSelectExplorationCandidate:
    def test_pool_includes_three_buckets(self):
        # cold-start provider (lifetime completed < 5)
        cold_owner = UserFactory()
        cold_svc = ServiceFactory(user=cold_owner, type='Offer', status='Active')

        # under-shown quality (Quality >= threshold, no completed handshake in 14d)
        proven_owner = UserFactory()
        proven_svc = ServiceFactory(user=proven_owner, type='Offer', status='Active')
        for _ in range(10):
            requester = UserFactory()
            old_svc = ServiceFactory(user=proven_owner, type='Offer')
            old_hs = HandshakeFactory(
                service=old_svc, requester=requester, status='completed',
            )
            ReputationRep.objects.create(
                handshake=old_hs, giver=requester, receiver=proven_owner, is_helpful=True,
            )
            Handshake.objects.filter(pk=old_hs.pk).update(
                updated_at=timezone.now() - timedelta(days=30),
            )

        # stale recurring (set the flag directly so we don't depend on the cron)
        recur_owner = UserFactory()
        recur_svc = ServiceFactory(
            user=recur_owner, type='Offer', status='Active', schedule_type='Recurrent',
        )
        Service.objects.filter(pk=recur_svc.pk).update(is_stale_recurring=True)

        candidates = list(Service.objects.filter(status='Active'))
        viewer = UserFactory()
        picked = Counter()
        for _ in range(300):
            choice = select_exploration_candidate(candidates, viewer)
            if choice is not None:
                picked[choice.id] += 1

        assert picked[cold_svc.id] > 0, 'cold-start never sampled'
        assert picked[proven_svc.id] > 0, 'under-shown never sampled'
        assert picked[recur_svc.id] > 0, 'stale recurring never sampled'

    def test_returns_none_when_pool_empty(self):
        # Owner with > threshold completed handshakes (so not cold-start).
        owner = UserFactory()
        for _ in range(10):
            HandshakeFactory(
                service=ServiceFactory(user=owner, type='Offer'),
                status='completed',
            )
        ineligible = ServiceFactory(user=owner, type='Offer', status='Active')
        # Recent completed handshake -> not under-shown.
        HandshakeFactory(service=ineligible, status='completed')
        viewer = UserFactory()
        result = select_exploration_candidate([ineligible], viewer)
        assert result is None


@pytest.mark.unit
class TestInjectExplorationSlot:
    def test_replaces_at_fixed_position(self):
        ordered = [f'svc-{i}' for i in range(20)]
        result = inject_exploration_slot(ordered, 'EXPLORE', slot_index=5)
        assert result[5] == 'EXPLORE'
        assert len(result) == 20
        assert result[:5] == ordered[:5]
        assert result[6:] == ordered[6:]

    def test_appends_when_list_shorter_than_slot(self):
        ordered = ['a', 'b', 'c']
        result = inject_exploration_slot(ordered, 'X', slot_index=5)
        assert 'X' in result

    def test_returns_unchanged_when_explore_is_none(self):
        ordered = ['a', 'b', 'c']
        result = inject_exploration_slot(ordered, None, slot_index=5)
        assert result == ordered
