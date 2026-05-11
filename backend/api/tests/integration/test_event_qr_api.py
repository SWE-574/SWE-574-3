"""Integration tests for the event QR attendance endpoints.

Covers the viewset-level wiring that was previously untested — the unit tests
in test_event_service.py exercise EventHandshakeService.generate_qr_token
directly, but the HTTP path through ServiceViewSet.generate_qr_token was
unexercised, which let the queryset-narrowing regression (the "Resource not
found." 404 on the organizer's Show Attendance QR button) ship to dev.
"""
from datetime import timedelta
from decimal import Decimal

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from api.models import Tag
from api.tests.helpers.factories import UserFactory, ServiceFactory, TagFactory
from api.tests.helpers.assertions import assert_api_response, assert_problem_detail


def _make_qr_event(organizer, hours_from_now=6):
    """Active Event that requires QR check-in, scheduled inside the 24h
    lockdown window so generate_qr_token's lockdown check passes."""
    return ServiceFactory(
        user=organizer,
        type='Event',
        status='Active',
        max_participants=10,
        schedule_type='One-Time',
        scheduled_time=timezone.now() + timedelta(hours=hours_from_now),
        duration=Decimal('1.00'),
        location_type='In-Person',
        location_lat=Decimal('41.012345'),
        location_lng=Decimal('28.974321'),
        requires_qr_checkin=True,
    )


@pytest.mark.django_db
@pytest.mark.integration
class TestGenerateQRTokenEndpoint:
    """POST /api/services/{id}/generate-qr-token/"""

    def test_organizer_can_generate_qr_token(self):
        organizer = UserFactory()
        event = _make_qr_event(organizer)

        client = APIClient()
        client.force_authenticate(user=organizer)
        resp = client.post(f'/api/services/{event.id}/generate-qr-token/')

        assert_api_response(resp, 200)
        body = resp.json()
        assert body['token']
        assert body['attendance_code']
        assert body['qr_payload']

    def test_non_organizer_gets_403(self):
        organizer = UserFactory()
        other = UserFactory()
        event = _make_qr_event(organizer)

        client = APIClient()
        client.force_authenticate(user=other)
        resp = client.post(f'/api/services/{event.id}/generate-qr-token/')

        assert_problem_detail(resp, 403)

    def test_anonymous_gets_401(self):
        organizer = UserFactory()
        event = _make_qr_event(organizer)

        client = APIClient()
        resp = client.post(f'/api/services/{event.id}/generate-qr-token/')

        assert_problem_detail(resp, 401)

    def test_offer_service_gets_400(self):
        organizer = UserFactory()
        offer = ServiceFactory(user=organizer, type='Offer', status='Active')

        client = APIClient()
        client.force_authenticate(user=organizer)
        resp = client.post(f'/api/services/{offer.id}/generate-qr-token/')

        assert_problem_detail(resp, 400)

    def test_outside_lockdown_window_gets_400(self):
        """Far-future event must be rejected with 400, not 404."""
        organizer = UserFactory()
        event = _make_qr_event(organizer, hours_from_now=48)

        client = APIClient()
        client.force_authenticate(user=organizer)
        resp = client.post(f'/api/services/{event.id}/generate-qr-token/')

        assert_problem_detail(resp, 400)

    def test_missing_event_returns_404(self):
        """Sanity: a genuinely missing pk still 404s."""
        organizer = UserFactory()

        client = APIClient()
        client.force_authenticate(user=organizer)
        resp = client.post(
            '/api/services/00000000-0000-0000-0000-000000000000/generate-qr-token/'
        )

        assert_problem_detail(resp, 404)

    def test_onboarded_organizer_with_mismatched_skills_can_still_generate(self):
        """Regression for the actual prod bug. The organizer is onboarded with
        skills that do NOT match the event's tags. Under the old code path,
        apply_onboarding_fallback() filtered the queryset down to services
        tagged with the viewer's skills, dropping the organizer's own event
        — self.get_object() then raised Http404 and the UI showed
        'Resource not found.' Once feed-shaping filters are gated to
        self.action == 'list', this path stays clean."""
        organizer = UserFactory(is_onboarded=True)
        skill_tag = TagFactory()
        organizer.skills.add(skill_tag)

        event_tag = TagFactory()
        event = _make_qr_event(organizer)
        event.tags.add(event_tag)  # different tag from the organizer's skill

        client = APIClient()
        client.force_authenticate(user=organizer)
        resp = client.post(f'/api/services/{event.id}/generate-qr-token/')

        assert_api_response(resp, 200)


@pytest.mark.django_db
@pytest.mark.integration
class TestGetQRTokenEndpoint:
    """GET /api/services/{id}/qr-token/"""

    def test_organizer_can_fetch_current_token(self):
        organizer = UserFactory()
        event = _make_qr_event(organizer)

        client = APIClient()
        client.force_authenticate(user=organizer)
        # Generate one first so there's something to fetch.
        client.post(f'/api/services/{event.id}/generate-qr-token/')

        resp = client.get(f'/api/services/{event.id}/qr-token/')

        assert_api_response(resp, 200)
        body = resp.json()
        assert body['token']
        assert body['attendance_code']
