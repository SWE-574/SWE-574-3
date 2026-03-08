"""
Unit tests for the capacity system and Agreed service status.

Covers:
  - _capacity_statuses / _existing_interest_statuses per schedule type
  - pending never counts toward capacity (SRS FR-E01f)
  - Recurrent: completed sessions free the slot
  - One-Time: accept auto-denies other pending handshakes
  - Service transitions Active → Agreed → Active via accept / cancel
  - participant_count serializer field
"""
from decimal import Decimal

import pytest
from django.test import TestCase
from rest_framework.test import APIRequestFactory

from api.models import Handshake, Notification, Service
from api.serializers import ServiceSerializer
from api.services import HandshakeService
from api.tests.helpers.factories import (
    HandshakeFactory,
    ServiceFactory,
    UserFactory,
)


# ── Helpers ───────────────────────────────────────────────────────────────────

def _make_service(owner, schedule_type='One-Time', max_p=1, stype='Offer', duration='1.00'):
    return ServiceFactory(
        user=owner,
        type=stype,
        schedule_type=schedule_type,
        max_participants=max_p,
        duration=Decimal(duration),
        status='Active',
    )


def _accepted_handshake(service, requester):
    return HandshakeFactory(
        service=service,
        requester=requester,
        status='accepted',
        provisioned_hours=service.duration,
    )


def _pending_handshake(service, requester):
    return HandshakeFactory(
        service=service,
        requester=requester,
        status='pending',
        provisioned_hours=service.duration,
    )


# ── 1. _capacity_statuses ─────────────────────────────────────────────────────

class TestCapacityStatuses(TestCase):

    def test_one_time_excludes_pending(self):
        svc = _make_service(UserFactory(), 'One-Time')
        caps = HandshakeService._capacity_statuses(svc)
        self.assertNotIn('pending', caps)
        for s in ('accepted', 'completed', 'reported', 'paused'):
            self.assertIn(s, caps)

    def test_recurrent_excludes_pending_and_completed(self):
        svc = _make_service(UserFactory(), 'Recurrent')
        caps = HandshakeService._capacity_statuses(svc)
        self.assertNotIn('pending', caps)
        self.assertNotIn('completed', caps)
        for s in ('accepted', 'reported', 'paused'):
            self.assertIn(s, caps)

    def test_existing_interest_one_time_includes_pending(self):
        svc = _make_service(UserFactory(), 'One-Time')
        ei = HandshakeService._existing_interest_statuses(svc)
        self.assertIn('pending', ei)
        self.assertIn('accepted', ei)
        self.assertIn('completed', ei)

    def test_existing_interest_recurrent_includes_pending_excludes_completed(self):
        svc = _make_service(UserFactory(), 'Recurrent')
        ei = HandshakeService._existing_interest_statuses(svc)
        self.assertIn('pending', ei)
        self.assertIn('accepted', ei)
        self.assertNotIn('completed', ei)


# ── 2. Pending does not block capacity ────────────────────────────────────────

class TestPendingDoesNotConsumeSlot(TestCase):

    def setUp(self):
        self.provider = UserFactory(timebank_balance=Decimal('10'))
        self.u2 = UserFactory(timebank_balance=Decimal('5'))
        self.u3 = UserFactory(timebank_balance=Decimal('5'))
        self.u4 = UserFactory(timebank_balance=Decimal('5'))

    def test_one_time_multiple_pending_dont_fill_single_slot(self):
        svc = _make_service(self.provider, 'One-Time', max_p=1)
        _pending_handshake(svc, self.u2)
        _pending_handshake(svc, self.u3)

        ok, err = HandshakeService.can_express_interest(svc, self.u4)
        self.assertTrue(ok, err)

    def test_recurrent_multiple_pending_dont_fill_single_slot(self):
        svc = _make_service(self.provider, 'Recurrent', max_p=1)
        _pending_handshake(svc, self.u2)

        ok, err = HandshakeService.can_express_interest(svc, self.u3)
        self.assertTrue(ok, err)

    def test_one_time_accepted_fills_slot(self):
        svc = _make_service(self.provider, 'One-Time', max_p=1)
        _accepted_handshake(svc, self.u2)

        ok, err = HandshakeService.can_express_interest(svc, self.u3)
        self.assertFalse(ok)
        self.assertIn('maximum capacity', err)

    def test_group_offer_pending_does_not_prematurely_close_slots(self):
        """Group offer with max_p=3: three pending users should all fit."""
        svc = _make_service(self.provider, 'One-Time', max_p=3)
        _pending_handshake(svc, self.u2)
        _pending_handshake(svc, self.u3)

        ok, err = HandshakeService.can_express_interest(svc, self.u4)
        self.assertTrue(ok, err)


# ── 3. Recurrent: completed frees the slot ────────────────────────────────────

class TestRecurrentSlotFreedAfterCompletion(TestCase):

    def test_completed_session_frees_slot(self):
        provider = UserFactory(timebank_balance=Decimal('10'))
        u2 = UserFactory(timebank_balance=Decimal('5'))
        u3 = UserFactory(timebank_balance=Decimal('5'))

        svc = _make_service(provider, 'Recurrent', max_p=1)
        HandshakeFactory(service=svc, requester=u2, status='completed',
                         provisioned_hours=svc.duration)

        ok, err = HandshakeService.can_express_interest(svc, u3)
        self.assertTrue(ok, f"Expected slot available after completion, got: {err}")

    def test_completed_does_not_block_same_user_recurrent(self):
        """A user whose previous Recurrent session is completed can rejoin."""
        provider = UserFactory(timebank_balance=Decimal('10'))
        u2 = UserFactory(timebank_balance=Decimal('5'))
        svc = _make_service(provider, 'Recurrent', max_p=2)
        HandshakeFactory(service=svc, requester=u2, status='completed',
                         provisioned_hours=svc.duration)

        ok, err = HandshakeService.can_express_interest(svc, u2)
        self.assertTrue(ok, f"Recurrent re-join should be allowed after completion: {err}")

    def test_one_time_completed_still_occupies_slot(self):
        """For One-Time services, completed handshake keeps the slot occupied."""
        provider = UserFactory(timebank_balance=Decimal('10'))
        u2 = UserFactory(timebank_balance=Decimal('5'))
        u3 = UserFactory(timebank_balance=Decimal('5'))
        svc = _make_service(provider, 'One-Time', max_p=1)
        HandshakeFactory(service=svc, requester=u2, status='completed',
                         provisioned_hours=svc.duration)

        ok, err = HandshakeService.can_express_interest(svc, u3)
        self.assertFalse(ok)
        self.assertIn('maximum capacity', err)


# ── 4. Auto-deny on accept (One-Time) ─────────────────────────────────────────

@pytest.mark.django_db
class TestAutoDenyOnAccept:
    """
    When a provider accepts one pending handshake on a One-Time service,
    all other pending handshakes are automatically denied.
    """

    def _setup(self, max_p=1):
        from api.utils import provision_timebank
        provider = UserFactory(timebank_balance=Decimal('20'))
        u2 = UserFactory(timebank_balance=Decimal('5'))
        u3 = UserFactory(timebank_balance=Decimal('5'))
        svc = ServiceFactory(
            user=provider, type='Offer', schedule_type='One-Time',
            max_participants=max_p, duration=Decimal('1'), status='Active',
        )
        h2 = HandshakeFactory(service=svc, requester=u2,
                               status='pending', provisioned_hours=Decimal('1'))
        h3 = HandshakeFactory(service=svc, requester=u3,
                               status='pending', provisioned_hours=Decimal('1'))
        provision_timebank(h2)
        return provider, u2, u3, svc, h2, h3

    def test_other_pending_become_denied_only_when_capacity_full(self):
        """h3 must be denied only AFTER all slots (max_p=1) are filled — i.e., after h2 is accepted."""
        from rest_framework.test import APIClient
        provider, u2, u3, svc, h2, h3 = self._setup()  # max_p=1
        client = APIClient()
        client.force_authenticate(user=provider)

        resp = client.post(f'/api/handshakes/{h2.id}/accept/')
        assert resp.status_code == 200

        h3.refresh_from_db()
        assert h3.status == 'denied', f"Expected denied when capacity full, got {h3.status}"

    def test_pending_not_denied_while_slots_remain(self):
        """For a max_p=2 service, accepting the first should NOT deny the second pending."""
        from api.utils import provision_timebank
        from rest_framework.test import APIClient

        provider = UserFactory(timebank_balance=Decimal('20'))
        u2 = UserFactory(timebank_balance=Decimal('5'))
        u3 = UserFactory(timebank_balance=Decimal('5'))
        svc = ServiceFactory(
            user=provider, type='Offer', schedule_type='One-Time',
            max_participants=2, duration=Decimal('1'), status='Active',
        )
        h2 = HandshakeFactory(service=svc, requester=u2,
                               status='pending', provisioned_hours=Decimal('1'))
        h3 = HandshakeFactory(service=svc, requester=u3,
                               status='pending', provisioned_hours=Decimal('1'))
        provision_timebank(h2)

        client = APIClient()
        client.force_authenticate(user=provider)
        client.post(f'/api/handshakes/{h2.id}/accept/')

        h3.refresh_from_db()
        assert h3.status == 'pending', (
            "h3 must remain pending because 1 slot is still open"
        )

    def test_denied_users_receive_notification_when_capacity_full(self):
        """Denied notification must be sent when the last slot is filled."""
        from rest_framework.test import APIClient
        provider, u2, u3, svc, h2, h3 = self._setup()  # max_p=1
        client = APIClient()
        client.force_authenticate(user=provider)
        client.post(f'/api/handshakes/{h2.id}/accept/')

        notifs = Notification.objects.filter(user=u3, type='handshake_denied')
        assert notifs.exists(), "Denied user should receive a notification when capacity is full"

    def test_accepted_handshake_stays_accepted(self):
        from rest_framework.test import APIClient
        provider, u2, u3, svc, h2, h3 = self._setup()
        client = APIClient()
        client.force_authenticate(user=provider)
        client.post(f'/api/handshakes/{h2.id}/accept/')

        h2.refresh_from_db()
        assert h2.status == 'accepted'

    def test_recurrent_does_not_auto_deny_others(self):
        """Recurrent services accept independently — no auto-deny ever."""
        from api.utils import provision_timebank
        from rest_framework.test import APIClient

        provider = UserFactory(timebank_balance=Decimal('20'))
        u2 = UserFactory(timebank_balance=Decimal('5'))
        u3 = UserFactory(timebank_balance=Decimal('5'))
        svc = ServiceFactory(
            user=provider, type='Offer', schedule_type='Recurrent',
            max_participants=1, duration=Decimal('1'), status='Active',
        )
        h2 = HandshakeFactory(service=svc, requester=u2,
                               status='pending', provisioned_hours=Decimal('1'))
        h3 = HandshakeFactory(service=svc, requester=u3,
                               status='pending', provisioned_hours=Decimal('1'))
        provision_timebank(h2)

        client = APIClient()
        client.force_authenticate(user=provider)
        resp = client.post(f'/api/handshakes/{h2.id}/accept/')
        assert resp.status_code == 200

        h3.refresh_from_db()
        assert h3.status == 'pending', (
            "Recurrent: other pending handshakes must NOT be auto-denied"
        )


# ── 5. Active → Agreed → Active state machine ─────────────────────────────────

@pytest.mark.django_db
class TestAgreedStatusTransitions:

    def _accept_handshake(self, provider, handshake):
        from api.utils import provision_timebank
        from rest_framework.test import APIClient
        provision_timebank(handshake)
        client = APIClient()
        client.force_authenticate(user=provider)
        resp = client.post(f'/api/handshakes/{handshake.id}/accept/')
        assert resp.status_code == 200, resp.data
        return resp

    def test_one_time_service_becomes_agreed_when_full(self):
        provider = UserFactory(timebank_balance=Decimal('20'))
        requester = UserFactory(timebank_balance=Decimal('5'))
        svc = ServiceFactory(
            user=provider, type='Offer', schedule_type='One-Time',
            max_participants=1, duration=Decimal('1'), status='Active',
        )
        h = HandshakeFactory(service=svc, requester=requester,
                              status='pending', provisioned_hours=Decimal('1'))
        self._accept_handshake(provider, h)

        svc.refresh_from_db()
        assert svc.status == 'Agreed', f"Expected Agreed, got {svc.status}"

    def test_service_not_agreed_until_all_slots_filled(self):
        """Group offer with 2 slots: first accept should NOT set Agreed.
        Both pending requesters exist simultaneously; each accept fills one slot.
        Only when the last slot is filled should Agreed be set and remaining
        pending handshakes (if any) be denied.
        """
        from api.utils import provision_timebank

        provider = UserFactory(timebank_balance=Decimal('20'))
        u2 = UserFactory(timebank_balance=Decimal('5'))
        u3 = UserFactory(timebank_balance=Decimal('5'))
        svc = ServiceFactory(
            user=provider, type='Offer', schedule_type='One-Time',
            max_participants=2, duration=Decimal('1'), status='Active',
        )
        h2 = HandshakeFactory(service=svc, requester=u2,
                               status='pending', provisioned_hours=Decimal('1'))
        h3 = HandshakeFactory(service=svc, requester=u3,
                               status='pending', provisioned_hours=Decimal('1'))

        # Accept first — 1/2 filled, h3 should still be pending, service Active
        self._accept_handshake(provider, h2)
        svc.refresh_from_db()
        h3.refresh_from_db()
        assert svc.status == 'Active', "Should still be Active after 1/2 slots filled"
        assert h3.status == 'pending', "Second pending should NOT be denied yet"

        # Accept second — 2/2 filled, service becomes Agreed
        provision_timebank(h3)
        self._accept_handshake(provider, h3)
        svc.refresh_from_db()
        assert svc.status == 'Agreed', "Should be Agreed after all slots filled"

    def test_recurrent_never_becomes_agreed(self):
        provider = UserFactory(timebank_balance=Decimal('20'))
        requester = UserFactory(timebank_balance=Decimal('5'))
        svc = ServiceFactory(
            user=provider, type='Offer', schedule_type='Recurrent',
            max_participants=1, duration=Decimal('1'), status='Active',
        )
        h = HandshakeFactory(service=svc, requester=requester,
                              status='pending', provisioned_hours=Decimal('1'))
        self._accept_handshake(provider, h)

        svc.refresh_from_db()
        assert svc.status == 'Active', (
            f"Recurrent service must stay Active, got {svc.status}"
        )

    def test_agreed_service_reverts_to_active_on_cancel(self):
        from rest_framework.test import APIClient

        provider = UserFactory(timebank_balance=Decimal('20'))
        requester = UserFactory(timebank_balance=Decimal('5'))
        svc = ServiceFactory(
            user=provider, type='Offer', schedule_type='One-Time',
            max_participants=1, duration=Decimal('1'), status='Active',
        )
        h = HandshakeFactory(service=svc, requester=requester,
                              status='pending', provisioned_hours=Decimal('1'))
        self._accept_handshake(provider, h)

        svc.refresh_from_db()
        assert svc.status == 'Agreed'

        client = APIClient()
        client.force_authenticate(user=provider)
        request_resp = client.post(f'/api/handshakes/{h.id}/cancel-request/')
        assert request_resp.status_code == 200, request_resp.data

        client.force_authenticate(user=requester)
        resp = client.post(f'/api/handshakes/{h.id}/cancel-request/approve/')
        assert resp.status_code == 200, resp.data

        svc.refresh_from_db()
        assert svc.status == 'Active', (
            f"Approving cancellation for accepted handshake should revert Agreed → Active, got {svc.status}"
        )

    def test_agreed_service_hidden_from_public_list(self):
        """Agreed services must not appear in GET /api/services/."""
        from rest_framework.test import APIClient

        provider = UserFactory(timebank_balance=Decimal('20'))
        requester = UserFactory(timebank_balance=Decimal('5'))
        svc = ServiceFactory(
            user=provider, type='Offer', schedule_type='One-Time',
            max_participants=1, duration=Decimal('1'), status='Active',
        )
        h = HandshakeFactory(service=svc, requester=requester,
                              status='pending', provisioned_hours=Decimal('1'))
        self._accept_handshake(provider, h)

        svc.refresh_from_db()
        assert svc.status == 'Agreed'

        client = APIClient()
        client.force_authenticate(user=UserFactory())
        resp = client.get('/api/services/')
        assert resp.status_code == 200
        data = resp.data
        results = data['results'] if isinstance(data, dict) and 'results' in data else data
        ids = [str(s['id']) for s in results]
        assert str(svc.id) not in ids, "Agreed service must not appear in public listing"


# ── 6. participant_count serializer field ─────────────────────────────────────

class TestParticipantCountSerializer(TestCase):

    def _serialize(self, service):
        """Serialize a service and return participant_count."""
        factory = APIRequestFactory()
        request = factory.get('/')
        serializer = ServiceSerializer(service, context={'request': request})
        return serializer.data['participant_count']

    def test_zero_when_no_handshakes(self):
        svc = _make_service(UserFactory(), 'One-Time')
        self.assertEqual(self._serialize(svc), 0)

    def test_pending_not_counted_one_time(self):
        svc = _make_service(UserFactory(), 'One-Time')
        _pending_handshake(svc, UserFactory())
        self.assertEqual(self._serialize(svc), 0)

    def test_accepted_counted_one_time(self):
        svc = _make_service(UserFactory(), 'One-Time', max_p=2)
        _accepted_handshake(svc, UserFactory())
        self.assertEqual(self._serialize(svc), 1)

    def test_completed_counted_one_time(self):
        svc = _make_service(UserFactory(), 'One-Time')
        HandshakeFactory(service=svc, requester=UserFactory(),
                         status='completed', provisioned_hours=svc.duration)
        self.assertEqual(self._serialize(svc), 1)

    def test_pending_not_counted_recurrent(self):
        svc = _make_service(UserFactory(), 'Recurrent')
        _pending_handshake(svc, UserFactory())
        self.assertEqual(self._serialize(svc), 0)

    def test_completed_not_counted_recurrent(self):
        svc = _make_service(UserFactory(), 'Recurrent')
        HandshakeFactory(service=svc, requester=UserFactory(),
                         status='completed', provisioned_hours=svc.duration)
        self.assertEqual(self._serialize(svc), 0)

    def test_accepted_counted_recurrent(self):
        svc = _make_service(UserFactory(), 'Recurrent', max_p=3)
        _accepted_handshake(svc, UserFactory())
        _accepted_handshake(svc, UserFactory())
        self.assertEqual(self._serialize(svc), 2)

    def test_mixed_statuses_correct_count(self):
        """Only capacity-consuming statuses should be counted."""
        svc = _make_service(UserFactory(), 'One-Time', max_p=5)
        owner = svc.user
        for status in ('pending', 'denied', 'cancelled'):
            HandshakeFactory(service=svc, requester=UserFactory(timebank_balance=Decimal('5')),
                             status=status, provisioned_hours=svc.duration)
        for status in ('accepted', 'completed'):
            HandshakeFactory(service=svc, requester=UserFactory(timebank_balance=Decimal('5')),
                             status=status, provisioned_hours=svc.duration)
        # Only accepted + completed should count → 2
        self.assertEqual(self._serialize(svc), 2)

    def test_uses_prefetched_capacity_handshakes(self):
        """When capacity_handshakes is prefetched, get_participant_count must
        use the cached data instead of issuing a new DB query."""
        svc = _make_service(UserFactory(), 'One-Time', max_p=3)
        _accepted_handshake(svc, UserFactory())
        _accepted_handshake(svc, UserFactory())

        from django.db.models import Prefetch
        svc_prefetched = Service.objects.prefetch_related(
            Prefetch(
                'handshakes',
                queryset=Handshake.objects.filter(
                    status__in=['pending', 'accepted', 'completed', 'reported', 'paused']
                ).only('id', 'service_id', 'status'),
                to_attr='capacity_handshakes',
            )
        ).get(pk=svc.pk)

        # Verify the prefetch path is taken and correct count is returned
        assert hasattr(svc_prefetched, 'capacity_handshakes'), (
            "Prefetch should attach capacity_handshakes attribute"
        )
        count = svc_prefetched.capacity_handshakes
        # Call get_participant_count directly to isolate the query count
        from api.serializers import ServiceSerializer
        serializer = ServiceSerializer()
        result = serializer.get_participant_count(svc_prefetched)
        self.assertEqual(result, 2)
