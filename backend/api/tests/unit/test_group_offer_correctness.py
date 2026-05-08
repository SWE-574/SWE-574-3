"""Coverage for the group-offer correctness pass.

Closes:
  #521 — accept() rejects Offer/Need without provider_initiated.
  #539 — approve() and accept() recheck capacity before flipping status.
  #540 — Serializer rejects max_participants edits below current count.
  #541 — Cancelling a service notifies users with denied handshakes.

Locks in (#538 wontfix):
  Group-offer time credits are asymmetric on purpose. Each receiver pays
  full duration; provider earns one duration credit total when the last
  participant completes. The surplus is a system sink.
"""
from decimal import Decimal
from datetime import timedelta

import pytest
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from api.models import Handshake, Notification, Service, TransactionHistory
from api.serializers import ServiceSerializer
from api.services import HandshakeService, HandshakeServiceError
from api.tests.helpers.factories import (
    HandshakeFactory,
    ServiceFactory,
    UserFactory,
)


def _ready_handshake(handshake):
    handshake.refresh_from_db()
    handshake.exact_duration = handshake.service.duration
    handshake.scheduled_time = timezone.now() + timedelta(days=1)
    if handshake.service.location_type == 'In-Person':
        handshake.exact_location = '123 Test Address'
    handshake.provider_initiated = True
    handshake.save()
    return handshake


def _approve(handshake):
    handshake = _ready_handshake(handshake)
    HandshakeService.approve(handshake, handshake.requester)
    handshake.refresh_from_db()
    return handshake


# ── #521 — Direct accept blocked for Offer/Need ──────────────────────────────

@pytest.mark.unit
@pytest.mark.django_db
class TestAcceptRequiresProposeFlow:

    def test_offer_direct_accept_returns_400(self):
        provider = UserFactory(timebank_balance=Decimal('20'))
        requester = UserFactory(timebank_balance=Decimal('5'))
        svc = ServiceFactory(
            user=provider, type='Offer', schedule_type='One-Time',
            max_participants=1, duration=Decimal('1'), status='Active',
        )
        h = HandshakeFactory(service=svc, requester=requester,
                             status='pending', provisioned_hours=Decimal('1'))

        client = APIClient()
        client.force_authenticate(user=provider)
        resp = client.post(f'/api/handshakes/{h.id}/accept/')
        assert resp.status_code == status.HTTP_400_BAD_REQUEST
        h.refresh_from_db()
        assert h.status == 'pending', "Direct accept must not flip status"

    def test_need_direct_accept_returns_400(self):
        helper = UserFactory(timebank_balance=Decimal('20'))
        owner = UserFactory(timebank_balance=Decimal('5'))
        svc = ServiceFactory(
            user=owner, type='Need', schedule_type='One-Time',
            max_participants=1, duration=Decimal('1'), status='Active',
        )
        h = HandshakeFactory(service=svc, requester=helper,
                             status='pending', provisioned_hours=Decimal('1'))

        client = APIClient()
        client.force_authenticate(user=owner)
        resp = client.post(f'/api/handshakes/{h.id}/accept/')
        assert resp.status_code == status.HTTP_400_BAD_REQUEST
        h.refresh_from_db()
        assert h.status == 'pending'

    def test_event_direct_accept_still_works(self):
        organizer = UserFactory(timebank_balance=Decimal('5'))
        attendee = UserFactory(timebank_balance=Decimal('5'))
        svc = ServiceFactory(
            user=organizer, type='Event', schedule_type='One-Time',
            max_participants=10, duration=Decimal('2'), status='Active',
            scheduled_time=timezone.now() + timedelta(days=2),
        )
        h = HandshakeFactory(service=svc, requester=attendee, status='pending')

        client = APIClient()
        client.force_authenticate(user=organizer)
        resp = client.post(f'/api/handshakes/{h.id}/accept/')
        assert resp.status_code == status.HTTP_200_OK
        h.refresh_from_db()
        assert h.status == 'accepted'

    def test_propose_then_approve_succeeds(self):
        provider = UserFactory(timebank_balance=Decimal('20'))
        requester = UserFactory(timebank_balance=Decimal('5'))
        svc = ServiceFactory(
            user=provider, type='Offer', schedule_type='One-Time',
            max_participants=1, duration=Decimal('1'), status='Active',
        )
        h = HandshakeFactory(service=svc, requester=requester,
                             status='pending', provisioned_hours=Decimal('1'))

        _approve(h)

        h.refresh_from_db()
        assert h.status == 'accepted'


# ── #539 — Capacity recheck on approve / accept ──────────────────────────────

@pytest.mark.unit
@pytest.mark.django_db
class TestCapacityRecheck:

    def test_approve_rejects_when_cap_already_filled(self):
        """Two pending handshakes with provider-initiated details on a max=1
        offer: only the first approve succeeds; the second is rejected for
        capacity."""
        provider = UserFactory(timebank_balance=Decimal('20'))
        u1 = UserFactory(timebank_balance=Decimal('5'))
        u2 = UserFactory(timebank_balance=Decimal('5'))
        svc = ServiceFactory(
            user=provider, type='Offer', schedule_type='One-Time',
            max_participants=1, duration=Decimal('1'), status='Active',
        )
        h1 = HandshakeFactory(service=svc, requester=u1,
                              status='pending', provisioned_hours=Decimal('1'))
        h2 = HandshakeFactory(service=svc, requester=u2,
                              status='pending', provisioned_hours=Decimal('1'))

        _approve(h1)
        h1.refresh_from_db()
        assert h1.status == 'accepted'

        # h2 was auto-denied when h1 filled the only slot.
        h2.refresh_from_db()
        assert h2.status == 'denied'

    def test_recurrent_group_offer_caps_at_max(self):
        """Recurrent group offers were silently uncapped on accept; verify the
        cap is now enforced via approve()."""
        provider = UserFactory(timebank_balance=Decimal('20'))
        u1 = UserFactory(timebank_balance=Decimal('5'))
        u2 = UserFactory(timebank_balance=Decimal('5'))
        u3 = UserFactory(timebank_balance=Decimal('5'))
        svc = ServiceFactory(
            user=provider, type='Offer', schedule_type='Recurrent',
            max_participants=2, duration=Decimal('1'), status='Active',
        )
        h1 = HandshakeFactory(service=svc, requester=u1,
                              status='pending', provisioned_hours=Decimal('1'))
        h2 = HandshakeFactory(service=svc, requester=u2,
                              status='pending', provisioned_hours=Decimal('1'))
        h3 = HandshakeFactory(service=svc, requester=u3,
                              status='pending', provisioned_hours=Decimal('1'))

        _approve(h1)
        _approve(h2)

        with pytest.raises(HandshakeServiceError) as excinfo:
            h3 = _ready_handshake(h3)
            HandshakeService.approve(h3, h3.requester)
        assert 'maximum capacity' in str(excinfo.value)

        h3.refresh_from_db()
        assert h3.status == 'pending'


# ── #540 — Serializer rejects lowering max below current count ───────────────

@pytest.mark.unit
@pytest.mark.django_db
class TestMaxParticipantsEditFloor:

    def test_lowering_below_current_accepted_rejected(self):
        provider = UserFactory(timebank_balance=Decimal('20'))
        svc = ServiceFactory(
            user=provider, type='Offer', schedule_type='Recurrent',
            max_participants=3, duration=Decimal('1'), status='Active',
        )
        for _ in range(2):
            HandshakeFactory(
                service=svc,
                requester=UserFactory(timebank_balance=Decimal('5')),
                status='accepted', provisioned_hours=Decimal('1'),
            )

        serializer = ServiceSerializer(svc, data={'max_participants': 1}, partial=True)
        assert not serializer.is_valid()
        assert 'max_participants' in serializer.errors

    def test_lowering_to_floor_allowed(self):
        provider = UserFactory(timebank_balance=Decimal('20'))
        svc = ServiceFactory(
            user=provider, type='Offer', schedule_type='Recurrent',
            max_participants=5, duration=Decimal('1'), status='Active',
        )
        for _ in range(2):
            HandshakeFactory(
                service=svc,
                requester=UserFactory(timebank_balance=Decimal('5')),
                status='accepted', provisioned_hours=Decimal('1'),
            )

        serializer = ServiceSerializer(svc, data={'max_participants': 2}, partial=True)
        assert serializer.is_valid(), serializer.errors

    def test_raising_cap_unaffected(self):
        provider = UserFactory(timebank_balance=Decimal('20'))
        svc = ServiceFactory(
            user=provider, type='Offer', schedule_type='Recurrent',
            max_participants=3, duration=Decimal('1'), status='Active',
        )
        HandshakeFactory(
            service=svc,
            requester=UserFactory(timebank_balance=Decimal('5')),
            status='accepted', provisioned_hours=Decimal('1'),
        )

        serializer = ServiceSerializer(svc, data={'max_participants': 8}, partial=True)
        assert serializer.is_valid(), serializer.errors


# ── #541 — Denied users notified on service cancellation ─────────────────────

@pytest.mark.django_db
@pytest.mark.integration
class TestDeniedNotifyOnCancel:

    def test_denied_users_get_cancellation_notification(self):
        provider = UserFactory(timebank_balance=Decimal('20'))
        accepted_user = UserFactory(timebank_balance=Decimal('5'))
        denied_a = UserFactory(timebank_balance=Decimal('5'))
        denied_b = UserFactory(timebank_balance=Decimal('5'))
        svc = ServiceFactory(
            user=provider, type='Offer', schedule_type='One-Time',
            max_participants=1, duration=Decimal('1'), status='Active',
        )
        accepted_h = HandshakeFactory(
            service=svc, requester=accepted_user,
            status='pending', provisioned_hours=Decimal('1'),
        )
        for u in (denied_a, denied_b):
            HandshakeFactory(
                service=svc, requester=u,
                status='pending', provisioned_hours=Decimal('1'),
            )

        _approve(accepted_h)
        # Cancel the accepted handshake so the service has no active handshakes
        # and can be soft-deleted by destroy().
        client = APIClient()
        client.force_authenticate(user=provider)
        client.post(f'/api/handshakes/{accepted_h.id}/cancel-request/')
        client.force_authenticate(user=accepted_user)
        client.post(f'/api/handshakes/{accepted_h.id}/cancel-request/approve/')

        # Drain any earlier notifications so we only capture the cancel ones.
        Notification.objects.filter(user__in=[denied_a, denied_b]).delete()

        client.force_authenticate(user=provider)
        resp = client.delete(f'/api/services/{svc.id}/')
        assert resp.status_code == status.HTTP_204_NO_CONTENT

        for u in (denied_a, denied_b):
            assert Notification.objects.filter(
                user=u, type='handshake_cancelled',
            ).exists(), f"{u.email} should have a cancellation notification"


# ── #538 wontfix — group-offer time credit asymmetry is intentional ──────────

@pytest.mark.django_db
@pytest.mark.integration
class TestGroupOfferTimeCreditIntentional:
    """Lock in the asymmetric system-sink behaviour for group offers.

    See memory/project_group_offer_timecredit.md and #538 (closed wontfix).
    Three participants × 2h offer should debit each receiver 2h and credit
    the provider exactly 2h once at the end — surplus 4h is the system sink.
    """

    def test_provider_credited_once_total(self):
        from api.utils import complete_timebank_transfer

        provider = UserFactory(timebank_balance=Decimal('0'))
        u1 = UserFactory(timebank_balance=Decimal('10'))
        u2 = UserFactory(timebank_balance=Decimal('10'))
        u3 = UserFactory(timebank_balance=Decimal('10'))
        svc = ServiceFactory(
            user=provider, type='Offer', schedule_type='One-Time',
            max_participants=3, duration=Decimal('2'), status='Active',
            scheduled_time=timezone.now() + timedelta(days=1),
            location_area='Kadikoy',
            session_exact_location='Kadikoy Square',
        )
        handshakes = [
            HandshakeFactory(service=svc, requester=u, status='accepted',
                             provisioned_hours=Decimal('2'))
            for u in (u1, u2, u3)
        ]

        # Drive each through completion. complete_timebank_transfer credits the
        # provider only once on the final completion (intentional system sink).
        for h in handshakes:
            complete_timebank_transfer(h)

        provider.refresh_from_db()
        provider_credits = TransactionHistory.objects.filter(
            user=provider, transaction_type='transfer',
            handshake__service=svc,
        )
        # Exactly one credit row, equal to service.duration.
        assert provider_credits.count() == 1
        assert provider_credits.first().amount == Decimal('2')
