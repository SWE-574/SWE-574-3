import pytest
from rest_framework import status
from rest_framework.test import APIClient

from api.models import AdminAuditLog, Report
from api.tests.helpers.factories import AdminUserFactory, HandshakeFactory, ServiceFactory, UserFactory
from api.tests.helpers.test_client import AuthenticatedAPIClient


def _payload_items(data):
    if isinstance(data, list):
        return data
    if isinstance(data, dict):
        return data.get('results', data)
    return data


@pytest.mark.django_db
@pytest.mark.integration
class TestAdminManagementApi:
    def test_metrics_requires_authentication(self):
        response = APIClient().get('/api/metrics/')
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_non_admin_cannot_access_metrics(self):
        member = UserFactory()
        client = AuthenticatedAPIClient().authenticate_user(member)

        response = client.get('/api/metrics/')
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_admin_can_access_metrics(self):
        admin = AdminUserFactory()
        client = AuthenticatedAPIClient().authenticate_admin(admin)

        response = client.get('/api/metrics/')

        assert response.status_code == status.HTTP_200_OK
        payload = response.json()
        assert 'users' in payload
        assert 'services' in payload
        assert 'handshakes' in payload
        assert 'transactions' in payload

    def test_admin_users_list_requires_authentication(self):
        response = APIClient().get('/api/admin/users/')
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_non_admin_cannot_list_admin_users(self):
        member = UserFactory()
        client = AuthenticatedAPIClient().authenticate_user(member)

        response = client.get('/api/admin/users/')
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_admin_can_list_users(self):
        admin = AdminUserFactory()
        listed_user = UserFactory()

        client = AuthenticatedAPIClient().authenticate_admin(admin)
        response = client.get('/api/admin/users/')

        assert response.status_code == status.HTTP_200_OK
        items = _payload_items(response.data)
        ids = {item['id'] for item in items}
        assert str(listed_user.id) in ids

    def test_admin_can_warn_ban_unban_and_adjust_karma(self):
        admin = AdminUserFactory()
        target_user = UserFactory(karma_score=10, is_active=True)

        client = AuthenticatedAPIClient().authenticate_admin(admin)

        warn_response = client.post(
            f'/api/admin/users/{target_user.id}/warn/',
            {'message': 'Please follow guidelines.'},
            format='json',
        )
        assert warn_response.status_code == status.HTTP_200_OK

        ban_response = client.post(f'/api/admin/users/{target_user.id}/ban/', {}, format='json')
        assert ban_response.status_code == status.HTTP_200_OK
        target_user.refresh_from_db()
        assert target_user.is_active is False

        unban_response = client.post(f'/api/admin/users/{target_user.id}/unban/', {}, format='json')
        assert unban_response.status_code == status.HTTP_200_OK
        target_user.refresh_from_db()
        assert target_user.is_active is True

        karma_response = client.post(
            f'/api/admin/users/{target_user.id}/adjust-karma/',
            {'adjustment': -3},
            format='json',
        )
        assert karma_response.status_code == status.HTTP_200_OK
        target_user.refresh_from_db()
        assert target_user.karma_score == 7

    def test_admin_audit_logs_requires_authentication(self):
        response = APIClient().get('/api/admin/audit-logs/')
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_non_admin_gets_empty_admin_audit_logs(self):
        member = UserFactory()
        admin = AdminUserFactory()
        target_user = UserFactory()
        AdminAuditLog.objects.create(
            admin=admin,
            action_type='warn_user',
            target_entity='user',
            target_id=target_user.id,
            reason='Seed audit record',
        )

        client = AuthenticatedAPIClient().authenticate_user(member)
        response = client.get('/api/admin/audit-logs/')

        assert response.status_code == status.HTTP_200_OK
        items = _payload_items(response.data)
        assert len(items) == 0

    def test_admin_can_list_and_filter_audit_logs(self):
        admin = AdminUserFactory()
        target_user = UserFactory()
        reporter = UserFactory()
        service = ServiceFactory(user=target_user)
        report = Report.objects.create(
            reporter=reporter,
            reported_user=target_user,
            reported_service=service,
            type='spam',
            description='Spam listing report',
            status='pending',
        )
        AdminAuditLog.objects.create(
            admin=admin,
            action_type='warn_user',
            target_entity='user',
            target_id=target_user.id,
            reason='Warning test',
        )
        AdminAuditLog.objects.create(
            admin=admin,
            action_type='resolve_report',
            target_entity='report',
            target_id=report.id,
            reason='Resolve test',
        )

        client = AuthenticatedAPIClient().authenticate_admin(admin)

        all_response = client.get('/api/admin/audit-logs/')
        assert all_response.status_code == status.HTTP_200_OK
        all_items = _payload_items(all_response.data)
        assert len(all_items) >= 2

        filtered_response = client.get('/api/admin/audit-logs/?action_type=resolve_report&target_entity=report')
        assert filtered_response.status_code == status.HTTP_200_OK
        filtered_items = _payload_items(filtered_response.data)
        assert len(filtered_items) >= 1
        assert all(item['action_type'] == 'resolve_report' for item in filtered_items)
        assert all(item['target_entity'] == 'report' for item in filtered_items)

    def test_admin_can_list_retrieve_and_pause_reports(self):
        admin = AdminUserFactory()
        provider = UserFactory()
        reporter = UserFactory()
        service = ServiceFactory(user=provider, type='Offer')
        handshake = HandshakeFactory(service=service, requester=reporter, status='accepted')
        report = Report.objects.create(
            reporter=reporter,
            reported_user=provider,
            related_handshake=handshake,
            reported_service=service,
            type='no_show',
            status='pending',
            description='Provider did not show up.',
        )

        client = AuthenticatedAPIClient().authenticate_admin(admin)

        list_response = client.get('/api/admin/reports/?status=pending')
        assert list_response.status_code == status.HTTP_200_OK
        list_items = _payload_items(list_response.data)
        report_ids = {item['id'] for item in list_items}
        assert str(report.id) in report_ids

        retrieve_response = client.get(f'/api/admin/reports/{report.id}/')
        assert retrieve_response.status_code == status.HTTP_200_OK
        assert retrieve_response.data['id'] == str(report.id)

        pause_response = client.post(f'/api/admin/reports/{report.id}/pause/', {}, format='json')
        assert pause_response.status_code == status.HTTP_200_OK
        handshake.refresh_from_db()
        assert handshake.status == 'paused'
