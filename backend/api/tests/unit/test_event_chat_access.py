"""
Unit tests for event-chat access control (GitHub issue #76).

Tests the _check_event_access helper in PublicChatViewSet,
the event-blocking guard in GroupChatViewSet._get_service_or_403,
and the PublicChatConsumer.check_event_access database helper.
"""
import pytest
from decimal import Decimal
from datetime import timedelta
from unittest.mock import MagicMock

from django.utils import timezone
from rest_framework.exceptions import PermissionDenied

from api.models import ChatRoom, Handshake
from api.tests.helpers.factories import (
    UserFactory, ServiceFactory, HandshakeFactory,
)


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _event_service(organizer=None, **kwargs):
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
    defaults = dict(
        user=owner or UserFactory(),
        type='Offer',
        status='Active',
        schedule_type='One-Time',
        max_participants=3,
    )
    defaults.update(kwargs)
    return ServiceFactory(**defaults)


# ─── PublicChatViewSet._check_event_access ────────────────────────────────────

@pytest.mark.django_db
@pytest.mark.unit
class TestPublicChatEventAccessHelper:
    """Unit tests for PublicChatViewSet._check_event_access method."""

    def _viewset_with_user(self, user):
        from api.views import PublicChatViewSet
        viewset = PublicChatViewSet()
        request = MagicMock()
        request.user = user
        return viewset, request

    def test_non_event_returns_none(self):
        """Non-event services should have no restriction."""
        service = _offer_service()
        vs, request = self._viewset_with_user(UserFactory())
        result = vs._check_event_access(request, service)
        assert result is None

    def test_organizer_allowed(self):
        """Event organizer gets None (= allowed)."""
        organizer = UserFactory()
        event = _event_service(organizer=organizer)
        vs, request = self._viewset_with_user(organizer)
        result = vs._check_event_access(request, event)
        assert result is None

    def test_accepted_participant_allowed(self):
        """Participant with accepted handshake gets None (= allowed)."""
        event = _event_service()
        participant = UserFactory()
        HandshakeFactory(service=event, requester=participant, status='accepted',
                         provisioned_hours=Decimal('0'))
        vs, request = self._viewset_with_user(participant)
        result = vs._check_event_access(request, event)
        assert result is None

    def test_checked_in_participant_allowed(self):
        """Participant with checked_in handshake gets None (= allowed)."""
        event = _event_service()
        participant = UserFactory()
        HandshakeFactory(service=event, requester=participant, status='checked_in',
                         provisioned_hours=Decimal('0'))
        vs, request = self._viewset_with_user(participant)
        result = vs._check_event_access(request, event)
        assert result is None

    def test_attended_participant_allowed(self):
        """Participant with attended handshake gets None (= allowed)."""
        event = _event_service()
        participant = UserFactory()
        HandshakeFactory(service=event, requester=participant, status='attended',
                         provisioned_hours=Decimal('0'))
        vs, request = self._viewset_with_user(participant)
        result = vs._check_event_access(request, event)
        assert result is None

    def test_non_participant_denied(self):
        """User with no handshake gets a 403 response."""
        event = _event_service()
        outsider = UserFactory()
        vs, request = self._viewset_with_user(outsider)
        result = vs._check_event_access(request, event)
        assert result is not None
        assert result.status_code == 403

    def test_pending_participant_denied(self):
        """User with pending handshake gets a 403 response."""
        event = _event_service()
        user = UserFactory()
        HandshakeFactory(service=event, requester=user, status='pending',
                         provisioned_hours=Decimal('0'))
        vs, request = self._viewset_with_user(user)
        result = vs._check_event_access(request, event)
        assert result is not None
        assert result.status_code == 403

    def test_cancelled_participant_denied(self):
        """User with cancelled handshake gets a 403 response."""
        event = _event_service()
        user = UserFactory()
        HandshakeFactory(service=event, requester=user, status='cancelled',
                         provisioned_hours=Decimal('0'))
        vs, request = self._viewset_with_user(user)
        result = vs._check_event_access(request, event)
        assert result is not None
        assert result.status_code == 403

    def test_no_show_participant_denied(self):
        """User with no_show handshake gets a 403 response."""
        event = _event_service()
        user = UserFactory()
        HandshakeFactory(service=event, requester=user, status='no_show',
                         provisioned_hours=Decimal('0'))
        vs, request = self._viewset_with_user(user)
        result = vs._check_event_access(request, event)
        assert result is not None
        assert result.status_code == 403


# ─── GroupChatViewSet._get_service_or_403 blocks events ──────────────────────

@pytest.mark.django_db
@pytest.mark.unit
class TestGroupChatEventAccess:
    """Unit tests for GroupChatViewSet._get_service_or_403 event handling."""

    def _viewset_with_user(self, user):
        from api.views import GroupChatViewSet
        viewset = GroupChatViewSet()
        viewset.request = MagicMock()
        viewset.request.user = user
        return viewset

    def test_event_organizer_allowed(self):
        """Event organizer (service owner) can access group chat."""
        organizer = UserFactory()
        event = _event_service(organizer=organizer)
        vs = self._viewset_with_user(organizer)

        result = vs._get_service_or_403(vs.request, str(event.id))
        assert result == event

    def test_event_checked_in_participant_allowed(self):
        """Checked-in event participant can access group chat."""
        event = _event_service()
        participant = UserFactory()
        HandshakeFactory(service=event, requester=participant, status='checked_in')
        vs = self._viewset_with_user(participant)

        result = vs._get_service_or_403(vs.request, str(event.id))
        assert result == event

    def test_event_attended_participant_allowed(self):
        """Attended event participant can access group chat."""
        event = _event_service()
        participant = UserFactory()
        HandshakeFactory(service=event, requester=participant, status='attended')
        vs = self._viewset_with_user(participant)

        result = vs._get_service_or_403(vs.request, str(event.id))
        assert result == event

    def test_event_cancelled_participant_denied(self):
        """Cancelled event participant is denied group chat."""
        event = _event_service()
        participant = UserFactory()
        HandshakeFactory(service=event, requester=participant, status='cancelled')
        vs = self._viewset_with_user(participant)

        with pytest.raises(PermissionDenied):
            vs._get_service_or_403(vs.request, str(event.id))

    def test_non_event_service_still_works(self):
        """Regular group service passes the check normally."""
        owner = UserFactory()
        service = _offer_service(owner=owner, max_participants=3)
        vs = self._viewset_with_user(owner)

        result = vs._get_service_or_403(vs.request, str(service.id))
        assert result == service


# ─── PublicChatConsumer.check_event_access (sync inner) ───────────────────────

@pytest.mark.django_db(transaction=True)
@pytest.mark.unit
class TestPublicChatConsumerEventAccess:
    """Unit tests for PublicChatConsumer.check_event_access database method.
    
    We call the inner sync function directly (bypassing async wrapper)
    since no WebSocket machinery is needed.
    """

    def _sync_check(self, room_id, user):
        """Call the sync version of check_event_access."""
        from api.consumers import PublicChatConsumer
        consumer = PublicChatConsumer()
        # The @database_sync_to_async decorated method wraps a sync function.
        # We can access the underlying sync function or just call it in a sync test.
        # Since we're in a sync pytest test with django_db, use sync_to_async's inner.
        from asgiref.sync import async_to_sync
        return async_to_sync(consumer.check_event_access)(room_id, user)

    def test_non_event_room_returns_true(self):
        """Rooms linked to non-event services allow all users."""
        service = _offer_service()
        room = service.chat_room
        outsider = UserFactory()
        assert self._sync_check(room.id, outsider) is True

    def test_event_room_organizer_allowed(self):
        """Organizer of the event can access the room."""
        organizer = UserFactory()
        event = _event_service(organizer=organizer)
        room = event.chat_room
        assert self._sync_check(room.id, organizer) is True

    def test_event_room_accepted_participant_allowed(self):
        """Accepted participant can access the event room."""
        event = _event_service()
        participant = UserFactory()
        HandshakeFactory(service=event, requester=participant, status='accepted',
                         provisioned_hours=Decimal('0'))
        room = event.chat_room
        assert self._sync_check(room.id, participant) is True

    def test_event_room_non_participant_denied(self):
        """User with no handshake is denied access to event room."""
        event = _event_service()
        outsider = UserFactory()
        room = event.chat_room
        assert self._sync_check(room.id, outsider) is False

    def test_event_room_pending_participant_denied(self):
        """User with only a pending handshake is denied."""
        event = _event_service()
        user = UserFactory()
        HandshakeFactory(service=event, requester=user, status='pending',
                         provisioned_hours=Decimal('0'))
        room = event.chat_room
        assert self._sync_check(room.id, user) is False

    def test_nonexistent_room_returns_false(self):
        """Non-existent room ID returns False."""
        import uuid
        user = UserFactory()
        assert self._sync_check(uuid.uuid4(), user) is False
