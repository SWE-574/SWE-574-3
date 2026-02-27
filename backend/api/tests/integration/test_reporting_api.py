"""Integration tests for reporting endpoints."""

import pytest
from rest_framework import status

from api.models import Report
from api.tests.helpers.factories import HandshakeFactory, ServiceFactory, UserFactory
from api.tests.helpers.test_client import AuthenticatedAPIClient


@pytest.mark.django_db
@pytest.mark.integration
class TestReportingAPI:
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
