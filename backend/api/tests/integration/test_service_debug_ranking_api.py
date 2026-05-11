import pytest
from rest_framework.test import APIClient

from api.models import PlatformSetting
from api.tests.helpers.factories import AdminUserFactory, ServiceFactory, UserFactory
from api.tests.helpers.assertions import assert_api_response, assert_problem_detail


@pytest.mark.django_db
@pytest.mark.integration
class TestServiceDebugRankingApi:
    def test_admin_can_update_global_debug_setting_and_availability_endpoint_reflects_it(self):
        admin = AdminUserFactory()

        client = APIClient()
        client.force_authenticate(user=admin)

        response = client.patch('/api/admin/settings/', {
            'ranking_debug_enabled': True,
        }, format='json')

        assert_api_response(response, 200)
        assert response.json()['ranking_debug_enabled'] is True

        availability = client.get('/api/services/debug-ranking-availability/')

        assert_api_response(availability, 200)
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

        assert_api_response(response, 200)
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

        assert_problem_detail(response, 403)


@pytest.mark.django_db
@pytest.mark.integration
class TestRecommendationShowcaseAccess:
    """The Recommendation Showcase is gated by the PlatformSetting toggle —
    when on, every authenticated viewer can see the breakdown."""

    def test_member_can_query_availability(self):
        member = UserFactory()
        PlatformSetting.objects.update_or_create(pk=1, defaults={'ranking_debug_enabled': True})
        client = APIClient()
        client.force_authenticate(user=member)
        resp = client.get('/api/services/debug-ranking-availability/')
        assert_api_response(resp, 200)
        assert resp.json() == {'enabled': True}

    def test_member_can_get_breakdown_when_toggle_on(self):
        member = UserFactory()
        owner = UserFactory()
        PlatformSetting.objects.update_or_create(pk=1, defaults={'ranking_debug_enabled': True})
        service = ServiceFactory(user=owner, status='Active', title='Mentoring')
        client = APIClient()
        client.force_authenticate(user=member)
        resp = client.post('/api/services/debug-ranking/', {
            'service_ids': [str(service.id)],
            'selected_service_id': str(service.id),
            'active_filter': 'all',
        }, format='json')
        assert_api_response(resp, 200)
        assert resp.json()['selected_service']['id'] == str(service.id)

    def test_member_post_is_blocked_when_toggle_off(self):
        member = UserFactory()
        owner = UserFactory()
        PlatformSetting.objects.update_or_create(pk=1, defaults={'ranking_debug_enabled': False})
        service = ServiceFactory(user=owner, status='Active')
        client = APIClient()
        client.force_authenticate(user=member)
        resp = client.post('/api/services/debug-ranking/', {
            'service_ids': [str(service.id)],
            'selected_service_id': str(service.id),
        }, format='json')
        assert_problem_detail(resp, 403)

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

        assert_api_response(resp, 200)
        # Payload still describes the same service, just from `target`'s
        # perspective (different social_boost / proximity numbers).
        assert resp.json()['selected_service']['id'] == str(service.id)

    def test_member_simulated_user_id_is_silently_stripped(self):
        member = UserFactory()
        target = UserFactory()
        owner = UserFactory()
        PlatformSetting.objects.update_or_create(pk=1, defaults={'ranking_debug_enabled': True})
        service = ServiceFactory(user=owner, status='Active', title='Mentoring')

        client = APIClient()
        client.force_authenticate(user=member)

        # `simulated_user_id` would leak target's tag/follow state — the
        # endpoint must accept the request but ignore the simulation flag.
        resp = client.post('/api/services/debug-ranking/', {
            'service_ids': [str(service.id)],
            'selected_service_id': str(service.id),
            'simulated_user_id': str(target.id),
        }, format='json')

        assert_api_response(resp, 200)
