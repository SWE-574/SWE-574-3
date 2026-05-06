"""Tests for proximity as a ranking factor (issue #479).

When the viewer has a known location, services closer to the viewer should
rank higher on the hot feed even when the user has not set an explicit
distance filter. The factor is 1 / (1 + distance_km / half_life_km), so a
service at the viewer's location keeps full score, a service at the half life
distance keeps half its score, and the curve decays smoothly. When the viewer
has no known location the factor is 1.0 and ranking is unchanged.
"""
import pytest
from django.test import override_settings


class TestProximityMultiplier:
    """Pure unit tests for the multiplier helper."""

    def test_zero_distance_returns_one(self):
        from api.ranking import proximity_multiplier

        assert proximity_multiplier(0.0, half_life_km=10.0) == 1.0

    def test_at_half_life_returns_one_half(self):
        from api.ranking import proximity_multiplier

        assert proximity_multiplier(10.0, half_life_km=10.0) == pytest.approx(0.5)

    def test_at_three_half_lives_returns_one_quarter(self):
        from api.ranking import proximity_multiplier

        assert proximity_multiplier(30.0, half_life_km=10.0) == pytest.approx(0.25)

    def test_none_distance_returns_one(self):
        from api.ranking import proximity_multiplier

        assert proximity_multiplier(None, half_life_km=10.0) == 1.0

    def test_negative_distance_clamps_to_one(self):
        from api.ranking import proximity_multiplier

        # Defensive: negative distances should not produce > 1.0 multipliers.
        assert proximity_multiplier(-5.0, half_life_km=10.0) == 1.0

    def test_invalid_half_life_returns_one(self):
        from api.ranking import proximity_multiplier

        assert proximity_multiplier(10.0, half_life_km=0.0) == 1.0
        assert proximity_multiplier(10.0, half_life_km=-1.0) == 1.0


@pytest.mark.django_db
@pytest.mark.unit
class TestProximityComposite:
    """Verify the composite score annotation built by the hot sort path
    in ServiceViewSet ranks closer services ahead of farther ones when
    base hot scores are equal."""

    def _make_authenticated_request(self, user, params):
        from rest_framework.request import Request
        from rest_framework.test import APIRequestFactory

        factory = APIRequestFactory()
        django_request = factory.get('/api/services/', params)
        request = Request(django_request)
        request.user = user
        return request

    def _make_service_with(self, owner, lat, lng, hot_score):
        from decimal import Decimal as Dec
        from api.models import Service
        from api.tests.helpers.factories import ServiceFactory

        svc = ServiceFactory(
            user=owner, type='Offer', status='Active',
            location_lat=Dec(str(lat)), location_lng=Dec(str(lng)),
        )
        Service.objects.filter(pk=svc.id).update(hot_score=hot_score)
        svc.refresh_from_db()
        return svc

    def test_closer_service_outranks_equally_hot_farther_service(self):
        from datetime import timedelta
        from django.utils import timezone

        from api.tests.helpers.factories import UserFactory
        from api.views import ServiceViewSet

        viewer = UserFactory(date_joined=timezone.now() - timedelta(days=200))
        owner = UserFactory(date_joined=timezone.now() - timedelta(days=200))

        # Both services within the LocationStrategy filter radius (20km),
        # both with the same stored hot_score. Proximity should break the tie.
        near = self._make_service_with(owner, lat=0.001, lng=0.0, hot_score=5.0)
        far = self._make_service_with(owner, lat=0.05, lng=0.0, hot_score=5.0)

        request = self._make_authenticated_request(
            viewer,
            {'sort': 'hot', 'lat': '0.0', 'lng': '0.0', 'distance': '20'},
        )
        viewset = ServiceViewSet()
        viewset.action = 'list'
        viewset.request = request
        with override_settings(RANKING_PROXIMITY_HALF_LIFE_KM=10.0):
            qs = viewset.get_queryset()
            ordered_ids = list(qs.values_list('id', flat=True))

        assert near.id in ordered_ids
        assert far.id in ordered_ids
        assert ordered_ids.index(near.id) < ordered_ids.index(far.id), (
            'Closer service should outrank an equally hot farther service'
        )

    def test_no_viewer_location_preserves_hot_score_ordering(self):
        from datetime import timedelta
        from django.utils import timezone

        from api.tests.helpers.factories import UserFactory
        from api.views import ServiceViewSet

        viewer = UserFactory(date_joined=timezone.now() - timedelta(days=200))
        owner = UserFactory(date_joined=timezone.now() - timedelta(days=200))

        higher = self._make_service_with(owner, lat=0.0, lng=0.0, hot_score=5.0)
        lower = self._make_service_with(owner, lat=0.0, lng=0.0, hot_score=1.0)

        request = self._make_authenticated_request(viewer, {'sort': 'hot'})
        viewset = ServiceViewSet()
        viewset.action = 'list'
        viewset.request = request
        with override_settings(RANKING_PROXIMITY_HALF_LIFE_KM=10.0):
            qs = viewset.get_queryset()
            ordered_ids = list(qs.values_list('id', flat=True))

        assert ordered_ids.index(higher.id) < ordered_ids.index(lower.id)
