"""
Hot score ranking algorithm for services.

Phase 2 formula: Score = Quality x Activity x CapacityMultiplier x NewcomerBoost

Where:
- Quality = wilson_score_lower_bound(positive_reps, positive_reps + negative_reps)
- Activity = log2(2 + HoursExchanged) + 0.5 * log2(2 + comment_count)
- CapacityMultiplier = 1.5 if 0.75 <= accepted/max_participants < 1.0 (events
  and group offers only), 1.0 otherwise
- NewcomerBoost = settings.RANKING_NEWCOMER_BOOST (default 1.2) if the owner's
  account is younger than 30 days, 1.0 otherwise
"""
from __future__ import annotations

import math
import random
from datetime import timedelta
from decimal import Decimal
from typing import TYPE_CHECKING

from django.conf import settings
from django.db.models import Count, Q, Sum
from django.db.models.functions import Coalesce
from django.utils import timezone

from .achievement_utils import is_newcomer

if TYPE_CHECKING:
    from .models import Service


FORMULA_VERSION = "v2.1-2026-05"


def sample_boost(target_multiplier: float, probability: float, rng=None):
    """Apply a multiplicative boost stochastically while preserving its expected value.

    Returns (effective_multiplier, applied).

    With probability >= 1.0 the boost is deterministic and the configured
    multiplier is returned. With 0 < probability < 1.0 the boost applies on
    a fraction of calls matching probability, and when applied the multiplier
    is amplified to 1 + (target - 1) / probability so that the expected
    multiplier across many calls equals target_multiplier. Probability <= 0
    disables the boost.

    Callers are expected to gate eligibility before calling: only call when the
    boost would otherwise fire deterministically (e.g. owner is a newcomer,
    capacity is in the trigger band).
    """
    if probability >= 1.0:
        return target_multiplier, True
    if probability <= 0.0:
        return 1.0, False
    rng_to_use = rng if rng is not None else random
    if rng_to_use.random() < probability:
        return 1.0 + (target_multiplier - 1.0) / probability, True
    return 1.0, False


def apply_stochastic_social_proximity(boosts: dict, probability: float, rng=None) -> dict:
    """Stochastic application of the social proximity boost map.

    Each entry is independently subjected to a Bernoulli trial. On success the
    boost is amplified by 1/probability so that the expected boost across many
    impressions equals the configured value; on failure the boost becomes 0.
    Probability >= 1.0 returns the input unchanged. Probability <= 0 returns
    an empty dict (boost disabled entirely).
    """
    if probability >= 1.0:
        return boosts
    if probability <= 0.0:
        return {}
    rng_to_use = rng if rng is not None else random
    return {
        uid: (boost / probability) if rng_to_use.random() < probability else 0.0
        for uid, boost in boosts.items()
    }


def proximity_multiplier(distance_km, half_life_km: float) -> float:
    """Smooth distance decay used as a Phase 2 ranking factor.

    Returns 1 / (1 + distance_km / half_life_km), bounded at 1.0 from above.
    A service at the viewer's location keeps full score, a service at the
    half life distance keeps half its score, and the curve approaches zero
    asymptotically at very large distances.

    Returns 1.0 (no effect) when distance_km is None (viewer location
    unknown), when half_life_km is non-positive, or when the distance is
    non-positive (defensive against PostGIS rounding noise).
    """
    if distance_km is None:
        return 1.0
    if half_life_km is None or half_life_km <= 0:
        return 1.0
    if distance_km <= 0:
        return 1.0
    return 1.0 / (1.0 + distance_km / half_life_km)


def wilson_score_lower_bound(positives: int, total: int, z: float = 1.96) -> float:
    """
    Wilson score lower bound for the positive rate of a Bernoulli sample.

    FR-17j (issue #317): a provider with 3/3 positives must NOT outrank one with
    95/100 just because the small sample happened to be perfect. The Wilson
    lower bound at z=1.96 (95% confidence) penalises small samples.

    Returns 0.0 for zero total — no observations means no signal.
    """
    if total <= 0:
        return 0.0
    p_hat = positives / total
    z2 = z * z
    denom = 1.0 + z2 / total
    centre = p_hat + z2 / (2.0 * total)
    margin = z * math.sqrt((p_hat * (1.0 - p_hat) + z2 / (4.0 * total)) / total)
    return max(0.0, (centre - margin) / denom)


# Why no time decay: an earlier draft used exp(-days_since_last_engagement / 14)
# as a freshness multiplier. Customer feedback rejected this -- well-established
# services with quiet weeks were being buried with no path back. Rotation of
# old-but-good listings is now Phase 3's job (Thompson Sampling exploration
# bucket explicitly samples from under-shown quality items), not Phase 2's.
#
# Why Wilson lower bound on Quality: a provider with 3/3 positives shouldn't
# outrank one with 95/100 on luck. Wilson at z=1.96 (95% confidence) gives
# small samples a fair but honest score. See FR-17j / issue #317.
#
# Why log on Activity: prevents the "rich get richer" runaway that ^1.5 caused
# in the HiveMind-faithful draft. log2(2+100) ~ 6.7 vs log2(2+10) ~ 3.6 --
# a 10x volume difference is a 2x score difference, not 30x.
#
# Why HoursExchanged not hours_since_creation: see FR-17b / issue #302.
def _compute_service_factors(service: Service) -> dict:
    """Return the factor breakdown for a service (Phase 2a). Used by both
    calculate_hot_score and the audit-log writer (Task 5 / NFR-17c / #308).
    Single source of truth for the service-formula math.
    """
    from .models import ReputationRep, NegativeRep, Comment, Handshake

    user = service.user
    pos = ReputationRep.objects.filter(
        receiver=user, handshake__service__type__in=['Offer', 'Need'],
    ).aggregate(
        c=Coalesce(Count('id', filter=Q(is_punctual=True)), 0)
        + Coalesce(Count('id', filter=Q(is_helpful=True)), 0)
        + Coalesce(Count('id', filter=Q(is_kind=True)), 0),
    )['c']
    neg = NegativeRep.objects.filter(
        receiver=user, handshake__service__type__in=['Offer', 'Need'],
    ).aggregate(
        c=Coalesce(Count('id', filter=Q(is_late=True)), 0)
        + Coalesce(Count('id', filter=Q(is_unhelpful=True)), 0)
        + Coalesce(Count('id', filter=Q(is_rude=True)), 0),
    )['c']
    comments = Comment.objects.filter(service=service, is_deleted=False).count()
    hours = Handshake.objects.filter(
        service=service, status='completed',
    ).aggregate(total=Coalesce(Sum('provisioned_hours'), Decimal('0')))['total']

    quality = wilson_score_lower_bound(pos, pos + neg)
    activity = math.log2(2 + float(hours)) + 0.5 * math.log2(2 + comments)

    # Capacity multiplier scope (FR-17e / #304):
    # Applies to Events AND group Offers (Offer with max_participants > 1).
    # Solo Offers/Needs (max_participants <= 1) are not capacitated; no boost.
    capacity_multiplier = 1.0
    capacity_applied = False
    if service.max_participants and service.max_participants > 0 and (
        service.type == 'Event'
        or (service.type == 'Offer' and service.max_participants > 1)
    ):
        accepted = Handshake.objects.filter(
            service=service,
            status__in=['accepted', 'checked_in', 'attended', 'no_show'],
        ).count()
        ratio = accepted / service.max_participants
        if 0.75 <= ratio < 1.0:
            capacity_multiplier, capacity_applied = sample_boost(
                1.5, getattr(settings, 'RANKING_CAPACITY_BOOST_PROBABILITY', 1.0),
            )

    if is_newcomer(user):
        newcomer_boost, newcomer_applied = sample_boost(
            settings.RANKING_NEWCOMER_BOOST,
            getattr(settings, 'RANKING_NEWCOMER_BOOST_PROBABILITY', 1.0),
        )
    else:
        newcomer_boost, newcomer_applied = 1.0, False

    final = round(quality * activity * capacity_multiplier * newcomer_boost, 6)
    return {
        'positive_rep_count': pos,
        'negative_rep_count': neg,
        'comment_count': comments,
        'hours_exchanged': hours,
        'quality': quality,
        'activity': activity,
        'capacity_multiplier': capacity_multiplier,
        'capacity_boost_applied': capacity_applied,
        'newcomer_boost': newcomer_boost,
        'newcomer_boost_applied': newcomer_applied,
        'final_score': final,
    }


def calculate_hot_score(service: Service) -> float:
    """Phase 2 Service Hot Score -- delegates to _compute_service_factors.

    Closes FR-17b (#302) and FR-17j (#317). For Events, callers should use
    calculate_event_hot_score (the batch updater routes Events automatically).

    The rationale comment block lives on _compute_service_factors above; keeping
    the docstring here brief avoids duplication.
    """
    return _compute_service_factors(service)['final_score']


def _compute_event_factors(event: Service) -> dict:
    """Return the factor breakdown for an event (Phase 2b). Sister helper to
    _compute_service_factors used by both calculate_event_hot_score and the
    audit-log writer (Task 5 / NFR-17c / #308).

    Why this and not the service formula: events have a hard date and short
    relevance window. Lifetime hours is the wrong signal -- RSVP velocity in
    the past 7 days is. OrganiserQuality is event-scoped because someone who
    runs great events doesn't necessarily run great offers, and vice versa.
    """
    from .models import Handshake, ReputationRep, NegativeRep

    organiser = event.user
    seven_days_ago = timezone.now() - timedelta(days=7)

    rsvps_last_7d = Handshake.objects.filter(
        service=event,
        status__in=['accepted', 'checked_in', 'attended'],
        created_at__gte=seven_days_ago,
    ).count()

    pos = ReputationRep.objects.filter(
        receiver=organiser, handshake__service__type='Event',
    ).aggregate(
        c=Coalesce(Count('id', filter=Q(is_punctual=True)), 0)
        + Coalesce(Count('id', filter=Q(is_helpful=True)), 0)
        + Coalesce(Count('id', filter=Q(is_kind=True)), 0),
    )['c']
    neg = NegativeRep.objects.filter(
        receiver=organiser, handshake__service__type='Event',
    ).aggregate(
        c=Coalesce(Count('id', filter=Q(is_late=True)), 0)
        + Coalesce(Count('id', filter=Q(is_unhelpful=True)), 0)
        + Coalesce(Count('id', filter=Q(is_rude=True)), 0),
    )['c']

    # Pure Wilson, no Laplace prior -- consistent with the service formula.
    # A brand-new organiser scores 0 here; rotation for cold-start providers is
    # Phase 3's job (Thompson Sampling exploration bucket explicitly samples
    # from organisers below the lifetime threshold).
    organiser_quality = wilson_score_lower_bound(pos, pos + neg)
    velocity = math.log2(2 + rsvps_last_7d)

    # Capacity multiplier scope (FR-17e / #304): same rule as the service
    # formula -- 1.5x at 75-99% fill.
    capacity_multiplier = 1.0
    capacity_applied = False
    if event.max_participants and event.max_participants > 0:
        accepted_count = Handshake.objects.filter(
            service=event,
            status__in=['accepted', 'checked_in', 'attended', 'no_show'],
        ).count()
        ratio = accepted_count / event.max_participants
        if 0.75 <= ratio < 1.0:
            capacity_multiplier, capacity_applied = sample_boost(
                1.5, getattr(settings, 'RANKING_CAPACITY_BOOST_PROBABILITY', 1.0),
            )

    if is_newcomer(organiser):
        newcomer_boost, newcomer_applied = sample_boost(
            settings.RANKING_NEWCOMER_BOOST,
            getattr(settings, 'RANKING_NEWCOMER_BOOST_PROBABILITY', 1.0),
        )
    else:
        newcomer_boost, newcomer_applied = 1.0, False

    final = round(velocity * organiser_quality * capacity_multiplier * newcomer_boost, 6)
    return {
        'positive_rep_count': pos,
        'negative_rep_count': neg,
        'rsvps_last_7d': rsvps_last_7d,
        'organiser_quality': organiser_quality,
        'velocity': velocity,
        'capacity_multiplier': capacity_multiplier,
        'capacity_boost_applied': capacity_applied,
        'newcomer_boost': newcomer_boost,
        'newcomer_boost_applied': newcomer_applied,
        'final_score': final,
    }


def calculate_event_hot_score(event: Service) -> float:
    """Phase 2 Event Hot Score (FR-RANK-02 / #303) -- delegates to
    _compute_event_factors. Symmetric with calculate_hot_score.
    """
    return _compute_event_factors(event)['final_score']


def calculate_hot_scores_batch(services) -> dict:
    """
    Batch version of calculate_hot_score. Returns {service_id: float}.

    Uses one-shot aggregate queries per signal so this stays O(1) DB round-trips
    regardless of len(services).
    """
    from .models import ReputationRep, NegativeRep, Comment, Handshake, User

    if not services:
        return {}

    user_ids = list({s.user_id for s in services})
    service_ids = [s.id for s in services]

    # Newcomer set (account age < 30 days). Single round-trip; mirrors the
    # per-service is_newcomer() check used in _compute_service_factors.
    thirty_days_ago = timezone.now() - timedelta(days=30)
    newcomer_user_ids = set(
        User.objects.filter(id__in=user_ids, date_joined__gte=thirty_days_ago)
        .values_list('id', flat=True)
    )

    # Per-owner positive rep count, owner-by-type (Offer/Need only).
    pos_by_user: dict = {}
    for row in ReputationRep.objects.filter(
        receiver_id__in=user_ids,
        handshake__service__type__in=['Offer', 'Need'],
    ).values('receiver_id').annotate(
        c=Coalesce(Count('id', filter=Q(is_punctual=True)), 0)
        + Coalesce(Count('id', filter=Q(is_helpful=True)), 0)
        + Coalesce(Count('id', filter=Q(is_kind=True)), 0),
    ):
        pos_by_user[row['receiver_id']] = row['c']

    neg_by_user: dict = {}
    for row in NegativeRep.objects.filter(
        receiver_id__in=user_ids,
        handshake__service__type__in=['Offer', 'Need'],
    ).values('receiver_id').annotate(
        c=Coalesce(Count('id', filter=Q(is_late=True)), 0)
        + Coalesce(Count('id', filter=Q(is_unhelpful=True)), 0)
        + Coalesce(Count('id', filter=Q(is_rude=True)), 0),
    ):
        neg_by_user[row['receiver_id']] = row['c']

    comments_by_service = {
        row['service_id']: row['c']
        for row in Comment.objects.filter(
            service_id__in=service_ids, is_deleted=False,
        ).values('service_id').annotate(c=Count('id'))
    }

    hours_by_service = {
        row['service_id']: (row['total'] or Decimal('0'))
        for row in Handshake.objects.filter(
            service_id__in=service_ids, status='completed',
        ).values('service_id').annotate(total=Sum('provisioned_hours'))
    }

    # Capacity-relevant accepted counts (only for capacitated services)
    capacitated_ids = [
        s.id for s in services
        if s.max_participants and s.max_participants > 0 and (
            s.type == 'Event'
            or (s.type == 'Offer' and s.max_participants > 1)
        )
    ]
    accepted_by_service: dict = {}
    if capacitated_ids:
        accepted_by_service = {
            row['service_id']: row['c']
            for row in Handshake.objects.filter(
                service_id__in=capacitated_ids,
                status__in=['accepted', 'checked_in', 'attended', 'no_show'],
            ).values('service_id').annotate(c=Count('id'))
        }

    scores: dict = {}
    for service in services:
        if service.type == 'Event':
            scores[service.id] = calculate_event_hot_score(service)
            continue
        pos = pos_by_user.get(service.user_id, 0)
        neg = neg_by_user.get(service.user_id, 0)
        comments = comments_by_service.get(service.id, 0)
        hours = hours_by_service.get(service.id, Decimal('0'))

        quality = wilson_score_lower_bound(pos, pos + neg)
        activity = math.log2(2 + float(hours)) + 0.5 * math.log2(2 + comments)

        # accepted_by_service is already pre-filtered to capacitated services
        # (see capacitated_ids above), so membership IS the capacity check.
        capacity_multiplier = 1.0
        if service.id in accepted_by_service:
            ratio = accepted_by_service[service.id] / service.max_participants
            if 0.75 <= ratio < 1.0:
                capacity_multiplier, _ = sample_boost(
                    1.5, getattr(settings, 'RANKING_CAPACITY_BOOST_PROBABILITY', 1.0),
                )

        if service.user_id in newcomer_user_ids:
            newcomer_boost, _ = sample_boost(
                settings.RANKING_NEWCOMER_BOOST,
                getattr(settings, 'RANKING_NEWCOMER_BOOST_PROBABILITY', 1.0),
            )
        else:
            newcomer_boost = 1.0

        scores[service.id] = round(
            quality * activity * capacity_multiplier * newcomer_boost, 6
        )

    return scores


class RankingPipeline:
    """
    Three-phase ranking pipeline (HiveMind-style):
      Phase 1 — filter_candidates: liquidity (status, proximity, capacity, type)
      Phase 2 — score_candidates: trust + discovery (Quality × Activity × Capacity)
      Phase 3 — rerank: fairness (Thompson Sampling exploration mixing)

    Each phase is a method to keep responsibilities crisp; ServiceViewSet calls
    .run(queryset) which orchestrates all three. The request is held on the
    instance because Phase 3 (`rerank`) needs it for the per-request
    exploration coin flip.
    """

    def __init__(self, request):
        self.request = request

    def filter_candidates(self, queryset):
        """Phase 1 — restrict to listings the requester can act on. (Wired in Task 12.)"""
        return queryset

    def score_candidates(self, services):
        """Phase 2 — return [(service, score)] sorted by score desc. (Formula updates land in Tasks 2 and 3.)"""
        scores = calculate_hot_scores_batch(services)
        return sorted(
            ((s, scores.get(s.id, 0.0)) for s in services),
            key=lambda pair: pair[1],
            reverse=True,
        )

    def rerank(self, scored):
        """Phase 3 -- inject exploration slot per Thompson Sampling (#316)."""
        from django.conf import settings
        if not should_explore(self.request):
            return scored
        candidates = [pair[0] for pair in scored]
        viewer = getattr(self.request, 'user', None)
        explore = select_exploration_candidate(candidates, viewer)
        if explore is None:
            return scored
        slot = getattr(settings, 'RANKING_EXPLORATION_SLOT_INDEX', 5)
        explore_score = next((p[1] for p in scored if p[0].id == explore.id), 0.0)
        return inject_exploration_slot(scored, (explore, explore_score), slot_index=slot)

    def run(self, queryset):
        candidates = list(self.filter_candidates(queryset))
        scored = self.score_candidates(candidates)
        return self.rerank(scored)


# ---------------------------------------------------------------------------
# Phase 3 -- Thompson Sampling exploration helpers (FR-17i / #316)
# ---------------------------------------------------------------------------

def should_explore(request) -> bool:
    """Per-request randomisation. Returns True with probability
    settings.RANKING_EXPLORATION_RATE. Per-request, NOT per-session, so admins
    can't predict which requests will be explored."""
    from django.conf import settings
    return random.random() < getattr(settings, 'RANKING_EXPLORATION_RATE', 0.20)


def _eligible_exploration(candidates):
    """Returns (cold_start, under_shown, stale_recurring) lists from candidates.

    Cold-start: provider with fewer than RANKING_COLDSTART_THRESHOLD lifetime
    completed handshakes (across all their services).

    Under-shown quality: service with quality >= RANKING_UNDERSHOWN_QUALITY_THRESHOLD
    and no completed handshake in the last RANKING_UNDERSHOWN_STALE_DAYS days.
    Computed via _compute_service_factors; events skipped because their formula
    uses different signals.

    Stale recurring: service.is_stale_recurring=True (set by check_recurring_growth).
    """
    from django.conf import settings
    from .models import Handshake

    cold_threshold = getattr(settings, 'RANKING_COLDSTART_THRESHOLD', 5)
    quality_threshold = getattr(settings, 'RANKING_UNDERSHOWN_QUALITY_THRESHOLD', 0.4)
    stale_days = getattr(settings, 'RANKING_UNDERSHOWN_STALE_DAYS', 14)
    cutoff = timezone.now() - timedelta(days=stale_days)

    candidate_ids = [c.id for c in candidates]
    user_ids = {c.user_id for c in candidates}

    lifetime = dict(
        Handshake.objects.filter(
            service__user_id__in=user_ids, status='completed',
        ).values('service__user_id').annotate(c=Count('id')).values_list('service__user_id', 'c')
    )

    recent_active = set(
        Handshake.objects.filter(
            service_id__in=candidate_ids, status='completed', updated_at__gte=cutoff,
        ).values_list('service_id', flat=True)
    )

    cold, undershown, stale = [], [], []
    for c in candidates:
        if lifetime.get(c.user_id, 0) < cold_threshold:
            cold.append(c)
            continue
        if c.type != 'Event':
            f = _compute_service_factors(c)
            if f['quality'] >= quality_threshold and c.id not in recent_active:
                undershown.append(c)
                continue
        if getattr(c, 'is_stale_recurring', False):
            stale.append(c)
    return cold, undershown, stale


def select_exploration_candidate(candidates, viewer):
    """Uniform sampling across the three eligible sub-buckets. Returns None if
    all three are empty -- caller should leave the ranked list unchanged."""
    cold, undershown, stale = _eligible_exploration(candidates)
    pools = [p for p in (cold, undershown, stale) if p]
    if not pools:
        return None
    chosen_pool = random.choice(pools)
    return random.choice(chosen_pool)


def inject_exploration_slot(ordered, explore_item, slot_index=5):
    """Replace the item at slot_index with explore_item. If the list is shorter
    than slot_index, append at the end. None explore_item returns ordered as-is."""
    if explore_item is None:
        return ordered
    if slot_index >= len(ordered):
        return list(ordered) + [explore_item]
    return list(ordered[:slot_index]) + [explore_item] + list(ordered[slot_index + 1:])
