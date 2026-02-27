"""
Unit tests for utility functions
"""
import pytest
from decimal import Decimal
from django.db import transaction

from api.models import User, Service, Handshake, TransactionHistory
from api.utils import (
    can_user_post_offer, provision_timebank, complete_timebank_transfer,
    cancel_timebank_transfer, get_provider_and_receiver, create_notification
)
from api.tests.helpers.factories import (
    UserFactory, ServiceFactory, HandshakeFactory
)


@pytest.mark.django_db
@pytest.mark.unit
class TestCanUserPostOffer:
    """Test can_user_post_offer function"""
    
    def test_can_post_when_balance_low(self):
        """Test user can post when balance is low"""
        user = UserFactory(timebank_balance=Decimal('5.00'))
        assert can_user_post_offer(user) is True
    
    def test_cannot_post_when_balance_high(self):
        """Test user cannot post when balance exceeds threshold"""
        user = UserFactory(timebank_balance=Decimal('11.00'))
        assert can_user_post_offer(user) is False
    
    def test_can_post_at_threshold(self):
        """Test user can post at threshold"""
        user = UserFactory(timebank_balance=Decimal('10.00'))
        assert can_user_post_offer(user) is True


@pytest.mark.django_db
@pytest.mark.unit
class TestGetProviderAndReceiver:
    """Test get_provider_and_receiver function"""
    
    def test_offer_service_provider(self):
        """Test provider/receiver for Offer service"""
        provider = UserFactory()
        requester = UserFactory()
        service = ServiceFactory(user=provider, type='Offer')
        handshake = HandshakeFactory(service=service, requester=requester)
        
        p, r = get_provider_and_receiver(handshake)
        assert p == provider
        assert r == requester
    
    def test_need_service_provider(self):
        """Test provider/receiver for Need service"""
        receiver = UserFactory()
        requester = UserFactory()
        service = ServiceFactory(user=receiver, type='Need')
        handshake = HandshakeFactory(service=service, requester=requester)
        
        p, r = get_provider_and_receiver(handshake)
        assert p == requester
        assert r == receiver


@pytest.mark.django_db
@pytest.mark.unit
class TestProvisionTimebank:
    """Test provision_timebank function"""
    
    def test_provision_timebank(self):
        """Test timebank provisioning"""
        provider = UserFactory(timebank_balance=Decimal('5.00'))
        receiver = UserFactory(timebank_balance=Decimal('3.00'))
        service = ServiceFactory(user=provider, type='Offer', duration=Decimal('2.00'))
        handshake = HandshakeFactory(
            service=service,
            requester=receiver,
            status='pending',
            provisioned_hours=Decimal('2.00')
        )
        
        provision_timebank(handshake)
        handshake.refresh_from_db()
        receiver.refresh_from_db()
        
        assert handshake.provisioned_hours == Decimal('2.00')
        assert receiver.timebank_balance == Decimal('1.00')  # 3.00 - 2.00


@pytest.mark.django_db
@pytest.mark.unit
class TestCompleteTimebankTransfer:
    """Test complete_timebank_transfer function"""
    
    def test_complete_timebank_transfer(self):
        """Test timebank transfer on completion"""
        provider = UserFactory(timebank_balance=Decimal('5.00'))
        receiver = UserFactory(timebank_balance=Decimal('1.00'))
        service = ServiceFactory(user=provider, type='Offer', duration=Decimal('2.00'))
        handshake = HandshakeFactory(
            service=service,
            requester=receiver,
            status='accepted',
            provisioned_hours=Decimal('2.00')
        )
        
        with transaction.atomic():
            complete_timebank_transfer(handshake)
        
        provider.refresh_from_db()
        receiver.refresh_from_db()
        
        assert provider.timebank_balance == Decimal('7.00')  # 5.00 + 2.00
        assert TransactionHistory.objects.filter(
            user=provider,
            transaction_type='transfer',
            amount=Decimal('2.00')
        ).exists()


@pytest.mark.django_db
@pytest.mark.unit
class TestCancelTimebankTransfer:
    """Test cancel_timebank_transfer function"""
    
    def test_cancel_timebank_transfer(self):
        """Test timebank refund on cancellation"""
        provider = UserFactory(timebank_balance=Decimal('5.00'))
        receiver = UserFactory(timebank_balance=Decimal('1.00'))
        service = ServiceFactory(user=provider, type='Offer', duration=Decimal('2.00'))
        handshake = HandshakeFactory(
            service=service,
            requester=receiver,
            status='accepted',
            provisioned_hours=Decimal('2.00')
        )
        
        with transaction.atomic():
            cancel_timebank_transfer(handshake)
        
        receiver.refresh_from_db()
        assert receiver.timebank_balance == Decimal('3.00')  # 1.00 + 2.00 (refunded)


@pytest.mark.django_db
@pytest.mark.unit
class TestCreateNotification:
    """Test create_notification function"""
    
    def test_create_notification(self):
        """Test notification creation"""
        user = UserFactory()
        service = ServiceFactory()
        handshake = HandshakeFactory(service=service)
        
        notification = create_notification(
            user=user,
            notification_type='handshake_request',
            title='New Handshake Request',
            message='Someone expressed interest in your service',
            handshake=handshake,
            service=service
        )
        
        assert notification.user == user
        assert notification.type == 'handshake_request'
        assert notification.related_handshake == handshake
        assert notification.related_service == service
