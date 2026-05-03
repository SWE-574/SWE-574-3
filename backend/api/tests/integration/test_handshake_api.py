"""
Integration tests for handshake API endpoints
"""
import pytest
from rest_framework import status
from rest_framework.test import APIClient
from decimal import Decimal
from datetime import timedelta
from django.utils import timezone
from unittest.mock import AsyncMock, patch

from api.tests.helpers.factories import (
    UserFactory, ServiceFactory, HandshakeFactory
)
from api.tests.helpers.test_client import AuthenticatedAPIClient
from api.models import Handshake, ChatMessage


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

    # ── Email verification gate for express-interest ────────────────────
    # Applicants must be verified to request an Offer or offer help on a Need.
    # The same gate is enforced on /api/handshakes/services/<id>/interest/.

    def test_express_interest_blocked_for_unverified_user(self):
        provider = UserFactory(timebank_balance=Decimal('5.00'))
        requester = UserFactory(
            timebank_balance=Decimal('3.00'), is_verified=False
        )
        service = ServiceFactory(
            user=provider, type='Offer', duration=Decimal('2.00')
        )

        client = AuthenticatedAPIClient().authenticate_user(requester)

        response = client.post(f'/api/services/{service.id}/interest/')

        assert response.status_code == status.HTTP_403_FORBIDDEN
        assert response.data.get('code') == 'EMAIL_NOT_VERIFIED'
        assert not Handshake.objects.filter(
            service=service, requester=requester
        ).exists()

    def test_express_interest_blocked_for_unverified_user_on_need(self):
        provider = UserFactory(timebank_balance=Decimal('5.00'))
        requester = UserFactory(
            timebank_balance=Decimal('3.00'), is_verified=False
        )
        need = ServiceFactory(
            user=provider, type='Need', duration=Decimal('1.00')
        )

        client = AuthenticatedAPIClient().authenticate_user(requester)

        response = client.post(f'/api/services/{need.id}/interest/')

        assert response.status_code == status.HTTP_403_FORBIDDEN
        assert response.data.get('code') == 'EMAIL_NOT_VERIFIED'
        assert not Handshake.objects.filter(
            service=need, requester=requester
        ).exists()

    def test_express_interest_router_action_blocked_for_unverified_user(self):
        """The /handshakes/services/<id>/interest/ alias must apply the same gate."""
        provider = UserFactory(timebank_balance=Decimal('5.00'))
        requester = UserFactory(
            timebank_balance=Decimal('3.00'), is_verified=False
        )
        service = ServiceFactory(
            user=provider, type='Offer', duration=Decimal('2.00')
        )

        client = AuthenticatedAPIClient().authenticate_user(requester)

        response = client.post(f'/api/handshakes/services/{service.id}/interest/')

        assert response.status_code == status.HTTP_403_FORBIDDEN
        assert response.data.get('code') == 'EMAIL_NOT_VERIFIED'
    
    def test_express_interest_insufficient_balance(self):
        """Test expressing interest with insufficient balance"""
        provider = UserFactory()
        requester = UserFactory(timebank_balance=Decimal('1.00'))
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

    def test_express_interest_creates_chat_thread_with_opening_message(self):
        """FR-10a/10b: expressing interest creates private thread and opening message."""
        provider = UserFactory(timebank_balance=Decimal('5.00'))
        requester = UserFactory(timebank_balance=Decimal('5.00'))
        service = ServiceFactory(user=provider, type='Offer', duration=Decimal('2.00'))

        client = AuthenticatedAPIClient()
        client.authenticate_user(requester)

        interest_response = client.post(f'/api/services/{service.id}/interest/')
        assert interest_response.status_code == status.HTTP_201_CREATED

        handshake_id = interest_response.data['id']
        assert str(interest_response.data['status']).lower() == 'pending'

        # Requester can see the conversation in chat list.
        requester_list = client.get('/api/chats/')
        assert requester_list.status_code == status.HTTP_200_OK
        requester_rows = requester_list.data.get('results', requester_list.data)
        assert any(row['handshake_id'] == str(handshake_id) for row in requester_rows)

        # Requester can fetch messages and sees the auto opening text.
        requester_thread = client.get(f'/api/chats/{handshake_id}/')
        assert requester_thread.status_code == status.HTTP_200_OK
        requester_messages = requester_thread.data.get('results', [])
        assert len(requester_messages) >= 1
        assert any(
            'interested in your service' in message['body']
            for message in requester_messages
        )

        # Provider can also fetch the same thread.
        client.authenticate_user(provider)
        provider_thread = client.get(f'/api/chats/{handshake_id}/')
        assert provider_thread.status_code == status.HTTP_200_OK
        provider_messages = provider_thread.data.get('results', [])
        assert any(
            'interested in your service' in message['body']
            for message in provider_messages
        )

    def test_express_interest_broadcasts_opening_message_via_websocket(self):
        """FR-10f: opening message should be delivered in real time when thread is created."""
        provider = UserFactory(timebank_balance=Decimal('5.00'))
        requester = UserFactory(timebank_balance=Decimal('5.00'))
        service = ServiceFactory(user=provider, type='Offer', duration=Decimal('2.00'))

        client = AuthenticatedAPIClient()
        client.authenticate_user(requester)

        fake_channel_layer = type('FakeChannelLayer', (), {})()
        fake_channel_layer.group_send = AsyncMock(return_value=None)

        with (
            patch('channels.layers.get_channel_layer', return_value=fake_channel_layer),
            patch('api.services.transaction.on_commit', side_effect=lambda callback: callback()),
        ):
            response = client.post(f'/api/services/{service.id}/interest/')

        assert response.status_code == status.HTTP_201_CREATED
        assert fake_channel_layer.group_send.await_count >= 1
        chat_group_name = f"chat_{response.data['id']}"
        chat_events = [
            call.args for call in fake_channel_layer.group_send.await_args_list
            if call.args and call.args[0] == chat_group_name
        ]
        assert chat_events, f'No websocket event was sent to {chat_group_name}'

        _, called_payload = chat_events[-1]
        assert called_payload['type'] == 'chat_message'
        assert 'interested in your service' in called_payload['message']['body']


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
        service = ServiceFactory(user=provider, type='Offer', location_type='In-Person')
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

        # Automated session summary is posted to chat
        summary_msgs = ChatMessage.objects.filter(handshake=handshake, sender=provider)
        assert summary_msgs.count() == 1
        body = summary_msgs.first().body
        assert 'Test Location' in body
        assert 'google.com/maps' in body
        assert '\U0001F4C5' in body or '📅' in body
        assert '\U0001F4CD' in body or '📍' in body

    def test_group_offer_initiate_uses_service_details(self):
        """One-time group offers must reuse service-level date/location details."""
        provider = UserFactory()
        requester = UserFactory()
        service = ServiceFactory(
            user=provider,
            type='Offer',
            schedule_type='One-Time',
            max_participants=3,
            duration=Decimal('2.00'),
            location_type='In-Person',
            location_area='Kadıköy Youth Center',
            location_lat=Decimal('40.987654'),
            location_lng=Decimal('29.123456'),
            session_exact_location='Caferağa Mahallesi, Moda Caddesi No: 185, Kadıköy, İstanbul, Türkiye',
            session_exact_location_lat=Decimal('40.987654'),
            session_exact_location_lng=Decimal('29.123456'),
            session_location_guide='Veterinerin olduğu bina',
            scheduled_time=timezone.now() + timedelta(days=4),
        )
        handshake = HandshakeFactory(service=service, requester=requester, status='pending')

        client = AuthenticatedAPIClient()
        client.authenticate_user(provider)

        response = client.post(f'/api/handshakes/{handshake.id}/initiate/', {
            'exact_location': 'Tamper attempt',
            'exact_duration': 9,
            'scheduled_time': '2099-01-01T10:00:00Z',
        })
        assert response.status_code == status.HTTP_200_OK

        handshake.refresh_from_db()
        assert handshake.provider_initiated is True
        assert handshake.exact_location == service.session_exact_location
        assert handshake.exact_location_guide == service.session_location_guide
        assert handshake.exact_duration == service.duration
        assert handshake.scheduled_time == service.scheduled_time
        assert handshake.exact_location_maps_url == 'https://www.google.com/maps?q=40.987654,29.123456'

        # Fixed-group initiate also posts session summary to chat
        summary_msgs = ChatMessage.objects.filter(handshake=handshake, sender=provider)
        assert summary_msgs.count() == 1
        assert service.session_exact_location in summary_msgs.first().body
        assert service.session_location_guide in summary_msgs.first().body
        assert 'google.com/maps' in summary_msgs.first().body

    def test_online_offer_initiate_does_not_require_or_share_location(self):
        provider = UserFactory()
        requester = UserFactory()
        service = ServiceFactory(
            user=provider,
            type='Offer',
            location_type='Online',
            location_area='Zoom',
        )
        handshake = HandshakeFactory(service=service, requester=requester, status='pending')

        client = AuthenticatedAPIClient()
        client.authenticate_user(provider)

        response = client.post(f'/api/handshakes/{handshake.id}/initiate/', {
            'exact_duration': 2,
            'scheduled_time': '2027-12-20T10:00:00Z',
        })
        assert response.status_code == status.HTTP_200_OK

        handshake.refresh_from_db()
        assert handshake.provider_initiated is True
        assert handshake.exact_location == ''
        assert handshake.exact_location_maps_url is None

        summary_msgs = ChatMessage.objects.filter(handshake=handshake, sender=provider)
        assert summary_msgs.count() == 1
        body = summary_msgs.first().body
        assert 'google.com/maps' not in body
        assert '\U0001F4CD' not in body
        assert '\U0001F4C5' in body or '📅' in body

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

        # Approve posts confirmation message to chat
        approve_msgs = ChatMessage.objects.filter(handshake=handshake, sender=requester, body__contains='Session approved!')
        assert approve_msgs.count() == 1
        assert 'Test Location' in approve_msgs.first().body
        
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
    
    def test_request_and_approve_cancellation(self):
        """Accepted Offer/Need handshakes require a mutual cancellation approval."""
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

        request_response = client.post(f'/api/handshakes/{handshake.id}/cancel-request/', {
            'reason': 'Unexpected conflict',
        })
        assert request_response.status_code == status.HTTP_200_OK

        handshake.refresh_from_db()
        assert handshake.status == 'accepted'
        assert handshake.cancellation_requested_by == provider
        assert handshake.cancellation_reason == 'Unexpected conflict'

        client.authenticate_user(requester)
        response = client.post(f'/api/handshakes/{handshake.id}/cancel-request/approve/')
        assert response.status_code == status.HTTP_200_OK
        
        handshake.refresh_from_db()
        assert handshake.status == 'cancelled'
        
        requester.refresh_from_db()
        assert requester.timebank_balance == Decimal('3.00')

    def test_reject_cancellation_request_keeps_handshake_active(self):
        provider = UserFactory()
        requester = UserFactory(timebank_balance=Decimal('4.00'))
        service = ServiceFactory(user=provider, type='Offer', duration=Decimal('2.00'))
        handshake = HandshakeFactory(
            service=service,
            requester=requester,
            status='accepted',
            provisioned_hours=Decimal('2.00'),
        )

        client = AuthenticatedAPIClient()
        client.authenticate_user(provider)
        request_response = client.post(f'/api/handshakes/{handshake.id}/cancel-request/', {
            'reason': 'Need to reschedule instead',
        })
        assert request_response.status_code == status.HTTP_200_OK

        client.authenticate_user(requester)
        reject_response = client.post(f'/api/handshakes/{handshake.id}/cancel-request/reject/')
        assert reject_response.status_code == status.HTTP_200_OK

        handshake.refresh_from_db()
        requester.refresh_from_db()
        assert handshake.status == 'accepted'
        assert handshake.cancellation_requested_by is None
        assert handshake.cancellation_requested_at is None
        assert handshake.cancellation_reason == ''
        assert requester.timebank_balance == Decimal('4.00')

    def test_requester_cannot_approve_own_cancellation_request(self):
        provider = UserFactory()
        requester = UserFactory(timebank_balance=Decimal('4.00'))
        service = ServiceFactory(user=provider, type='Offer', duration=Decimal('2.00'))
        handshake = HandshakeFactory(
            service=service,
            requester=requester,
            status='accepted',
            provisioned_hours=Decimal('2.00'),
        )

        client = AuthenticatedAPIClient()
        client.authenticate_user(requester)
        request_response = client.post(f'/api/handshakes/{handshake.id}/cancel-request/')
        assert request_response.status_code == status.HTTP_200_OK

        approve_response = client.post(f'/api/handshakes/{handshake.id}/cancel-request/approve/')
        assert approve_response.status_code == status.HTTP_403_FORBIDDEN

    def test_event_handshake_cannot_use_cancellation_request(self):
        organizer = UserFactory()
        attendee = UserFactory()
        service = ServiceFactory(user=organizer, type='Event')
        handshake = HandshakeFactory(
            service=service,
            requester=attendee,
            status='accepted',
            provisioned_hours=Decimal('0.00'),
        )

        client = AuthenticatedAPIClient()
        client.authenticate_user(organizer)
        response = client.post(f'/api/handshakes/{handshake.id}/cancel-request/')
        assert response.status_code == status.HTTP_400_BAD_REQUEST


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
        'exact_duration': 2,
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

    def test_initiate_rejects_fractional_duration(self):
        """Offer/Need handshake initiation must reject fractional exact_duration values."""
        service_owner = UserFactory()
        requester = UserFactory()
        service = ServiceFactory(user=service_owner, type='Offer', duration=Decimal('2.00'))
        handshake = HandshakeFactory(service=service, requester=requester, status='pending')

        client = AuthenticatedAPIClient()
        client.authenticate_user(service_owner)
        resp = client.post(f'/api/handshakes/{handshake.id}/initiate/', {
            'exact_location': 'Test Cafe, Beşiktaş',
            'exact_duration': 1.5,
            'scheduled_time': (timezone.now() + timedelta(days=5)).isoformat(),
        })

        assert resp.status_code == status.HTTP_400_BAD_REQUEST
        assert resp.data['detail'] == 'Duration must be a whole number of hours'

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

    def test_online_group_offer_requester_can_approve_without_exact_location(self):
        """Online fixed group offers should approve without requiring an exact location."""
        service_owner = UserFactory()
        requester = UserFactory(timebank_balance=Decimal('5.00'))
        scheduled_time = timezone.now() + timedelta(days=3)
        service = ServiceFactory(
            user=service_owner,
            type='Offer',
            duration=Decimal('1.00'),
            location_type='Online',
            location_area='Zoom',
            schedule_type='One-Time',
            max_participants=3,
            scheduled_time=scheduled_time,
        )
        handshake = HandshakeFactory(
            service=service,
            requester=requester,
            status='pending',
            provider_initiated=True,
            exact_location='',
            exact_duration=Decimal('1.00'),
            scheduled_time=scheduled_time,
        )

        client = AuthenticatedAPIClient()
        client.authenticate_user(requester)
        resp = client.post(f'/api/handshakes/{handshake.id}/approve/', {})
        assert resp.status_code == status.HTTP_200_OK

        handshake.refresh_from_db()
        assert handshake.status == 'accepted'

        approve_msgs = ChatMessage.objects.filter(handshake=handshake, sender=requester, body__contains='Session approved!')
        assert approve_msgs.count() == 1
        assert ' at .' not in approve_msgs.first().body

    def test_in_person_approve_still_requires_exact_location(self):
        """In-person approvals must still reject missing exact location details."""
        service_owner = UserFactory()
        requester = UserFactory(timebank_balance=Decimal('5.00'))
        handshake = HandshakeFactory(
            service=ServiceFactory(
                user=service_owner,
                type='Offer',
                duration=Decimal('1.00'),
                location_type='In-Person',
            ),
            requester=requester,
            status='pending',
            provider_initiated=True,
            exact_location='',
            exact_duration=Decimal('1.00'),
            scheduled_time=timezone.now() + timedelta(days=3),
        )

        client = AuthenticatedAPIClient()
        client.authenticate_user(requester)
        resp = client.post(f'/api/handshakes/{handshake.id}/approve/', {})
        assert resp.status_code == status.HTTP_400_BAD_REQUEST
        assert resp.data['detail'] == 'Provider must provide exact location, duration, and scheduled time before approval'
        assert resp.data['requires_details'] is True

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

    def test_confirm_rejects_fractional_hours_adjustment(self):
        """Completion confirmation must reject fractional hour adjustments."""
        provider = UserFactory(timebank_balance=Decimal('5.00'))
        requester = UserFactory(timebank_balance=Decimal('3.00'))
        service = ServiceFactory(user=provider, type='Offer', duration=Decimal('2.00'))
        handshake = HandshakeFactory(
            service=service,
            requester=requester,
            status='accepted',
            provisioned_hours=Decimal('2.00'),
            provider_initiated=True,
            requester_initiated=True,
        )

        client = AuthenticatedAPIClient()
        client.authenticate_user(provider)
        resp = client.post(f'/api/handshakes/{handshake.id}/confirm/', {'hours': 1.5})

        assert resp.status_code == status.HTTP_400_BAD_REQUEST
        assert resp.data['detail'] == 'Hours must be a whole number'

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
        request_resp = client.post(f'/api/handshakes/{h.id}/cancel-request/')
        assert request_resp.status_code == status.HTTP_200_OK
        client.authenticate_user(requester)
        resp = client.post(f'/api/handshakes/{h.id}/cancel-request/approve/')
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
        request_resp = client.post(f'/api/handshakes/{h.id}/cancel-request/')
        assert request_resp.status_code == status.HTTP_200_OK
        client.authenticate_user(requester)
        approve_resp = client.post(f'/api/handshakes/{h.id}/cancel-request/approve/')
        assert approve_resp.status_code == status.HTTP_200_OK

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


@pytest.mark.django_db
@pytest.mark.integration
class TestEventHandshakeEndpoints:
    """Coverage for event-specific handshake endpoints and auth guards."""

    def test_join_event_requires_authentication(self):
        organizer = UserFactory()
        service = ServiceFactory(
            user=organizer,
            type='Event',
            status='Active',
            schedule_type='One-Time',
            scheduled_time=timezone.now() + timedelta(days=2),
        )

        client = APIClient()
        response = client.post(f'/api/handshakes/services/{service.id}/join-event/')
        assert response.status_code in (
            status.HTTP_401_UNAUTHORIZED,
            status.HTTP_403_FORBIDDEN,
        )

    def test_join_event_success_creates_credit_free_handshake(self):
        organizer = UserFactory()
        participant = UserFactory()
        service = ServiceFactory(
            user=organizer,
            type='Event',
            status='Active',
            schedule_type='One-Time',
            scheduled_time=timezone.now() + timedelta(days=2),
            max_participants=3,
        )

        client = AuthenticatedAPIClient()
        client.authenticate_user(participant)
        response = client.post(f'/api/handshakes/services/{service.id}/join-event/')
        assert response.status_code == status.HTTP_201_CREATED

        handshake = Handshake.objects.get(id=response.data['id'])
        assert handshake.status == 'accepted'
        assert handshake.provisioned_hours == Decimal('0.00')

    def test_join_event_blocked_for_unverified_user(self):
        """Unverified users may not RSVP to an Event."""
        organizer = UserFactory()
        participant = UserFactory(is_verified=False)
        service = ServiceFactory(
            user=organizer,
            type='Event',
            status='Active',
            schedule_type='One-Time',
            scheduled_time=timezone.now() + timedelta(days=2),
            max_participants=3,
        )

        client = AuthenticatedAPIClient().authenticate_user(participant)
        response = client.post(f'/api/handshakes/services/{service.id}/join-event/')

        assert response.status_code == status.HTTP_403_FORBIDDEN
        assert response.data.get('code') == 'EMAIL_NOT_VERIFIED'
        assert not Handshake.objects.filter(
            service=service, requester=participant
        ).exists()

    def test_checkin_after_start_returns_invalid_state(self):
        organizer = UserFactory()
        participant = UserFactory()
        service = ServiceFactory(
            user=organizer,
            type='Event',
            status='Active',
            schedule_type='One-Time',
            scheduled_time=timezone.now() - timedelta(minutes=30),
        )
        handshake = HandshakeFactory(
            service=service,
            requester=participant,
            status='accepted',
            provisioned_hours=Decimal('0.00'),
        )

        client = AuthenticatedAPIClient()
        client.authenticate_user(participant)
        response = client.post(f'/api/handshakes/{handshake.id}/checkin/')
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert 'no longer available' in str(response.data).lower()

    def test_mark_attended_requires_authentication(self):
        organizer = UserFactory()
        participant = UserFactory()
        service = ServiceFactory(
            user=organizer,
            type='Event',
            status='Active',
            schedule_type='One-Time',
            scheduled_time=timezone.now() + timedelta(hours=2),
        )
        handshake = HandshakeFactory(
            service=service,
            requester=participant,
            status='checked_in',
            provisioned_hours=Decimal('0.00'),
        )

        client = APIClient()
        response = client.post(f'/api/handshakes/{handshake.id}/mark-attended/')
        assert response.status_code in (
            status.HTTP_401_UNAUTHORIZED,
            status.HTTP_403_FORBIDDEN,
        )


@pytest.mark.django_db
@pytest.mark.integration
class TestMarkAttendedAndCompleteEvent:
    """
    Integration tests for:
      POST /api/handshakes/{id}/mark-attended/
      POST /api/services/{id}/complete-event/

    Covers Feature 15 lifecycle invariants:
    role-based permissions, allowed/blocked source states, and DB persistence.
    """

    # ------------------------------------------------------------------ #
    # mark-attended
    # ------------------------------------------------------------------ #

    def test_organizer_can_mark_checked_in_participant_as_attended(self):
        organizer = UserFactory()
        participant = UserFactory()
        event = ServiceFactory(
            user=organizer,
            type='Event',
            status='Active',
            schedule_type='One-Time',
            scheduled_time=timezone.now() + timedelta(hours=2),
        )
        handshake = HandshakeFactory(
            service=event,
            requester=participant,
            status='checked_in',
            provisioned_hours=Decimal('0.00'),
        )

        client = AuthenticatedAPIClient()
        client.authenticate_user(organizer)
        response = client.post(f'/api/handshakes/{handshake.id}/mark-attended/')

        assert response.status_code == status.HTTP_200_OK
        handshake.refresh_from_db()
        assert handshake.status == 'attended'

    def test_non_organizer_cannot_mark_attended(self):
        organizer = UserFactory()
        participant = UserFactory()
        other = UserFactory()
        event = ServiceFactory(
            user=organizer,
            type='Event',
            status='Active',
            schedule_type='One-Time',
            scheduled_time=timezone.now() + timedelta(hours=2),
        )
        handshake = HandshakeFactory(
            service=event,
            requester=participant,
            status='checked_in',
            provisioned_hours=Decimal('0.00'),
        )

        client = AuthenticatedAPIClient()
        client.authenticate_user(other)
        response = client.post(f'/api/handshakes/{handshake.id}/mark-attended/')

        assert response.status_code in (
            status.HTTP_403_FORBIDDEN,
            status.HTTP_400_BAD_REQUEST,
            status.HTTP_404_NOT_FOUND,  # view hides handshakes from non-parties
        )
        handshake.refresh_from_db()
        assert handshake.status == 'checked_in'

    def test_participant_cannot_mark_themselves_attended(self):
        organizer = UserFactory()
        participant = UserFactory()
        event = ServiceFactory(
            user=organizer,
            type='Event',
            status='Active',
            schedule_type='One-Time',
            scheduled_time=timezone.now() + timedelta(hours=2),
        )
        handshake = HandshakeFactory(
            service=event,
            requester=participant,
            status='checked_in',
            provisioned_hours=Decimal('0.00'),
        )

        client = AuthenticatedAPIClient()
        client.authenticate_user(participant)
        response = client.post(f'/api/handshakes/{handshake.id}/mark-attended/')

        assert response.status_code in (
            status.HTTP_403_FORBIDDEN,
            status.HTTP_400_BAD_REQUEST,
        )
        handshake.refresh_from_db()
        assert handshake.status == 'checked_in'

    def test_mark_attended_rejected_when_status_is_accepted(self):
        """Handshake must be checked_in, not merely accepted."""
        organizer = UserFactory()
        participant = UserFactory()
        event = ServiceFactory(
            user=organizer,
            type='Event',
            status='Active',
            schedule_type='One-Time',
            scheduled_time=timezone.now() + timedelta(hours=2),
        )
        handshake = HandshakeFactory(
            service=event,
            requester=participant,
            status='accepted',
            provisioned_hours=Decimal('0.00'),
        )

        client = AuthenticatedAPIClient()
        client.authenticate_user(organizer)
        response = client.post(f'/api/handshakes/{handshake.id}/mark-attended/')

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        handshake.refresh_from_db()
        assert handshake.status == 'accepted'

    def test_mark_attended_is_idempotent_on_already_attended(self):
        """Calling mark-attended on an already-attended handshake is rejected cleanly."""
        organizer = UserFactory()
        participant = UserFactory()
        event = ServiceFactory(
            user=organizer,
            type='Event',
            status='Active',
            schedule_type='One-Time',
            scheduled_time=timezone.now() + timedelta(hours=2),
        )
        handshake = HandshakeFactory(
            service=event,
            requester=participant,
            status='attended',
            provisioned_hours=Decimal('0.00'),
        )

        client = AuthenticatedAPIClient()
        client.authenticate_user(organizer)
        response = client.post(f'/api/handshakes/{handshake.id}/mark-attended/')

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        handshake.refresh_from_db()
        assert handshake.status == 'attended'

    # ------------------------------------------------------------------ #
    # complete-event
    # ------------------------------------------------------------------ #

    def test_complete_event_moves_accepted_and_checked_in_to_no_show(self):
        organizer = UserFactory()
        p_accepted = UserFactory()
        p_checked_in = UserFactory()
        p_attended = UserFactory()
        event = ServiceFactory(
            user=organizer,
            type='Event',
            status='Active',
            schedule_type='One-Time',
            scheduled_time=timezone.now() - timedelta(hours=1),
        )
        h_accepted = HandshakeFactory(
            service=event,
            requester=p_accepted,
            status='accepted',
            provisioned_hours=Decimal('0.00'),
        )
        h_checked_in = HandshakeFactory(
            service=event,
            requester=p_checked_in,
            status='checked_in',
            provisioned_hours=Decimal('0.00'),
        )
        h_attended = HandshakeFactory(
            service=event,
            requester=p_attended,
            status='attended',
            provisioned_hours=Decimal('0.00'),
        )

        client = AuthenticatedAPIClient()
        client.authenticate_user(organizer)
        response = client.post(f'/api/services/{event.id}/complete-event/')

        assert response.status_code == status.HTTP_200_OK

        h_accepted.refresh_from_db()
        h_checked_in.refresh_from_db()
        h_attended.refresh_from_db()

        assert h_accepted.status == 'no_show'
        assert h_checked_in.status == 'no_show'
        assert h_attended.status == 'attended', 'attended participants must not be downgraded'

    def test_attended_participants_not_downgraded_during_completion(self):
        """Explicit isolation: attended status is preserved regardless of other participants."""
        organizer = UserFactory()
        participant = UserFactory()
        event = ServiceFactory(
            user=organizer,
            type='Event',
            status='Active',
            schedule_type='One-Time',
            scheduled_time=timezone.now() - timedelta(hours=1),
        )
        handshake = HandshakeFactory(
            service=event,
            requester=participant,
            status='attended',
            provisioned_hours=Decimal('0.00'),
        )

        client = AuthenticatedAPIClient()
        client.authenticate_user(organizer)
        response = client.post(f'/api/services/{event.id}/complete-event/')

        assert response.status_code == status.HTTP_200_OK
        handshake.refresh_from_db()
        assert handshake.status == 'attended'

    def test_non_organizer_cannot_complete_event(self):
        organizer = UserFactory()
        other = UserFactory()
        event = ServiceFactory(
            user=organizer,
            type='Event',
            status='Active',
            schedule_type='One-Time',
            scheduled_time=timezone.now() - timedelta(hours=1),
        )
        HandshakeFactory(
            service=event,
            requester=UserFactory(),
            status='accepted',
            provisioned_hours=Decimal('0.00'),
        )

        client = AuthenticatedAPIClient()
        client.authenticate_user(other)
        response = client.post(f'/api/services/{event.id}/complete-event/')

        assert response.status_code in (
            status.HTTP_403_FORBIDDEN,
            status.HTTP_400_BAD_REQUEST,
        )
        event.refresh_from_db()
        assert event.status != 'Completed'

    def test_complete_event_repeated_call_is_safely_rejected(self):
        """Second call on an already-Completed event must not raise 500."""
        organizer = UserFactory()
        event = ServiceFactory(
            user=organizer,
            type='Event',
            status='Active',
            schedule_type='One-Time',
            scheduled_time=timezone.now() - timedelta(hours=1),
        )

        client = AuthenticatedAPIClient()
        client.authenticate_user(organizer)

        first = client.post(f'/api/services/{event.id}/complete-event/')
        assert first.status_code == status.HTTP_200_OK

        second = client.post(f'/api/services/{event.id}/complete-event/')
        assert second.status_code in (
            status.HTTP_400_BAD_REQUEST,
            status.HTTP_409_CONFLICT,
            status.HTTP_404_NOT_FOUND,  # completed events may be filtered from active queryset
        )
