"""
Integration tests for user API endpoints
"""
import pytest
from rest_framework import status
from decimal import Decimal

from api.tests.helpers.factories import UserFactory, ServiceFactory, HandshakeFactory
from api.tests.helpers.test_client import AuthenticatedAPIClient
from api.models import Handshake, TransactionHistory, Badge, UserBadge


@pytest.mark.django_db
@pytest.mark.integration
class TestUserProfileView:
    """Test UserProfileView (GET /api/users/me/, PATCH /api/users/me/)"""
    
    def test_get_current_user_profile(self):
        """Test retrieving current user profile"""
        user = UserFactory()
        client = AuthenticatedAPIClient()
        client.authenticate_user(user)
        
        response = client.get('/api/users/me/')
        assert response.status_code == status.HTTP_200_OK
        assert response.data['email'] == user.email
        assert response.data['first_name'] == user.first_name
        assert 'achievements' in response.data
    
    def test_update_user_profile(self):
        """Test updating user profile"""
        user = UserFactory()
        client = AuthenticatedAPIClient()
        client.authenticate_user(user)
        
        response = client.patch('/api/users/me/', {
            'bio': 'Updated bio',
            'first_name': 'Updated'
        })
        assert response.status_code == status.HTTP_200_OK
        assert response.data['bio'] == 'Updated bio'
        assert response.data['first_name'] == 'Updated'
        
        user.refresh_from_db()
        assert user.bio == 'Updated bio'
    
    def test_update_user_profile_validation(self):
        """Test profile update validation"""
        user = UserFactory()
        client = AuthenticatedAPIClient()
        client.authenticate_user(user)
        
        response = client.patch('/api/users/me/', {
            'bio': 'x' * 1001  # Exceeds limit
        })
        assert response.status_code == status.HTTP_400_BAD_REQUEST


@pytest.mark.django_db
@pytest.mark.integration
class TestUserHistoryView:
    """Test UserHistoryView (GET /api/users/{id}/history/)"""
    
    def test_get_user_history(self):
        """Test retrieving user transaction history"""
        user = UserFactory()
        service = ServiceFactory(user=user, type='Offer')
        requester = UserFactory()
        handshake = HandshakeFactory(
            service=service,
            requester=requester,
            status='completed'
        )
        
        client = AuthenticatedAPIClient()
        client.authenticate_user(user)
        
        response = client.get(f'/api/users/{user.id}/history/')
        assert response.status_code == status.HTTP_200_OK
        assert isinstance(response.data, list)
    
    def test_user_history_empty(self):
        """Test user history for user with no transactions"""
        user = UserFactory()
        client = AuthenticatedAPIClient()
        client.authenticate_user(user)
        
        response = client.get(f'/api/users/{user.id}/history/')
        assert response.status_code == status.HTTP_200_OK
        assert response.data == []


@pytest.mark.django_db
@pytest.mark.integration
class TestUserBadgeProgressView:
    """Test UserBadgeProgressView (GET /api/users/{id}/badge-progress/)"""
    
    def test_get_achievement_progress(self):
        """Test retrieving achievement progress"""
        user = UserFactory()
        service = ServiceFactory(user=user, type='Offer')
        requester = UserFactory()
        HandshakeFactory(service=service, requester=requester, status='completed')
        
        client = AuthenticatedAPIClient()
        client.authenticate_user(user)
        
        response = client.get(f'/api/users/{user.id}/badge-progress/')
        assert response.status_code == status.HTTP_200_OK
        assert 'first-service' in response.data
        assert 'achievement' in response.data['first-service']
    
    def test_get_achievement_progress_other_user(self):
        """Test cannot view other user's achievement progress"""
        user1 = UserFactory()
        user2 = UserFactory()
        
        client = AuthenticatedAPIClient()
        client.authenticate_user(user1)
        
        response = client.get(f'/api/users/{user2.id}/badge-progress/')
        assert response.status_code == status.HTTP_403_FORBIDDEN


@pytest.mark.django_db
@pytest.mark.integration
class TestUserVerifiedReviewsView:
    """Test UserVerifiedReviewsView (GET /api/users/{id}/verified-reviews/)"""
    
    def test_get_verified_reviews(self):
        """Test retrieving verified reviews for a user"""
        user = UserFactory()
        service = ServiceFactory(user=user, type='Offer')
        requester = UserFactory()
        handshake = HandshakeFactory(
            service=service,
            requester=requester,
            status='completed'
        )
        
        from api.models import Comment
        Comment.objects.create(
            service=service,
            user=requester,
            body='Great service!',
            is_verified_review=True,
            related_handshake=handshake
        )
        
        client = AuthenticatedAPIClient()
        client.authenticate_user(user)
        
        response = client.get(f'/api/users/{user.id}/verified-reviews/')
        assert response.status_code == status.HTTP_200_OK
        assert isinstance(response.data, dict)
        assert 'results' in response.data
        if len(response.data['results']) > 0:
            assert response.data['results'][0]['is_verified_review'] is True


@pytest.mark.django_db
@pytest.mark.integration
class TestPublicUserProfile:
    """Test public user profile endpoint (GET /api/users/{id}/)"""
    
    def test_get_public_profile(self):
        """Test retrieving public user profile"""
        user = UserFactory()
        client = AuthenticatedAPIClient()
        client.authenticate_user(user)
        
        response = client.get(f'/api/users/{user.id}/')
        assert response.status_code == status.HTTP_200_OK
        assert response.data['id'] == str(user.id)
        assert 'achievements' in response.data
        assert 'services' in response.data
    
    def test_public_profile_excludes_sensitive_data(self):
        """Test public profile excludes sensitive information"""
        user = UserFactory()
        other_user = UserFactory()
        
        client = AuthenticatedAPIClient()
        client.authenticate_user(user)
        
        response = client.get(f'/api/users/{other_user.id}/')
        assert response.status_code == status.HTTP_200_OK
        assert 'email' not in response.data
        assert 'timebank_balance' not in response.data
