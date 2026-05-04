"""Integration tests for #244 (registration rate limit + email blacklist +
auth signal logging) and #326 (geolocation encryption posture ADR).
"""
import logging

import pytest
from rest_framework import status
from rest_framework.test import APIClient

from api.tests.helpers.factories import UserFactory


REGISTER_URL = '/api/auth/register/'
LOGIN_URL = '/api/auth/login/'


def _payload(email: str = 'newuser@example.com') -> dict:
    return {
        'email': email,
        'password': 'StrongPass123!',
        'first_name': 'Test',
        'last_name': 'User',
    }


class TestThrottleWiring:
    """Throttles are wired to the auth views (#244)."""

    def test_register_view_uses_registration_throttle(self):
        from api.views import RegistrationThrottle, UserRegistrationView
        assert RegistrationThrottle in UserRegistrationView.throttle_classes

    def test_login_view_uses_login_throttle(self):
        from api.views import CustomTokenObtainPairView, LoginThrottle
        assert LoginThrottle in CustomTokenObtainPairView.throttle_classes


@pytest.mark.django_db
@pytest.mark.integration
class TestDisposableEmailBlacklist:
    """UserRegistrationSerializer rejects throwaway providers."""

    @pytest.mark.parametrize('domain', [
        'mailinator.com',
        '10minutemail.com',
        'guerrillamail.com',
        'yopmail.com',
        'tempmail.com',
    ])
    def test_disposable_domain_rejected(self, domain):
        client = APIClient()
        response = client.post(REGISTER_URL, _payload(f'spammer@{domain}'))
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        # Error must come back attached to the email field, not as a server error.
        assert 'email' in response.data

    def test_real_provider_accepted(self):
        client = APIClient()
        response = client.post(REGISTER_URL, _payload('real.user@gmail.com'))
        assert response.status_code == status.HTTP_201_CREATED


@pytest.mark.django_db
@pytest.mark.integration
class TestAuthSecurityLogging:
    """user_logged_in / user_login_failed signals fire and the api.security
    logger captures them."""

    def test_failed_login_emits_security_log(self, caplog):
        client = APIClient()
        with caplog.at_level(logging.WARNING, logger='api.security'):
            response = client.post(LOGIN_URL, {
                'email': 'nobody@example.com',
                'password': 'wrong-password',
            })
        assert response.status_code in (
            status.HTTP_401_UNAUTHORIZED, status.HTTP_400_BAD_REQUEST,
        )
        assert any('auth.login.failed' in rec.message for rec in caplog.records)

    def test_successful_login_emits_security_log(self, caplog):
        user = UserFactory(email='success@example.com')
        user.set_password('GoodPass123!')
        user.save()

        client = APIClient()
        with caplog.at_level(logging.INFO, logger='api.security'):
            response = client.post(LOGIN_URL, {
                'email': 'success@example.com',
                'password': 'GoodPass123!',
            })
        assert response.status_code == status.HTTP_200_OK
        assert any('auth.login.success' in rec.message for rec in caplog.records)
