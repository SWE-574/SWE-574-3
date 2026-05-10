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


@pytest.mark.unit
class TestWsAuthTokenCacheTtlClamp:
    """The WS auth helper caches user_id by JWT for 60s, but the cache
    TTL must never extend the token's own ``exp`` lifetime — a token that
    expires in 5 seconds cannot keep authenticating for the full 60 by
    virtue of being cached.
    """

    def _make_token_pair(self, user, exp_offset_seconds):
        """Build a real AccessToken for ``user`` whose ``exp`` claim is
        offset relative to ``now`` by the given seconds. The decoded
        token still validates because we set both iat and exp explicitly,
        sidestepping simplejwt's lifetime config.
        """
        import time
        from rest_framework_simplejwt.tokens import AccessToken
        token = AccessToken.for_user(user)
        now = int(time.time())
        token.payload['exp'] = now + exp_offset_seconds
        token.payload['iat'] = now
        return str(token), token.payload['exp']

    def test_short_lived_token_caches_with_clamped_ttl(self):
        from api.consumers import _resolve_user_id_from_token, _WS_AUTH_CACHE_TTL_SECONDS
        from django.core.cache import cache
        from unittest.mock import patch
        cache.clear()
        user = UserFactory()
        # exp is 5s in the future — TTL must clamp to <= 5s, not the
        # default 60s.
        raw, _exp = self._make_token_pair(user, exp_offset_seconds=5)

        captured = {}
        original_set = cache.set
        def spy_set(key, value, ttl=None, *a, **kw):
            captured.setdefault('ttl', ttl)
            return original_set(key, value, ttl, *a, **kw)
        with patch('api.consumers.cache.set', side_effect=spy_set):
            user_id = _resolve_user_id_from_token(raw)
        # JWT serialises UUID user ids as strings; compare under str.
        assert str(user_id) == str(user.id)
        assert captured['ttl'] is not None
        assert captured['ttl'] <= 5
        assert captured['ttl'] < _WS_AUTH_CACHE_TTL_SECONDS

    def test_already_expired_token_is_not_cached_at_all(self):
        """An exp-in-the-past token must skip cache.set entirely so the
        next call re-runs validation. Patches the symbol on the simplejwt
        module rather than ``api.consumers`` because the consumer imports
        ``AccessToken`` lazily inside the function and the attribute does
        not exist on the consumer module at import time.
        """
        from api.consumers import _resolve_user_id_from_token
        from django.core.cache import cache
        from unittest.mock import patch
        from rest_framework_simplejwt.tokens import AccessToken
        cache.clear()
        user = UserFactory()
        token = AccessToken.for_user(user)
        token.payload['exp'] = 0
        with patch('rest_framework_simplejwt.tokens.AccessToken', return_value=token), \
             patch('api.consumers.cache.set') as set_mock:
            _resolve_user_id_from_token('forced-skewed-token')
        set_mock.assert_not_called()
