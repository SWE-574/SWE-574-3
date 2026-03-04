import pytest
from rest_framework import status
from rest_framework.test import APIClient
from django.contrib.auth import get_user_model
from django.utils import timezone
from datetime import timedelta
from unittest.mock import patch, MagicMock

from api.models import EmailVerificationToken, PasswordResetToken
from api.tests.helpers.factories import UserFactory
from api.tests.helpers.test_client import AuthenticatedAPIClient

User = get_user_model()


@pytest.mark.django_db
@pytest.mark.integration
class TestVerificationAPI:

    def test_verify_email_success(self):
        user = UserFactory(is_verified=False)
        token = EmailVerificationToken.objects.create(
            user=user,
            token="valid_token_123",
            expires_at=timezone.now() + timedelta(hours=1)
        )
        client = APIClient()
        response = client.post('/api/auth/verify-email/', {'token': 'valid_token_123'})
        assert response.status_code == status.HTTP_200_OK
        assert 'access' in response.data
        user.refresh_from_db()
        assert user.is_verified is True
        token.refresh_from_db()
        assert token.is_used is True

    def test_verify_email_invalid_token(self):
        client = APIClient()
        response = client.post('/api/auth/verify-email/', {'token': 'invalid_string'})
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_verify_email_expired_token(self):
        user = UserFactory(is_verified=False)
        EmailVerificationToken.objects.create(
            user=user,
            token="expired_token_123",
            expires_at=timezone.now() - timedelta(hours=1)
        )
        client = APIClient()
        response = client.post('/api/auth/verify-email/', {'token': 'expired_token_123'})
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    @patch('api.views._send_email_async')
    def test_send_verification_authenticated(self, mock_send):
        user = UserFactory(is_verified=False)
        client = AuthenticatedAPIClient()
        client.authenticate_user(user)

        response = client.post('/api/auth/send-verification/')
        assert response.status_code == status.HTTP_200_OK
        assert EmailVerificationToken.objects.filter(user=user, is_used=False).exists()
        mock_send.assert_called_once()

    def test_send_verification_already_verified(self):
        user = UserFactory(is_verified=True)
        client = AuthenticatedAPIClient()
        client.authenticate_user(user)

        response = client.post('/api/auth/send-verification/')
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    @patch('api.views._send_email_async')
    def test_resend_verification_public(self, mock_send):
        user = UserFactory(is_verified=False, email='testunverified@test.com')
        client = APIClient()
        response = client.post('/api/auth/resend-verification/', {'email': 'testunverified@test.com'})
        assert response.status_code == status.HTTP_200_OK
        mock_send.assert_called_once()

    @patch('api.views._send_email_async')
    def test_resend_verification_public_does_not_exist(self, mock_send):
        client = APIClient()
        response = client.post('/api/auth/resend-verification/', {'email': 'doesnotexist@test.com'})
        assert response.status_code == status.HTTP_200_OK
        mock_send.assert_not_called()


@pytest.mark.django_db
@pytest.mark.integration
class TestPasswordResetAPI:

    @patch('api.views._send_email_async')
    def test_forgot_password(self, mock_send):
        UserFactory(email='forgotpass@test.com')
        client = APIClient()
        response = client.post('/api/auth/forgot-password/', {'email': 'forgotpass@test.com'})
        assert response.status_code == status.HTTP_200_OK
        mock_send.assert_called_once()

    def test_reset_password_success(self):
        user = UserFactory(email='reset@test.com')
        user.set_password('oldpass123')
        user.save()

        token = PasswordResetToken.objects.create(
            user=user,
            token="reset_token_123",
            expires_at=timezone.now() + timedelta(hours=1)
        )

        client = APIClient()
        response = client.post('/api/auth/reset-password/', {
            'token': 'reset_token_123',
            'password': 'newsecurepass123'
        })
        
        assert response.status_code == status.HTTP_200_OK
        user.refresh_from_db()
        assert user.check_password('newsecurepass123') is True
        token.refresh_from_db()
        assert token.is_used is True

    def test_reset_password_invalid_token(self):
        client = APIClient()
        response = client.post('/api/auth/reset-password/', {
            'token': 'bad_token',
            'password': 'newsecurepass123'
        })
        assert response.status_code == status.HTTP_400_BAD_REQUEST
