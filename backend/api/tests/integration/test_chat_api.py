"""
Integration tests for chat API endpoints
"""
import pytest
from rest_framework import status

from api.tests.helpers.factories import (
    UserFactory, ServiceFactory, HandshakeFactory, ChatMessageFactory,
    ServiceGroupChatMessageFactory,
)
from api.tests.helpers.test_client import AuthenticatedAPIClient
from api.models import ChatMessage, ChatRoom, PublicChatMessage, ServiceGroupChatMessage


@pytest.mark.django_db
@pytest.mark.integration
class TestChatViewSet:
    """Test ChatViewSet (private handshake chat)"""
    
    def test_list_conversations(self):
        """Test listing user conversations"""
        user = UserFactory()
        service = ServiceFactory(user=user)
        requester = UserFactory()
        handshake = HandshakeFactory(service=service, requester=requester)
        
        client = AuthenticatedAPIClient()
        client.authenticate_user(user)
        
        response = client.get('/api/chats/')
        assert response.status_code == status.HTTP_200_OK
        assert 'results' in response.data
        conversation = next(item for item in response.data['results'] if item['handshake_id'] == str(handshake.id))
        assert conversation['service_member_count'] == 1

    def test_list_conversations_includes_group_member_count(self):
        """Group service rows include canonical owner+accepted member count."""
        owner = UserFactory()
        service = _group_service(owner)
        requester = UserFactory()
        handshake = HandshakeFactory(service=service, requester=requester, status='accepted')
        _accepted_handshake(service)

        client = AuthenticatedAPIClient()
        client.authenticate_user(requester)

        response = client.get('/api/chats/')
        assert response.status_code == status.HTTP_200_OK
        conversation = next(item for item in response.data['results'] if item['handshake_id'] == str(handshake.id))
        assert conversation['service_member_count'] == 3
    
    def test_get_conversation_messages(self):
        """Test retrieving messages for a conversation"""
        user = UserFactory()
        service = ServiceFactory(user=user)
        requester = UserFactory()
        handshake = HandshakeFactory(service=service, requester=requester)
        ChatMessageFactory.create_batch(3, handshake=handshake, sender=requester)
        
        client = AuthenticatedAPIClient()
        client.authenticate_user(user)
        
        response = client.get(f'/api/chats/{handshake.id}/')
        assert response.status_code == status.HTTP_200_OK
        assert response.data['count'] == 3
        assert len(response.data['results']) == 3
    
    def test_send_message(self):
        """Test sending a chat message"""
        user = UserFactory()
        service = ServiceFactory(user=user)
        requester = UserFactory()
        handshake = HandshakeFactory(service=service, requester=requester)
        
        client = AuthenticatedAPIClient()
        client.authenticate_user(requester)
        
        response = client.post('/api/chats/', {
            'handshake_id': str(handshake.id),
            'body': 'Hello, I am interested!'
        })
        assert response.status_code == status.HTTP_201_CREATED
        assert ChatMessage.objects.filter(
            handshake=handshake,
            body='Hello, I am interested!'
        ).exists()
    
    def test_send_message_unauthorized(self):
        """Test cannot send message to unrelated handshake"""
        user1 = UserFactory()
        user2 = UserFactory()
        service = ServiceFactory(user=user1)
        requester = UserFactory()
        handshake = HandshakeFactory(service=service, requester=requester)
        
        client = AuthenticatedAPIClient()
        client.authenticate_user(user2)
        
        response = client.post('/api/chats/', {
            'handshake_id': str(handshake.id),
            'body': 'Unauthorized message'
        })
        assert response.status_code == status.HTTP_403_FORBIDDEN


@pytest.mark.django_db
@pytest.mark.integration
class TestPublicChatViewSet:
    """Test PublicChatViewSet (public service chat)"""
    
    def test_get_public_chat_room(self):
        """Test retrieving public chat room for a service"""
        service = ServiceFactory()
        user = UserFactory()
        client = AuthenticatedAPIClient()
        client.authenticate_user(user)
        
        response = client.get(f'/api/public-chat/{service.id}/')
        assert response.status_code == status.HTTP_200_OK
        assert 'room' in response.data
        assert 'messages' in response.data
        assert 'id' in response.data['room']
        assert 'name' in response.data['room']
    
    def test_get_public_chat_messages(self):
        """Test retrieving public chat messages"""
        service = ServiceFactory()
        user = UserFactory()
        room, _ = ChatRoom.objects.get_or_create(
            related_service=service,
            defaults={
                'name': f"Discussion: {service.title}",
                'type': 'public',
            }
        )
        PublicChatMessage.objects.create(
            room=room,
            sender=user,
            body='Public message'
        )

        client = AuthenticatedAPIClient()
        client.authenticate_user(UserFactory())
        response = client.get(f'/api/public-chat/{service.id}/')
        assert response.status_code == status.HTTP_200_OK
        assert response.data['messages']['count'] == 1
        assert len(response.data['messages']['results']) == 1
    
    def test_send_public_message(self):
        """Test sending public chat message"""
        service = ServiceFactory()
        user = UserFactory()
        
        client = AuthenticatedAPIClient()
        client.authenticate_user(user)
        
        response = client.post(f'/api/public-chat/{service.id}/', {
            'body': 'Public question about this service'
        })
        assert response.status_code == status.HTTP_201_CREATED
        assert PublicChatMessage.objects.filter(
            room=service.chat_room,
            body='Public question about this service'
        ).exists()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _group_service(owner=None):
    """Return a One-Time group service owned by *owner* (or a new user)."""
    return ServiceFactory(
        user=owner or UserFactory(),
        schedule_type='One-Time',
        max_participants=3,
        status='Active',
    )


def _accepted_handshake(service, requester=None):
    """Return an accepted Handshake for *service*."""
    return HandshakeFactory(
        service=service,
        requester=requester or UserFactory(),
        status='accepted',
    )


@pytest.mark.django_db
@pytest.mark.integration
class TestGroupChatViewSet:
    """Integration tests for the private group chat endpoint.

    Rules under test:
    - Only One-Time services with max_participants > 1 may have a group chat.
    - Access is limited to the service owner and users with an accepted handshake.
    - GET returns the last 50 messages (oldest first).
    - POST creates a message and returns 201.
    - Empty or blank bodies are rejected with 400.
    - Unauthenticated requests are rejected with 401.
    """

    # ── GET: message retrieval ────────────────────────────────────────────────

    def test_owner_can_get_messages(self):
        """Service owner can read the group chat."""
        owner = UserFactory()
        service = _group_service(owner)

        client = AuthenticatedAPIClient()
        client.authenticate_user(owner)

        response = client.get(f'/api/group-chat/{service.id}/')
        assert response.status_code == status.HTTP_200_OK
        assert response.data['service_id'] == str(service.id)
        assert response.data['service_title'] == service.title
        assert response.data['participants'] == [{
            'id': str(owner.id),
            'name': f'{owner.first_name} {owner.last_name}'.strip(),
            'avatar_url': owner.avatar_url,
        }]
        assert 'messages' in response.data

    def test_accepted_participant_can_get_messages(self):
        """A user with an accepted handshake can read the group chat."""
        service = _group_service()
        participant = UserFactory()
        _accepted_handshake(service, participant)
        ServiceGroupChatMessageFactory(service=service)

        client = AuthenticatedAPIClient()
        client.authenticate_user(participant)

        response = client.get(f'/api/group-chat/{service.id}/')
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data['messages']) == 1
        assert len(response.data['participants']) == 2
        assert response.data['participants'][0]['id'] == str(service.user_id)
        assert response.data['participants'][1]['id'] == str(participant.id)

    def test_get_returns_messages_oldest_first(self):
        """Messages are returned in ascending (oldest-first) order."""
        service = _group_service()
        owner = service.user
        msgs = ServiceGroupChatMessageFactory.create_batch(3, service=service)

        client = AuthenticatedAPIClient()
        client.authenticate_user(owner)

        response = client.get(f'/api/group-chat/{service.id}/')
        assert response.status_code == status.HTTP_200_OK
        created_at_values = [m['created_at'] for m in response.data['messages']]
        assert created_at_values == sorted(created_at_values)

    def test_unrelated_user_cannot_get_messages(self):
        """A user with no connection to the service is denied."""
        service = _group_service()
        outsider = UserFactory()

        client = AuthenticatedAPIClient()
        client.authenticate_user(outsider)

        response = client.get(f'/api/group-chat/{service.id}/')
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_pending_handshake_user_cannot_get_messages(self):
        """A pending requester must wait until the handshake is accepted."""
        service = _group_service()
        requester = UserFactory()
        HandshakeFactory(service=service, requester=requester, status='pending')

        client = AuthenticatedAPIClient()
        client.authenticate_user(requester)

        response = client.get(f'/api/group-chat/{service.id}/')
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_unauthenticated_get_returns_401(self):
        """Unauthenticated requests are rejected."""
        from rest_framework.test import APIClient
        service = _group_service()

        response = APIClient().get(f'/api/group-chat/{service.id}/')
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_get_nonexistent_service_returns_404(self):
        """Unknown service UUID returns 404."""
        import uuid
        owner = UserFactory()
        client = AuthenticatedAPIClient()
        client.authenticate_user(owner)

        response = client.get(f'/api/group-chat/{uuid.uuid4()}/')
        assert response.status_code == status.HTTP_404_NOT_FOUND

    # ── GET: eligibility guards ───────────────────────────────────────────────

    def test_recurrent_service_is_not_eligible(self):
        """Recurrent services do not have a group chat."""
        owner = UserFactory()
        service = ServiceFactory(
            user=owner, schedule_type='Recurrent', max_participants=5
        )

        client = AuthenticatedAPIClient()
        client.authenticate_user(owner)

        response = client.get(f'/api/group-chat/{service.id}/')
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_single_participant_service_is_not_eligible(self):
        """One-Time services with max_participants=1 do not have a group chat."""
        owner = UserFactory()
        service = ServiceFactory(
            user=owner, schedule_type='One-Time', max_participants=1
        )

        client = AuthenticatedAPIClient()
        client.authenticate_user(owner)

        response = client.get(f'/api/group-chat/{service.id}/')
        assert response.status_code == status.HTTP_403_FORBIDDEN

    # ── POST: sending messages ────────────────────────────────────────────────

    def test_owner_can_send_message(self):
        """Service owner can post a message to the group chat."""
        owner = UserFactory()
        service = _group_service(owner)

        client = AuthenticatedAPIClient()
        client.authenticate_user(owner)

        response = client.post(
            f'/api/group-chat/{service.id}/',
            {'body': 'Welcome everyone!'},
            format='json',
        )
        assert response.status_code == status.HTTP_201_CREATED
        assert ServiceGroupChatMessage.objects.filter(
            service=service, body='Welcome everyone!'
        ).exists()

    def test_accepted_participant_can_send_message(self):
        """A participant with an accepted handshake can post a message."""
        service = _group_service()
        participant = UserFactory()
        _accepted_handshake(service, participant)

        client = AuthenticatedAPIClient()
        client.authenticate_user(participant)

        response = client.post(
            f'/api/group-chat/{service.id}/',
            {'body': 'Hello group!'},
            format='json',
        )
        assert response.status_code == status.HTTP_201_CREATED
        assert ServiceGroupChatMessage.objects.filter(
            service=service, sender=participant, body='Hello group!'
        ).exists()

    def test_send_message_response_contains_expected_fields(self):
        """POST response contains id, body, sender_id, sender_name, created_at."""
        owner = UserFactory()
        service = _group_service(owner)

        client = AuthenticatedAPIClient()
        client.authenticate_user(owner)

        response = client.post(
            f'/api/group-chat/{service.id}/',
            {'body': 'Test message'},
            format='json',
        )
        assert response.status_code == status.HTTP_201_CREATED
        for field in ('id', 'body', 'sender_id', 'sender_name', 'created_at'):
            assert field in response.data, f"Missing field: {field}"

    def test_empty_body_returns_400(self):
        """Empty message body is rejected."""
        owner = UserFactory()
        service = _group_service(owner)

        client = AuthenticatedAPIClient()
        client.authenticate_user(owner)

        response = client.post(
            f'/api/group-chat/{service.id}/',
            {'body': '   '},
            format='json',
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_missing_body_returns_400(self):
        """Request with no body field is rejected."""
        owner = UserFactory()
        service = _group_service(owner)

        client = AuthenticatedAPIClient()
        client.authenticate_user(owner)

        response = client.post(f'/api/group-chat/{service.id}/', {}, format='json')
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_unrelated_user_cannot_send_message(self):
        """A user with no connection to the service cannot post."""
        service = _group_service()
        outsider = UserFactory()

        client = AuthenticatedAPIClient()
        client.authenticate_user(outsider)

        response = client.post(
            f'/api/group-chat/{service.id}/',
            {'body': 'Sneaky message'},
            format='json',
        )
        assert response.status_code == status.HTTP_403_FORBIDDEN
        assert not ServiceGroupChatMessage.objects.filter(service=service).exists()

    def test_unauthenticated_post_returns_401(self):
        """Unauthenticated POST is rejected."""
        from rest_framework.test import APIClient
        service = _group_service()

        response = APIClient().post(
            f'/api/group-chat/{service.id}/',
            {'body': 'No auth'},
            format='json',
        )
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    # ── Event group chat  ─────────────────────────────────────────────────────

    def test_event_organizer_can_access_group_chat(self):
        """Event organizer can read the group chat."""
        owner = UserFactory()
        service = ServiceFactory(
            user=owner, type='Event', schedule_type='One-Time',
            max_participants=10, status='Active',
        )

        client = AuthenticatedAPIClient()
        client.authenticate_user(owner)

        response = client.get(f'/api/group-chat/{service.id}/')
        assert response.status_code == status.HTTP_200_OK

    def test_event_checked_in_participant_can_access_group_chat(self):
        """A checked-in event participant can access group chat."""
        owner = UserFactory()
        service = ServiceFactory(
            user=owner, type='Event', schedule_type='One-Time',
            max_participants=10, status='Active',
        )
        participant = UserFactory()
        HandshakeFactory(service=service, requester=participant, status='checked_in')

        client = AuthenticatedAPIClient()
        client.authenticate_user(participant)

        response = client.get(f'/api/group-chat/{service.id}/')
        assert response.status_code == status.HTTP_200_OK

    def test_event_attended_participant_can_access_group_chat(self):
        """An attended event participant can access group chat."""
        owner = UserFactory()
        service = ServiceFactory(
            user=owner, type='Event', schedule_type='One-Time',
            max_participants=10, status='Active',
        )
        participant = UserFactory()
        HandshakeFactory(service=service, requester=participant, status='attended')

        client = AuthenticatedAPIClient()
        client.authenticate_user(participant)

        response = client.get(f'/api/group-chat/{service.id}/')
        assert response.status_code == status.HTTP_200_OK

    def test_event_cancelled_participant_cannot_access_group_chat(self):
        """A cancelled event participant cannot access group chat."""
        owner = UserFactory()
        service = ServiceFactory(
            user=owner, type='Event', schedule_type='One-Time',
            max_participants=10, status='Active',
        )
        participant = UserFactory()
        HandshakeFactory(service=service, requester=participant, status='cancelled')

        client = AuthenticatedAPIClient()
        client.authenticate_user(participant)

        response = client.get(f'/api/group-chat/{service.id}/')
        assert response.status_code == status.HTTP_403_FORBIDDEN
