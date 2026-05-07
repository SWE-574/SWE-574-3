"""
WebSocket test helpers.

Channels has a manual auth scheme (no ``AuthMiddlewareStack``) — consumers pull
the JWT either from the ``access_token`` cookie (web) or the ``?token=`` query
string (mobile). Tests should exercise both paths, so these helpers make that
mechanical.

Usage:

    @pytest.mark.asyncio
    @pytest.mark.websocket
    async def test_private_chat_owner_connects(handshake):
        async with consumer_for(
            f'/ws/chat/{handshake.id}/',
            user=handshake.requester,
            auth='cookie',
        ) as comm:
            assert (await comm.receive_json_from())['type'] == 'connection.ok'

The yielded object is a Channels ``WebsocketCommunicator``.
"""
from contextlib import asynccontextmanager

from channels.routing import URLRouter
from channels.testing import WebsocketCommunicator
from rest_framework_simplejwt.tokens import RefreshToken

import api.routing


def _build_app():
    return URLRouter(api.routing.websocket_urlpatterns)


def _token_for(user) -> str:
    return str(RefreshToken.for_user(user).access_token)


@asynccontextmanager
async def consumer_for(path: str, *, user=None, auth: str = 'cookie'):
    """
    Open a Channels ``WebsocketCommunicator`` against the live routing table.

    Parameters
    ----------
    path:
        WebSocket path, e.g. ``/ws/notifications/``.
    user:
        Authenticated user. ``None`` simulates an anonymous connection.
    auth:
        ``'cookie'`` (default) sets ``access_token`` in the request headers
        like the browser.
        ``'query'`` appends ``?token=...`` like the mobile client.
    """
    if user is not None and auth not in {'cookie', 'query'}:
        raise ValueError(f'auth must be cookie | query, got {auth!r}')

    final_path = path
    headers: list[tuple[bytes, bytes]] = []

    if user is not None:
        token = _token_for(user)
        if auth == 'cookie':
            headers.append((b'cookie', f'access_token={token}'.encode()))
        else:
            sep = '&' if '?' in path else '?'
            final_path = f'{path}{sep}token={token}'

    communicator = WebsocketCommunicator(_build_app(), final_path, headers=headers)
    try:
        yield communicator
    finally:
        await communicator.disconnect()


async def connect_consumer(path: str, *, user=None, auth: str = 'cookie'):
    """
    Lower-level helper: returns ``(communicator, connected, subprotocol)``.

    Prefer ``consumer_for`` for most tests; reach for this when you need to
    inspect the handshake explicitly (e.g. assert anonymous connections are
    rejected).
    """
    headers: list[tuple[bytes, bytes]] = []
    final_path = path
    if user is not None:
        token = _token_for(user)
        if auth == 'cookie':
            headers.append((b'cookie', f'access_token={token}'.encode()))
        else:
            sep = '&' if '?' in path else '?'
            final_path = f'{path}{sep}token={token}'

    communicator = WebsocketCommunicator(_build_app(), final_path, headers=headers)
    connected, subprotocol = await communicator.connect()
    return communicator, connected, subprotocol
