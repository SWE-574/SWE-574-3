"""
Unit tests for private ChatConsumer helper methods.
"""
import pytest
from asgiref.sync import async_to_sync

from api.consumers import ChatConsumer
from api.tests.helpers.factories import (
    UserFactory,
    ServiceFactory,
    HandshakeFactory,
)


@pytest.mark.django_db(transaction=True)
@pytest.mark.unit
class TestChatConsumerPrivateAccess:
    """Private chat consumer should only allow handshake parties."""

    def test_handshake_parties_are_authorized(self):
        owner = UserFactory()
        requester = UserFactory()
        service = ServiceFactory(user=owner)
        handshake = HandshakeFactory(service=service, requester=requester)
        consumer = ChatConsumer()

        owner_allowed = async_to_sync(consumer.verify_handshake_access)(owner, str(handshake.id))
        requester_allowed = async_to_sync(consumer.verify_handshake_access)(requester, str(handshake.id))

        assert owner_allowed is True
        assert requester_allowed is True

    def test_unrelated_user_is_rejected(self):
        owner = UserFactory()
        requester = UserFactory()
        outsider = UserFactory()
        service = ServiceFactory(user=owner)
        handshake = HandshakeFactory(service=service, requester=requester)
        consumer = ChatConsumer()

        outsider_allowed = async_to_sync(consumer.verify_handshake_access)(outsider, str(handshake.id))

        assert outsider_allowed is False


@pytest.mark.django_db(transaction=True)
@pytest.mark.unit
class TestChatConsumerMessagePersistence:
    """Saved private messages should be sanitized and bounded."""

    def test_save_message_sanitizes_html_and_truncates(self):
        owner = UserFactory()
        requester = UserFactory()
        service = ServiceFactory(user=owner)
        handshake = HandshakeFactory(service=service, requester=requester)
        consumer = ChatConsumer()

        raw_body = "<script>alert('xss')</script>" + ("a" * 6000)
        message = async_to_sync(consumer.save_message)(str(handshake.id), requester.id, raw_body)

        assert message.handshake_id == handshake.id
        assert message.sender_id == requester.id
        assert '<script>' not in message.body
        assert len(message.body) == 5000
