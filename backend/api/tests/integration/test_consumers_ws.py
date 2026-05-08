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
from channels.db import database_sync_to_async

from api.tests.helpers.factories import (
    UserFactory, ServiceFactory, HandshakeFactory,
)
from api.tests.helpers.ws import consumer_for, connect_consumer


# Channels' WebsocketCommunicator runs in an async context, so any ORM call
# (and the django-storages MinIO setup that fires when a service is built)
# must be wrapped in database_sync_to_async to avoid SynchronousOnlyOperation.
async_user = database_sync_to_async(UserFactory)
async_service = database_sync_to_async(ServiceFactory)
async_handshake = database_sync_to_async(HandshakeFactory)


@pytest.mark.asyncio
@pytest.mark.websocket
@pytest.mark.django_db(transaction=True)
class TestPrivateChatConnect:
    """``ws/chat/<handshake>/`` is restricted to the two handshake parties."""

    async def test_owner_can_connect_via_cookie(self, db):
        owner = await async_user()
        requester = await async_user()
        service = await async_service(user=owner)
        handshake = await async_handshake(service=service, requester=requester)

        async with consumer_for(
            f'/ws/chat/{handshake.id}/', user=owner, auth='cookie',
        ) as comm:
            connected, _ = await comm.connect()
            assert connected is True

    async def test_requester_can_connect_via_query_token(self, db):
        owner = await async_user()
        requester = await async_user()
        service = await async_service(user=owner)
        handshake = await async_handshake(service=service, requester=requester)

        async with consumer_for(
            f'/ws/chat/{handshake.id}/', user=requester, auth='query',
        ) as comm:
            connected, _ = await comm.connect()
            assert connected is True

    async def test_outsider_is_rejected(self, db):
        owner = await async_user()
        requester = await async_user()
        outsider = await async_user()
        service = await async_service(user=owner)
        handshake = await async_handshake(service=service, requester=requester)

        comm, connected, _ = await connect_consumer(
            f'/ws/chat/{handshake.id}/', user=outsider, auth='cookie',
        )
        try:
            assert connected is False
        finally:
            await comm.disconnect()

    async def test_anonymous_is_rejected(self, db):
        owner = await async_user()
        requester = await async_user()
        service = await async_service(user=owner)
        handshake = await async_handshake(service=service, requester=requester)

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
        user = await async_user()
        async with consumer_for('/ws/notifications/', user=user, auth='cookie') as comm:
            connected, _ = await comm.connect()
            assert connected is True

    async def test_query_token_path_works_for_mobile(self, db):
        user = await async_user()
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
        owner = await async_user()
        # Pin schedule_type to 'One-Time' because ServiceFactory's iterator
        # otherwise alternates between 'One-Time' and 'Recurrent' between
        # consecutive test runs, and Recurrent group chat requires a
        # session_id query parameter that this test does not provide.
        service = await async_service(user=owner, max_participants=4, schedule_type='One-Time')
        async with consumer_for(
            f'/ws/group-chat/{service.id}/', user=owner, auth='cookie',
        ) as comm:
            connected, _ = await comm.connect()
            assert connected is True

    async def test_outsider_without_handshake_rejected(self, db):
        owner = await async_user()
        outsider = await async_user()
        service = await async_service(user=owner, max_participants=4, schedule_type='One-Time')
        comm, connected, _ = await connect_consumer(
            f'/ws/group-chat/{service.id}/', user=outsider, auth='cookie',
        )
        try:
            assert connected is False
        finally:
            await comm.disconnect()
