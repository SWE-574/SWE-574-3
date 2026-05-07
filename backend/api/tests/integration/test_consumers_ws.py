"""
Integration tests for the Channels consumers.

These exercise the *real* connect handshake (cookie auth and ``?token=`` auth)
against the live ASGI router rather than poking the consumer's Python helpers
in isolation. The unit test file ``test_private_chat_consumer.py`` continues
to cover the helper methods individually.

Audit gap closed: only ~65 LOC of consumer coverage existed and none of it
exercised the connection handshake or authorization rejection at the wire.
"""
from decimal import Decimal

import pytest

from api.tests.helpers.factories import (
    UserFactory, ServiceFactory, HandshakeFactory,
)
from api.tests.helpers.ws import consumer_for, connect_consumer


@pytest.mark.asyncio
@pytest.mark.websocket
@pytest.mark.django_db(transaction=True)
class TestPrivateChatConnect:
    """``ws/chat/<handshake>/`` is restricted to the two handshake parties."""

    async def test_owner_can_connect_via_cookie(self, db):
        owner = UserFactory()
        requester = UserFactory()
        service = ServiceFactory(user=owner)
        handshake = HandshakeFactory(service=service, requester=requester)

        async with consumer_for(
            f'/ws/chat/{handshake.id}/', user=owner, auth='cookie',
        ) as comm:
            connected, _ = await comm.connect()
            assert connected is True

    async def test_requester_can_connect_via_query_token(self, db):
        owner = UserFactory()
        requester = UserFactory()
        service = ServiceFactory(user=owner)
        handshake = HandshakeFactory(service=service, requester=requester)

        async with consumer_for(
            f'/ws/chat/{handshake.id}/', user=requester, auth='query',
        ) as comm:
            connected, _ = await comm.connect()
            assert connected is True

    async def test_outsider_is_rejected(self, db):
        owner = UserFactory()
        requester = UserFactory()
        outsider = UserFactory()
        service = ServiceFactory(user=owner)
        handshake = HandshakeFactory(service=service, requester=requester)

        comm, connected, _ = await connect_consumer(
            f'/ws/chat/{handshake.id}/', user=outsider, auth='cookie',
        )
        try:
            assert connected is False
        finally:
            await comm.disconnect()

    async def test_anonymous_is_rejected(self, db):
        owner = UserFactory()
        requester = UserFactory()
        service = ServiceFactory(user=owner)
        handshake = HandshakeFactory(service=service, requester=requester)

        comm, connected, _ = await connect_consumer(
            f'/ws/chat/{handshake.id}/', user=None,
        )
        try:
            assert connected is False
        finally:
            await comm.disconnect()


@pytest.mark.asyncio
@pytest.mark.websocket
@pytest.mark.django_db(transaction=True)
class TestNotificationConsumer:
    """``ws/notifications/`` accepts every authenticated user."""

    async def test_authenticated_user_connects(self, db):
        user = UserFactory()
        async with consumer_for('/ws/notifications/', user=user, auth='cookie') as comm:
            connected, _ = await comm.connect()
            assert connected is True

    async def test_query_token_path_works_for_mobile(self, db):
        user = UserFactory()
        async with consumer_for('/ws/notifications/', user=user, auth='query') as comm:
            connected, _ = await comm.connect()
            assert connected is True

    async def test_anonymous_rejected(self, db):
        comm, connected, _ = await connect_consumer('/ws/notifications/', user=None)
        try:
            assert connected is False
        finally:
            await comm.disconnect()


@pytest.mark.asyncio
@pytest.mark.websocket
@pytest.mark.django_db(transaction=True)
class TestGroupChatConsumer:
    """``ws/group-chat/<service>/`` requires service ownership or accepted membership."""

    async def test_owner_can_connect(self, db):
        owner = UserFactory()
        service = ServiceFactory(user=owner, max_participants=4)
        async with consumer_for(
            f'/ws/group-chat/{service.id}/', user=owner, auth='cookie',
        ) as comm:
            connected, _ = await comm.connect()
            assert connected is True

    async def test_outsider_without_handshake_rejected(self, db):
        owner = UserFactory()
        outsider = UserFactory()
        service = ServiceFactory(user=owner, max_participants=4)
        comm, connected, _ = await connect_consumer(
            f'/ws/group-chat/{service.id}/', user=outsider, auth='cookie',
        )
        try:
            assert connected is False
        finally:
            await comm.disconnect()
