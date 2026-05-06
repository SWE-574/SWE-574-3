"""Integration tests for #370 — notification preferences UI + persistence.

Covers:
- PATCH /api/users/me/ persists notification_preferences
- /users/me/ returns the persisted prefs
- _send_push_notification respects the master push switch and per-category opt-outs
"""
from unittest.mock import patch

import pytest
from rest_framework import status
from rest_framework.test import APIClient

from api.models import DevicePushToken, Notification
from api.tests.helpers.factories import UserFactory
from api.tests.helpers.test_client import AuthenticatedAPIClient
from api.utils import _send_push_notification, user_wants_push


@pytest.mark.django_db
@pytest.mark.integration
class TestNotificationPreferencesPersistence:
    def test_unauthenticated_request_rejected(self):
        response = APIClient().patch(
            '/api/users/me/',
            {'notification_preferences': {'push': False}},
            format='json',
        )
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_patch_round_trips(self):
        user = UserFactory()
        client = AuthenticatedAPIClient().authenticate_user(user)

        patch_response = client.patch(
            '/api/users/me/',
            {'notification_preferences': {'push': True, 'chat': False, 'system': True}},
            format='json',
        )
        assert patch_response.status_code == status.HTTP_200_OK

        get_response = client.get('/api/users/me/')
        assert get_response.status_code == status.HTTP_200_OK
        prefs = get_response.data.get('notification_preferences') or {}
        assert prefs.get('push') is True
        assert prefs.get('chat') is False
        assert prefs.get('system') is True

    def test_default_is_empty_dict(self):
        user = UserFactory()
        # No PATCH performed; the default JSON value is {} which means "all on".
        assert user.notification_preferences == {}


@pytest.mark.django_db
@pytest.mark.integration
class TestUserWantsPushHelper:
    """user_wants_push() honours the master switch and category opt-outs."""

    def test_default_user_gets_all_pushes(self):
        user = UserFactory()
        assert user_wants_push(user, 'chat_message') is True
        assert user_wants_push(user, 'handshake_request') is True
        assert user_wants_push(user, 'report_resolved') is True

    def test_master_off_silences_everything(self):
        user = UserFactory(notification_preferences={'push': False})
        assert user_wants_push(user, 'chat_message') is False
        assert user_wants_push(user, 'handshake_request') is False
        assert user_wants_push(user, 'report_resolved') is False

    def test_per_category_opt_out(self):
        user = UserFactory(notification_preferences={'chat': False})
        assert user_wants_push(user, 'chat_message') is False
        # Other categories still flow through.
        assert user_wants_push(user, 'handshake_request') is True

    def test_unknown_type_falls_under_system(self):
        user = UserFactory(notification_preferences={'system': False})
        # admin_warning is mapped to 'system' so it should be muted.
        assert user_wants_push(user, 'admin_warning') is False


@pytest.mark.django_db
@pytest.mark.integration
class TestSendPushRespectsPreferences:
    """_send_push_notification short-circuits when prefs say no."""

    def test_skips_when_master_push_off(self):
        user = UserFactory(notification_preferences={'push': False})
        DevicePushToken.objects.create(user=user, token='ExponentPushToken[abc]', is_active=True)
        notif = Notification.objects.create(
            user=user, type='chat_message',
            title='New message', message='Hi',
        )

        with patch('api.utils.PushClient', create=True) as push_client_cls:
            _send_push_notification(notif)

        push_client_cls.assert_not_called()

    def test_skips_when_category_off(self):
        user = UserFactory(notification_preferences={'handshakes': False})
        DevicePushToken.objects.create(user=user, token='ExponentPushToken[xyz]', is_active=True)
        notif = Notification.objects.create(
            user=user, type='handshake_request',
            title='New request', message='Someone wants help',
        )

        with patch('api.utils.PushClient', create=True) as push_client_cls:
            _send_push_notification(notif)

        push_client_cls.assert_not_called()
