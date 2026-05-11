"""Featured content endpoint for mobile feed highlights."""
from __future__ import annotations

from datetime import timedelta

from django.core.cache import cache
from django.db.models import Count, Q
from django.utils import timezone
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.authentication import JWTAuthentication

from drf_spectacular.utils import extend_schema, extend_schema_view

from api.authentication import CookieJWTAuthentication
from api.models import Handshake, SavedService, Service, Tag, User, UserFollow
from api.ranking import calculate_hot_scores_batch

TRENDING_WINDOW_DAYS = 30
CACHE_TTL_SHARED = 120
CACHE_TTL_PER_USER = 120
CACHE_TTL_PUBLIC = 300  # Public landing page can tolerate stale data

CONFIRMED_STATUSES = ['accepted', 'completed', 'checked_in', 'attended']
CHIPS_LIMIT = 12
CHIPS_CACHE_TTL_PER_USER = 600  # 10 minutes
CHIPS_CACHE_TTL_GLOBAL = 1800   # 30 minutes (anonymous fallback rarely changes)


def _serialize_service(service, extra=None):
    """Inline dict serialization for a Service instance."""
    data = {
        "id": str(service.id),
        "title": service.title,
        "type": service.type,
        "user": {
            "id": str(service.user.id),
            "first_name": service.user.first_name,
            "last_name": service.user.last_name,
            "avatar_url": getattr(service.user, 'avatar_url', None)
            if hasattr(service.user, 'avatar_url')
            else None,
        },
        "tags": [{"id": tag.id, "name": tag.name} for tag in service.tags.all()],
        "participant_count": getattr(service, '_participant_count', 0),
        "max_participants": service.max_participants,
        "location_area": service.location_area,
        "created_at": service.created_at.isoformat(),
    }
    if extra:
        data.update(extra)
    return data


@extend_schema_view(
    get=extend_schema(
        tags=['Featured'],
        summary='Featured services',
        description='Authenticated featured surface: trending services, top providers, and personalised highlights.',
    ),
)
class FeaturedView(APIView):
    authentication_classes = [CookieJWTAuthentication, JWTAuthentication]
    permission_classes = [IsAuthenticated]

    def get(self, request):
        trending = cache.get('featured:trending')
        if trending is None:
            trending = self._get_trending()
            cache.set('featured:trending', trending, CACHE_TTL_SHARED)

        user_id = str(request.user.id)
        friends_key = f'featured:friends:{user_id}'
        friends = cache.get(friends_key)
        if friends is None:
            friends = self._get_friends(request.user)
            cache.set(friends_key, friends, CACHE_TTL_PER_USER)

        top_providers = cache.get('featured:top_providers')
        if top_providers is None:
            top_providers = self._get_top_providers()
            cache.set('featured:top_providers', top_providers, CACHE_TTL_SHARED)

        return Response({
            "trending": trending,
            "friends": friends,
            "top_providers": top_providers,
        })

    # ------------------------------------------------------------------
    # Trending
    # ------------------------------------------------------------------
    def _get_trending(self):
        window_start = timezone.now() - timedelta(days=TRENDING_WINDOW_DAYS)
        services = (
            Service.objects.filter(
                status='Active',
                is_visible=True,
                created_at__gte=window_start,
            )
            .select_related('user')
            .prefetch_related('tags')
            .annotate(
                _participant_count=Count(
                    'handshakes',
                    filter=Q(handshakes__status__in=CONFIRMED_STATUSES),
                ),
            )
        )
        service_list = list(services)
        if not service_list:
            return []

        scores = calculate_hot_scores_batch(service_list)
        service_list.sort(key=lambda s: scores.get(s.id, 0), reverse=True)
        top = service_list[:10]
        return [_serialize_service(s) for s in top]

    # ------------------------------------------------------------------
    # Friends activity
    # ------------------------------------------------------------------
    def _get_friends(self, user):
        friend_ids = list(
            UserFollow.objects.filter(follower=user)
            .values_list('following_id', flat=True)
        )
        if not friend_ids:
            return []

        # Events get more handshakes per service (one per RSVP) than 1:1
        # services, so a single friend-attended event used to drown out
        # offers and needs that friends own. Cap events to FRIENDS_EVENT_CAP
        # so the tab keeps offer/need variety even when the social graph
        # mostly RSVPs together.
        base_qs = (
            Service.objects.filter(
                status='Active',
                is_visible=True,
                handshakes__requester_id__in=friend_ids,
                handshakes__status__in=CONFIRMED_STATUSES,
            )
            .exclude(user=user)
            .select_related('user')
            .prefetch_related('tags')
            .annotate(
                _participant_count=Count(
                    'handshakes',
                    filter=Q(handshakes__status__in=CONFIRMED_STATUSES),
                ),
                friend_count=Count(
                    'handshakes__requester',
                    filter=Q(
                        handshakes__requester_id__in=friend_ids,
                        handshakes__status__in=CONFIRMED_STATUSES,
                    ),
                    distinct=True,
                ),
            )
        )
        FRIENDS_LIMIT = 10
        FRIENDS_EVENT_CAP = 3
        events = list(base_qs.filter(type='Event').order_by('-friend_count')[:FRIENDS_EVENT_CAP])
        non_events = list(
            base_qs.exclude(type='Event').order_by('-friend_count')[:FRIENDS_LIMIT]
        )
        # Merge and re-sort by friend_count so the strongest signal still
        # leads, then trim to the overall limit.
        service_qs = sorted(
            events + non_events,
            key=lambda s: s.friend_count,
            reverse=True,
        )[:FRIENDS_LIMIT]

        service_ids = [s.id for s in service_qs]
        friend_name_map: dict[str, list[str]] = {}
        if service_ids:
            hs_qs = (
                Handshake.objects.filter(
                    service_id__in=service_ids,
                    requester_id__in=friend_ids,
                    status__in=CONFIRMED_STATUSES,
                )
                .select_related('requester')
                .values_list('service_id', 'requester__first_name', 'requester__last_name')
                .distinct()
            )
            for sid, first, last in hs_qs:
                key = str(sid)
                name = f"{first} {last[0]}." if last else first
                friend_name_map.setdefault(key, []).append(name)

        results = []
        for s in service_qs:
            names = friend_name_map.get(str(s.id), [])
            results.append(_serialize_service(s, extra={
                "friend_count": s.friend_count,
                "friend_names": names,
            }))
        return results

    # ------------------------------------------------------------------
    # Top providers (last 7 days)
    # ------------------------------------------------------------------
    def _get_top_providers(self):
        seven_days_ago = timezone.now() - timedelta(days=7)

        providers = (
            User.objects.filter(
                received_reps__created_at__gte=seven_days_ago,
            )
            .annotate(
                positive_count=Count(
                    'received_reps',
                    filter=Q(
                        received_reps__created_at__gte=seven_days_ago,
                    ) & (
                        Q(received_reps__is_punctual=True)
                        | Q(received_reps__is_helpful=True)
                        | Q(received_reps__is_kind=True)
                    ),
                    distinct=True,
                ),
                completed_count=Count(
                    'services__handshakes',
                    filter=Q(services__handshakes__status='completed'),
                    distinct=True,
                ),
            )
            .filter(positive_count__gt=0)
            .order_by('-positive_count')[:10]
        )

        return [
            {
                "id": str(u.id),
                "first_name": u.first_name,
                "last_name": u.last_name,
                "avatar_url": getattr(u, 'avatar_url', None),
                "completed_count": u.completed_count,
                "positive_rep_count": u.positive_count,
            }
            for u in providers
        ]


@extend_schema_view(
    get=extend_schema(
        tags=['Featured'],
        summary='Featured discovery chips',
        description='Compact category chips used by the discovery surface.',
    ),
)
class FeaturedChipsView(APIView):
    """YouTube-style filter chip strip above the Browse feed.

    Authenticated viewer: top tags from interaction history -- declared
    skills, completed handshake counterparts, and saved services -- ranked
    by frequency. Anonymous fallback: top tags by service count from the
    active catalog.

    Returns up to CHIPS_LIMIT chips, each {qid, label, count}. Cached per
    user (or globally for anonymous) so the request stays cheap when the
    chip strip rerenders on every browse navigation.
    """

    authentication_classes = [CookieJWTAuthentication, JWTAuthentication]
    permission_classes = [AllowAny]

    def get(self, request):
        viewer = request.user if getattr(request.user, 'is_authenticated', False) else None
        if viewer is None:
            cached = cache.get('featured:chips:anonymous')
            if cached is None:
                cached = self._global_chips()
                cache.set('featured:chips:anonymous', cached, CHIPS_CACHE_TTL_GLOBAL)
            return Response({'chips': cached})

        cache_key = f'featured:chips:{viewer.id}'
        cached = cache.get(cache_key)
        if cached is None:
            cached = self._user_chips(viewer)
            cache.set(cache_key, cached, CHIPS_CACHE_TTL_PER_USER)
        return Response({'chips': cached})

    def _user_chips(self, viewer):
        # Aggregate tag-qid frequency across the viewer's three signal sources:
        # explicit skills, handshake history, and saved services. Each unique
        # tag occurrence on a related Service counts once.
        skill_qids = list(viewer.skills.values_list('id', flat=True))
        handshake_service_ids = list(
            Handshake.objects.filter(
                requester_id=viewer.id, status='completed',
            ).values_list('service_id', flat=True)
        )
        saved_service_ids = list(
            SavedService.objects.filter(user_id=viewer.id)
            .values_list('service_id', flat=True)
        )
        related_service_ids = list(set(handshake_service_ids + saved_service_ids))

        counts: dict[str, int] = {qid: 1 for qid in skill_qids if qid}
        if related_service_ids:
            rows = (
                Tag.objects.filter(service__id__in=related_service_ids)
                .values('id')
                .annotate(c=Count('service', distinct=True))
            )
            for row in rows:
                tid = row['id']
                if tid:
                    counts[tid] = counts.get(tid, 0) + row['c']

        if not counts:
            return self._global_chips()

        top_qids = sorted(counts.items(), key=lambda kv: -kv[1])[:CHIPS_LIMIT]
        qid_to_count = {qid: c for qid, c in top_qids}
        labels = dict(
            Tag.objects.filter(id__in=qid_to_count.keys()).values_list('id', 'name')
        )
        chips = [
            {'qid': qid, 'label': labels.get(qid, qid), 'count': qid_to_count[qid]}
            for qid in qid_to_count
            if labels.get(qid)
        ]
        chips.sort(key=lambda c: -c['count'])
        return chips

    def _global_chips(self):
        # Top tags by count of services that carry them in the active catalog.
        rows = (
            Tag.objects.filter(
                service__status='Active', service__is_visible=True,
            )
            .values('id', 'name')
            .annotate(c=Count('service', distinct=True))
            .order_by('-c')[:CHIPS_LIMIT]
        )
        return [
            {'qid': row['id'], 'label': row['name'], 'count': row['c']}
            for row in rows
            if row['name']
        ]


@extend_schema_view(
    get=extend_schema(
        tags=['Featured'],
        summary='Public featured services (deprecated)',
        description='Deprecated pre-auth landing variant. Use `GET /api/featured/` (authenticated) instead.',
        deprecated=True,
    ),
)
class PublicFeaturedView(APIView):
    """Anonymous-safe subset of FeaturedView for the public landing page (#457).

    Returns only the cohort-shared sections (trending services, top providers).
    Friends-of-friends data is intentionally omitted because it is per-user
    and would leak signal about who is logged in. Cached longer than the
    authenticated variant (5 min) since this drives an unauthenticated page
    that benefits from any safe staleness.
    """

    authentication_classes = []
    permission_classes = [AllowAny]

    def get(self, request):
        trending = cache.get('featured:public:trending')
        if trending is None:
            trending = FeaturedView()._get_trending()
            cache.set('featured:public:trending', trending, CACHE_TTL_PUBLIC)

        top_providers = cache.get('featured:public:top_providers')
        if top_providers is None:
            top_providers = FeaturedView()._get_top_providers()
            cache.set('featured:public:top_providers', top_providers, CACHE_TTL_PUBLIC)

        return Response({
            "trending": trending,
            "top_providers": top_providers,
        })
