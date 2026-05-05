"""Tests for the For You scorer (issue #481).

Four signals on top of hot_score:
- tag_overlap (Jaccard with viewer.skills, with one level of parent_qid match)
- follow_affinity (1.0 first degree, 0.5 second degree, via get_social_proximity_boosts)
- cooccurrence_signal (anonymized item-item matrix, k-anonymous threshold)
- recency_penalty (decay over hours since the viewer last saw the service)

Each signal is tested in isolation, then the blend is tested as a whole.
"""
from datetime import timedelta
from decimal import Decimal

import pytest
from django.utils import timezone

from api.tests.helpers.factories import (
    HandshakeFactory,
    ServiceFactory,
    UserFactory,
)


# ---------------------------------------------------------------------------
# tag_overlap
# ---------------------------------------------------------------------------


@pytest.mark.django_db
@pytest.mark.unit
class TestTagOverlap:
    def _make_tag(self, qid, parent=None):
        from api.models import Tag

        return Tag.objects.create(id=qid, name=qid, parent_qid=parent)

    def test_no_overlap_returns_zero(self):
        from api.ranking_personalized import tag_overlap

        a = self._make_tag('Q1')
        b = self._make_tag('Q2')
        viewer = UserFactory()
        viewer.skills.add(a)
        svc = ServiceFactory(type='Offer', status='Active')
        svc.tags.add(b)
        assert tag_overlap(svc, viewer) == 0.0

    def test_full_overlap_returns_one(self):
        from api.ranking_personalized import tag_overlap

        a = self._make_tag('Q1')
        viewer = UserFactory()
        viewer.skills.add(a)
        svc = ServiceFactory(type='Offer', status='Active')
        svc.tags.add(a)
        assert tag_overlap(svc, viewer) == 1.0

    def test_partial_overlap_returns_jaccard(self):
        from api.ranking_personalized import tag_overlap

        a = self._make_tag('Q1')
        b = self._make_tag('Q2')
        c = self._make_tag('Q3')
        viewer = UserFactory()
        viewer.skills.add(a, b)
        svc = ServiceFactory(type='Offer', status='Active')
        svc.tags.add(b, c)
        # intersection {Q2}, union {Q1, Q2, Q3} -> 1/3
        assert tag_overlap(svc, viewer) == pytest.approx(1.0 / 3.0)

    def test_parent_qid_counts_as_match(self):
        from api.ranking_personalized import tag_overlap

        parent = self._make_tag('Q_parent')
        child = self._make_tag('Q_child', parent='Q_parent')
        viewer = UserFactory()
        viewer.skills.add(parent)
        svc = ServiceFactory(type='Offer', status='Active')
        svc.tags.add(child)
        # The child shares the parent skill -> non-zero overlap
        assert tag_overlap(svc, viewer) > 0.0

    def test_anonymous_or_skillless_viewer_returns_zero(self):
        from django.contrib.auth.models import AnonymousUser
        from api.ranking_personalized import tag_overlap

        a = self._make_tag('Q1')
        svc = ServiceFactory(type='Offer', status='Active')
        svc.tags.add(a)
        assert tag_overlap(svc, AnonymousUser()) == 0.0

        viewer = UserFactory()  # no skills
        assert tag_overlap(svc, viewer) == 0.0


# ---------------------------------------------------------------------------
# follow_affinity
# ---------------------------------------------------------------------------


@pytest.mark.django_db
@pytest.mark.unit
class TestFollowAffinity:
    def test_first_degree_follow_returns_one(self):
        from api.models import UserFollow
        from api.ranking_personalized import follow_affinity

        viewer = UserFactory()
        owner = UserFactory()
        UserFollow.objects.create(follower=viewer, following=owner)
        svc = ServiceFactory(user=owner, type='Offer', status='Active')

        boosts = {owner.id: 1.0}
        assert follow_affinity(svc, boosts) == 1.0

    def test_second_degree_returns_half(self):
        from api.ranking_personalized import follow_affinity

        owner = UserFactory()
        svc = ServiceFactory(user=owner, type='Offer', status='Active')
        boosts = {owner.id: 0.5}
        assert follow_affinity(svc, boosts) == 0.5

    def test_unrelated_owner_returns_zero(self):
        from api.ranking_personalized import follow_affinity

        owner = UserFactory()
        svc = ServiceFactory(user=owner, type='Offer', status='Active')
        boosts = {}
        assert follow_affinity(svc, boosts) == 0.0


# ---------------------------------------------------------------------------
# cooccurrence_signal
# ---------------------------------------------------------------------------


@pytest.mark.django_db
@pytest.mark.unit
class TestCooccurrenceSignal:
    def test_no_viewer_history_returns_zero(self):
        from api.ranking_personalized import cooccurrence_signal

        svc = ServiceFactory(type='Offer', status='Active')
        viewer_history_ids = []
        cooccur_lookup = {}
        assert cooccurrence_signal(svc, viewer_history_ids, cooccur_lookup) == 0.0

    def test_summed_pair_counts(self):
        from api.ranking_personalized import cooccurrence_signal

        svc = ServiceFactory(type='Offer', status='Active')
        # viewer has completed handshakes on services A and B
        # cooccurrence with target svc:  (A, svc) -> 5, (B, svc) -> 3
        from api.tests.helpers.factories import ServiceFactory as SF

        a = SF(type='Offer', status='Active')
        b = SF(type='Offer', status='Active')
        viewer_history_ids = [a.id, b.id]
        cooccur_lookup = {
            (a.id, svc.id): 5,
            (b.id, svc.id): 3,
        }
        # log scaling so a few co-purchases don't dominate; helper uses log1p
        assert cooccurrence_signal(svc, viewer_history_ids, cooccur_lookup) == pytest.approx(
            __import__('math').log1p(5 + 3)
        )

    def test_excludes_self_from_history(self):
        from api.ranking_personalized import cooccurrence_signal

        svc = ServiceFactory(type='Offer', status='Active')
        viewer_history_ids = [svc.id]  # viewer has done this service themselves
        cooccur_lookup = {(svc.id, svc.id): 99}
        # Should not score itself; pair with self is filtered
        assert cooccurrence_signal(svc, viewer_history_ids, cooccur_lookup) == 0.0


# ---------------------------------------------------------------------------
# recency_penalty
# ---------------------------------------------------------------------------


class TestRecencyPenalty:
    def test_never_seen_returns_zero(self):
        from api.ranking_personalized import recency_penalty

        assert recency_penalty(seconds_since_last_seen=None, half_life_hours=24) == 0.0

    def test_just_seen_returns_one(self):
        from api.ranking_personalized import recency_penalty

        assert recency_penalty(0, half_life_hours=24) == pytest.approx(1.0)

    def test_at_half_life_returns_one_half(self):
        from api.ranking_personalized import recency_penalty

        # 24 hours = 24 * 3600 seconds at half life of 24h
        assert recency_penalty(24 * 3600, half_life_hours=24) == pytest.approx(0.5)

    def test_long_ago_decays_to_near_zero(self):
        from api.ranking_personalized import recency_penalty

        # Several half lives ago
        assert recency_penalty(10 * 24 * 3600, half_life_hours=24) < 0.005

    def test_zero_half_life_returns_zero(self):
        from api.ranking_personalized import recency_penalty

        # Defensive: misconfigured half-life shouldn't blow up
        assert recency_penalty(3600, half_life_hours=0) == 0.0


# ---------------------------------------------------------------------------
# blend
# ---------------------------------------------------------------------------


@pytest.mark.django_db
@pytest.mark.unit
class TestForYouBlend:
    """The composed scorer uses the four signals plus hot_score as additive
    contributions with configurable weights. With default weights an
    equally-quality service that matches a viewer signal must outrank a
    neutral service."""

    def test_blend_default_weights(self):
        from django.test import override_settings
        from api.ranking_personalized import blend_for_you_score

        with override_settings(
            RANKING_FOR_YOU_TAG_WEIGHT=0.3,
            RANKING_FOR_YOU_FOLLOW_WEIGHT=0.4,
            RANKING_FOR_YOU_COOCCUR_WEIGHT=0.2,
            RANKING_FOR_YOU_RECENCY_WEIGHT=0.1,
        ):
            score, signals = blend_for_you_score(
                hot_score=1.0,
                tag=0.5,
                follow=1.0,
                cooccur=2.0,
                recency_penalty_value=0.25,
            )
        # hot_score(1) + 0.3*0.5 + 0.4*1.0 + 0.2*2.0 - 0.1*0.25 = 1.925
        assert score == pytest.approx(1.0 + 0.15 + 0.4 + 0.4 - 0.025)
        assert signals == {
            'tag': 0.5,
            'follow': 1.0,
            'cooccur': 2.0,
            'recency_penalty': 0.25,
        }

    def test_neutral_signals_recover_hot_score(self):
        from api.ranking_personalized import blend_for_you_score

        score, _ = blend_for_you_score(
            hot_score=3.14,
            tag=0.0,
            follow=0.0,
            cooccur=0.0,
            recency_penalty_value=0.0,
        )
        assert score == pytest.approx(3.14)

    def test_signal_lifts_above_neutral(self):
        from api.ranking_personalized import blend_for_you_score

        neutral_score, _ = blend_for_you_score(
            hot_score=2.0, tag=0.0, follow=0.0, cooccur=0.0, recency_penalty_value=0.0,
        )
        boosted_score, _ = blend_for_you_score(
            hot_score=2.0, tag=1.0, follow=0.0, cooccur=0.0, recency_penalty_value=0.0,
        )
        assert boosted_score > neutral_score


# ---------------------------------------------------------------------------
# Cooccurrence builder
# ---------------------------------------------------------------------------


@pytest.mark.django_db
@pytest.mark.unit
class TestCooccurrenceBuilder:
    def _completed(self, viewer, svc):
        # Reuse the existing factory; it sets status='completed' explicitly.
        HandshakeFactory(service=svc, requester=viewer, status='completed')

    def test_builder_writes_pairs_above_k_anon(self):
        from django.db.models import Q
        from django.test import override_settings
        from api.models import HandshakeCooccurrence
        from api.ranking_personalized import rebuild_cooccurrence_matrix

        a = ServiceFactory(type='Offer', status='Active')
        b = ServiceFactory(type='Offer', status='Active')
        # 3 distinct viewers complete both -> meets k=3 threshold
        for _ in range(3):
            viewer = UserFactory()
            self._completed(viewer, a)
            self._completed(viewer, b)

        with override_settings(RANKING_COOCCUR_MIN_USERS=3):
            rebuild_cooccurrence_matrix()

        # Pair stored once in canonical order; either direction is valid.
        assert HandshakeCooccurrence.objects.filter(
            Q(service_a=a, service_b=b) | Q(service_a=b, service_b=a),
        ).count() == 1

    def test_builder_excludes_pairs_below_k_anon(self):
        from django.test import override_settings
        from api.models import HandshakeCooccurrence
        from api.ranking_personalized import rebuild_cooccurrence_matrix

        a = ServiceFactory(type='Offer', status='Active')
        b = ServiceFactory(type='Offer', status='Active')
        # Only 2 viewers complete both -> below threshold
        for _ in range(2):
            viewer = UserFactory()
            self._completed(viewer, a)
            self._completed(viewer, b)

        with override_settings(RANKING_COOCCUR_MIN_USERS=3):
            rebuild_cooccurrence_matrix()

        assert HandshakeCooccurrence.objects.count() == 0

    def test_score_for_you_orders_by_total_score(self):
        from django.test import override_settings
        from api.models import UserFollow
        from api.ranking_personalized import score_for_you

        viewer = UserFactory()
        followed = UserFactory()
        stranger = UserFactory()
        UserFollow.objects.create(follower=viewer, following=followed)

        followed_svc = ServiceFactory(user=followed, type='Offer', status='Active')
        stranger_svc = ServiceFactory(user=stranger, type='Offer', status='Active')

        from api.models import Service
        Service.objects.filter(pk=followed_svc.id).update(hot_score=1.0)
        Service.objects.filter(pk=stranger_svc.id).update(hot_score=1.0)
        followed_svc.refresh_from_db()
        stranger_svc.refresh_from_db()

        with override_settings(
            RANKING_FOR_YOU_FOLLOW_WEIGHT=1.0,
            RANKING_FOR_YOU_TAG_WEIGHT=0.0,
            RANKING_FOR_YOU_COOCCUR_WEIGHT=0.0,
            RANKING_FOR_YOU_RECENCY_WEIGHT=0.0,
        ):
            scored = score_for_you([stranger_svc, followed_svc], viewer)

        assert [s.id for s, _, _ in scored][0] == followed_svc.id

    def test_score_for_you_anonymous_falls_back_to_hot_score(self):
        from django.contrib.auth.models import AnonymousUser
        from api.models import Service
        from api.ranking_personalized import score_for_you

        a = ServiceFactory(type='Offer', status='Active')
        b = ServiceFactory(type='Offer', status='Active')
        Service.objects.filter(pk=a.id).update(hot_score=2.0)
        Service.objects.filter(pk=b.id).update(hot_score=5.0)
        a.refresh_from_db(); b.refresh_from_db()

        scored = score_for_you([a, b], AnonymousUser())
        # b has higher hot_score, no signals can lift a above it
        assert scored[0][0].id == b.id

    def test_record_and_get_impressions(self):
        from api.ranking_personalized import (
            get_recent_impressions, record_impressions,
        )

        viewer = UserFactory()
        a = ServiceFactory(type='Offer', status='Active')
        b = ServiceFactory(type='Offer', status='Active')

        assert get_recent_impressions(viewer.id) == {}
        record_impressions(viewer.id, [a.id, b.id])
        history = get_recent_impressions(viewer.id)
        assert str(a.id) in history
        assert str(b.id) in history

    def test_builder_replaces_prior_state(self):
        """Rebuilding should not leave stale pairs from a previous run."""
        from django.test import override_settings
        from api.models import HandshakeCooccurrence
        from api.ranking_personalized import rebuild_cooccurrence_matrix

        a = ServiceFactory(type='Offer', status='Active')
        b = ServiceFactory(type='Offer', status='Active')
        # Seed a stale row that the rebuilder must remove.
        HandshakeCooccurrence.objects.create(service_a=a, service_b=b, count=99)
        # No actual handshakes -> after rebuild, the stale row is gone.
        with override_settings(RANKING_COOCCUR_MIN_USERS=3):
            rebuild_cooccurrence_matrix()
        assert HandshakeCooccurrence.objects.count() == 0
