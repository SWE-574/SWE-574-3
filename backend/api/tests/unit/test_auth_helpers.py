import pytest
from django.contrib.auth import get_user_model
from django.utils import timezone
from datetime import timedelta
from unittest.mock import patch, MagicMock
from rest_framework.response import Response

from api.models import EmailVerificationToken, PasswordResetToken
from api.tests.helpers.factories import UserFactory
from api.views import get_cookie_settings, _set_auth_cookies, _send_verification_email, _send_password_reset_email

User = get_user_model()


@pytest.mark.django_db
@pytest.mark.unit
class TestAuthHelpers:

    def test_get_cookie_settings_dev(self, settings):
        settings.IS_PRODUCTION = False
        cookie_settings = get_cookie_settings(httponly=True)
        assert cookie_settings['httponly'] is True
        assert cookie_settings['secure'] is False
        assert cookie_settings['samesite'] == 'Lax'
        assert cookie_settings['path'] == '/'

    def test_get_cookie_settings_prod(self, settings):
        settings.IS_PRODUCTION = True
        cookie_settings = get_cookie_settings(httponly=False)
        assert cookie_settings['httponly'] is False
        assert cookie_settings['secure'] is True
        assert cookie_settings['samesite'] == 'Strict'

    def test_set_auth_cookies(self, settings):
        settings.IS_PRODUCTION = False
        response = Response()
        
        # Test the helper which sets access_token and refresh_token
        _set_auth_cookies(response, "fake_access", "fake_refresh")
        
        # In DRF, cookies are stored in response.cookies (a SimpleCookie object)
        assert 'access_token' in response.cookies
        assert response.cookies['access_token'].value == "fake_access"
        assert response.cookies['access_token']['httponly'] is True
        assert response.cookies['access_token']['samesite'].lower() == 'lax'.lower()

        assert 'refresh_token' in response.cookies
        assert response.cookies['refresh_token'].value == "fake_refresh"
        assert response.cookies['refresh_token']['httponly'] is True
        assert response.cookies['refresh_token']['samesite'].lower() == 'lax'.lower()

    @patch('api.views._send_email_async')
    def test_send_verification_email(self, mock_send):
        user = UserFactory(is_verified=False)
        _send_verification_email(user)
        
        # Should create a token
        token = EmailVerificationToken.objects.get(user=user)
        assert token.is_used is False
        assert token.token is not None
        assert token.expires_at > timezone.now()
        
        mock_send.assert_called_once()
        args, kwargs = mock_send.call_args
        assert args[0] == user.email
        assert args[1] == 'Verify your email — The Hive'
        assert str(token.token) in args[2]

    @patch('api.views._send_email_async')
    def test_send_password_reset_email(self, mock_send):
        user = UserFactory()
        _send_password_reset_email(user)
        
        # Should create a token
        token = PasswordResetToken.objects.get(user=user)
        assert token.is_used is False
        assert token.token is not None
        assert token.expires_at > timezone.now()
        
        mock_send.assert_called_once()
        args, kwargs = mock_send.call_args
        assert args[0] == user.email
        assert args[1] == 'Reset your password — The Hive'
        assert str(token.token) in args[2]
