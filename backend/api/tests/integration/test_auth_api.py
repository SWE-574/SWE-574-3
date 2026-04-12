"""
Integration tests for authentication API endpoints
"""
import pytest
from rest_framework import status
from rest_framework.test import APIClient
from django.contrib.auth import get_user_model
from django.utils import timezone
from datetime import timedelta

from api.tests.helpers.factories import UserFactory
from api.tests.helpers.test_client import AuthenticatedAPIClient

User = get_user_model()


@pytest.mark.django_db
@pytest.mark.integration
class TestUserRegistration:
    """Test user registration endpoint"""
    
    def test_registration_success(self):
        """Test successful user registration"""
        client = APIClient()
        response = client.post('/api/auth/register/', {
            'email': 'newuser@test.com',
            'password': 'testpass123',
            'first_name': 'New',
            'last_name': 'User'
        })
        assert response.status_code == status.HTTP_201_CREATED
        assert 'user_id' in response.data
        assert 'user' in response.data
        assert response.data['user']['email'] == 'newuser@test.com'
        assert User.objects.filter(email='newuser@test.com').exists()
    
    def test_registration_duplicate_email(self):
        """Test registration with duplicate email fails"""
        UserFactory(email='existing@test.com')
        client = APIClient()
        response = client.post('/api/auth/register/', {
            'email': 'existing@test.com',
            'password': 'testpass123',
            'first_name': 'Test',
            'last_name': 'User'
        })
        assert response.status_code == status.HTTP_400_BAD_REQUEST
    
    def test_registration_missing_fields(self):
        """Test registration with missing required fields"""
        client = APIClient()
        response = client.post('/api/auth/register/', {
            'email': 'incomplete@test.com'
        })
        assert response.status_code == status.HTTP_400_BAD_REQUEST


@pytest.mark.django_db
@pytest.mark.integration
class TestUserLogin:
    """Test user login endpoint"""
    
    def test_login_success(self):
        """Test successful login"""
        user = UserFactory(email='testuser@test.com')
        user.set_password('testpass123')
        user.save()
        
        client = APIClient()
        response = client.post('/api/auth/login/', {
            'email': 'testuser@test.com',
            'password': 'testpass123'
        })
        assert response.status_code == status.HTTP_200_OK
        assert 'access' in response.data
        assert 'refresh' in response.data
    
    def test_login_invalid_credentials(self):
        """Test login with invalid credentials"""
        UserFactory(email='testuser@test.com', password='correctpass')
        
        client = APIClient()
        response = client.post('/api/auth/login/', {
            'email': 'testuser@test.com',
            'password': 'wrongpass'
        })
        assert response.status_code == status.HTTP_401_UNAUTHORIZED
    
    def test_login_account_locked(self):
        """Test login with locked account"""
        user = UserFactory(email='locked@test.com')
        user.set_password('testpass123')
        user.locked_until = timezone.now() + timedelta(hours=1)
        user.save()
        
        client = APIClient()
        response = client.post('/api/auth/login/', {
            'email': 'locked@test.com',
            'password': 'testpass123'
        })
        assert response.status_code == status.HTTP_423_LOCKED
    
    def test_login_account_lockout_after_failed_attempts(self):
        """Test account lockout after multiple failed attempts"""
        user = UserFactory(email='lockout@test.com')
        user.set_password('testpass123')
        user.save()
        
        client = APIClient()
        for i in range(5):
            response = client.post('/api/auth/login/', {
                'email': 'lockout@test.com',
                'password': 'wrongpass'
            })
        
        user.refresh_from_db()
        assert user.failed_login_attempts >= 5
        assert user.locked_until is not None


@pytest.mark.django_db
@pytest.mark.integration
class TestTokenRefresh:
    """Test token refresh endpoint"""
    
    def test_token_refresh_success(self):
        """Test successful token refresh"""
        user = UserFactory()
        from rest_framework_simplejwt.tokens import RefreshToken
        refresh = RefreshToken.for_user(user)
        
        client = APIClient()
        response = client.post('/api/auth/refresh/', {
            'refresh': str(refresh)
        })
        assert response.status_code == status.HTTP_200_OK
        assert 'access' in response.data
    
    def test_token_refresh_invalid_token(self):
        """Test token refresh with invalid token"""
        client = APIClient()
        response = client.post('/api/auth/refresh/', {
            'refresh': 'invalid-token'
        })
        assert response.status_code == status.HTTP_401_UNAUTHORIZED


@pytest.mark.django_db
@pytest.mark.integration
class TestAuthenticatedEndpoints:
    """Test authenticated endpoint access"""
    
    def test_authenticated_access(self):
        """Test accessing protected endpoint with valid token"""
        user = UserFactory()
        client = AuthenticatedAPIClient()
        client.authenticate_user(user)
        
        response = client.get('/api/users/me/')
        assert response.status_code == status.HTTP_200_OK
        assert response.data['email'] == user.email
    
    def test_unauthenticated_access(self):
        """Test accessing protected endpoint without token"""
        client = APIClient()
        response = client.get('/api/users/me/')
        assert response.status_code == status.HTTP_401_UNAUTHORIZED


@pytest.mark.django_db
@pytest.mark.integration
class TestLogout:
    """Test logout endpoint (FR01c) — cookie clearing and token blacklisting"""

    def _login(self, client, email='logoutuser@test.com', password='testpass123'):
        """Helper: create user, log in, return (user, refresh_token_str)."""
        user = UserFactory(email=email)
        user.set_password(password)
        user.save()
        resp = client.post('/api/auth/login/', {'email': email, 'password': password})
        assert resp.status_code == status.HTTP_200_OK
        return user, resp.data['refresh']

    def test_logout_returns_200(self):
        """POST /api/auth/logout/ returns 200 with success detail."""
        client = APIClient()
        self._login(client)
        response = client.post('/api/auth/logout/')
        assert response.status_code == status.HTTP_200_OK
        assert 'detail' in response.data

    def test_logout_clears_auth_cookies(self):
        """Logout response includes cookie-deletion directives for both tokens."""
        client = APIClient()
        _, refresh_token = self._login(client, email='cookietest@test.com')

        # Attach the refresh cookie so logout can blacklist it
        client.cookies['refresh_token'] = refresh_token

        response = client.post('/api/auth/logout/')
        assert response.status_code == status.HTTP_200_OK

        # Django sets max-age=0 when deleting a cookie
        assert 'access_token' in response.cookies
        assert 'refresh_token' in response.cookies
        assert response.cookies['access_token']['max-age'] == 0
        assert response.cookies['refresh_token']['max-age'] == 0

    def test_logout_blacklists_refresh_token(self):
        """Refresh token used before logout is unusable after logout."""
        client = APIClient()
        _, refresh_token = self._login(client, email='blacklist@test.com')

        # Attach refresh cookie so logout can blacklist it
        client.cookies['refresh_token'] = refresh_token
        logout_resp = client.post('/api/auth/logout/')
        assert logout_resp.status_code == status.HTTP_200_OK

        # Attempt to use the blacklisted token on a fresh client (sent in body)
        fresh_client = APIClient()
        refresh_resp = fresh_client.post('/api/auth/refresh/', {'refresh': refresh_token})
        assert refresh_resp.status_code == status.HTTP_401_UNAUTHORIZED

    def test_logout_without_cookies_is_safe(self):
        """Logout is idempotent / safe when no refresh cookie is present."""
        client = APIClient()
        response = client.post('/api/auth/logout/')
        assert response.status_code == status.HTTP_200_OK
        assert 'detail' in response.data
