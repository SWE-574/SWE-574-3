"""Integration tests for reporting endpoints."""

import pytest
from datetime import timedelta
from django.utils import timezone
from rest_framework import status

from api.models import Report
from api.tests.helpers.factories import HandshakeFactory, ServiceFactory, UserFactory
from api.tests.helpers.test_client import AuthenticatedAPIClient


@pytest.mark.django_db
@pytest.mark.integration
class TestReportingAPI:
    def test_user_can_report_non_active_listing(self):
        reporter = UserFactory()
        service = ServiceFactory(status="Agreed")

        client = AuthenticatedAPIClient().authenticate_user(reporter)

        response = client.post(
            f"/api/services/{service.id}/report/",
            {"issue_type": "spam", "description": "Report after status change."},
            format="json",
        )
        assert response.status_code == status.HTTP_201_CREATED
        assert "report_id" in response.data

    def test_user_can_only_report_a_listing_once(self):
        reporter = UserFactory()
        service = ServiceFactory()

        client = AuthenticatedAPIClient().authenticate_user(reporter)

        first = client.post(
            f"/api/services/{service.id}/report/",
            {"issue_type": "spam", "description": "This listing looks like spam."},
            format="json",
        )
        assert first.status_code == status.HTTP_201_CREATED
        assert "report_id" in first.data

        second = client.post(
            f"/api/services/{service.id}/report/",
            {"issue_type": "spam", "description": "Duplicate report attempt."},
            format="json",
        )
        assert second.status_code == status.HTTP_400_BAD_REQUEST
        assert "already reported" in (second.data.get("detail", "") or "").lower()

    @pytest.mark.parametrize("final_status", ["resolved", "dismissed"])
    def test_listing_report_is_rejected_even_if_prior_report_is_resolved_or_dismissed(self, final_status: str):
        reporter = UserFactory()
        service = ServiceFactory()

        client = AuthenticatedAPIClient().authenticate_user(reporter)

        first = client.post(
            f"/api/services/{service.id}/report/",
            {"issue_type": "spam", "description": "Initial report."},
            format="json",
        )
        assert first.status_code == status.HTTP_201_CREATED

        report = Report.objects.get(id=first.data["report_id"])
        report.status = final_status
        report.save(update_fields=["status"])

        second = client.post(
            f"/api/services/{service.id}/report/",
            {"issue_type": "spam", "description": "Attempt after moderation action."},
            format="json",
        )
        assert second.status_code == status.HTTP_400_BAD_REQUEST
        assert "already reported" in (second.data.get("detail", "") or "").lower()

    def test_handshake_report_is_not_blocked_by_existing_listing_report(self):
        provider = UserFactory()
        reporter = UserFactory()
        service = ServiceFactory(user=provider, type="Offer")

        reporter_client = AuthenticatedAPIClient().authenticate_user(reporter)

        listing_report = reporter_client.post(
            f"/api/services/{service.id}/report/",
            {"issue_type": "spam", "description": "Spam listing."},
            format="json",
        )
        assert listing_report.status_code == status.HTTP_201_CREATED

        handshake = HandshakeFactory(service=service, requester=reporter, status="accepted")

        handshake_report = reporter_client.post(
            f"/api/handshakes/{handshake.id}/report/",
            {"issue_type": "no_show", "description": "No-show dispute for this handshake."},
            format="json",
        )
        assert handshake_report.status_code == status.HTTP_201_CREATED
        assert "report_id" in handshake_report.data

    def test_non_event_handshake_rejects_behavior_issue_types(self):
        provider = UserFactory()
        reporter = UserFactory()
        service = ServiceFactory(user=provider, type="Offer")
        handshake = HandshakeFactory(service=service, requester=reporter, status="accepted")

        reporter_client = AuthenticatedAPIClient().authenticate_user(reporter)
        response = reporter_client.post(
            f"/api/handshakes/{handshake.id}/report/",
            {"issue_type": "harassment", "description": "Abusive language in chat."},
            format="json",
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "invalid issue_type" in (response.data.get("detail", "") or "").lower()

    def test_event_handshake_allows_behavior_reports_during_24h_window(self):
        organizer = UserFactory()
        participant = UserFactory()
        event = ServiceFactory(
            user=organizer,
            type="Event",
            max_participants=10,
            scheduled_time=timezone.now() - timedelta(hours=2),
        )
        handshake = HandshakeFactory(service=event, requester=participant, status="accepted")

        participant_client = AuthenticatedAPIClient().authenticate_user(participant)
        response = participant_client.post(
            f"/api/handshakes/{handshake.id}/report/",
            {"issue_type": "harassment", "description": "Organizer was verbally abusive."},
            format="json",
        )

        assert response.status_code == status.HTTP_201_CREATED
        report = Report.objects.get(id=response.data["report_id"])
        assert report.type == "harassment"
        assert report.reported_user_id == organizer.id

    def test_event_handshake_rejects_reports_before_event_start(self):
        organizer = UserFactory()
        participant = UserFactory()
        event = ServiceFactory(
            user=organizer,
            type="Event",
            max_participants=10,
            scheduled_time=timezone.now() + timedelta(hours=1),
        )
        handshake = HandshakeFactory(service=event, requester=participant, status="accepted")

        participant_client = AuthenticatedAPIClient().authenticate_user(participant)
        response = participant_client.post(
            f"/api/handshakes/{handshake.id}/report/",
            {"issue_type": "no_show", "description": "Attempt before event start."},
            format="json",
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "up to 24 hours" in (response.data.get("detail", "") or "").lower()

    def test_event_handshake_rejects_reports_after_24h_window(self):
        organizer = UserFactory()
        participant = UserFactory()
        event = ServiceFactory(
            user=organizer,
            type="Event",
            max_participants=10,
            scheduled_time=timezone.now() - timedelta(hours=26),
        )
        handshake = HandshakeFactory(service=event, requester=participant, status="accepted")

        participant_client = AuthenticatedAPIClient().authenticate_user(participant)
        response = participant_client.post(
            f"/api/handshakes/{handshake.id}/report/",
            {"issue_type": "service_issue", "description": "Attempt after report window."},
            format="json",
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "up to 24 hours" in (response.data.get("detail", "") or "").lower()

    def test_event_participant_can_report_another_participant_with_reported_user_id(self):
        organizer = UserFactory()
        reporter = UserFactory()
        target_participant = UserFactory()
        event = ServiceFactory(
            user=organizer,
            type="Event",
            max_participants=10,
            scheduled_time=timezone.now() - timedelta(hours=3),
        )
        reporter_handshake = HandshakeFactory(service=event, requester=reporter, status="accepted")
        HandshakeFactory(service=event, requester=target_participant, status="accepted")

        reporter_client = AuthenticatedAPIClient().authenticate_user(reporter)
        response = reporter_client.post(
            f"/api/handshakes/{reporter_handshake.id}/report/",
            {
                "issue_type": "spam",
                "reported_user_id": str(target_participant.id),
                "description": "Participant repeatedly spammed the event chat.",
            },
            format="json",
        )

        assert response.status_code == status.HTTP_201_CREATED
        report = Report.objects.get(id=response.data["report_id"])
        assert report.reported_user_id == target_participant.id
        assert report.type == "spam"

    def test_duplicate_open_handshake_report_is_blocked_but_resolved_report_allows_new(self):
        organizer = UserFactory()
        participant = UserFactory()
        event = ServiceFactory(
            user=organizer,
            type="Event",
            max_participants=10,
            scheduled_time=timezone.now() - timedelta(hours=3),
        )
        handshake = HandshakeFactory(service=event, requester=participant, status="accepted")

        participant_client = AuthenticatedAPIClient().authenticate_user(participant)
        first = participant_client.post(
            f"/api/handshakes/{handshake.id}/report/",
            {"issue_type": "harassment", "description": "First harassment report."},
            format="json",
        )
        assert first.status_code == status.HTTP_201_CREATED

        second = participant_client.post(
            f"/api/handshakes/{handshake.id}/report/",
            {"issue_type": "harassment", "description": "Duplicate open report."},
            format="json",
        )
        assert second.status_code == status.HTTP_400_BAD_REQUEST
        assert "open report" in (second.data.get("detail", "") or "").lower()

        open_report = Report.objects.get(id=first.data["report_id"])
        open_report.status = "resolved"
        open_report.save(update_fields=["status"])

        third = participant_client.post(
            f"/api/handshakes/{handshake.id}/report/",
            {"issue_type": "harassment", "description": "Re-report after moderation."},
            format="json",
        )
        assert third.status_code == status.HTTP_201_CREATED
