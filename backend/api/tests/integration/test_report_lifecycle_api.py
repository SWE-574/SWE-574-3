"""Integration tests for the report lifecycle work in #455, #441, #442.

Covers:
- report_received notification on creation
- report_resolved / report_dismissed notifications on admin state change
- New mark_resolved / mark_dismissed admin actions (#441)
- New /api/users/me/reports/ endpoint with reporter-only scoping and no
  moderator PII leak (#455)
"""
import pytest
from rest_framework import status
from rest_framework.test import APIClient

from api.models import Notification, Report
from api.tests.helpers.factories import AdminUserFactory, ServiceFactory, UserFactory
from api.tests.helpers.test_client import AuthenticatedAPIClient


@pytest.mark.django_db
@pytest.mark.integration
class TestReportReceivedNotification:
    """Reporter is told their report was received when filing one (#455)."""

    def test_service_report_creates_report_received_notification(self):
        reporter = UserFactory()
        service_owner = UserFactory()
        service = ServiceFactory(user=service_owner)

        client = AuthenticatedAPIClient().authenticate_user(reporter)
        response = client.post(
            f'/api/services/{service.id}/report/',
            {'issue_type': 'inappropriate_content', 'description': 'Test report'},
            format='json',
        )

        assert response.status_code == status.HTTP_201_CREATED
        received = Notification.objects.filter(
            user=reporter, type='report_received',
        )
        assert received.exists()


@pytest.mark.django_db
@pytest.mark.integration
class TestReportResolveLifecycleNotifications:
    """Reporter gets typed report_resolved / report_dismissed on state change (#455)."""

    def _make_report(self) -> tuple[Report, AdminUserFactory]:
        reporter = UserFactory()
        target = UserFactory()
        service = ServiceFactory(user=target)
        report = Report.objects.create(
            reporter=reporter,
            reported_user=target,
            reported_service=service,
            type='spam',
            description='Test',
            status='pending',
        )
        return report, AdminUserFactory()

    def test_mark_resolved_notifies_reporter(self):
        report, admin = self._make_report()
        client = AuthenticatedAPIClient().authenticate_admin(admin)

        response = client.post(
            f'/api/admin/reports/{report.id}/resolve/',
            {'action': 'mark_resolved'},
            format='json',
        )

        assert response.status_code == status.HTTP_200_OK
        report.refresh_from_db()
        assert report.status == 'resolved'
        assert report.resolved_by_id == admin.id
        assert Notification.objects.filter(
            user=report.reporter, type='report_resolved',
        ).exists()

    def test_mark_dismissed_notifies_reporter(self):
        report, admin = self._make_report()
        client = AuthenticatedAPIClient().authenticate_admin(admin)

        response = client.post(
            f'/api/admin/reports/{report.id}/resolve/',
            {'action': 'mark_dismissed'},
            format='json',
        )

        assert response.status_code == status.HTTP_200_OK
        report.refresh_from_db()
        assert report.status == 'dismissed'
        assert Notification.objects.filter(
            user=report.reporter, type='report_dismissed',
        ).exists()

    def test_mark_resolved_rejects_when_already_closed(self):
        report, admin = self._make_report()
        report.status = 'resolved'
        report.save(update_fields=['status'])

        client = AuthenticatedAPIClient().authenticate_admin(admin)
        response = client.post(
            f'/api/admin/reports/{report.id}/resolve/',
            {'action': 'mark_resolved'},
            format='json',
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST


@pytest.mark.django_db
@pytest.mark.integration
class TestMyReportsEndpoint:
    """GET /api/users/me/reports/ — reporter sees only their reports without moderator PII (#455)."""

    def test_unauthenticated_request_is_rejected(self):
        response = APIClient().get('/api/users/me/reports/')
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_returns_only_current_users_reports(self):
        alice = UserFactory()
        bob = UserFactory()
        target = UserFactory()
        service = ServiceFactory(user=target)

        Report.objects.create(
            reporter=alice, reported_user=target, reported_service=service,
            type='spam', description='alice report', status='pending',
        )
        Report.objects.create(
            reporter=bob, reported_user=target, reported_service=service,
            type='spam', description='bob report', status='pending',
        )

        client = AuthenticatedAPIClient().authenticate_user(alice)
        response = client.get('/api/users/me/reports/')

        assert response.status_code == status.HTTP_200_OK
        results = response.data['results'] if isinstance(response.data, dict) else response.data
        assert len(results) == 1
        assert results[0]['description'] == 'alice report'

    def test_payload_does_not_leak_moderator_pii(self):
        reporter = UserFactory()
        admin = AdminUserFactory()
        target = UserFactory()
        service = ServiceFactory(user=target)

        Report.objects.create(
            reporter=reporter,
            reported_user=target,
            reported_service=service,
            type='spam',
            description='Test',
            status='resolved',
            resolved_by=admin,
            admin_notes='Internal moderation note that should never be exposed.',
        )

        client = AuthenticatedAPIClient().authenticate_user(reporter)
        response = client.get('/api/users/me/reports/')

        assert response.status_code == status.HTTP_200_OK
        results = response.data['results'] if isinstance(response.data, dict) else response.data
        assert len(results) == 1
        payload = results[0]
        assert 'resolved_by' not in payload
        assert 'admin_notes' not in payload
        assert 'reporter' not in payload
        # The reporter does see the public surface.
        assert payload['status'] == 'resolved'
        assert payload['target_kind'] == 'service'
        assert payload['target_summary'] == service.title
