"""
Integration tests for E2E test utility endpoints.

These endpoints are only available when DJANGO_E2E=1.
"""
import pytest
from decimal import Decimal
from rest_framework import status
from rest_framework.test import APIClient
from django.test import override_settings

from api.tests.helpers.factories import UserFactory
from api.tests.helpers.test_client import AuthenticatedAPIClient


@pytest.mark.django_db
@pytest.mark.integration
class TestE2ESetBalance:
    """Test POST /api/e2e/set-balance/"""

    URL = '/api/e2e/set-balance/'

    @override_settings(DJANGO_E2E=True)
    def test_set_balance_success(self):
        user = UserFactory(timebank_balance=Decimal('3.00'))
        client = AuthenticatedAPIClient()
        client.authenticate_user(user)

        response = client.post(self.URL, {'balance': 10.5}, format='json')

        assert response.status_code == status.HTTP_200_OK
        assert response.data['balance'] == 10.5
        assert response.data['email'] == user.email
        assert response.data['id'] == str(user.id)

        user.refresh_from_db()
        assert user.timebank_balance == Decimal('10.50')

    @override_settings(DJANGO_E2E=True)
    def test_set_balance_zero(self):
        user = UserFactory(timebank_balance=Decimal('5.00'))
        client = AuthenticatedAPIClient()
        client.authenticate_user(user)

        response = client.post(self.URL, {'balance': 0}, format='json')

        assert response.status_code == status.HTTP_200_OK
        assert response.data['balance'] == 0.0

        user.refresh_from_db()
        assert user.timebank_balance == Decimal('0.00')

    @override_settings(DJANGO_E2E=True)
    def test_set_balance_negative(self):
        user = UserFactory(timebank_balance=Decimal('5.00'))
        client = AuthenticatedAPIClient()
        client.authenticate_user(user)

        response = client.post(self.URL, {'balance': -5.0}, format='json')

        assert response.status_code == status.HTTP_200_OK
        user.refresh_from_db()
        assert user.timebank_balance == Decimal('-5.00')

    @override_settings(DJANGO_E2E=False)
    def test_blocked_when_e2e_disabled(self):
        user = UserFactory()
        client = AuthenticatedAPIClient()
        client.authenticate_user(user)

        response = client.post(self.URL, {'balance': 100}, format='json')

        assert response.status_code == status.HTTP_403_FORBIDDEN
        assert 'E2E mode' in response.data['detail']

    @override_settings(DJANGO_E2E=True)
    def test_unauthenticated_rejected(self):
        client = APIClient()
        response = client.post(self.URL, {'balance': 10}, format='json')

        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    @override_settings(DJANGO_E2E=True)
    def test_missing_balance_field(self):
        user = UserFactory()
        client = AuthenticatedAPIClient()
        client.authenticate_user(user)

        response = client.post(self.URL, {}, format='json')

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert 'balance' in response.data['detail'].lower()

    @override_settings(DJANGO_E2E=True)
    def test_invalid_balance_value(self):
        user = UserFactory()
        client = AuthenticatedAPIClient()
        client.authenticate_user(user)

        response = client.post(self.URL, {'balance': 'not-a-number'}, format='json')

        assert response.status_code == status.HTTP_400_BAD_REQUEST

    @override_settings(DJANGO_E2E=True)
    def test_balance_below_minimum_rejected(self):
        user = UserFactory()
        client = AuthenticatedAPIClient()
        client.authenticate_user(user)

        response = client.post(self.URL, {'balance': -11.0}, format='json')

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert 'range' in response.data['detail'].lower()
