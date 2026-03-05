"""
Integration tests for handshake API endpoints
"""
import pytest
from rest_framework import status
from decimal import Decimal
from datetime import timedelta
from django.utils import timezone

from api.tests.helpers.factories import (
    UserFactory, ServiceFactory, HandshakeFactory
)
from api.tests.helpers.test_client import AuthenticatedAPIClient
from api.models import Handshake


@pytest.mark.django_db
@pytest.mark.integration
class TestExpressInterestView:
    """Test ExpressInterestView (POST /api/services/{id}/interest/)"""
    
    def test_express_interest_success(self):
        """Test successfully expressing interest"""
        provider = UserFactory(timebank_balance=Decimal('5.00'))
        requester = UserFactory(timebank_balance=Decimal('3.00'))
        service = ServiceFactory(user=provider, type='Offer', duration=Decimal('2.00'))
        
        client = AuthenticatedAPIClient()
        client.authenticate_user(requester)
        
        response = client.post(f'/api/services/{service.id}/interest/')
        assert response.status_code == status.HTTP_201_CREATED
        assert Handshake.objects.filter(
            service=service,
            requester=requester,
            status='pending'
        ).exists()
    
    def test_express_interest_insufficient_balance(self):
        """Test expressing interest with insufficient balance"""
        provider = UserFactory()
        requester = UserFactory(timebank_balance=Decimal('0.50'))
        service = ServiceFactory(user=provider, type='Offer', duration=Decimal('2.00'))
        
        client = AuthenticatedAPIClient()
        client.authenticate_user(requester)
        
        response = client.post(f'/api/services/{service.id}/interest/')
        assert response.status_code == status.HTTP_400_BAD_REQUEST
    
    def test_express_interest_own_service(self):
        """Test cannot express interest in own service"""
        user = UserFactory()
        service = ServiceFactory(user=user)
        
        client = AuthenticatedAPIClient()
        client.authenticate_user(user)
        
        response = client.post(f'/api/services/{service.id}/interest/')
        assert response.status_code == status.HTTP_400_BAD_REQUEST
    
    def test_express_interest_max_participants(self):
        """Test cannot express interest when max participants reached"""
        provider = UserFactory()
        service = ServiceFactory(user=provider, max_participants=1)
        requester1 = UserFactory()
        requester2 = UserFactory()
        
        HandshakeFactory(service=service, requester=requester1, status='accepted')
        
        client = AuthenticatedAPIClient()
        client.authenticate_user(requester2)
        
        response = client.post(f'/api/services/{service.id}/interest/')
        assert response.status_code == status.HTTP_400_BAD_REQUEST


@pytest.mark.django_db
@pytest.mark.integration
class TestHandshakeViewSet:
    """Test HandshakeViewSet"""
    
    def test_list_handshakes(self):
        """Test listing handshakes"""
        user = UserFactory()
        service = ServiceFactory(user=user)
        HandshakeFactory.create_batch(3, service=service, requester=UserFactory())
        
        client = AuthenticatedAPIClient()
        client.authenticate_user(user)
        
        response = client.get('/api/handshakes/')
        assert response.status_code == status.HTTP_200_OK
        assert isinstance(response.data, list)
        assert len(response.data) == 3

    def test_list_handshakes_includes_user_has_reviewed(self):
        """GET /api/handshakes/ includes user_has_reviewed; True after current user submits review"""
        provider = UserFactory()
        requester = UserFactory()
        service = ServiceFactory(user=provider, type='Offer')
        now = timezone.now()
        handshake = HandshakeFactory(
            service=service,
            requester=requester,
            status='completed',
            evaluation_window_starts_at=now - timedelta(hours=1),
            evaluation_window_ends_at=now + timedelta(hours=47),
            evaluation_window_closed_at=None,
        )
        client = AuthenticatedAPIClient()
        client.authenticate_user(requester)

        response = client.get('/api/handshakes/')
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data) >= 1
        h = next((x for x in response.data if str(x['id']) == str(handshake.id)), None)
        assert h is not None
        assert 'user_has_reviewed' in h
        assert h['user_has_reviewed'] is False

        client.post('/api/reputation/', {
            'handshake_id': str(handshake.id),
            'punctual': True,
            'helpful': True,
            'kindness': True,
        })
        response2 = client.get('/api/handshakes/')
        assert response2.status_code == status.HTTP_200_OK
        h2 = next((x for x in response2.data if str(x['id']) == str(handshake.id)), None)
        assert h2 is not None
        assert h2['user_has_reviewed'] is True
    
    def test_initiate_handshake(self):
        """Test provider initiating handshake"""
        provider = UserFactory()
        requester = UserFactory()
        service = ServiceFactory(user=provider, type='Offer')
        handshake = HandshakeFactory(service=service, requester=requester, status='pending')
        
        client = AuthenticatedAPIClient()
        client.authenticate_user(provider)
        
        response = client.post(f'/api/handshakes/{handshake.id}/initiate/', {
            'exact_location': 'Test Location',
            'exact_duration': 2.0,
            'scheduled_time': '2027-12-20T10:00:00Z'
        })
        assert response.status_code == status.HTTP_200_OK
        
        handshake.refresh_from_db()
        assert handshake.provider_initiated is True
        assert handshake.exact_location == 'Test Location'
    
    def test_approve_handshake(self):
        """Test receiver approving handshake"""
        provider = UserFactory()
        requester = UserFactory(timebank_balance=Decimal('3.00'))
        service = ServiceFactory(user=provider, type='Offer', duration=Decimal('2.00'))
        handshake = HandshakeFactory(
            service=service,
            requester=requester,
            status='pending',
            provider_initiated=True,
            exact_location='Test Location',
            exact_duration=Decimal('2.00'),
            scheduled_time=timezone.now() + timedelta(days=1)
        )
        
        client = AuthenticatedAPIClient()
        client.authenticate_user(requester)
        
        response = client.post(f'/api/handshakes/{handshake.id}/approve/')
        assert response.status_code == status.HTTP_200_OK
        
        handshake.refresh_from_db()
        assert handshake.status == 'accepted'
        assert handshake.provisioned_hours > 0
        
        requester.refresh_from_db()
        assert requester.timebank_balance < Decimal('3.00')
    
    def test_confirm_completion(self):
        """Test confirming handshake completion"""
        provider = UserFactory(timebank_balance=Decimal('5.00'))
        requester = UserFactory(timebank_balance=Decimal('1.00'))
        service = ServiceFactory(user=provider, type='Offer', duration=Decimal('2.00'))
        handshake = HandshakeFactory(
            service=service,
            requester=requester,
            status='accepted',
            provisioned_hours=Decimal('2.00'),
            provider_initiated=True,
            requester_initiated=True
        )
        
        client = AuthenticatedAPIClient()
        client.authenticate_user(provider)
        
        response = client.post(f'/api/handshakes/{handshake.id}/confirm/')
        assert response.status_code == status.HTTP_200_OK
        
        handshake.refresh_from_db()
        assert handshake.provider_confirmed_complete is True
        
        client.authenticate_user(requester)
        response = client.post(f'/api/handshakes/{handshake.id}/confirm/')
        assert response.status_code == status.HTTP_200_OK
        
        handshake.refresh_from_db()
        assert handshake.status == 'completed'
        assert handshake.receiver_confirmed_complete is True
        
        provider.refresh_from_db()
        assert provider.timebank_balance > Decimal('5.00')
    
    def test_cancel_handshake(self):
        """Test canceling a handshake"""
        provider = UserFactory()
        requester = UserFactory(timebank_balance=Decimal('1.00'))
        service = ServiceFactory(user=provider, type='Offer', duration=Decimal('2.00'))
        handshake = HandshakeFactory(
            service=service,
            requester=requester,
            status='accepted',
            provisioned_hours=Decimal('2.00')
        )
        
        client = AuthenticatedAPIClient()
        client.authenticate_user(provider)
        
        response = client.post(f'/api/handshakes/{handshake.id}/cancel/')
        assert response.status_code == status.HTTP_200_OK
        
        handshake.refresh_from_db()
        assert handshake.status == 'cancelled'
        
        requester.refresh_from_db()
        assert requester.timebank_balance == Decimal('3.00')


# ── Tests: initiate/approve permission changes (service-owner-first model) ────


@pytest.mark.django_db
@pytest.mark.integration
class TestInitiateApproveServiceOwnerModel:
    """
    New rule: the SERVICE OWNER always initiates session details,
    regardless of Offer/Need type. The person who expressed interest (requester)
    then approves.
    """

    FUTURE = timezone.now() + timedelta(days=5)
    INITIATE_PAYLOAD = {
        'exact_location': 'Test Cafe, Beşiktaş',
        'exact_duration': 1.5,
        'scheduled_time': (timezone.now() + timedelta(days=5)).isoformat(),
    }

    # ── Offer service ─────────────────────────────────────────────────────────

    def test_offer_owner_can_initiate(self):
        """Offer service owner (provider) can still initiate — no regression."""
        service_owner = UserFactory()
        requester = UserFactory()
        service = ServiceFactory(user=service_owner, type='Offer')
        handshake = HandshakeFactory(service=service, requester=requester, status='pending')

        client = AuthenticatedAPIClient()
        client.authenticate_user(service_owner)
        resp = client.post(f'/api/handshakes/{handshake.id}/initiate/', self.INITIATE_PAYLOAD)
        assert resp.status_code == status.HTTP_200_OK
        handshake.refresh_from_db()
        assert handshake.provider_initiated is True

    def test_offer_requester_cannot_initiate(self):
        """Requester cannot initiate an Offer handshake — only service owner can."""
        service_owner = UserFactory()
        requester = UserFactory()
        service = ServiceFactory(user=service_owner, type='Offer')
        handshake = HandshakeFactory(service=service, requester=requester, status='pending')

        client = AuthenticatedAPIClient()
        client.authenticate_user(requester)
        resp = client.post(f'/api/handshakes/{handshake.id}/initiate/', self.INITIATE_PAYLOAD)
        assert resp.status_code == status.HTTP_403_FORBIDDEN

    def test_offer_requester_can_approve(self):
        """Requester (interest expresser) can approve an Offer handshake."""
        service_owner = UserFactory()
        requester = UserFactory(timebank_balance=Decimal('5.00'))
        service = ServiceFactory(user=service_owner, type='Offer', duration=Decimal('1.00'))
        handshake = HandshakeFactory(
            service=service, requester=requester, status='pending',
            provider_initiated=True,
            exact_location='Test Location',
            exact_duration=Decimal('1.00'),
            scheduled_time=timezone.now() + timedelta(days=3),
        )

        client = AuthenticatedAPIClient()
        client.authenticate_user(requester)
        resp = client.post(f'/api/handshakes/{handshake.id}/approve/', {})
        assert resp.status_code == status.HTTP_200_OK
        handshake.refresh_from_db()
        assert handshake.status == 'accepted'

    def test_offer_service_owner_cannot_approve_own_handshake(self):
        """Service owner cannot approve their own handshake."""
        service_owner = UserFactory()
        requester = UserFactory(timebank_balance=Decimal('5.00'))
        service = ServiceFactory(user=service_owner, type='Offer', duration=Decimal('1.00'))
        handshake = HandshakeFactory(
            service=service, requester=requester, status='pending',
            provider_initiated=True,
            exact_location='Test Location',
            exact_duration=Decimal('1.00'),
            scheduled_time=timezone.now() + timedelta(days=3),
        )

        client = AuthenticatedAPIClient()
        client.authenticate_user(service_owner)
        resp = client.post(f'/api/handshakes/{handshake.id}/approve/', {})
        assert resp.status_code == status.HTTP_403_FORBIDDEN

    # ── Need/Want service ─────────────────────────────────────────────────────

    def test_need_service_owner_can_initiate(self):
        """
        Need/Want service owner can initiate session details.
        Previously only the 'provider' (= requester for Need) could do this.
        """
        service_owner = UserFactory()
        helper = UserFactory()  # person who expressed interest to fulfill the Need
        service = ServiceFactory(user=service_owner, type='Need')
        handshake = HandshakeFactory(service=service, requester=helper, status='pending')

        client = AuthenticatedAPIClient()
        client.authenticate_user(service_owner)
        resp = client.post(f'/api/handshakes/{handshake.id}/initiate/', self.INITIATE_PAYLOAD)
        assert resp.status_code == status.HTTP_200_OK
        handshake.refresh_from_db()
        assert handshake.provider_initiated is True
        assert handshake.exact_location == 'Test Cafe, Beşiktaş'

    def test_need_helper_cannot_initiate(self):
        """
        The helper (who expressed interest) cannot initiate a Need handshake —
        only the service owner can propose session details.
        """
        service_owner = UserFactory()
        helper = UserFactory()
        service = ServiceFactory(user=service_owner, type='Need')
        handshake = HandshakeFactory(service=service, requester=helper, status='pending')

        client = AuthenticatedAPIClient()
        client.authenticate_user(helper)
        resp = client.post(f'/api/handshakes/{handshake.id}/initiate/', self.INITIATE_PAYLOAD)
        assert resp.status_code == status.HTTP_403_FORBIDDEN

    def test_need_helper_can_approve(self):
        """
        The helper (requester) approves the session details set by the Need service owner.
        This was previously only allowed for the 'receiver' role.
        """
        service_owner = UserFactory()
        helper = UserFactory(timebank_balance=Decimal('5.00'))
        service = ServiceFactory(user=service_owner, type='Need', duration=Decimal('1.00'))
        handshake = HandshakeFactory(
            service=service, requester=helper, status='pending',
            provider_initiated=True,
            exact_location='Need Location',
            exact_duration=Decimal('1.00'),
            scheduled_time=timezone.now() + timedelta(days=3),
        )

        client = AuthenticatedAPIClient()
        client.authenticate_user(helper)
        resp = client.post(f'/api/handshakes/{handshake.id}/approve/', {})
        assert resp.status_code == status.HTTP_200_OK
        handshake.refresh_from_db()
        assert handshake.status == 'accepted'

    def test_need_service_owner_cannot_approve_own_handshake(self):
        """Need service owner cannot approve — they are the initiator, not the approver."""
        service_owner = UserFactory()
        helper = UserFactory(timebank_balance=Decimal('5.00'))
        service = ServiceFactory(user=service_owner, type='Need', duration=Decimal('1.00'))
        handshake = HandshakeFactory(
            service=service, requester=helper, status='pending',
            provider_initiated=True,
            exact_location='Need Location',
            exact_duration=Decimal('1.00'),
            scheduled_time=timezone.now() + timedelta(days=3),
        )

        client = AuthenticatedAPIClient()
        client.authenticate_user(service_owner)
        resp = client.post(f'/api/handshakes/{handshake.id}/approve/', {})
        assert resp.status_code == status.HTTP_403_FORBIDDEN

    def test_third_party_cannot_initiate_or_approve(self):
        """
        An unrelated user cannot initiate or approve any handshake.
        Backend may return 403 (permission denied) or 404 (resource hidden) —
        both are acceptable security responses that prevent access.
        """
        service_owner = UserFactory()
        requester = UserFactory()
        stranger = UserFactory()
        service = ServiceFactory(user=service_owner, type='Offer')
        handshake = HandshakeFactory(service=service, requester=requester, status='pending')

        client = AuthenticatedAPIClient()
        client.authenticate_user(stranger)

        resp = client.post(f'/api/handshakes/{handshake.id}/initiate/', self.INITIATE_PAYLOAD)
        assert resp.status_code in (status.HTTP_403_FORBIDDEN, status.HTTP_404_NOT_FOUND)

        handshake.provider_initiated = True
        handshake.exact_location = 'Loc'
        handshake.exact_duration = Decimal('1.00')
        handshake.scheduled_time = timezone.now() + timedelta(days=3)
        handshake.save()

        resp = client.post(f'/api/handshakes/{handshake.id}/approve/', {})
        assert resp.status_code in (status.HTTP_403_FORBIDDEN, status.HTTP_404_NOT_FOUND)


# ── New tests: capacity system + Agreed status ────────────────────────────────


@pytest.mark.django_db
@pytest.mark.integration
class TestPendingCapacityIntegration:
    """Pending handshakes must never block new interest expressions."""

    def test_multiple_users_can_express_interest_simultaneously(self):
        """Three users can all express interest in a max_participants=1 One-Time service
        because pending doesn't consume a slot."""
        from api.utils import provision_timebank

        provider = UserFactory(timebank_balance=Decimal('20'))
        u1 = UserFactory(timebank_balance=Decimal('5'))
        u2 = UserFactory(timebank_balance=Decimal('5'))
        u3 = UserFactory(timebank_balance=Decimal('5'))
        svc = ServiceFactory(
            user=provider, type='Offer', schedule_type='One-Time',
            max_participants=1, duration=Decimal('1'), status='Active',
        )

        client = AuthenticatedAPIClient()
        for user in (u1, u2, u3):
            client.authenticate_user(user)
            resp = client.post(f'/api/services/{svc.id}/interest/')
            assert resp.status_code == status.HTTP_201_CREATED, (
                f"User {user.email} should be able to express interest: {resp.data}"
            )

        assert Handshake.objects.filter(service=svc, status='pending').count() == 3

    def test_accepted_slot_blocks_new_interest(self):
        """After one handshake is accepted, the slot is consumed and no further
        interest can be expressed on a max_participants=1 One-Time service."""
        from api.utils import provision_timebank

        provider = UserFactory(timebank_balance=Decimal('20'))
        u1 = UserFactory(timebank_balance=Decimal('5'))
        u2 = UserFactory(timebank_balance=Decimal('5'))
        svc = ServiceFactory(
            user=provider, type='Offer', schedule_type='One-Time',
            max_participants=1, duration=Decimal('1'), status='Active',
        )
        h1 = HandshakeFactory(service=svc, requester=u1,
                               status='pending', provisioned_hours=Decimal('1'))
        provision_timebank(h1)

        # accept h1
        client = AuthenticatedAPIClient()
        client.authenticate_user(provider)
        client.post(f'/api/handshakes/{h1.id}/accept/')

        # u2 tries to express interest — service is now Agreed (hidden) or full
        # Backend returns 404 (service not in Active queryset) or 400 (capacity)
        client.authenticate_user(u2)
        resp = client.post(f'/api/services/{svc.id}/interest/')
        assert resp.status_code in (
            status.HTTP_400_BAD_REQUEST,
            status.HTTP_404_NOT_FOUND,
        ), f"Expected 400 or 404, got {resp.status_code}"


@pytest.mark.django_db
@pytest.mark.integration
class TestAcceptAutoDenyIntegration:
    """Accepting a One-Time handshake auto-denies all other pending ones."""

    def _setup_one_time(self, max_p=1):
        from api.utils import provision_timebank

        provider = UserFactory(timebank_balance=Decimal('20'))
        svc = ServiceFactory(
            user=provider, type='Offer', schedule_type='One-Time',
            max_participants=max_p, duration=Decimal('1'), status='Active',
        )
        requesters = [UserFactory(timebank_balance=Decimal('5')) for _ in range(3)]
        handshakes = []
        for r in requesters:
            h = HandshakeFactory(service=svc, requester=r,
                                 status='pending', provisioned_hours=Decimal('1'))
            provision_timebank(h)
            handshakes.append(h)
        return provider, svc, requesters, handshakes

    def test_accept_last_slot_denies_remaining_pending(self):
        """For max_p=1: accepting fills the only slot → other pending get denied."""
        provider, svc, _, handshakes = self._setup_one_time(max_p=1)
        h_accept = handshakes[0]

        client = AuthenticatedAPIClient()
        client.authenticate_user(provider)
        resp = client.post(f'/api/handshakes/{h_accept.id}/accept/')
        assert resp.status_code == status.HTTP_200_OK

        for h in handshakes[1:]:
            h.refresh_from_db()
            assert h.status == 'denied', f"Expected denied when capacity full, got {h.status}"

    def test_denied_count_correct_when_capacity_full(self):
        """max_p=1: accept 1 → remaining 2 denied."""
        provider, svc, _, handshakes = self._setup_one_time(max_p=1)
        client = AuthenticatedAPIClient()
        client.authenticate_user(provider)
        client.post(f'/api/handshakes/{handshakes[0].id}/accept/')

        denied = Handshake.objects.filter(service=svc, status='denied').count()
        assert denied == 2

    def test_group_offer_pending_stays_until_all_slots_filled(self):
        """Group offer with max_p=2: accepting the first should NOT deny the
        second pending — one slot remains open for it."""
        provider, svc, _, handshakes = self._setup_one_time(max_p=2)
        client = AuthenticatedAPIClient()
        client.authenticate_user(provider)
        client.post(f'/api/handshakes/{handshakes[0].id}/accept/')

        # handshakes[1] must remain pending (1 slot still open)
        handshakes[1].refresh_from_db()
        assert handshakes[1].status == 'pending', (
            "Second pending must stay pending while a slot remains"
        )
        # handshakes[2] must also remain pending
        handshakes[2].refresh_from_db()
        assert handshakes[2].status == 'pending', (
            "Third pending must stay pending while a slot remains"
        )


@pytest.mark.django_db
@pytest.mark.integration
class TestAgreedStatusIntegration:
    """Service status lifecycle: Active → Agreed → Active."""

    def _accept(self, provider, handshake):
        from api.utils import provision_timebank
        provision_timebank(handshake)
        client = AuthenticatedAPIClient()
        client.authenticate_user(provider)
        resp = client.post(f'/api/handshakes/{handshake.id}/accept/')
        assert resp.status_code == status.HTTP_200_OK, resp.data

    def test_one_time_service_becomes_agreed_on_full_accept(self):
        provider = UserFactory(timebank_balance=Decimal('20'))
        requester = UserFactory(timebank_balance=Decimal('5'))
        svc = ServiceFactory(
            user=provider, type='Offer', schedule_type='One-Time',
            max_participants=1, duration=Decimal('1'), status='Active',
        )
        h = HandshakeFactory(service=svc, requester=requester,
                              status='pending', provisioned_hours=Decimal('1'))
        self._accept(provider, h)

        svc.refresh_from_db()
        assert svc.status == 'Agreed'

    def test_agreed_service_excluded_from_list(self):
        provider = UserFactory(timebank_balance=Decimal('20'))
        requester = UserFactory(timebank_balance=Decimal('5'))
        svc = ServiceFactory(
            user=provider, type='Offer', schedule_type='One-Time',
            max_participants=1, duration=Decimal('1'), status='Active',
        )
        h = HandshakeFactory(service=svc, requester=requester,
                              status='pending', provisioned_hours=Decimal('1'))
        self._accept(provider, h)

        viewer = UserFactory()
        client = AuthenticatedAPIClient()
        client.authenticate_user(viewer)
        resp = client.get('/api/services/')
        assert resp.status_code == status.HTTP_200_OK
        data = resp.data
        results = data['results'] if isinstance(data, dict) and 'results' in data else data
        ids = [str(s['id']) for s in results]
        assert str(svc.id) not in ids

    def test_cancel_agreed_reverts_to_active(self):
        provider = UserFactory(timebank_balance=Decimal('20'))
        requester = UserFactory(timebank_balance=Decimal('5'))
        svc = ServiceFactory(
            user=provider, type='Offer', schedule_type='One-Time',
            max_participants=1, duration=Decimal('1'), status='Active',
        )
        h = HandshakeFactory(service=svc, requester=requester,
                              status='pending', provisioned_hours=Decimal('1'))
        self._accept(provider, h)
        svc.refresh_from_db()
        assert svc.status == 'Agreed'

        client = AuthenticatedAPIClient()
        client.authenticate_user(provider)
        resp = client.post(f'/api/handshakes/{h.id}/cancel/')
        assert resp.status_code == status.HTTP_200_OK

        svc.refresh_from_db()
        assert svc.status == 'Active'

    def test_cancel_agreed_service_reappears_in_list(self):
        provider = UserFactory(timebank_balance=Decimal('20'))
        requester = UserFactory(timebank_balance=Decimal('5'))
        svc = ServiceFactory(
            user=provider, type='Offer', schedule_type='One-Time',
            max_participants=1, duration=Decimal('1'), status='Active',
        )
        h = HandshakeFactory(service=svc, requester=requester,
                              status='pending', provisioned_hours=Decimal('1'))
        self._accept(provider, h)

        client = AuthenticatedAPIClient()
        client.authenticate_user(provider)
        client.post(f'/api/handshakes/{h.id}/cancel/')

        viewer = UserFactory()
        client.authenticate_user(viewer)
        resp = client.get('/api/services/')
        data = resp.data
        results = data['results'] if isinstance(data, dict) and 'results' in data else data
        ids = [str(s['id']) for s in results]
        assert str(svc.id) in ids, "After cancel, Active service should reappear in listing"

    def test_recurrent_service_stays_active_after_accept(self):
        provider = UserFactory(timebank_balance=Decimal('20'))
        requester = UserFactory(timebank_balance=Decimal('5'))
        svc = ServiceFactory(
            user=provider, type='Offer', schedule_type='Recurrent',
            max_participants=1, duration=Decimal('1'), status='Active',
        )
        h = HandshakeFactory(service=svc, requester=requester,
                              status='pending', provisioned_hours=Decimal('1'))
        self._accept(provider, h)

        svc.refresh_from_db()
        assert svc.status == 'Active', (
            f"Recurrent service must stay Active after accept, got {svc.status}"
        )
