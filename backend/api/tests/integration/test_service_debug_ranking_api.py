import pytest
from rest_framework.test import APIClient

from api.tests.helpers.factories import ServiceFactory, UserFactory


@pytest.mark.django_db
@pytest.mark.integration
class TestServiceDebugRankingApi:
    def test_debug_ranking_returns_backend_breakdown_for_selected_service(self):
        viewer = UserFactory()
        owner = UserFactory()
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
