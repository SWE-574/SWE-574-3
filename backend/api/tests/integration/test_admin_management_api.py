import pytest
from rest_framework import status
from rest_framework.test import APIClient

from api.models import AdminAuditLog, Report
from api.tests.helpers.factories import AdminUserFactory, ForumTopicFactory, HandshakeFactory, ServiceFactory, UserFactory
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

    def test_admin_cannot_suspend_themselves(self):
        """An admin cannot suspend their own account via the ban endpoint."""
        admin = AdminUserFactory()
        client = AuthenticatedAPIClient().authenticate_admin(admin)

        response = client.post(f'/api/admin/users/{admin.id}/ban/', {}, format='json')

        assert response.status_code == status.HTTP_403_FORBIDDEN
        admin.refresh_from_db()
        assert admin.is_active is True  # account must remain active

    def test_admin_cannot_warn_themselves(self):
        """An admin cannot issue a warning to their own account."""
        admin = AdminUserFactory()
        client = AuthenticatedAPIClient().authenticate_admin(admin)

        response = client.post(
            f'/api/admin/users/{admin.id}/warn/',
            {'message': 'Self-warning attempt'},
            format='json',
        )

        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_admin_can_still_suspend_other_users(self):
        """Regression: the self-suspend guard must not break normal ban flow."""
        admin = AdminUserFactory()
        target = UserFactory(is_active=True)
        client = AuthenticatedAPIClient().authenticate_admin(admin)

        response = client.post(f'/api/admin/users/{target.id}/ban/', {}, format='json')

        assert response.status_code == status.HTTP_200_OK
        target.refresh_from_db()
        assert target.is_active is False

    def test_resolved_report_is_retrievable_via_detail_endpoint(self):
        """Resolved reports must return 200 on the detail endpoint (not 404)."""
        admin = AdminUserFactory()
        reporter = UserFactory()
        reported = UserFactory()
        report = Report.objects.create(
            reporter=reporter,
            reported_user=reported,
            type='spam',
            description='Spam listing.',
            status='resolved',
        )

        client = AuthenticatedAPIClient().authenticate_admin(admin)
        response = client.get(f'/api/admin/reports/{report.id}/')

        assert response.status_code == status.HTTP_200_OK
        assert response.data['id'] == str(report.id)
        assert response.data['status'] == 'resolved'

    def test_dismissed_report_is_retrievable_via_detail_endpoint(self):
        """Dismissed reports must also return 200 on the detail endpoint."""
        admin = AdminUserFactory()
        reporter = UserFactory()
        reported = UserFactory()
        report = Report.objects.create(
            reporter=reporter,
            reported_user=reported,
            type='harassment',
            description='Harassment claim.',
            status='dismissed',
        )

        client = AuthenticatedAPIClient().authenticate_admin(admin)
        response = client.get(f'/api/admin/reports/{report.id}/')

        assert response.status_code == status.HTTP_200_OK
        assert response.data['status'] == 'dismissed'

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

    # ── Admin User Detail ──────────────────────────────────────────────────────

    def test_admin_user_detail_requires_authentication(self):
        target = UserFactory()
        response = APIClient().get(f'/api/admin/users/{target.id}/')
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_non_admin_cannot_retrieve_user_detail(self):
        member = UserFactory()
        target = UserFactory()
        client = AuthenticatedAPIClient().authenticate_user(member)
        response = client.get(f'/api/admin/users/{target.id}/')
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_admin_can_retrieve_user_detail(self):
        admin = AdminUserFactory()
        target = UserFactory(
            first_name='Jane', last_name='Doe',
            karma_score=25, is_active=True, is_verified=True,
        )
        client = AuthenticatedAPIClient().authenticate_admin(admin)

        response = client.get(f'/api/admin/users/{target.id}/')

        assert response.status_code == status.HTTP_200_OK
        data = response.data
        assert data['id'] == str(target.id)
        assert data['email'] == target.email
        assert data['first_name'] == 'Jane'
        assert data['last_name'] == 'Doe'
        assert data['karma_score'] == 25
        assert data['is_active'] is True
        assert data['is_verified'] is True
        assert 'date_joined' in data
        assert 'last_login' in data
        assert 'timebank_balance' in data
        assert 'no_show_count' in data
        assert 'is_event_banned_until' in data
        assert 'is_organizer_banned_until' in data
        assert 'offers_count' in data
        assert 'requests_count' in data
        assert 'events_count' in data
        assert 'handshakes_as_requester_count' in data
        assert 'handshakes_as_provider_count' in data
        assert 'forum_topics_count' in data
        assert 'recent_admin_actions' in data

    def test_admin_user_detail_counts_are_accurate(self):
        admin = AdminUserFactory()
        target = UserFactory()

        ServiceFactory(user=target, type='Offer')
        ServiceFactory(user=target, type='Offer')
        ServiceFactory(user=target, type='Need')
        ServiceFactory(user=target, type='Event')

        provider_service = ServiceFactory(user=UserFactory(), type='Offer')
        HandshakeFactory(service=provider_service, requester=target, status='completed')

        ForumTopicFactory(author=target)

        client = AuthenticatedAPIClient().authenticate_admin(admin)
        response = client.get(f'/api/admin/users/{target.id}/')

        assert response.status_code == status.HTTP_200_OK
        data = response.data
        assert data['offers_count'] == 2
        assert data['requests_count'] == 1
        assert data['events_count'] == 1
        assert data['handshakes_as_requester_count'] == 1
        assert data['forum_topics_count'] == 1

    def test_admin_user_detail_includes_recent_admin_actions(self):
        admin = AdminUserFactory()
        target = UserFactory()
        AdminAuditLog.objects.create(
            admin=admin,
            action_type='warn_user',
            target_entity='user',
            target_id=target.id,
            reason='Test warning',
        )

        client = AuthenticatedAPIClient().authenticate_admin(admin)
        response = client.get(f'/api/admin/users/{target.id}/')

        assert response.status_code == status.HTTP_200_OK
        actions = response.data['recent_admin_actions']
        assert len(actions) == 1
        assert actions[0]['action_type'] == 'warn_user'
        assert actions[0]['reason'] == 'Test warning'

    def test_admin_user_detail_returns_404_for_unknown_user(self):
        import uuid
        admin = AdminUserFactory()
        client = AuthenticatedAPIClient().authenticate_admin(admin)

        response = client.get(f'/api/admin/users/{uuid.uuid4()}/')
        assert response.status_code == status.HTTP_404_NOT_FOUND
