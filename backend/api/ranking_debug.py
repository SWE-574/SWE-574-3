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


def _formula_lines_with_substitutions(factors: dict) -> list[str]:
    """Render the ranking formulas with the actual numeric values so the
    debug panel reads as 'Wilson(1, 1) = 0.21' rather than the algebraic
    template only."""
    if factors['kind'] == 'event':
        return [
            f"velocity = log2(2 + {factors['rsvps_last_7d']}) = {factors['velocity']:.4f}",
            f"organiser_quality (Wilson) = Wilson({factors['positive_count']}, {factors['positive_count'] + factors['negative_count']}) = {factors['organiser_quality']:.4f}",
            f"capacity_multiplier = {factors['capacity_multiplier']:.2f}",
            f"newcomer_boost = {factors['newcomer_boost']:.2f}",
            f"final = velocity * organiser_quality * capacity * newcomer = {factors['final_score']:.6f}",
        ]
    return [
        f"quality (Wilson) = Wilson({factors['positive_count']}, {factors['positive_count'] + factors['negative_count']}) = {factors['quality']:.4f}",
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
    age_hours = max((timezone.now() - selected_service.created_at).total_seconds() / 3600, 0)
    numerator = positive_count - negative_count + comment_count
    denominator = max(age_hours + 2, 0) ** 1.5
    raw_hot_score = 0.0 if denominator == 0 else numerator / denominator

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

    distance_km = None
    if lat is not None and lng is not None and selected_service.location_lat is not None and selected_service.location_lng is not None:
        distance_km = round(
            _haversine_km(
                float(lat),
                float(lng),
                float(selected_service.location_lat),
                float(selected_service.location_lng),
            ),
            4,
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

    sankey_nodes = [
        {'id': 'positive', 'label': 'Positive rep', 'tone': 'positive'},
        {'id': 'comments', 'label': 'Comments', 'tone': 'positive'},
        {'id': 'negative', 'label': 'Negative rep', 'tone': 'negative'},
        {'id': 'age', 'label': 'Age dampener', 'tone': 'negative'},
        {'id': 'capacity', 'label': 'Capacity boost', 'tone': 'positive' if capacity_boost_applied else 'neutral'},
        {'id': 'search', 'label': 'Search score', 'tone': 'positive' if search_score > 0 else 'neutral'},
        {'id': 'social', 'label': 'Social boost', 'tone': 'positive' if social_boost > 0 else 'neutral'},
        {'id': 'distance', 'label': 'Distance context', 'tone': 'neutral'},
        {'id': 'pin', 'label': 'Pin priority', 'tone': 'positive' if selected_service.is_pinned else 'neutral'},
        {'id': 'hot', 'label': 'Hot score', 'tone': 'neutral'},
        {'id': 'card', 'label': 'Current feed card', 'tone': 'neutral'},
    ]
    sankey_links = [
        {'source': 'positive', 'target': 'hot', 'value': max(float(positive_count), 0.01), 'tone': 'positive'},
        {'source': 'comments', 'target': 'hot', 'value': max(float(comment_count), 0.01), 'tone': 'positive'},
        {'source': 'negative', 'target': 'hot', 'value': max(float(negative_count), 0.01), 'tone': 'negative'},
        {'source': 'age', 'target': 'hot', 'value': max(float(denominator), 0.01), 'tone': 'negative'},
        {'source': 'capacity', 'target': 'hot', 'value': max(abs(recomputed_hot_score - raw_hot_score), 0.01), 'tone': 'positive' if capacity_boost_applied else 'neutral'},
        {'source': 'hot', 'target': 'card', 'value': max(abs(float(recomputed_hot_score)), 0.01), 'tone': 'neutral'},
        {'source': 'search', 'target': 'card', 'value': max(abs(float(search_score)), 0.01), 'tone': 'positive' if search_score > 0 else 'neutral'},
        {'source': 'social', 'target': 'card', 'value': max(abs(float(weighted_social_boost)), 0.01), 'tone': 'positive' if social_boost > 0 else 'neutral'},
        {'source': 'distance', 'target': 'card', 'value': max(abs(float(distance_km or 0.01)), 0.01), 'tone': 'neutral'},
        {'source': 'pin', 'target': 'card', 'value': 1.0 if selected_service.is_pinned else 0.01, 'tone': 'positive' if selected_service.is_pinned else 'neutral'},
    ]

    factors = _factor_breakdown(selected_service)
    phase3 = _phase3_trace(selected_service, factors)
    new_formula_lines = _formula_lines_with_substitutions(factors)

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
            'phase3': phase3,
            'breakdown': {
                'positive_count': positive_count,
                'negative_count': negative_count,
                'comment_count': comment_count,
                'numerator': numerator,
                'age_hours': round(float(age_hours), 4),
                'denominator': round(float(denominator), 6),
                'raw_hot_score': round(float(raw_hot_score), 6),
                'capacity_ratio': round(float(capacity_ratio), 4) if capacity_ratio is not None else None,
                'capacity_boost_applied': capacity_boost_applied,
                'social_reason': social_reason_label,
            },
            'formula_lines': new_formula_lines,
            'notes': notes,
            'sankey': {
                'nodes': sankey_nodes,
                'links': sankey_links,
            },
        },
    }
