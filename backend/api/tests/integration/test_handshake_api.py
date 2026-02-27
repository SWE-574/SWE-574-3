"""
Integration tests for handshake API endpoints
"""
import pytest
from rest_framework import status
from decimal import Decimal
from datetime import timedelta
from django.utils import timezone

from api.tests.helpers.factories import (
    UserFactory, ServiceFactory, HandshakeFactory
)
from api.tests.helpers.test_client import AuthenticatedAPIClient
from api.models import Handshake


@pytest.mark.django_db
@pytest.mark.integration
class TestExpressInterestView:
    """Test ExpressInterestView (POST /api/services/{id}/interest/)"""
    
    def test_express_interest_success(self):
        """Test successfully expressing interest"""
        provider = UserFactory(timebank_balance=Decimal('5.00'))
        requester = UserFactory(timebank_balance=Decimal('3.00'))
        service = ServiceFactory(user=provider, type='Offer', duration=Decimal('2.00'))
        
        client = AuthenticatedAPIClient()
        client.authenticate_user(requester)
        
        response = client.post(f'/api/services/{service.id}/interest/')
        assert response.status_code == status.HTTP_201_CREATED
        assert Handshake.objects.filter(
            service=service,
            requester=requester,
            status='pending'
        ).exists()
    
    def test_express_interest_insufficient_balance(self):
        """Test expressing interest with insufficient balance"""
        provider = UserFactory()
        requester = UserFactory(timebank_balance=Decimal('0.50'))
        service = ServiceFactory(user=provider, type='Offer', duration=Decimal('2.00'))
        
        client = AuthenticatedAPIClient()
        client.authenticate_user(requester)
        
        response = client.post(f'/api/services/{service.id}/interest/')
        assert response.status_code == status.HTTP_400_BAD_REQUEST
    
    def test_express_interest_own_service(self):
        """Test cannot express interest in own service"""
        user = UserFactory()
        service = ServiceFactory(user=user)
        
        client = AuthenticatedAPIClient()
        client.authenticate_user(user)
        
        response = client.post(f'/api/services/{service.id}/interest/')
        assert response.status_code == status.HTTP_400_BAD_REQUEST
    
    def test_express_interest_max_participants(self):
        """Test cannot express interest when max participants reached"""
        provider = UserFactory()
        service = ServiceFactory(user=provider, max_participants=1)
        requester1 = UserFactory()
        requester2 = UserFactory()
        
        HandshakeFactory(service=service, requester=requester1, status='accepted')
        
        client = AuthenticatedAPIClient()
        client.authenticate_user(requester2)
        
        response = client.post(f'/api/services/{service.id}/interest/')
        assert response.status_code == status.HTTP_400_BAD_REQUEST


@pytest.mark.django_db
@pytest.mark.integration
class TestHandshakeViewSet:
    """Test HandshakeViewSet"""
    
    def test_list_handshakes(self):
        """Test listing handshakes"""
        user = UserFactory()
        service = ServiceFactory(user=user)
        HandshakeFactory.create_batch(3, service=service, requester=UserFactory())
        
        client = AuthenticatedAPIClient()
        client.authenticate_user(user)
        
        response = client.get('/api/handshakes/')
        assert response.status_code == status.HTTP_200_OK
        assert isinstance(response.data, list)
        assert len(response.data) == 3
    
    def test_initiate_handshake(self):
        """Test provider initiating handshake"""
        provider = UserFactory()
        requester = UserFactory()
        service = ServiceFactory(user=provider, type='Offer')
        handshake = HandshakeFactory(service=service, requester=requester, status='pending')
        
        client = AuthenticatedAPIClient()
        client.authenticate_user(provider)
        
        response = client.post(f'/api/handshakes/{handshake.id}/initiate/', {
            'exact_location': 'Test Location',
            'exact_duration': 2.0,
            'scheduled_time': '2025-12-20T10:00:00Z'
        })
        assert response.status_code == status.HTTP_200_OK
        
        handshake.refresh_from_db()
        assert handshake.provider_initiated is True
        assert handshake.exact_location == 'Test Location'
    
    def test_approve_handshake(self):
        """Test receiver approving handshake"""
        provider = UserFactory()
        requester = UserFactory(timebank_balance=Decimal('3.00'))
        service = ServiceFactory(user=provider, type='Offer', duration=Decimal('2.00'))
        handshake = HandshakeFactory(
            service=service,
            requester=requester,
            status='pending',
            provider_initiated=True,
            exact_location='Test Location',
            exact_duration=Decimal('2.00'),
            scheduled_time=timezone.now() + timedelta(days=1)
        )
        
        client = AuthenticatedAPIClient()
        client.authenticate_user(requester)
        
        response = client.post(f'/api/handshakes/{handshake.id}/approve/')
        assert response.status_code == status.HTTP_200_OK
        
        handshake.refresh_from_db()
        assert handshake.status == 'accepted'
        assert handshake.provisioned_hours > 0
        
        requester.refresh_from_db()
        assert requester.timebank_balance < Decimal('3.00')
    
    def test_confirm_completion(self):
        """Test confirming handshake completion"""
        provider = UserFactory(timebank_balance=Decimal('5.00'))
        requester = UserFactory(timebank_balance=Decimal('1.00'))
        service = ServiceFactory(user=provider, type='Offer', duration=Decimal('2.00'))
        handshake = HandshakeFactory(
            service=service,
            requester=requester,
            status='accepted',
            provisioned_hours=Decimal('2.00'),
            provider_initiated=True,
            requester_initiated=True
        )
        
        client = AuthenticatedAPIClient()
        client.authenticate_user(provider)
        
        response = client.post(f'/api/handshakes/{handshake.id}/confirm/')
        assert response.status_code == status.HTTP_200_OK
        
        handshake.refresh_from_db()
        assert handshake.provider_confirmed_complete is True
        
        client.authenticate_user(requester)
        response = client.post(f'/api/handshakes/{handshake.id}/confirm/')
        assert response.status_code == status.HTTP_200_OK
        
        handshake.refresh_from_db()
        assert handshake.status == 'completed'
        assert handshake.receiver_confirmed_complete is True
        
        provider.refresh_from_db()
        assert provider.timebank_balance > Decimal('5.00')
    
    def test_cancel_handshake(self):
        """Test canceling a handshake"""
        provider = UserFactory()
        requester = UserFactory(timebank_balance=Decimal('1.00'))
        service = ServiceFactory(user=provider, type='Offer', duration=Decimal('2.00'))
        handshake = HandshakeFactory(
            service=service,
            requester=requester,
            status='accepted',
            provisioned_hours=Decimal('2.00')
        )
        
        client = AuthenticatedAPIClient()
        client.authenticate_user(provider)
        
        response = client.post(f'/api/handshakes/{handshake.id}/cancel/')
        assert response.status_code == status.HTTP_200_OK
        
        handshake.refresh_from_db()
        assert handshake.status == 'cancelled'
        
        requester.refresh_from_db()
        assert requester.timebank_balance == Decimal('3.00')
