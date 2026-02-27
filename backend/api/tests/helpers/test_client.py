"""
Custom test client with authentication helpers
"""
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken
from django.contrib.auth import get_user_model

User = get_user_model()


class AuthenticatedAPIClient(APIClient):
    """APIClient with authentication helpers"""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.raise_request_exception = True
    
    def authenticate_user(self, user):
        """Authenticate a user and set Authorization header"""
        refresh = RefreshToken.for_user(user)
        self.credentials(HTTP_AUTHORIZATION=f'Bearer {refresh.access_token}')
        return self
    
    def authenticate_admin(self, admin_user):
        """Authenticate an admin user"""
        return self.authenticate_user(admin_user)
    
    def logout(self):
        """Remove authentication"""
        self.credentials()
