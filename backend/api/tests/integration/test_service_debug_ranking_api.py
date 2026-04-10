import pytest
from rest_framework.test import APIClient

from api.models import PlatformSetting
from api.tests.helpers.factories import AdminUserFactory, ServiceFactory, UserFactory


@pytest.mark.django_db
@pytest.mark.integration
class TestServiceDebugRankingApi:
    def test_admin_can_update_global_debug_setting_and_availability_endpoint_reflects_it(self):
        admin = AdminUserFactory()
        member = UserFactory()

        client = APIClient()
        client.force_authenticate(user=admin)

        response = client.patch('/api/admin/settings/', {
            'ranking_debug_enabled': True,
        }, format='json')

        assert response.status_code == 200
        assert response.json()['ranking_debug_enabled'] is True

        member_client = APIClient()
        member_client.force_authenticate(user=member)
        availability = member_client.get('/api/services/debug-ranking-availability/')

        assert availability.status_code == 200
        assert availability.json() == {'enabled': True}

    def test_debug_ranking_returns_backend_breakdown_for_selected_service(self):
        viewer = UserFactory()
        owner = UserFactory()
        PlatformSetting.objects.update_or_create(pk=1, defaults={'ranking_debug_enabled': True})
        service = ServiceFactory(
            user=owner,
            status='Active',
            title='React mentoring',
            description='Pair programming and React help',
            location_type='Online',
        )

        client = APIClient()
        client.force_authenticate(user=viewer)

        response = client.post('/api/services/debug-ranking/', {
            'service_ids': [str(service.id)],
            'selected_service_id': str(service.id),
            'search': 'React',
            'active_filter': 'all',
        }, format='json')

        assert response.status_code == 200
        payload = response.json()
        assert payload['total_services'] == 1
        assert payload['selected_service']['id'] == str(service.id)
        assert payload['selected_service']['title'] == 'React mentoring'
        assert payload['selected_service']['search_score'] > 0
        assert payload['selected_service']['sankey']['nodes']
        assert payload['selected_service']['sankey']['links']

    def test_debug_ranking_rejects_requests_when_feature_is_disabled(self):
        viewer = UserFactory()
        owner = UserFactory()
        service = ServiceFactory(user=owner, status='Active')

        client = APIClient()
        client.force_authenticate(user=viewer)

        response = client.post('/api/services/debug-ranking/', {
            'service_ids': [str(service.id)],
            'selected_service_id': str(service.id),
        }, format='json')

        assert response.status_code == 403
