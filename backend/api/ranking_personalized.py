"""For You feed scorer (#481).

Composes four viewer specific signals on top of the existing hot_score:
- tag_overlap (Jaccard with viewer.skills, with one level of parent_qid match)
- follow_affinity (1.0 first degree, 0.5 second degree, via get_social_proximity_boosts)
- cooccurrence_signal (anonymized item-item matrix, k-anonymous threshold)
- recency_penalty (decay over hours since the viewer last saw the service)

Surface and integration live in views.py; this module is the pure scorer plus
the daily cooccurrence matrix builder. No request, no DB writes from the
scorer functions themselves so they are cheap to test in isolation.
"""
from __future__ import annotations

import math
import time
from collections import Counter, defaultdict
from typing import Iterable

from django.conf import settings
from django.core.cache import cache
from django.db import transaction


# ---------------------------------------------------------------------------
# Signal helpers (pure)
# ---------------------------------------------------------------------------


def _viewer_skill_qids(viewer) -> set[str]:
    """Return the viewer's declared skill QIDs plus their parent_qid expansions
    so a service tagged with a child of a viewer skill still counts as overlap.
    Anonymous and skill-less viewers return the empty set.
    """
    if viewer is None or not getattr(viewer, 'is_authenticated', False):
        return set()
    qids: set[str] = set()
    for tag in viewer.skills.all():
        qids.add(tag.id)
        if tag.parent_qid:
            qids.add(tag.parent_qid)
    return qids


def _service_tag_qids(service) -> set[str]:
    qids: set[str] = set()
    for tag in service.tags.all():
        qids.add(tag.id)
        if tag.parent_qid:
            qids.add(tag.parent_qid)
    return qids


def tag_overlap(service, viewer) -> float:
    """Jaccard similarity of viewer skills and service tags, with parent_qid
    lifted into the membership set so hierarchical matches count.
    """
    return tag_overlap_with_viewer_qids(service, _viewer_skill_qids(viewer))


def tag_overlap_with_viewer_qids(service, viewer_qids: set[str]) -> float:
    """Same as tag_overlap but accepts precomputed viewer QIDs so callers
    (e.g. score_for_you) issue a single skills query per request, not one per
    candidate service."""
    if not viewer_qids:
        return 0.0
    tag_qids = _service_tag_qids(service)
    if not tag_qids:
        return 0.0
    intersection = viewer_qids & tag_qids
    union = viewer_qids | tag_qids
    if not union:
        return 0.0
    return len(intersection) / len(union)


def engagement_signal(
    service_tag_qids: set, saved_tag_qids: set,
) -> float:
    """Jaccard overlap between the candidate's tags and the aggregate tag
    set of services the viewer has saved (private bookmarks).

    Completed handshakes are deliberately excluded — they would anchor the
    viewer too tightly to past collaborations.

    Returns a value in [0, 1].
    """
    if not saved_tag_qids or not service_tag_qids:
        return 0.0
    intersection = service_tag_qids & saved_tag_qids
    union = service_tag_qids | saved_tag_qids
    if not union:
        return 0.0
    return len(intersection) / len(union)


def dismissed_similarity(
    service_tag_qids: set, dismissed_tag_qids: set,
) -> float:
    """Jaccard overlap between the candidate's tags and the aggregate tag
    set of services the viewer has dismissed.

    Used as a soft penalty in the blend; the existing hard exclusion in
    the list view still removes the exact dismissed services from the
    candidate set, so this only affects services *like* the dismissed
    ones.

    Returns a value in [0, 1].
    """
    if not dismissed_tag_qids or not service_tag_qids:
        return 0.0
    intersection = service_tag_qids & dismissed_tag_qids
    union = service_tag_qids | dismissed_tag_qids
    if not union:
        return 0.0
    return len(intersection) / len(union)


def follow_affinity(service, boosts: dict) -> float:
    """Return the social proximity boost for the service's owner.
    Boosts come from api.services.get_social_proximity_boosts(viewer_id):
      1.0 for first degree, 0.5 for second degree, absent for strangers.
    """
    owner_id = getattr(service, 'user_id', None)
    if owner_id is None:
        return 0.0
    return float(boosts.get(owner_id, 0.0))


def cooccurrence_signal(
    service, viewer_history_ids: Iterable, cooccur_lookup: dict
) -> float:
    """Sum log1p(count) over (history_service, target_service) pairs the
    viewer has interacted with. Pairs with the service itself are excluded
    so a viewer who completed the very service does not score it.
    """
    target_id = service.id
    total = 0
    for hist_id in viewer_history_ids:
        if hist_id == target_id:
            continue
        count = cooccur_lookup.get((hist_id, target_id), 0)
        total += count
    if total <= 0:
        return 0.0
    return math.log1p(total)


def recency_penalty(seconds_since_last_seen, half_life_hours: float) -> float:
    """Exponential decay of impression freshness. Never seen returns 0.
    seconds=0 returns 1.0 (just shown). At half_life_hours, returns 0.5.
    """
    if seconds_since_last_seen is None:
        return 0.0
    if half_life_hours is None or half_life_hours <= 0:
        return 0.0
    half_life_seconds = half_life_hours * 3600.0
    return float(math.exp(-seconds_since_last_seen * math.log(2) / half_life_seconds))


def blend_for_you_score(
    *,
    hot_score: float,
    tag: float,
    follow: float,
    cooccur: float,
    recency_penalty_value: float,
    engagement: float = 0.0,
) -> tuple[float, dict]:
    """Additive blend on top of hot_score using the configured weights.
    Returns (score, signals_dict) so the caller can serialize per-card
    signal breakdowns for the smart-pill UI.

    The dismiss feature was removed in 2026-05; the dismissed_similarity
    penalty went with it. Older callers that still pass it can drop the
    arg without behaviour change.
    """
    w_tag = float(getattr(settings, 'RANKING_FOR_YOU_TAG_WEIGHT', 0.3))
    w_follow = float(getattr(settings, 'RANKING_FOR_YOU_FOLLOW_WEIGHT', 0.4))
    w_cooccur = float(getattr(settings, 'RANKING_FOR_YOU_COOCCUR_WEIGHT', 0.2))
    w_recency = float(getattr(settings, 'RANKING_FOR_YOU_RECENCY_WEIGHT', 0.1))
    w_engagement = float(getattr(settings, 'RANKING_FOR_YOU_ENGAGEMENT_WEIGHT', 0.25))
    score = (
        float(hot_score)
        + w_tag * tag
        + w_follow * follow
        + w_cooccur * cooccur
        - w_recency * recency_penalty_value
        + w_engagement * engagement
    )
    return score, {
        'tag': tag,
        'follow': follow,
        'cooccur': cooccur,
        'recency_penalty': recency_penalty_value,
        'engagement': engagement,
    }


# ---------------------------------------------------------------------------
# Cooccurrence matrix builder
# ---------------------------------------------------------------------------


def rebuild_cooccurrence_matrix() -> int:
    """Rebuild HandshakeCooccurrence from completed handshakes.

    For each viewer who has completed at least 2 services, count every
    unordered pair (a, b) once. After tallying, only pairs reached by at
    least RANKING_COOCCUR_MIN_USERS distinct viewers are kept (k-anonymous).
    The matrix is replaced atomically: the previous contents are deleted
    inside the same transaction as the bulk_create of fresh rows.

    Returns the number of pairs written.
    """
    from .models import Handshake, HandshakeCooccurrence

    min_users = int(getattr(settings, 'RANKING_COOCCUR_MIN_USERS', 3))

    # Group completed handshakes by viewer.
    by_viewer: dict = defaultdict(set)
    for row in Handshake.objects.filter(status='completed').values(
        'requester_id', 'service_id',
    ).iterator():
        by_viewer[row['requester_id']].add(row['service_id'])

    # Tally how many distinct viewers completed each unordered pair.
    distinct_viewers_for_pair: Counter = Counter()
    for viewer_id, service_ids in by_viewer.items():
        if len(service_ids) < 2:
            continue
        ids_sorted = sorted(service_ids)
        for i in range(len(ids_sorted)):
            for j in range(i + 1, len(ids_sorted)):
                distinct_viewers_for_pair[(ids_sorted[i], ids_sorted[j])] += 1

    # Apply k-anonymity threshold.
    rows = [
        HandshakeCooccurrence(
            service_a_id=a, service_b_id=b, count=count,
        )
        for (a, b), count in distinct_viewers_for_pair.items()
        if count >= min_users
    ]

    with transaction.atomic():
        HandshakeCooccurrence.objects.all().delete()
        if rows:
            HandshakeCooccurrence.objects.bulk_create(rows)

    return len(rows)


# ---------------------------------------------------------------------------
# Impression cache (recency penalty input)
# ---------------------------------------------------------------------------

# 7 days in seconds; matches the 7d retention in the spec.
_IMPRESSION_TTL_SECONDS = 7 * 24 * 3600


# Impression history is stored in Django's default cache, which is the
# Redis backend in any environment with REDIS_URL set (see settings.py
# CACHES block). Multi-worker deployments share state through Redis so
# the recency penalty stays coherent across Daphne workers; do not swap
# this for an in-process dict.
def _impression_cache_key(viewer_id) -> str:
    return f'forYou:impressions:{viewer_id}'


def get_recent_impressions(viewer_id) -> dict:
    """Return {service_id: unix_timestamp_of_last_impression} for the viewer.
    Empty dict for anonymous viewers or first-time users.
    """
    if viewer_id is None:
        return {}
    return cache.get(_impression_cache_key(viewer_id)) or {}


def record_impressions(viewer_id, service_ids) -> None:
    """Append impressions for the viewer; cap history size and reset TTL."""
    if viewer_id is None or not service_ids:
        return
    key = _impression_cache_key(viewer_id)
    history = cache.get(key) or {}
    now = time.time()
    for sid in service_ids:
        history[str(sid)] = now
    cap = int(getattr(settings, 'RANKING_FOR_YOU_IMPRESSION_HISTORY', 100))
    if len(history) > cap:
        # Drop the oldest entries beyond the cap.
        sorted_items = sorted(history.items(), key=lambda kv: kv[1], reverse=True)
        history = dict(sorted_items[:cap])
    cache.set(key, history, _IMPRESSION_TTL_SECONDS)


# ---------------------------------------------------------------------------
# Top-level scorer
# ---------------------------------------------------------------------------


def _aggregate_tag_qids_for_services(service_ids) -> set:
    """Return the union of tag QIDs and their parent_qids for the given
    service ids. Empty set when the input is empty.
    """
    from .models import Tag

    if not service_ids:
        return set()
    rows = Tag.objects.filter(service__id__in=service_ids).values_list(
        'id', 'parent_qid',
    ).distinct()
    qids: set = set()
    for tid, parent in rows:
        if tid:
            qids.add(tid)
        if parent:
            qids.add(parent)
    return qids


def score_for_you(services, viewer) -> list[tuple]:
    """Score a list of candidate services for the viewer.

    Returns a list of (service, for_you_score, signals_dict) sorted by score
    descending. Anonymous viewers fall back to hot_score-only ordering.

    All viewer-aware lookups (social proximity, viewer history, impressions,
    cooccurrence rows, saved/dismissed tag aggregates) are issued exactly
    once and joined in Python so this stays O(N) per request in the size
    of the candidate set.
    """
    from .models import Handshake, HandshakeCooccurrence, SavedService
    from .services import get_social_proximity_boosts

    services = list(services)
    if not services:
        return []

    is_authenticated = bool(getattr(viewer, 'is_authenticated', False))
    viewer_id = getattr(viewer, 'id', None) if is_authenticated else None

    # Pre-fetch viewer-scoped data (one query each).
    boosts = get_social_proximity_boosts(viewer_id) if viewer_id else {}
    viewer_history_ids: list = []
    if viewer_id:
        viewer_history_ids = list(
            Handshake.objects.filter(
                requester_id=viewer_id, status='completed',
            ).values_list('service_id', flat=True)
        )

    # Pre-fetch saved service tag aggregate for the engagement signal.
    saved_tag_qids: set = set()
    if viewer_id:
        saved_ids = list(
            SavedService.objects.filter(user_id=viewer_id).values_list(
                'service_id', flat=True,
            )
        )
        saved_tag_qids = _aggregate_tag_qids_for_services(saved_ids)

    # Cooccurrence lookup keyed both directions for O(1) access.
    candidate_ids = [s.id for s in services]
    cooccur_lookup: dict = {}
    if viewer_history_ids and candidate_ids:
        rows = HandshakeCooccurrence.objects.filter(
            service_a_id__in=viewer_history_ids + candidate_ids,
            service_b_id__in=viewer_history_ids + candidate_ids,
        ).values_list('service_a_id', 'service_b_id', 'count')
        for a, b, c in rows:
            cooccur_lookup[(a, b)] = c
            cooccur_lookup[(b, a)] = c

    impressions = get_recent_impressions(viewer_id)
    half_life_hours = float(
        getattr(settings, 'RANKING_FOR_YOU_RECENCY_HALF_LIFE_HOURS', 24)
    )
    now = time.time()

    # One viewer.skills scan per request — tag_overlap used to call this inside
    # the loop (N list queries on Browse when smart-pill signals attach).
    cached_viewer_qids = _viewer_skill_qids(viewer)

    scored: list = []
    for svc in services:
        tag = tag_overlap_with_viewer_qids(svc, cached_viewer_qids)
        follow = follow_affinity(svc, boosts)
        cooccur = cooccurrence_signal(svc, viewer_history_ids, cooccur_lookup)

        # Compute the candidate's tag set once and reuse for all
        # tag-overlap-shaped signals.
        svc_tag_qids = _service_tag_qids(svc)
        engagement = engagement_signal(svc_tag_qids, saved_tag_qids)

        last_seen = impressions.get(str(svc.id))
        seconds_since = (now - last_seen) if last_seen else None
        recency = recency_penalty(seconds_since, half_life_hours)

        score, signals = blend_for_you_score(
            hot_score=float(svc.hot_score or 0.0),
            tag=tag,
            follow=follow,
            cooccur=cooccur,
            recency_penalty_value=recency,
            engagement=engagement,
        )
        scored.append((svc, score, signals))

    scored.sort(key=lambda triple: triple[1], reverse=True)
    return scored


def apply_mmr_diversification(
    scored, lambda_: float | None = None, top_k: int | None = None,
) -> list[tuple]:
    """Re-rank the top-K candidates by Maximal Marginal Relevance so the
    visible feed isn't dominated by near-duplicates of a single tag
    cluster.

    For each pick, the adjusted score is:
        original_score - lambda * max(jaccard(candidate, selected))
    where jaccard is over the parent-expanded tag set. Tag overlap is
    the only diversity axis — service type and owner are intentionally
    not penalized so a small community where one prolific neighbor
    posts a lot doesn't get suppressed.

    `scored` is the list returned by score_for_you (triples of
    (service, score, signals)). Anything past `top_k` is left in its
    original order.
    """
    if lambda_ is None:
        lambda_ = float(getattr(settings, 'RANKING_FOR_YOU_MMR_LAMBDA', 0.3))
    if top_k is None:
        top_k = int(getattr(settings, 'RANKING_FOR_YOU_MMR_TOP_K', 20))
    if lambda_ <= 0 or top_k <= 1 or len(scored) <= 1:
        return scored

    head = scored[:top_k]
    tail = scored[top_k:]

    # Cache each candidate's parent-expanded tag set once.
    tag_sets: list[set] = [_service_tag_qids(triple[0]) for triple in head]

    selected: list[tuple] = []
    selected_indices: set[int] = set()
    remaining = list(range(len(head)))

    while remaining:
        best_idx = None
        best_adjusted = None
        for idx in remaining:
            svc_tags = tag_sets[idx]
            if selected_indices and svc_tags:
                max_sim = 0.0
                for sel_idx in selected_indices:
                    sel_tags = tag_sets[sel_idx]
                    if not sel_tags:
                        continue
                    union = svc_tags | sel_tags
                    if not union:
                        continue
                    sim = len(svc_tags & sel_tags) / len(union)
                    if sim > max_sim:
                        max_sim = sim
            else:
                max_sim = 0.0
            adjusted = head[idx][1] - lambda_ * max_sim
            if best_adjusted is None or adjusted > best_adjusted:
                best_adjusted = adjusted
                best_idx = idx
        selected.append(head[best_idx])
        selected_indices.add(best_idx)
        remaining.remove(best_idx)

    return selected + tail
