"""Integration tests for social-proximity boost in hot service sorting."""

from decimal import Decimal

import pytest

from api.models import Service, UserFollow
from api.tests.helpers.factories import ServiceFactory, UserFactory
from api.tests.helpers.test_client import AuthenticatedAPIClient


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

        assert response.status_code == 200
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

        assert response.status_code == 200
        ordered_ids = self._service_ids_in_order(response.data)
        assert str(second_degree_service.id) == ordered_ids[0]
        assert str(disconnected_service.id) == ordered_ids[1]
