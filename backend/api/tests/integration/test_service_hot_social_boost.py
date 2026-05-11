"""Integration tests for social-proximity boost in hot service sorting."""

from decimal import Decimal

import pytest

from api.models import Service, UserFollow
from api.tests.helpers.factories import ServiceFactory, UserFactory
from api.tests.helpers.test_client import AuthenticatedAPIClient
from api.tests.helpers.assertions import assert_api_response, assert_problem_detail


@pytest.mark.django_db
@pytest.mark.integration
class TestServiceHotSocialBoost:
    """Verify authenticated hot-sort ranking includes social proximity boost."""

    def _service_ids_in_order(self, response_data):
        results = response_data.get('results', response_data)
        ours = [item for item in results if item['title'].startswith('[SPB]')]
        return [item['id'] for item in ours]

    def test_authenticated_user_gets_direct_social_boost_in_hot_sort(self):
        viewer = UserFactory()
        connected_owner = UserFactory()
        disconnected_owner = UserFactory()

        connected_service = ServiceFactory(
            user=connected_owner,
            type='Offer',
            schedule_type='One-Time',
            max_participants=1,
            title='[SPB] Directly Connected Owner',
            duration=Decimal('1.00'),
            location_type='Online',
            status='Active',
        )
        disconnected_service = ServiceFactory(
            user=disconnected_owner,
            type='Offer',
            schedule_type='One-Time',
            max_participants=1,
            title='[SPB] Disconnected Owner',
            duration=Decimal('1.00'),
            location_type='Online',
            status='Active',
        )

        # Base hot score is lower for connected owner; social boost should move it ahead.
        Service.objects.filter(pk=connected_service.pk).update(hot_score=9.7)
        Service.objects.filter(pk=disconnected_service.pk).update(hot_score=10.0)

        UserFollow.objects.create(follower=viewer, following=connected_owner)

        client = AuthenticatedAPIClient().authenticate_user(viewer)
        response = client.get('/api/services/?sort=hot&search=[SPB]')

        assert_api_response(response, 200)
        ordered_ids = self._service_ids_in_order(response.data)
        assert str(connected_service.id) == ordered_ids[0]
        assert str(disconnected_service.id) == ordered_ids[1]

    def test_authenticated_user_gets_second_degree_social_boost_in_hot_sort(self):
        viewer = UserFactory()
        bridge = UserFactory()
        second_degree_owner = UserFactory()
        disconnected_owner = UserFactory()

        second_degree_service = ServiceFactory(
            user=second_degree_owner,
            type='Offer',
            schedule_type='One-Time',
            max_participants=1,
            title='[SPB] Second Degree Owner',
            duration=Decimal('1.00'),
            location_type='Online',
            status='Active',
        )
        disconnected_service = ServiceFactory(
            user=disconnected_owner,
            type='Offer',
            schedule_type='One-Time',
            max_participants=1,
            title='[SPB] Disconnected Owner Two',
            duration=Decimal('1.00'),
            location_type='Online',
            status='Active',
        )

        # Second-degree boost is 0.25 in composite score (0.5 * 0.5).
        Service.objects.filter(pk=second_degree_service.pk).update(hot_score=9.8)
        Service.objects.filter(pk=disconnected_service.pk).update(hot_score=10.0)

        UserFollow.objects.create(follower=viewer, following=bridge)
        UserFollow.objects.create(follower=bridge, following=second_degree_owner)

        client = AuthenticatedAPIClient().authenticate_user(viewer)
        response = client.get('/api/services/?sort=hot&search=[SPB]')

        assert_api_response(response, 200)
        ordered_ids = self._service_ids_in_order(response.data)
        assert str(second_degree_service.id) == ordered_ids[0]
        assert str(disconnected_service.id) == ordered_ids[1]


@pytest.mark.django_db
@pytest.mark.integration
class TestServiceHotProximityWithOnline:
    """Online services must rank by hot_score alone when proximity is active.

    Regression: the Phase 2 ranking annotates `distance = Distance(location,
    viewer_point)`, which is NULL for Online services because they have no
    `location` PointField. The proximity expression `1.0 / (1.0 + distance /
    half_life)` then evaluates to NULL, propagates into `composite_score`,
    and Postgres' default for `ORDER BY composite_score DESC` is NULLS
    FIRST -- so every Online service piled to the top of every
    location-aware feed regardless of its hot_score. Treat NULL distance as
    a neutral 0 m so Online services compete on hot_score with the closest
    in-person rows instead of jumping the queue.
    """

    def _service_ids_in_order(self, response_data):
        results = response_data.get('results', response_data)
        ours = [item for item in results if item['title'].startswith('[HPO]')]
        return [item['id'] for item in ours]

    def test_low_score_online_does_not_outrank_high_score_inperson_under_location(self):
        viewer = UserFactory()

        # Online row with the lowest hot_score in the matched set. Pre-fix it
        # still landed at the top because its NULL composite_score sorted
        # before any concrete float in `ORDER BY ... DESC NULLS FIRST`.
        online_low = ServiceFactory(
            user=UserFactory(),
            type='Offer',
            schedule_type='One-Time',
            max_participants=1,
            title='[HPO] Online Low Score',
            duration=Decimal('1.00'),
            location_type='Online',
            location_lat=None,
            location_lng=None,
            status='Active',
        )
        # In-Person row sitting right at the viewer's location with a
        # clearly higher hot_score. With Online treated neutrally this row
        # must sort first.
        in_person_high = ServiceFactory(
            user=UserFactory(),
            type='Offer',
            schedule_type='One-Time',
            max_participants=1,
            title='[HPO] In-Person High Score Nearby',
            duration=Decimal('1.00'),
            location_type='In-Person',
            location_lat=Decimal('41.0082'),
            location_lng=Decimal('29.0500'),
            status='Active',
        )

        Service.objects.filter(pk=online_low.pk).update(hot_score=1.0)
        Service.objects.filter(pk=in_person_high.pk).update(hot_score=10.0)

        client = AuthenticatedAPIClient().authenticate_user(viewer)
        response = client.get(
            '/api/services/?sort=hot&search=[HPO]&lat=41.0082&lng=29.0500'
        )

        assert_api_response(response, 200)
        ordered_ids = self._service_ids_in_order(response.data)
        assert str(in_person_high.id) == ordered_ids[0], (
            'High-score in-person row at the viewer location must outrank a '
            'low-score Online row when proximity is active. Pre-fix the '
            'Online row landed first because NULL composite_score sorted '
            'before all floats.'
        )
        assert str(online_low.id) == ordered_ids[1]
