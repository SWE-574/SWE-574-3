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

    def test_phase3_marks_injected_card(self):
        from api.ranking_debug import build_service_debug_payload

        viewer = UserFactory()
        owner = UserFactory(date_joined=timezone.now() - timedelta(days=365))
        svc = ServiceFactory(user=owner, type='Offer', status='Active')

        payload = build_service_debug_payload(
            service_ids=[str(svc.id)],
            selected_service_id=str(svc.id),
            request_user=viewer,
            phase3_injected_id=str(svc.id),
            phase3_slot_index=5,
        )
        phase3 = payload['selected_service']['phase3']

        assert phase3['injected_on_this_request'] is True
        assert phase3['injected_card_id'] == str(svc.id)
        assert phase3['injected_slot_index'] == 5

    def test_phase3_does_not_mark_other_cards_as_injected(self):
        from api.ranking_debug import build_service_debug_payload

        viewer = UserFactory()
        owner = UserFactory(date_joined=timezone.now() - timedelta(days=365))
        svc = ServiceFactory(user=owner, type='Offer', status='Active')
        other = ServiceFactory(user=owner, type='Offer', status='Active')

        payload = build_service_debug_payload(
            service_ids=[str(svc.id), str(other.id)],
            selected_service_id=str(svc.id),
            request_user=viewer,
            phase3_injected_id=str(other.id),
            phase3_slot_index=5,
        )
        phase3 = payload['selected_service']['phase3']

        assert phase3['injected_on_this_request'] is False
        assert phase3['injected_card_id'] == str(other.id)
        assert phase3['injected_slot_index'] is None


@pytest.mark.django_db
@pytest.mark.unit
class TestPhase1Trace:
    def test_phase1_block_present_for_composite_mode(self):
        from api.ranking_debug import build_service_debug_payload

        viewer = UserFactory()
        owner = UserFactory(date_joined=timezone.now() - timedelta(days=365))
        svc = ServiceFactory(user=owner, type='Offer', status='Active')

        payload = build_service_debug_payload(
            service_ids=[str(svc.id)],
            selected_service_id=str(svc.id),
            request_user=viewer,
            active_filter='nearby',
        )
        phase1 = payload['selected_service']['phase1']

        assert phase1['active_filter'] == 'nearby'
        assert phase1['sort_mode'] == 'composite'
        assert phase1['client_reorder'] is False
        assert phase1['service_type'] == 'Offer'
        assert phase1['is_pinned'] is False

    def test_phase1_block_for_chronological_mode(self):
        from api.ranking_debug import build_service_debug_payload

        viewer = UserFactory()
        owner = UserFactory(date_joined=timezone.now() - timedelta(days=365))
        svc = ServiceFactory(user=owner, type='Offer', status='Active')

        payload = build_service_debug_payload(
            service_ids=[str(svc.id)],
            selected_service_id=str(svc.id),
            request_user=viewer,
            active_filter='newest',
        )
        phase1 = payload['selected_service']['phase1']

        assert phase1['sort_mode'] == 'chronological'
        # client_reorder warns the panel that composite below is informational
        assert phase1['client_reorder'] is True

    def test_phase1_marks_newest_filter_as_client_reorder(self):
        from api.ranking_debug import build_service_debug_payload

        viewer = UserFactory()
        owner = UserFactory(date_joined=timezone.now() - timedelta(days=365))
        svc = ServiceFactory(user=owner, type='Offer', status='Active')

        payload = build_service_debug_payload(
            service_ids=[str(svc.id)],
            selected_service_id=str(svc.id),
            request_user=viewer,
            active_filter='newest',
        )
        phase1 = payload['selected_service']['phase1']

        assert phase1['sort_mode'] == 'chronological'
        assert phase1['client_reorder'] is True


@pytest.mark.django_db
@pytest.mark.unit
class TestPhase2BTrace:
    def test_phase2b_block_present_with_composite(self):
        from api.ranking_debug import build_service_debug_payload

        viewer = UserFactory()
        owner = UserFactory(date_joined=timezone.now() - timedelta(days=365))
        svc = ServiceFactory(user=owner, type='Offer', status='Active')

        payload = build_service_debug_payload(
            service_ids=[str(svc.id)],
            selected_service_id=str(svc.id),
            request_user=viewer,
        )
        phase2b = payload['selected_service']['phase2b']

        assert 'hot_score' in phase2b
        assert 'proximity_factor' in phase2b
        assert 'composite_score' in phase2b
        assert 'social_boost' in phase2b
        assert 'proximity_half_life_km' in phase2b

    def test_phase2b_proximity_is_one_without_viewer_location(self):
        from api.ranking_debug import build_service_debug_payload

        viewer = UserFactory()
        owner = UserFactory(date_joined=timezone.now() - timedelta(days=365))
        svc = ServiceFactory(user=owner, type='Offer', status='Active')

        payload = build_service_debug_payload(
            service_ids=[str(svc.id)],
            selected_service_id=str(svc.id),
            request_user=viewer,
            lat=None, lng=None,
        )
        phase2b = payload['selected_service']['phase2b']

        assert phase2b['proximity_factor'] == 1.0
        assert phase2b['distance_km'] is None


@pytest.mark.django_db
@pytest.mark.unit
class TestSortBlock:
    def test_sort_block_includes_neighbours_and_key(self):
        from api.ranking_debug import build_service_debug_payload

        viewer = UserFactory()
        owner = UserFactory(date_joined=timezone.now() - timedelta(days=365))
        services = [
            ServiceFactory(user=owner, type='Offer', status='Active') for _ in range(5)
        ]
        ids = [str(s.id) for s in services]
        selected = services[2]

        payload = build_service_debug_payload(
            service_ids=ids,
            selected_service_id=str(selected.id),
            request_user=viewer,
            active_filter='nearby',
        )
        sort_block = payload['selected_service']['sort']

        assert sort_block['sort_key'] == '(-is_pinned, -composite_score, -created_at)'
        assert sort_block['sort_mode'] == 'composite'
        assert 'is_pinned' in sort_block['this_card_key']
        assert 'composite_score' in sort_block['this_card_key']
        assert 'created_at' in sort_block['this_card_key']
        assert len(sort_block['neighbours']) == 5
        selected_row = next(n for n in sort_block['neighbours'] if n['is_selected'])
        assert selected_row['id'] == str(selected.id)

    def test_sort_block_uses_chronological_key_in_default_mode(self):
        from api.ranking_debug import build_service_debug_payload

        viewer = UserFactory()
        owner = UserFactory(date_joined=timezone.now() - timedelta(days=365))
        svc = ServiceFactory(user=owner, type='Offer', status='Active')

        payload = build_service_debug_payload(
            service_ids=[str(svc.id)],
            selected_service_id=str(svc.id),
            request_user=viewer,
            active_filter='newest',
        )
        sort_block = payload['selected_service']['sort']

        assert sort_block['sort_key'] == '(-is_pinned, -created_at)'
        assert sort_block['sort_mode'] == 'chronological'

    def test_sort_block_pinned_count(self):
        from api.ranking_debug import build_service_debug_payload

        viewer = UserFactory()
        owner = UserFactory(date_joined=timezone.now() - timedelta(days=365))
        pinned = ServiceFactory(user=owner, type='Offer', status='Active', is_pinned=True)
        regular = ServiceFactory(user=owner, type='Offer', status='Active')

        payload = build_service_debug_payload(
            service_ids=[str(pinned.id), str(regular.id)],
            selected_service_id=str(regular.id),
            request_user=viewer,
        )
        sort_block = payload['selected_service']['sort']

        assert sort_block['pinned_count_in_list'] == 1


@pytest.mark.django_db
@pytest.mark.unit
class TestDiagnosisLine:
    def _setup_owner_and_viewer(self, age_days=365):
        owner = UserFactory(date_joined=timezone.now() - timedelta(days=age_days))
        viewer = UserFactory(date_joined=timezone.now() - timedelta(days=age_days))
        return owner, viewer

    def test_diagnosis_explore_branch(self):
        from api.ranking_debug import build_service_debug_payload

        owner, viewer = self._setup_owner_and_viewer()
        svc = ServiceFactory(user=owner, type='Offer', status='Active')

        payload = build_service_debug_payload(
            service_ids=[str(svc.id)],
            selected_service_id=str(svc.id),
            request_user=viewer,
            phase3_injected_id=str(svc.id),
            phase3_slot_index=5,
        )
        diagnosis = payload['selected_service']['diagnosis']

        assert diagnosis['class'] == 'explore'
        assert 'explore' in diagnosis['message'].lower()

    def test_diagnosis_trust_branch_for_unrated_provider(self):
        from api.ranking_debug import build_service_debug_payload

        owner, viewer = self._setup_owner_and_viewer()
        svc = ServiceFactory(user=owner, type='Offer', status='Active')

        payload = build_service_debug_payload(
            service_ids=[str(svc.id)],
            selected_service_id=str(svc.id),
            request_user=viewer,
            active_filter='nearby',
        )
        diagnosis = payload['selected_service']['diagnosis']

        # Unrated provider quality (post-Laplace) is well below 0.25.
        assert diagnosis['class'] == 'trust'
        assert 'trust' in diagnosis['message'].lower() or 'wilson' in diagnosis['message'].lower()

    def test_diagnosis_proximity_branch(self):
        from api.ranking_debug import build_service_debug_payload

        owner, viewer = self._setup_owner_and_viewer()
        # Seed enough quality to clear the trust threshold.
        for _ in range(20):
            requester = UserFactory(date_joined=timezone.now() - timedelta(days=365))
            hs = HandshakeFactory(
                service=ServiceFactory(user=owner, type='Offer'),
                requester=requester, status='completed',
            )
            ReputationRepFactory(
                handshake=hs, giver=requester, receiver=owner,
                is_punctual=True, is_helpful=True, is_kind=True,
            )
        svc = ServiceFactory(
            user=owner, type='Offer', status='Active',
            location_lat=40.0, location_lng=29.0,
        )

        payload = build_service_debug_payload(
            service_ids=[str(svc.id)],
            selected_service_id=str(svc.id),
            request_user=viewer,
            active_filter='nearby',
            lat=41.0, lng=29.0,
        )
        diagnosis = payload['selected_service']['diagnosis']

        assert diagnosis['class'] == 'proximity'
        assert 'km' in diagnosis['message'].lower()

    def test_diagnosis_pin_branch(self):
        from api.ranking_debug import build_service_debug_payload

        owner, viewer = self._setup_owner_and_viewer()
        for _ in range(20):
            requester = UserFactory(date_joined=timezone.now() - timedelta(days=365))
            hs = HandshakeFactory(
                service=ServiceFactory(user=owner, type='Offer'),
                requester=requester, status='completed',
            )
            ReputationRepFactory(
                handshake=hs, giver=requester, receiver=owner,
                is_punctual=True, is_helpful=True, is_kind=True,
            )
        pinned = ServiceFactory(user=owner, type='Offer', status='Active', is_pinned=True)
        unpinned = ServiceFactory(user=owner, type='Offer', status='Active')

        payload = build_service_debug_payload(
            service_ids=[str(pinned.id), str(unpinned.id)],
            selected_service_id=str(unpinned.id),
            request_user=viewer,
            active_filter='nearby',
        )
        diagnosis = payload['selected_service']['diagnosis']

        assert diagnosis['class'] == 'pin'
        assert 'pin' in diagnosis['message'].lower()

    def test_diagnosis_neutral_branch(self):
        from api.ranking_debug import build_service_debug_payload

        owner, viewer = self._setup_owner_and_viewer()
        for _ in range(20):
            requester = UserFactory(date_joined=timezone.now() - timedelta(days=365))
            hs = HandshakeFactory(
                service=ServiceFactory(user=owner, type='Offer'),
                requester=requester, status='completed',
            )
            ReputationRepFactory(
                handshake=hs, giver=requester, receiver=owner,
                is_punctual=True, is_helpful=True, is_kind=True,
            )
        svc = ServiceFactory(user=owner, type='Offer', status='Active')
        # Bump hot_score so composite > 0.
        from api.models import Service
        Service.objects.filter(pk=svc.pk).update(hot_score=2.5)
        svc.refresh_from_db()

        payload = build_service_debug_payload(
            service_ids=[str(svc.id)],
            selected_service_id=str(svc.id),
            request_user=viewer,
            active_filter='nearby',
        )
        diagnosis = payload['selected_service']['diagnosis']

        assert diagnosis['class'] == 'neutral'

    def test_diagnosis_chronological_in_default_mode(self):
        """When the active filter does not trigger composite sort, the
        diagnosis must call out chronological ordering directly so the user
        does not chase composite-related red herrings."""
        from api.ranking_debug import build_service_debug_payload

        owner, viewer = self._setup_owner_and_viewer()
        svc = ServiceFactory(user=owner, type='Offer', status='Active')

        payload = build_service_debug_payload(
            service_ids=[str(svc.id)],
            selected_service_id=str(svc.id),
            request_user=viewer,
            active_filter='newest',
        )
        diagnosis = payload['selected_service']['diagnosis']

        assert diagnosis['class'] == 'chronological'
        assert 'created_at' in diagnosis['message']
