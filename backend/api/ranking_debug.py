from __future__ import annotations

from datetime import timedelta
from math import asin, cos, pi, sin, sqrt

from django.conf import settings
from django.db.models import Count, Max
from django.utils import timezone

from .achievement_utils import is_newcomer
from .models import Comment, Handshake, NegativeRep, ReputationRep, Service, User
from .ranking import (
    _compute_event_factors,
    _compute_service_factors,
    calculate_hot_score,
    proximity_multiplier,
)
from .services import get_social_proximity_boosts


def _phase3_trace(service: Service, factors: dict) -> dict:
    """Compute Phase 3 eligibility for a single service so the admin debug
    panel can explain whether a card came from the regular hot list or the
    explore bucket and which sub pool it was eligible for.
    """
    cold_threshold = getattr(settings, 'RANKING_COLDSTART_THRESHOLD', 5)
    quality_threshold = getattr(settings, 'RANKING_UNDERSHOWN_QUALITY_THRESHOLD', 0.4)
    stale_days = getattr(settings, 'RANKING_UNDERSHOWN_STALE_DAYS', 14)
    cutoff = timezone.now() - timedelta(days=stale_days)

    lifetime = Handshake.objects.filter(
        service__user_id=service.user_id, status='completed',
    ).count()
    last_completed = Handshake.objects.filter(
        service=service, status='completed',
    ).aggregate(latest=Max('updated_at'))['latest']
    days_since_last = (
        (timezone.now() - last_completed).days if last_completed else None
    )

    pool = None
    if lifetime < cold_threshold:
        pool = 'cold_start'
    elif (
        service.type != 'Event'
        and factors.get('quality', 0.0) >= quality_threshold
        and (last_completed is None or last_completed < cutoff)
    ):
        pool = 'undershown_quality'
    elif getattr(service, 'is_stale_recurring', False):
        pool = 'stale_recurring'

    return {
        'pool': pool,
        'exploration_rate': float(getattr(settings, 'RANKING_EXPLORATION_RATE', 0.20)),
        'lifetime_completed_handshakes': lifetime,
        'days_since_last_completed_handshake': days_since_last,
        'is_stale_recurring': bool(getattr(service, 'is_stale_recurring', False)),
        'cold_start_threshold': cold_threshold,
        'undershown_quality_threshold': quality_threshold,
        'undershown_stale_days': stale_days,
    }


def _factor_breakdown(service: Service) -> dict:
    """Run the live ranking formulas and return a flattened debug summary
    that includes both the raw inputs (positive_count, negative_count,
    comment_count, hours_exchanged or rsvps_last_7d) and the derived
    factors (quality, activity / velocity, capacity_multiplier,
    newcomer_boost, final_score) in one shape per service kind."""
    if service.type == 'Event':
        f = _compute_event_factors(service)
        return {
            'kind': 'event',
            'positive_count': f['positive_rep_count'],
            'negative_count': f['negative_rep_count'],
            'rsvps_last_7d': f['rsvps_last_7d'],
            'organiser_quality': f['organiser_quality'],
            'velocity': f['velocity'],
            'capacity_multiplier': f['capacity_multiplier'],
            'newcomer_boost': f['newcomer_boost'],
            'is_newcomer': is_newcomer(service.user),
            'final_score': f['final_score'],
        }
    f = _compute_service_factors(service)
    return {
        'kind': 'service',
        'positive_count': f['positive_rep_count'],
        'negative_count': f['negative_rep_count'],
        'comment_count': f['comment_count'],
        'hours_exchanged': float(f['hours_exchanged']),
        'quality': f['quality'],
        'activity': f['activity'],
        'capacity_multiplier': f['capacity_multiplier'],
        'newcomer_boost': f['newcomer_boost'],
        'is_newcomer': is_newcomer(service.user),
        'final_score': f['final_score'],
    }


def _ranking_sankey_from_factors(factors: dict) -> dict:
    """Compact nodes/links for the admin Recommendation Showcase sankey chart.

    The UI only needs non-empty `nodes` and `links`; values are relative weights.
    """
    if factors.get('kind') == 'event':
        v = max(0.001, float(factors.get('velocity') or 0))
        oq = max(0.001, float(factors.get('organiser_quality') or 0))
        return {
            'nodes': [
                {'id': 'velocity', 'label': 'Velocity'},
                {'id': 'organiser_quality', 'label': 'Organiser quality'},
                {'id': 'final', 'label': 'Event hot score'},
            ],
            'links': [
                {'source': 'velocity', 'target': 'final', 'value': v},
                {'source': 'organiser_quality', 'target': 'final', 'value': oq},
            ],
        }
    q = max(0.001, float(factors.get('quality') or 0))
    a = max(0.001, float(factors.get('activity') or 0))
    c = max(0.001, float(factors.get('capacity_multiplier') or 0))
    n = max(0.001, float(factors.get('newcomer_boost') or 0))
    return {
        'nodes': [
            {'id': 'quality', 'label': 'Wilson quality'},
            {'id': 'activity', 'label': 'Activity'},
            {'id': 'capacity_multiplier', 'label': 'Capacity multiplier'},
            {'id': 'newcomer_boost', 'label': 'Newcomer boost'},
            {'id': 'final', 'label': 'Hot score'},
        ],
        'links': [
            {'source': 'quality', 'target': 'final', 'value': q},
            {'source': 'activity', 'target': 'final', 'value': a},
            {'source': 'capacity_multiplier', 'target': 'final', 'value': c},
            {'source': 'newcomer_boost', 'target': 'final', 'value': n},
        ],
    }


def _formula_lines_with_substitutions(factors: dict) -> list[str]:
    """Render the ranking formulas with the actual numeric values so the
    debug panel reads as 'Wilson(1, 2) = 0.21' rather than the algebraic
    template only.

    The Wilson lines explicitly call out the +1/+2 Laplace prior so the
    arithmetic in the panel matches the function output. Without this the
    panel showed 'Wilson(6, 6) = 0.5291' which is mathematically wrong --
    Wilson(6, 6) is 0.6098; the engine actually computes Wilson(7, 8).
    """
    if factors['kind'] == 'event':
        pos = factors['positive_count']
        total = pos + factors['negative_count']
        return [
            f"velocity = log2(2 + {factors['rsvps_last_7d']}) = {factors['velocity']:.4f}",
            f"organiser_quality = Wilson({pos}+1, {total}+2) = Wilson({pos + 1}, {total + 2}) = {factors['organiser_quality']:.4f}",
            f"capacity_multiplier = {factors['capacity_multiplier']:.2f}",
            f"newcomer_boost = {factors['newcomer_boost']:.2f}",
            f"final = velocity * organiser_quality * capacity * newcomer = {factors['final_score']:.6f}",
        ]
    pos = factors['positive_count']
    total = pos + factors['negative_count']
    return [
        f"quality = Wilson({pos}+1, {total}+2) = Wilson({pos + 1}, {total + 2}) = {factors['quality']:.4f}",
        f"activity = log2(2 + {factors['hours_exchanged']:.2f}) + 0.5 * log2(2 + {factors['comment_count']}) = {factors['activity']:.4f}",
        f"capacity_multiplier = {factors['capacity_multiplier']:.2f}",
        f"newcomer_boost = {factors['newcomer_boost']:.2f}",
        f"final = quality * activity * capacity * newcomer = {factors['final_score']:.6f}",
    ]


def _normalize_text(value: str) -> str:
    return value.strip().lower()


def _includes_text(source: str | None, query: str) -> bool:
    if not source:
        return False
    return _normalize_text(query) in _normalize_text(source)


def _haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    earth_radius_km = 6371
    d_lat = (lat2 - lat1) * pi / 180
    d_lng = (lng2 - lng1) * pi / 180
    lat1_rad = lat1 * pi / 180
    lat2_rad = lat2 * pi / 180
    a = sin(d_lat / 2) ** 2 + cos(lat1_rad) * cos(lat2_rad) * sin(d_lng / 2) ** 2
    return 2 * earth_radius_km * asin(sqrt(a))


def _compute_search_score(service: Service, search: str, tag_ids: list[str]) -> float:
    score = 0.0

    if search:
        if _includes_text(service.title, search):
            score += 1.0
        if _includes_text(service.description, search):
            score += 0.6
        if service.tags.filter(name__icontains=search).exists():
            score += 0.3

    if tag_ids:
        if service.tags.filter(id__in=tag_ids).exists():
            score += 0.8
        if service.tags.filter(parent_qid__in=tag_ids).exists():
            score += 0.5

    return round(score, 6)


def _viewer_label(user: User) -> str:
    full_name = f'{user.first_name or ""} {user.last_name or ""}'.strip()
    return full_name or user.email


def _sort_mode_for(active_filter: str) -> str:
    """Map the frontend ranking mode to the backend's actual sort behaviour.

    See ServiceViewSet.get_queryset (views.py around line 2435):
      - sort='hot' (the 'nearby' filter and the dashboard 'all' filter) -> composite_score order
      - explore_only feed (only 'discovery') -> Phase 3 rotation
      - everything else -> created_at desc

    Knowing which sort actually decided position is the difference between a
    diagnosis line that explains the truth and one that points at composite
    factors that had no bearing on the ordering.
    """
    if active_filter in ('nearby', 'all'):
        return 'composite'
    if active_filter == 'discovery':
        return 'explore_only'
    return 'chronological'


def _phase1_trace(
    service: Service,
    *,
    active_filter: str,
    distance_km: float | None,
    search_score: float,
) -> dict:
    """Inputs the front-end shows in the 'Phase 1 — Filter' accordion."""
    sort_mode = _sort_mode_for(active_filter)
    return {
        'active_filter': active_filter,
        'sort_mode': sort_mode,
        # 'newest' / 'all' / 'recurrent' etc. fall through to chronological
        # sort -- composite_score does not decide the order. Surface this so
        # the panel doesn't mislead viewers into reading too much into the
        # composite numbers in those modes.
        'client_reorder': sort_mode == 'chronological',
        'distance_km': distance_km,
        'search_score': round(float(search_score), 6),
        'is_pinned': bool(service.is_pinned),
        'service_type': service.type,
        'location_type': service.location_type,
    }


def _composite_for(
    service: Service,
    *,
    viewer_lat: float | None,
    viewer_lng: float | None,
    half_life_km: float,
    social_reasons: dict,
) -> tuple[float, float, float | None, float]:
    """Return (composite_score, proximity_factor, distance_km, social_boost)
    using the same expression the queryset-level annotation uses in views.py:
    composite = hot_score * proximity_factor + 0.5 * social_boost.
    Mirrors that calculation so the bar can show the exact sort input.
    """
    distance_km: float | None = None
    if viewer_lat is not None and viewer_lng is not None:
        if service.location_lat is not None and service.location_lng is not None:
            distance_km = round(
                _haversine_km(
                    viewer_lat,
                    viewer_lng,
                    float(service.location_lat),
                    float(service.location_lng),
                ),
                4,
            )
    proximity = proximity_multiplier(distance_km, half_life_km)
    social_boost = float(social_reasons.get(service.user_id, 0.0))
    composite = float(service.hot_score or 0.0) * proximity + 0.5 * social_boost
    return composite, proximity, distance_km, social_boost


def _neighbours_block(
    *,
    services_by_id: dict,
    service_ids: list[str],
    selected_id: str,
    viewer_lat: float | None,
    viewer_lng: float | None,
    half_life_km: float,
    social_reasons: dict,
) -> list[dict]:
    """Two cards above and two below the selected card in the result list,
    each with the sort-tuple components (is_pinned, composite_score,
    created_at) that decided their position.
    """
    try:
        idx = service_ids.index(selected_id)
    except ValueError:
        return []
    start = max(0, idx - 2)
    end = min(len(service_ids), idx + 3)
    rows: list[dict] = []
    for i in range(start, end):
        sid = service_ids[i]
        svc = services_by_id.get(sid)
        if svc is None:
            continue
        composite, _, _, _ = _composite_for(
            svc,
            viewer_lat=viewer_lat,
            viewer_lng=viewer_lng,
            half_life_km=half_life_km,
            social_reasons=social_reasons,
        )
        rows.append({
            'position': i + 1,
            'id': str(svc.id),
            'title': svc.title,
            'is_pinned': bool(svc.is_pinned),
            'composite_score': round(float(composite), 6),
            'created_at': svc.created_at.isoformat(),
            'is_selected': sid == selected_id,
        })
    return rows


def _classify_bottleneck(
    *,
    factors: dict,
    composite_score: float,
    proximity_factor: float,
    distance_km: float | None,
    half_life_km: float,
    is_pinned: bool,
    pinned_count_in_list: int,
    phase3_injected: bool,
    phase3_pool: str | None,
    phase3_slot_index: int | None,
    sort_mode: str,
    active_filter: str,
) -> dict:
    """Pick the single dominant factor pulling this card's position away from
    raw-score order, return {class, message} for the diagnosis line.

    The decision tree fans out by sort_mode: when the actual sort is
    chronological (the 'all', 'newest', etc. modes), composite_score does not
    decide position so the trust/proximity/tie branches mislead. In those
    modes we point at the chronological sort directly and leave the composite
    factors as informational only.
    """
    quality = float(
        factors.get('quality', factors.get('organiser_quality', 0.0)) or 0.0
    )
    pos = int(factors.get('positive_count', 0) or 0)
    neg = int(factors.get('negative_count', 0) or 0)

    if phase3_injected:
        slot_text = f"slot {phase3_slot_index}" if phase3_slot_index is not None else "the explore slot"
        pool_text = phase3_pool or "explore"
        return {
            'class': 'explore',
            'message': f"Surfaced by the explore bucket ({pool_text} pool) at {slot_text}.",
        }

    if sort_mode == 'chronological':
        # In 'all' / 'newest' / etc. modes the backend sort is just
        # (-is_pinned, -created_at). Pin priority is the only non-temporal
        # factor that can move a card; everything else is informational.
        if pinned_count_in_list > 0 and not is_pinned:
            plural = 's' if pinned_count_in_list != 1 else ''
            return {
                'class': 'pin',
                'message': (
                    f"Pin priority — {pinned_count_in_list} pinned card{plural} "
                    f"sit above all unpinned cards. The rest of the page is sorted by "
                    f"created_at, newest first."
                ),
            }
        return {
            'class': 'chronological',
            'message': (
                f"List is sorted by created_at descending in '{active_filter}' mode — "
                f"composite_score below is informational only and does not decide position."
            ),
        }

    if sort_mode == 'explore_only':
        return {
            'class': 'explore',
            'message': (
                "List is the Phase 3 explore feed — cold-start, under-shown quality, "
                "and stale-recurring picks rotated for discovery. Order is intentional "
                "exposure rotation rather than composite ranking."
            ),
        }

    # sort_mode == 'composite' (the 'nearby' mode) -- ranking factors apply.
    if quality < 0.25:
        return {
            'class': 'trust',
            'message': (
                f"Thin trust signal — this provider has {pos} positive and {neg} negative ratings, "
                f"so the Wilson lower bound caps quality at {quality:.2f}."
            ),
        }
    if distance_km is not None and proximity_factor < 0.85:
        pct = int(round(proximity_factor * 100))
        return {
            'class': 'proximity',
            'message': (
                f"Proximity decay — this card is {distance_km:.1f} km away "
                f"(half-life {half_life_km:.0f} km), scaling its score to {pct}%."
            ),
        }
    if pinned_count_in_list > 0 and not is_pinned:
        plural = 's' if pinned_count_in_list != 1 else ''
        return {
            'class': 'pin',
            'message': (
                f"Pin priority — {pinned_count_in_list} pinned card{plural} "
                f"sit above all organic ranking on this page."
            ),
        }
    if composite_score == 0:
        return {
            'class': 'tie',
            'message': "Score is 0 — final sort fell to the created_at tiebreaker.",
        }
    return {
        'class': 'neutral',
        'message': "Position reflects composite_score rank (no single dominant factor).",
    }


def build_service_debug_payload(
    *,
    service_ids: list[str],
    selected_service_id: str | None,
    request_user: User,
    simulated_user_id: str | None = None,
    search: str = '',
    tag_ids: list[str] | None = None,
    lat: float | None = None,
    lng: float | None = None,
    distance: float | None = None,
    active_filter: str = 'all',
    phase3_injected_id: str | None = None,
    phase3_slot_index: int | None = None,
) -> dict:
    # #371 -- admin-only "simulate as user" override. When provided, the payload
    # is computed from the simulated user's perspective (their social graph,
    # location, and lifetime handshake count). The admin endpoint enforces that
    # only admins can pass this; this function only swaps the viewer.
    if simulated_user_id:
        try:
            request_user = User.objects.get(pk=simulated_user_id)
        except User.DoesNotExist:
            pass
    if not service_ids:
        return {
            'selected_service': None,
            'total_services': 0,
            'active_filter': active_filter,
        }

    tag_ids = tag_ids or []
    selected_id = selected_service_id or service_ids[0]
    order_map = {service_id: index + 1 for index, service_id in enumerate(service_ids)}

    services = (
        Service.objects.select_related('user')
        .prefetch_related('tags')
        .filter(id__in=service_ids)
    )
    services_by_id = {str(service.id): service for service in services}
    selected_service = services_by_id.get(selected_id)
    if selected_service is None:
        selected_service = services_by_id[service_ids[0]]
        selected_id = str(selected_service.id)

    effective_viewer = request_user if request_user.is_authenticated else None
    social_reasons = get_social_proximity_boosts(effective_viewer.id) if effective_viewer else {}
    social_boost = float(social_reasons.get(selected_service.user_id, 0.0))

    positive_stats = ReputationRep.objects.filter(
        receiver=selected_service.user,
        handshake__service__type__in=['Offer', 'Need'],
    )
    positive_count = (
        positive_stats.filter(is_punctual=True).count()
        + positive_stats.filter(is_helpful=True).count()
        + positive_stats.filter(is_kind=True).count()
    )

    negative_stats = NegativeRep.objects.filter(
        receiver=selected_service.user,
        handshake__service__type__in=['Offer', 'Need'],
    )
    negative_count = (
        negative_stats.filter(is_late=True).count()
        + negative_stats.filter(is_unhelpful=True).count()
        + negative_stats.filter(is_rude=True).count()
    )

    comment_count = Comment.objects.filter(service=selected_service, is_deleted=False).count()

    accepted_count = Handshake.objects.filter(
        service=selected_service,
        status__in=['accepted', 'checked_in', 'attended', 'no_show'],
    ).count()
    capacity_ratio = None
    capacity_boost_applied = False
    if selected_service.max_participants > 0 and (
        selected_service.type == 'Event'
        or (selected_service.type == 'Offer' and selected_service.max_participants > 1)
    ):
        capacity_ratio = accepted_count / selected_service.max_participants
        capacity_boost_applied = 0.75 <= capacity_ratio < 1.0

    recomputed_hot_score = calculate_hot_score(selected_service)
    search_score = _compute_search_score(selected_service, search, tag_ids)
    weighted_social_boost = round(social_boost * 0.5, 6)

    half_life_km = float(getattr(settings, 'RANKING_PROXIMITY_HALF_LIFE_KM', 10.0))
    composite_score, proximity_factor, distance_km, _ = _composite_for(
        selected_service,
        viewer_lat=float(lat) if lat is not None else None,
        viewer_lng=float(lng) if lng is not None else None,
        half_life_km=half_life_km,
        social_reasons=social_reasons,
    )

    social_reason = social_reasons.get(selected_service.user_id)
    social_reason_label = 'none'
    if social_reason == 1.0:
        social_reason_label = 'direct network'
    elif social_reason == 0.5:
        social_reason_label = 'second-degree network'

    notes: list[str] = []
    if lat is not None and lng is not None:
        if selected_service.location_type == 'Online':
            notes.append('This card remains visible because the dashboard merges online services into the nearby feed.')
        else:
            notes.append('This in-person card is affected by the active distance and location search state.')
    if active_filter == 'newest':
        notes.append('The dashboard currently applies a client-side newest-first ordering.')
    elif active_filter == 'recurrent':
        notes.append('The dashboard currently filters to recurrent services only.')
    elif active_filter == 'weekend':
        notes.append('The dashboard currently filters to weekend-friendly services only.')
    elif active_filter == 'online':
        notes.append('The dashboard currently filters to online services only.')
    if selected_service.is_pinned:
        notes.append('Pinned services are floated to the top of the dashboard feed.')

    factors = _factor_breakdown(selected_service)
    phase3 = _phase3_trace(selected_service, factors)
    phase3_injected_here = (
        phase3_injected_id is not None
        and str(phase3_injected_id) == str(selected_service.id)
    )
    phase3.update({
        'injected_on_this_request': phase3_injected_here,
        'injected_card_id': str(phase3_injected_id) if phase3_injected_id else None,
        'injected_slot_index': phase3_slot_index if phase3_injected_here else None,
    })
    new_formula_lines = _formula_lines_with_substitutions(factors)

    phase1 = _phase1_trace(
        selected_service,
        active_filter=active_filter,
        distance_km=distance_km,
        search_score=search_score,
    )

    phase2b = {
        'hot_score': round(float(selected_service.hot_score or 0.0), 6),
        'recomputed_hot_score': round(float(recomputed_hot_score), 6),
        'proximity_factor': round(float(proximity_factor), 6),
        'proximity_half_life_km': half_life_km,
        'distance_km': distance_km,
        'social_boost': round(float(social_boost), 6),
        'weighted_social_boost': weighted_social_boost,
        'social_reason': social_reason_label,
        'composite_score': round(float(composite_score), 6),
    }

    neighbours = _neighbours_block(
        services_by_id=services_by_id,
        service_ids=service_ids,
        selected_id=selected_id,
        viewer_lat=float(lat) if lat is not None else None,
        viewer_lng=float(lng) if lng is not None else None,
        half_life_km=half_life_km,
        social_reasons=social_reasons,
    )
    pinned_count_in_list = sum(
        1 for svc in services_by_id.values() if svc.is_pinned
    )
    sort_mode = _sort_mode_for(active_filter)
    if sort_mode == 'composite':
        sort_key_str = '(-is_pinned, -composite_score, -created_at)'
    elif sort_mode == 'explore_only':
        sort_key_str = 'Phase 3 explore rotation (no composite sort)'
    else:
        sort_key_str = '(-is_pinned, -created_at)'
    sort_block = {
        'sort_key': sort_key_str,
        'sort_mode': sort_mode,
        'this_card_key': {
            'is_pinned': bool(selected_service.is_pinned),
            'composite_score': round(float(composite_score), 6),
            'created_at': selected_service.created_at.isoformat(),
        },
        'neighbours': neighbours,
        'pinned_count_in_list': pinned_count_in_list,
    }

    diagnosis = _classify_bottleneck(
        factors=factors,
        composite_score=composite_score,
        proximity_factor=proximity_factor,
        distance_km=distance_km,
        half_life_km=half_life_km,
        is_pinned=bool(selected_service.is_pinned),
        pinned_count_in_list=pinned_count_in_list,
        phase3_injected=phase3_injected_here,
        phase3_pool=phase3.get('pool'),
        phase3_slot_index=phase3_slot_index,
        sort_mode=sort_mode,
        active_filter=active_filter,
    )

    return {
        'active_filter': active_filter,
        'total_services': len(service_ids),
        'selected_service': {
            'id': str(selected_service.id),
            'title': selected_service.title,
            'type': selected_service.type,
            'owner_name': _viewer_label(selected_service.user),
            'location_type': selected_service.location_type,
            'location_area': selected_service.location_area,
            'current_position': order_map.get(str(selected_service.id)),
            'is_pinned': selected_service.is_pinned,
            'stored_hot_score': round(float(selected_service.hot_score or 0.0), 6),
            'recomputed_hot_score': round(float(recomputed_hot_score), 6),
            'search_score': round(float(search_score), 6),
            'social_boost': round(float(social_boost), 6),
            'weighted_social_boost': weighted_social_boost,
            'distance_km': distance_km,
            'participant_count': accepted_count,
            'max_participants': selected_service.max_participants,
            'factors': factors,
            'phase1': phase1,
            'phase2b': phase2b,
            'phase3': phase3,
            'sort': sort_block,
            'diagnosis': diagnosis,
            'breakdown': {
                'positive_count': positive_count,
                'negative_count': negative_count,
                'comment_count': comment_count,
                'capacity_ratio': round(float(capacity_ratio), 4) if capacity_ratio is not None else None,
                'capacity_boost_applied': capacity_boost_applied,
                'social_reason': social_reason_label,
            },
            'formula_lines': new_formula_lines,
            'notes': notes,
            'sankey': _ranking_sankey_from_factors(factors),
        },
    }
