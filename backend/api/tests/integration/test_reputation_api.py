"""
Integration tests for reputation API endpoints
"""
import pytest
from rest_framework import status

from api.tests.helpers.factories import (
    UserFactory, ServiceFactory, HandshakeFactory
)
from api.tests.helpers.test_client import AuthenticatedAPIClient
from api.models import ReputationRep, NegativeRep, Badge, UserBadge


@pytest.mark.django_db
@pytest.mark.integration
class TestReputationViewSet:
    """Test ReputationViewSet (positive reputation)"""
    
    def test_create_reputation(self):
        """Test creating positive reputation"""
        provider = UserFactory()
        requester = UserFactory()
        service = ServiceFactory(user=provider, type='Offer')
        handshake = HandshakeFactory(
            service=service,
            requester=requester,
            status='completed'
        )
        
        client = AuthenticatedAPIClient()
        client.authenticate_user(requester)
        
        response = client.post('/api/reputation/', {
            'handshake_id': str(handshake.id),
            'punctual': True,
            'helpful': True,
            'kindness': True
        })
        assert response.status_code == status.HTTP_201_CREATED
        assert ReputationRep.objects.filter(
            handshake=handshake,
            giver=requester,
            receiver=provider
        ).exists()
        
        provider.refresh_from_db()
        assert provider.karma_score > 0

    def test_create_reputation_provider_can_review_receiver(self):
        """Either party can submit reputation for the other (provider -> receiver)"""
        provider = UserFactory()
        requester = UserFactory(karma_score=0)
        service = ServiceFactory(user=provider, type='Offer')
        handshake = HandshakeFactory(
            service=service,
            requester=requester,
            status='completed'
        )

        client = AuthenticatedAPIClient()
        client.authenticate_user(provider)

        response = client.post('/api/reputation/', {
            'handshake_id': str(handshake.id),
            'punctual': True,
            'helpful': False,
            'kindness': True,
            'comment': 'Great communication and punctual.'
        })

        assert response.status_code == status.HTTP_201_CREATED
        assert ReputationRep.objects.filter(
            handshake=handshake,
            giver=provider,
            receiver=requester
        ).exists()

        requester.refresh_from_db()
        assert requester.karma_score > 0
    
    def test_create_reputation_duplicate(self):
        """Test cannot create duplicate reputation"""
        provider = UserFactory()
        requester = UserFactory()
        service = ServiceFactory(user=provider)
        handshake = HandshakeFactory(
            service=service,
            requester=requester,
            status='completed'
        )
        
        ReputationRep.objects.create(
            handshake=handshake,
            giver=requester,
            receiver=provider,
            is_punctual=True,
            is_helpful=True,
            is_kind=True
        )
        
        client = AuthenticatedAPIClient()
        client.authenticate_user(requester)
        
        response = client.post('/api/reputation/', {
            'handshake_id': str(handshake.id),
            'punctual': True,
            'helpful': True,
            'kindness': True
        })
        assert response.status_code == status.HTTP_400_BAD_REQUEST
    
    def test_create_reputation_own_handshake(self):
        """Test can only create reputation for completed handshake"""
        provider = UserFactory()
        requester = UserFactory()
        service = ServiceFactory(user=provider)
        handshake = HandshakeFactory(
            service=service,
            requester=requester,
            status='accepted'  # Not completed
        )
        
        client = AuthenticatedAPIClient()
        client.authenticate_user(requester)
        
        response = client.post('/api/reputation/', {
            'handshake_id': str(handshake.id),
            'punctual': True,
            'helpful': True,
            'kindness': True
        })
        assert response.status_code == status.HTTP_404_NOT_FOUND
    
    def test_list_reputation(self):
        """Test listing reputation entries"""
        provider = UserFactory()
        requester = UserFactory()
        service = ServiceFactory(user=provider)
        handshake = HandshakeFactory(
            service=service,
            requester=requester,
            status='completed'
        )
        ReputationRep.objects.create(
            handshake=handshake,
            giver=requester,
            receiver=provider,
            is_punctual=True,
            is_helpful=True,
            is_kind=True
        )
        
        client = AuthenticatedAPIClient()
        client.authenticate_user(requester)
        
        response = client.get('/api/reputation/')
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data) > 0


@pytest.mark.django_db
@pytest.mark.integration
class TestNegativeRepViewSet:
    """Test NegativeRepViewSet"""
    
    def test_create_negative_reputation(self):
        """Test creating negative reputation"""
        provider = UserFactory()
        requester = UserFactory()
        service = ServiceFactory(user=provider, type='Offer')
        handshake = HandshakeFactory(
            service=service,
            requester=requester,
            status='completed'
        )
        
        client = AuthenticatedAPIClient()
        client.authenticate_user(requester)
        
        response = client.post('/api/reputation/negative/', {
            'handshake_id': str(handshake.id),
            'is_late': True,
            'comment': 'Arrived 30 minutes late'
        })
        assert response.status_code == status.HTTP_201_CREATED
        assert NegativeRep.objects.filter(
            handshake=handshake,
            giver=requester,
            receiver=provider
        ).exists()
    
    def test_negative_reputation_affects_karma(self):
        """Test negative reputation affects karma score"""
        provider = UserFactory(karma_score=10)
        requester = UserFactory()
        service = ServiceFactory(user=provider, type='Offer')
        handshake = HandshakeFactory(
            service=service,
            requester=requester,
            status='completed'
        )

        # Prevent badge assignment side-effects from offsetting the penalty.
        # The negative-rep flow calls check_and_assign_badges(), which can award
        # karma for the 'first-service' badge once the user has 1 completed handshake.
        badge, _ = Badge.objects.get_or_create(
            id='first-service',
            defaults={
                'name': 'First Service',
                'description': 'Completed your first service',
                'icon_url': None,
            }
        )
        UserBadge.objects.get_or_create(user=provider, badge=badge)
        
        client = AuthenticatedAPIClient()
        client.authenticate_user(requester)
        
        client.post('/api/reputation/negative/', {
            'handshake_id': str(handshake.id),
            'is_late': True
        })
        
        provider.refresh_from_db()
        assert provider.karma_score < 10
