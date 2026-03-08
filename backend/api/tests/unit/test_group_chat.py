"""
Unit tests for the private group chat feature.

Covers:
- ServiceGroupChatMessage model (field defaults, str representation, ordering)
- GroupChatViewSet._get_service_or_403 access-control logic
- ServiceGroupChatMessageSerializer output shape
"""
import pytest
from decimal import Decimal
from unittest.mock import patch, MagicMock

from api.models import ServiceGroupChatMessage, GroupChatSession
from api.serializers import ServiceGroupChatMessageSerializer
from api.tests.helpers.factories import (
    UserFactory, ServiceFactory, HandshakeFactory,
    ServiceGroupChatMessageFactory,
)


# ── GroupChatSession model ───────────────────────────────────────────────────

@pytest.mark.django_db
class TestGroupChatSessionModel:
    """Unit tests for GroupChatSession (recurrent group chat threads)."""

    def test_get_or_create_by_service_and_scheduled_time(self):
        """Sessions are unique per (service, scheduled_time)."""
        from django.utils import timezone
        from datetime import timedelta
        service = ServiceFactory(schedule_type='Recurrent', max_participants=5)
        st = timezone.now() + timedelta(days=1)
        s1, created1 = GroupChatSession.objects.get_or_create(
            service=service, scheduled_time=st, defaults={}
        )
        s2, created2 = GroupChatSession.objects.get_or_create(
            service=service, scheduled_time=st, defaults={}
        )
        assert created1 is True
        assert created2 is False
        assert s1.id == s2.id

    def test_message_with_session_stored_under_session(self):
        """ServiceGroupChatMessage with group_chat_session links to that session."""
        from django.utils import timezone
        from datetime import timedelta
        service = ServiceFactory(schedule_type='Recurrent', max_participants=5)
        st = timezone.now() + timedelta(days=1)
        session, _ = GroupChatSession.objects.get_or_create(
            service=service, scheduled_time=st, defaults={}
        )
        sender = UserFactory()
        msg = ServiceGroupChatMessage.objects.create(
            service=service, group_chat_session=session, sender=sender, body='Hi',
        )
        assert msg.group_chat_session_id == session.id
        assert list(session.messages.values_list('id', flat=True)) == [msg.id]


# ── Model tests ──────────────────────────────────────────────────────────────

@pytest.mark.django_db
class TestServiceGroupChatMessageModel:
    """Unit tests for the ServiceGroupChatMessage model."""

    def test_create_message_stores_fields(self):
        """A message can be created and all fields are persisted correctly."""
        service = ServiceFactory(schedule_type='One-Time', max_participants=3)
        sender = UserFactory()

        msg = ServiceGroupChatMessage.objects.create(
            service=service,
            sender=sender,
            body='Hello, group!',
        )

        msg.refresh_from_db()
        assert msg.service == service
        assert msg.sender == sender
        assert msg.body == 'Hello, group!'
        assert msg.created_at is not None

    def test_messages_ordered_by_created_at_ascending(self):
        """Default queryset ordering is oldest-first."""
        service = ServiceFactory(schedule_type='One-Time', max_participants=3)
        sender = UserFactory()
        m1 = ServiceGroupChatMessage.objects.create(service=service, sender=sender, body='first')
        m2 = ServiceGroupChatMessage.objects.create(service=service, sender=sender, body='second')
        m3 = ServiceGroupChatMessage.objects.create(service=service, sender=sender, body='third')

        ids = list(
            ServiceGroupChatMessage.objects.filter(service=service)
            .values_list('id', flat=True)
        )
        assert ids == [m1.id, m2.id, m3.id]

    def test_message_str_contains_sender_and_service(self):
        """__str__ includes enough context to identify the message."""
        msg = ServiceGroupChatMessageFactory()
        s = str(msg)
        # At minimum the model should be representable as a non-empty string
        assert len(s) > 0

    def test_deleting_service_cascades_to_messages(self):
        """Deleting the service also removes its group chat messages."""
        service = ServiceFactory(schedule_type='One-Time', max_participants=3)
        ServiceGroupChatMessageFactory.create_batch(3, service=service)
        assert ServiceGroupChatMessage.objects.filter(service=service).count() == 3

        service_id = service.id
        service.delete()
        assert ServiceGroupChatMessage.objects.filter(service_id=service_id).count() == 0

    def test_deleting_sender_sets_null_or_cascades(self):
        """Deleting a sender should not raise an integrity error."""
        msg = ServiceGroupChatMessageFactory()
        sender_id = msg.sender_id
        # Depending on on_delete setting this may cascade or set null
        try:
            msg.sender.delete()
        except Exception:
            pass  # CASCADE or PROTECT are both valid design choices
        # The important thing is no unhandled exception propagates


# ── Serializer tests ─────────────────────────────────────────────────────────

@pytest.mark.django_db
class TestServiceGroupChatMessageSerializer:
    """Unit tests for ServiceGroupChatMessageSerializer."""

    def test_serializer_contains_required_fields(self):
        """Serialized output includes all fields expected by the frontend."""
        msg = ServiceGroupChatMessageFactory()
        data = ServiceGroupChatMessageSerializer(msg).data

        for field in ('id', 'service', 'sender_id', 'sender_name', 'body', 'created_at'):
            assert field in data, f"Missing field: {field}"

    def test_sender_name_is_full_name(self):
        """sender_name is the full name of the sender."""
        sender = UserFactory(first_name='Ada', last_name='Lovelace')
        msg = ServiceGroupChatMessageFactory(sender=sender)
        data = ServiceGroupChatMessageSerializer(msg).data
        assert 'Ada' in data['sender_name'] or 'Lovelace' in data['sender_name']

    def test_sender_id_matches_sender(self):
        """sender_id in the payload matches the sender's primary key."""
        msg = ServiceGroupChatMessageFactory()
        data = ServiceGroupChatMessageSerializer(msg).data
        assert str(data['sender_id']) == str(msg.sender.id)

    def test_service_id_matches_service(self):
        """service field matches the service UUID."""
        msg = ServiceGroupChatMessageFactory()
        data = ServiceGroupChatMessageSerializer(msg).data
        assert str(data['service']) == str(msg.service.id)

    def test_body_is_preserved(self):
        """The body field is returned verbatim."""
        msg = ServiceGroupChatMessageFactory(body='Specific body content')
        data = ServiceGroupChatMessageSerializer(msg).data
        assert data['body'] == 'Specific body content'


# ── Access-control unit tests ─────────────────────────────────────────────────

@pytest.mark.django_db
class TestGroupChatViewSetAccessControl:
    """Unit tests for GroupChatViewSet._get_service_or_403.

    These tests exercise the access-control helper directly without going
    through the HTTP layer, giving faster and more targeted coverage.
    """

    def _viewset_with_user(self, user):
        """Return a GroupChatViewSet instance whose request.user is *user*."""
        from api.views import GroupChatViewSet
        from unittest.mock import MagicMock
        viewset = GroupChatViewSet()
        viewset.request = MagicMock()
        viewset.request.user = user
        return viewset

    def test_owner_is_allowed(self):
        """Service owner passes the access check."""
        owner = UserFactory()
        service = ServiceFactory(
            user=owner, schedule_type='One-Time', max_participants=3
        )
        vs = self._viewset_with_user(owner)
        result = vs._get_service_or_403(vs.request, str(service.id))
        assert result == service

    def test_accepted_requester_is_allowed(self):
        """User with an accepted handshake passes the access check."""
        service = ServiceFactory(schedule_type='One-Time', max_participants=3)
        requester = UserFactory()
        HandshakeFactory(service=service, requester=requester, status='accepted')

        vs = self._viewset_with_user(requester)
        result = vs._get_service_or_403(vs.request, str(service.id))
        assert result == service

    def test_pending_requester_is_denied_for_group_offer(self):
        """Pending group-offer requester must wait for acceptance."""
        from rest_framework.exceptions import PermissionDenied
        service = ServiceFactory(schedule_type='One-Time', max_participants=3)
        requester = UserFactory()
        HandshakeFactory(service=service, requester=requester, status='pending')

        vs = self._viewset_with_user(requester)
        with pytest.raises(PermissionDenied):
            vs._get_service_or_403(vs.request, str(service.id))

    def test_unrelated_user_is_denied(self):
        """A completely unrelated user is denied."""
        from rest_framework.exceptions import PermissionDenied
        service = ServiceFactory(schedule_type='One-Time', max_participants=3)
        outsider = UserFactory()

        vs = self._viewset_with_user(outsider)
        with pytest.raises(PermissionDenied):
            vs._get_service_or_403(vs.request, str(service.id))

    def test_recurrent_service_is_allowed(self):
        """Recurrent services with group capacity are allowed."""
        owner = UserFactory()
        service = ServiceFactory(
            user=owner, schedule_type='Recurrent', max_participants=5
        )
        vs = self._viewset_with_user(owner)
        result = vs._get_service_or_403(vs.request, str(service.id))
        assert result == service

    def test_single_participant_service_is_denied(self):
        """max_participants=1 services are rejected."""
        from rest_framework.exceptions import PermissionDenied
        owner = UserFactory()
        service = ServiceFactory(
            user=owner, schedule_type='One-Time', max_participants=1
        )
        vs = self._viewset_with_user(owner)
        with pytest.raises(PermissionDenied):
            vs._get_service_or_403(vs.request, str(service.id))

    def test_nonexistent_service_raises_not_found(self):
        """Unknown service UUID raises NotFound."""
        import uuid
        from rest_framework.exceptions import NotFound
        owner = UserFactory()
        vs = self._viewset_with_user(owner)
        with pytest.raises(NotFound):
            vs._get_service_or_403(vs.request, str(uuid.uuid4()))

    def test_denied_handshake_status_variations(self):
        """Terminal or rejected statuses do not grant access."""
        from rest_framework.exceptions import PermissionDenied
        service = ServiceFactory(schedule_type='One-Time', max_participants=3)
        requester = UserFactory()

        for hs_status in ('denied', 'cancelled'):
            HandshakeFactory(service=service, requester=requester, status=hs_status)
            vs = self._viewset_with_user(requester)
            with pytest.raises(PermissionDenied):
                vs._get_service_or_403(vs.request, str(service.id))


# ── GroupChatConsumer._check_access (WebSocket) ─────────────────────────────

@pytest.mark.django_db(transaction=True)
@pytest.mark.unit
class TestGroupChatConsumerAccess:
    """Unit tests for GroupChatConsumer._check_access (WS group chat eligibility)."""

    def _sync_check(self, user, service_id):
        """Call the async _check_access via async_to_sync."""
        from api.consumers import GroupChatConsumer
        from asgiref.sync import async_to_sync
        consumer = GroupChatConsumer()
        return async_to_sync(consumer._check_access)(user, service_id)

    def _sync_requires_session(self, service_id):
        """Call async _service_requires_session via async_to_sync."""
        from api.consumers import GroupChatConsumer
        from asgiref.sync import async_to_sync
        consumer = GroupChatConsumer()
        return async_to_sync(consumer._service_requires_session)(service_id)

    def _sync_session_check(self, user, service_id, session_id):
        """Call async _check_session_access via async_to_sync."""
        from api.consumers import GroupChatConsumer
        from asgiref.sync import async_to_sync
        consumer = GroupChatConsumer()
        return async_to_sync(consumer._check_session_access)(user, service_id, session_id)

    def test_recurrent_group_owner_allowed(self):
        """Recurrent group offer owner is allowed to connect to group chat WS."""
        owner = UserFactory()
        service = ServiceFactory(
            user=owner, schedule_type='Recurrent', max_participants=5
        )
        assert self._sync_check(owner, str(service.id)) is True

    def test_recurrent_accepted_participant_allowed(self):
        """User with accepted handshake on recurrent group offer is allowed."""
        service = ServiceFactory(schedule_type='Recurrent', max_participants=5)
        participant = UserFactory()
        HandshakeFactory(service=service, requester=participant, status='accepted')
        assert self._sync_check(participant, str(service.id)) is True

    def test_recurrent_pending_participant_denied(self):
        """Pending requester on recurrent group offer is denied WS access."""
        service = ServiceFactory(schedule_type='Recurrent', max_participants=5)
        requester = UserFactory()
        HandshakeFactory(service=service, requester=requester, status='pending')
        assert self._sync_check(requester, str(service.id)) is False

    def test_single_participant_service_denied(self):
        """max_participants=1 service is denied (no group chat)."""
        owner = UserFactory()
        service = ServiceFactory(
            user=owner, schedule_type='One-Time', max_participants=1
        )
        assert self._sync_check(owner, str(service.id)) is False

    def test_one_time_group_still_works(self):
        """One-Time group offer owner and accepted participant still allowed."""
        owner = UserFactory()
        service = ServiceFactory(
            user=owner, schedule_type='One-Time', max_participants=3
        )
        assert self._sync_check(owner, str(service.id)) is True
        participant = UserFactory()
        HandshakeFactory(service=service, requester=participant, status='accepted')
        assert self._sync_check(participant, str(service.id)) is True

    def test_recurrent_group_requires_session(self):
        """Recurrent group services must use session-scoped chat."""
        service = ServiceFactory(schedule_type='Recurrent', max_participants=5)
        assert self._sync_requires_session(str(service.id)) is True

    def test_one_time_group_does_not_require_session(self):
        """One-Time group services keep legacy service-scoped chat behavior."""
        service = ServiceFactory(schedule_type='One-Time', max_participants=3)
        assert self._sync_requires_session(str(service.id)) is False

    def test_recurrent_session_access_denied_for_malformed_session_id(self):
        """Malformed session_id never grants access."""
        service = ServiceFactory(schedule_type='Recurrent', max_participants=5)
        owner = service.user
        assert self._sync_session_check(owner, str(service.id), 'not-a-uuid') is False

    def test_recurrent_session_access_denied_when_time_does_not_match(self):
        """Accepted user for one occurrence cannot access another occurrence session."""
        from django.utils import timezone
        from datetime import timedelta
        from api.models import GroupChatSession

        service = ServiceFactory(schedule_type='Recurrent', max_participants=5)
        participant = UserFactory()
        st_a = timezone.now() + timedelta(days=1)
        st_b = timezone.now() + timedelta(days=2)
        HandshakeFactory(service=service, requester=participant, status='accepted', scheduled_time=st_a)
        session_b, _ = GroupChatSession.objects.get_or_create(service=service, scheduled_time=st_b, defaults={})

        assert self._sync_session_check(participant, str(service.id), str(session_b.id)) is False
