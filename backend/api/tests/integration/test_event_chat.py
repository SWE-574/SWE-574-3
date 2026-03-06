"""
Integration tests for event chat changes (GitHub issue #76).

Covers:
1. ChatViewSet.list() excludes Event-type handshakes from conversations.
2. PublicChatViewSet restricts event chat to organizer + active participants.
3. GroupChatViewSet rejects Event-type services entirely.
"""
import pytest
from decimal import Decimal
from datetime import timedelta

from django.utils import timezone
from rest_framework import status

from api.models import ChatMessage, ChatRoom, PublicChatMessage, ServiceGroupChatMessage, Handshake
from api.tests.helpers.factories import (
    UserFactory, ServiceFactory, HandshakeFactory, ChatMessageFactory,
)
from api.tests.helpers.test_client import AuthenticatedAPIClient


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _event_service(organizer=None, **kwargs):
    """Create an active Event with a future scheduled_time."""
    defaults = dict(
        user=organizer or UserFactory(),
        type='Event',
        status='Active',
        max_participants=10,
        schedule_type='One-Time',
        scheduled_time=timezone.now() + timedelta(hours=48),
        duration=Decimal('1.00'),
    )
    defaults.update(kwargs)
    return ServiceFactory(**defaults)


def _offer_service(owner=None, **kwargs):
    """Create an active Offer service."""
    defaults = dict(
        user=owner or UserFactory(),
        type='Offer',
        status='Active',
        schedule_type='One-Time',
        max_participants=3,
    )
    defaults.update(kwargs)
    return ServiceFactory(**defaults)


# ─── ChatViewSet: events excluded from conversation list ─────────────────────

@pytest.mark.django_db
@pytest.mark.integration
class TestChatViewSetExcludesEvents:
    """Event-type handshakes must NOT appear in GET /api/chats/."""

    def test_event_handshakes_excluded_from_conversations(self):
        """When a user has both event and non-event handshakes, only non-event appear."""
        user = UserFactory()

        # Create an offer handshake (should appear)
        offer_svc = _offer_service(owner=user)
        offer_hs = HandshakeFactory(service=offer_svc, requester=UserFactory(), status='accepted')
        ChatMessageFactory(handshake=offer_hs, sender=offer_hs.requester, body='offer msg')

        # Create an event handshake (should NOT appear)
        event_svc = _event_service(organizer=user)
        event_hs = HandshakeFactory(
            service=event_svc, requester=UserFactory(),
            status='accepted', provisioned_hours=Decimal('0'),
        )
        ChatMessageFactory(handshake=event_hs, sender=event_hs.requester, body='event msg')

        client = AuthenticatedAPIClient()
        client.authenticate_user(user)

        response = client.get('/api/chats/')
        assert response.status_code == status.HTTP_200_OK

        results = response.data['results']
        handshake_ids = {item['handshake_id'] for item in results}
        assert str(offer_hs.id) in handshake_ids
        assert str(event_hs.id) not in handshake_ids

    def test_only_event_handshakes_returns_empty(self):
        """A user with only event handshakes sees an empty conversation list."""
        user = UserFactory()
        event_svc = _event_service(organizer=user)
        event_hs = HandshakeFactory(
            service=event_svc, requester=UserFactory(),
            status='accepted', provisioned_hours=Decimal('0'),
        )
        ChatMessageFactory(handshake=event_hs, sender=event_hs.requester)

        client = AuthenticatedAPIClient()
        client.authenticate_user(user)

        response = client.get('/api/chats/')
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data['results']) == 0

    def test_requester_side_event_excluded(self):
        """Event handshake is excluded when the requesting user is the requester, not owner."""
        requester = UserFactory()
        event_svc = _event_service()
        HandshakeFactory(
            service=event_svc, requester=requester,
            status='accepted', provisioned_hours=Decimal('0'),
        )

        client = AuthenticatedAPIClient()
        client.authenticate_user(requester)

        response = client.get('/api/chats/')
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data['results']) == 0


# ─── PublicChatViewSet: event access control ──────────────────────────────────

@pytest.mark.django_db
@pytest.mark.integration
class TestPublicChatEventAccess:
    """
    For Event-type services, PublicChatViewSet should restrict access to:
    - The event organizer
    - Users with an active handshake (accepted, checked_in, attended)
    
    Non-event services remain open to all authenticated users.
    """

    # ── GET (retrieve) ────────────────────────────────────────────────────────

    def test_organizer_can_access_event_chat(self):
        """Event organizer can retrieve the public chat room."""
        organizer = UserFactory()
        event = _event_service(organizer=organizer)

        client = AuthenticatedAPIClient()
        client.authenticate_user(organizer)

        response = client.get(f'/api/public-chat/{event.id}/')
        assert response.status_code == status.HTTP_200_OK
        assert 'room' in response.data
        assert 'messages' in response.data

    def test_accepted_participant_can_access_event_chat(self):
        """A participant with 'accepted' status can access the event chat."""
        event = _event_service()
        participant = UserFactory()
        HandshakeFactory(service=event, requester=participant, status='accepted',
                         provisioned_hours=Decimal('0'))

        client = AuthenticatedAPIClient()
        client.authenticate_user(participant)

        response = client.get(f'/api/public-chat/{event.id}/')
        assert response.status_code == status.HTTP_200_OK

    def test_checked_in_participant_can_access_event_chat(self):
        """A participant with 'checked_in' status can access the event chat."""
        event = _event_service()
        participant = UserFactory()
        HandshakeFactory(service=event, requester=participant, status='checked_in',
                         provisioned_hours=Decimal('0'))

        client = AuthenticatedAPIClient()
        client.authenticate_user(participant)

        response = client.get(f'/api/public-chat/{event.id}/')
        assert response.status_code == status.HTTP_200_OK

    def test_attended_participant_can_access_event_chat(self):
        """A participant with 'attended' status can access the event chat."""
        event = _event_service()
        participant = UserFactory()
        HandshakeFactory(service=event, requester=participant, status='attended',
                         provisioned_hours=Decimal('0'))

        client = AuthenticatedAPIClient()
        client.authenticate_user(participant)

        response = client.get(f'/api/public-chat/{event.id}/')
        assert response.status_code == status.HTTP_200_OK

    def test_non_participant_denied_event_chat(self):
        """A user with no handshake cannot access the event chat."""
        event = _event_service()
        outsider = UserFactory()

        client = AuthenticatedAPIClient()
        client.authenticate_user(outsider)

        response = client.get(f'/api/public-chat/{event.id}/')
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_pending_participant_denied_event_chat(self):
        """A user with only a pending handshake cannot access the event chat."""
        event = _event_service()
        user = UserFactory()
        HandshakeFactory(service=event, requester=user, status='pending',
                         provisioned_hours=Decimal('0'))

        client = AuthenticatedAPIClient()
        client.authenticate_user(user)

        response = client.get(f'/api/public-chat/{event.id}/')
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_cancelled_participant_denied_event_chat(self):
        """A user with a cancelled handshake cannot access the event chat."""
        event = _event_service()
        user = UserFactory()
        HandshakeFactory(service=event, requester=user, status='cancelled',
                         provisioned_hours=Decimal('0'))

        client = AuthenticatedAPIClient()
        client.authenticate_user(user)

        response = client.get(f'/api/public-chat/{event.id}/')
        assert response.status_code == status.HTTP_403_FORBIDDEN

    # ── POST (create message) ─────────────────────────────────────────────────

    def test_organizer_can_send_event_chat_message(self):
        """Event organizer can send a message."""
        organizer = UserFactory()
        event = _event_service(organizer=organizer)

        client = AuthenticatedAPIClient()
        client.authenticate_user(organizer)

        response = client.post(f'/api/public-chat/{event.id}/', {'body': 'Hello from organizer!'})
        assert response.status_code == status.HTTP_201_CREATED
        assert PublicChatMessage.objects.filter(
            room=event.chat_room,
            body='Hello from organizer!'
        ).exists()

    def test_active_participant_can_send_event_chat_message(self):
        """An active participant can send a message."""
        event = _event_service()
        participant = UserFactory()
        HandshakeFactory(service=event, requester=participant, status='accepted',
                         provisioned_hours=Decimal('0'))

        client = AuthenticatedAPIClient()
        client.authenticate_user(participant)

        response = client.post(f'/api/public-chat/{event.id}/', {'body': 'Participant message'})
        assert response.status_code == status.HTTP_201_CREATED

    def test_non_participant_cannot_send_event_chat_message(self):
        """A non-participant cannot send a message to event chat."""
        event = _event_service()
        outsider = UserFactory()

        client = AuthenticatedAPIClient()
        client.authenticate_user(outsider)

        response = client.post(f'/api/public-chat/{event.id}/', {'body': 'Sneaky msg'})
        assert response.status_code == status.HTTP_403_FORBIDDEN
        assert not PublicChatMessage.objects.filter(
            room=event.chat_room,
            body='Sneaky msg'
        ).exists()

    # ── Non-event services remain open ────────────────────────────────────────

    def test_non_event_public_chat_remains_open_to_all(self):
        """For non-event services, any authenticated user can access public chat."""
        service = _offer_service()
        random_user = UserFactory()

        client = AuthenticatedAPIClient()
        client.authenticate_user(random_user)

        response = client.get(f'/api/public-chat/{service.id}/')
        assert response.status_code == status.HTTP_200_OK

    def test_non_event_public_chat_send_open_to_all(self):
        """For non-event services, any authenticated user can send messages."""
        service = _offer_service()
        random_user = UserFactory()

        client = AuthenticatedAPIClient()
        client.authenticate_user(random_user)

        response = client.post(f'/api/public-chat/{service.id}/', {'body': 'Public question'})
        assert response.status_code == status.HTTP_201_CREATED


# ─── GroupChatViewSet: events rejected ────────────────────────────────────────

@pytest.mark.django_db
@pytest.mark.integration
class TestGroupChatEventAccess:
    """Event-type services can use group chat with appropriate roles."""

    def test_event_organizer_can_access_group_chat(self):
        """GET /api/group-chat/{event_id}/ returns 200 for organizer."""
        organizer = UserFactory()
        event = _event_service(organizer=organizer)

        client = AuthenticatedAPIClient()
        client.authenticate_user(organizer)

        response = client.get(f'/api/group-chat/{event.id}/')
        assert response.status_code == status.HTTP_200_OK

    def test_event_organizer_can_post_group_chat(self):
        """POST /api/group-chat/{event_id}/ returns 201 for organizer."""
        organizer = UserFactory()
        event = _event_service(organizer=organizer)

        client = AuthenticatedAPIClient()
        client.authenticate_user(organizer)

        response = client.post(
            f'/api/group-chat/{event.id}/',
            {'body': 'Hello from organizer'},
            format='json',
        )
        assert response.status_code == status.HTTP_201_CREATED

    def test_event_checked_in_participant_can_access(self):
        """A checked-in event participant can access group chat."""
        event = _event_service()
        participant = UserFactory()
        HandshakeFactory(service=event, requester=participant, status='checked_in')

        client = AuthenticatedAPIClient()
        client.authenticate_user(participant)

        response = client.get(f'/api/group-chat/{event.id}/')
        assert response.status_code == status.HTTP_200_OK

    def test_event_cancelled_participant_denied_group_chat(self):
        """A cancelled event participant cannot use group chat."""
        event = _event_service()
        participant = UserFactory()
        HandshakeFactory(service=event, requester=participant, status='cancelled')

        client = AuthenticatedAPIClient()
        client.authenticate_user(participant)

        response = client.get(f'/api/group-chat/{event.id}/')
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_non_event_group_chat_still_works(self):
        """Regular group services still work with group chat."""
        owner = UserFactory()
        service = _offer_service(owner=owner, max_participants=3)

        client = AuthenticatedAPIClient()
        client.authenticate_user(owner)

        response = client.get(f'/api/group-chat/{service.id}/')
        assert response.status_code == status.HTTP_200_OK
