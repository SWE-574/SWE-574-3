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

from api.authentication import CookieJWTAuthentication
from api.models import Handshake, Service, User, UserFollow
from api.ranking import calculate_hot_scores_batch

TRENDING_WINDOW_DAYS = 30
CACHE_TTL_SHARED = 120
CACHE_TTL_PER_USER = 120
CACHE_TTL_PUBLIC = 300  # Public landing page can tolerate stale data

CONFIRMED_STATUSES = ['accepted', 'completed', 'checked_in', 'attended']


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

        service_qs = (
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
            .order_by('-friend_count')[:10]
        )

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
