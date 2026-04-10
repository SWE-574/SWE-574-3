from __future__ import annotations

from math import asin, cos, pi, sin, sqrt
from django.utils import timezone

from .models import Comment, Handshake, NegativeRep, ReputationRep, Service, User
from .ranking import calculate_hot_score
from .services import get_social_proximity_boosts


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
    search: str = '',
    tag_ids: list[str] | None = None,
    lat: float | None = None,
    lng: float | None = None,
    distance: float | None = None,
    active_filter: str = 'all',
) -> dict:
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
            'formula_lines': [
                f'P = {positive_count}',
                f'N = {negative_count}',
                f'C = {comment_count}',
                f'T = {age_hours:.2f}h',
                f'raw_hot = ({numerator}) / ({denominator:.4f})',
                f'recomputed_hot = {float(recomputed_hot_score):.6f}',
                f'search_score = {float(search_score):.6f}',
                f'weighted_social = {weighted_social_boost:.6f}',
            ],
            'notes': notes,
            'sankey': {
                'nodes': sankey_nodes,
                'links': sankey_links,
            },
        },
    }
