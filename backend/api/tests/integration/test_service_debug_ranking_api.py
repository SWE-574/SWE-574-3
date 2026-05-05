import pytest
from rest_framework.test import APIClient

from api.models import PlatformSetting
from api.tests.helpers.factories import AdminUserFactory, ServiceFactory, UserFactory


@pytest.mark.django_db
@pytest.mark.integration
class TestServiceDebugRankingApi:
    def test_admin_can_update_global_debug_setting_and_availability_endpoint_reflects_it(self):
        # Per #371 the availability endpoint is admin-only too -- a member can no
        # longer query it. The admin sets the flag and the same admin reads it back.
        admin = AdminUserFactory()

        client = APIClient()
        client.force_authenticate(user=admin)

        response = client.patch('/api/admin/settings/', {
            'ranking_debug_enabled': True,
        }, format='json')

        assert response.status_code == 200
        assert response.json()['ranking_debug_enabled'] is True

        availability = client.get('/api/services/debug-ranking-availability/')

        assert availability.status_code == 200
        assert availability.json() == {'enabled': True}

    def test_debug_ranking_returns_backend_breakdown_for_selected_service(self):
        admin = AdminUserFactory()
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
        client.force_authenticate(user=admin)

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
        # #371 -- admin frontend uses this header to throttle hover-triggered calls.
        assert response['X-Ranking-Debug-Debounce'] == '300'

    def test_debug_ranking_rejects_requests_when_feature_is_disabled(self):
        admin = AdminUserFactory()
        owner = UserFactory()
        service = ServiceFactory(user=owner, status='Active')
        # Feature disabled (default) -- admin still gets 403 for THIS reason.
        PlatformSetting.objects.update_or_create(pk=1, defaults={'ranking_debug_enabled': False})

        client = APIClient()
        client.force_authenticate(user=admin)

        response = client.post('/api/services/debug-ranking/', {
            'service_ids': [str(service.id)],
            'selected_service_id': str(service.id),
        }, format='json')

        assert response.status_code == 403


@pytest.mark.django_db
@pytest.mark.integration
class TestDebugPanelAdminOnly:
    """#371 -- debug endpoints must reject non-admin users before any business logic."""

    def test_non_admin_get_availability_is_forbidden(self):
        member = UserFactory()
        client = APIClient()
        client.force_authenticate(user=member)
        resp = client.get('/api/services/debug-ranking-availability/')
        assert resp.status_code == 403

    def test_non_admin_post_debug_ranking_is_forbidden(self):
        member = UserFactory()
        client = APIClient()
        client.force_authenticate(user=member)
        resp = client.post('/api/services/debug-ranking/', {'service_ids': []}, format='json')
        assert resp.status_code == 403

    def test_admin_can_simulate_as_other_user(self):
        admin = AdminUserFactory()
        target = UserFactory()
        owner = UserFactory()
        PlatformSetting.objects.update_or_create(pk=1, defaults={'ranking_debug_enabled': True})
        service = ServiceFactory(user=owner, status='Active', title='Mentoring')

        client = APIClient()
        client.force_authenticate(user=admin)

        resp = client.post('/api/services/debug-ranking/', {
            'service_ids': [str(service.id)],
            'selected_service_id': str(service.id),
            'simulated_user_id': str(target.id),
        }, format='json')

        assert resp.status_code == 200
        # Payload should still describe the same service, just from `target`'s
        # perspective (different social_boost / proximity numbers).
        assert resp.json()['selected_service']['id'] == str(service.id)
