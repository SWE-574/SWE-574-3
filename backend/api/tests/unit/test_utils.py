"""
Unit tests for utility functions
"""
import pytest
from decimal import Decimal
from django.db import transaction

from api.models import User, Service, Handshake, TransactionHistory
from api.utils import (
    can_user_post_offer, provision_timebank, complete_timebank_transfer,
    cancel_timebank_transfer, get_provider_and_receiver, create_notification,
    reserve_timebank_for_need_service, release_timebank_for_need_service,
    ensure_accepted_handshake_reservation,
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
        """Test user cannot post when debt exceeds 10 hours.

        -11.00 violates the DB check constraint (minimum -10.00), so we test
        the pure function logic with a lightweight mock instead of a DB row.
        """
        from types import SimpleNamespace
        user = SimpleNamespace(timebank_balance=Decimal('-11.00'))
        assert can_user_post_offer(user) is False
    
    def test_can_post_at_threshold(self):
        """Test user can post exactly at the -10-hour debt threshold"""
        user = UserFactory(timebank_balance=Decimal('-10.00'))
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

    def test_reserve_timebank_for_need_service(self):
        """Need creation reserves hours at service level before a handshake is accepted."""
        owner = UserFactory(timebank_balance=Decimal('3.00'))
        service = ServiceFactory(user=owner, type='Need', duration=Decimal('2.00'))

        reserve_timebank_for_need_service(service)

        owner.refresh_from_db()
        service.refresh_from_db()

        assert owner.timebank_balance == Decimal('1.00')
        assert service.reserved_timebank_hours == Decimal('2.00')
        assert TransactionHistory.objects.filter(
            user=owner,
            service=service,
            handshake=None,
            transaction_type='provision',
        ).exists()

    def test_reserve_timebank_for_need_service_respects_debt_limit(self):
        """Need creation can use available debt, but cannot exceed the -10h limit."""
        owner = UserFactory(timebank_balance=Decimal('-9.00'))
        service = ServiceFactory(user=owner, type='Need', duration=Decimal('2.00'))

        with pytest.raises(ValueError, match='maximum debt limit'):
            reserve_timebank_for_need_service(service)

        owner.refresh_from_db()
        service.refresh_from_db()
        assert owner.timebank_balance == Decimal('-9.00')
        assert service.reserved_timebank_hours == Decimal('0.00')
        assert not TransactionHistory.objects.filter(
            user=owner,
            service=service,
            transaction_type='provision',
        ).exists()

    def test_accepted_need_reuses_existing_service_reservation(self):
        """Accepting a Need with an upfront reservation does not debit twice."""
        owner = UserFactory(timebank_balance=Decimal('2.00'))
        helper = UserFactory(timebank_balance=Decimal('5.00'))
        service = ServiceFactory(
            user=owner,
            type='Need',
            duration=Decimal('1.00'),
            reserved_timebank_hours=Decimal('1.00'),
        )
        handshake = HandshakeFactory(
            service=service,
            requester=helper,
            status='pending',
            provisioned_hours=Decimal('1.00'),
        )

        ensure_accepted_handshake_reservation(handshake)

        owner.refresh_from_db()
        service.refresh_from_db()
        assert owner.timebank_balance == Decimal('2.00')
        assert service.reserved_timebank_hours == Decimal('1.00')
        assert TransactionHistory.objects.filter(
            user=owner,
            service=service,
            handshake=handshake,
            transaction_type='provision',
        ).count() == 0


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

    def test_group_one_time_offer_transfers_only_once_and_all_receivers_pay(self):
        provider = UserFactory(timebank_balance=Decimal('0.00'))
        receiver1 = UserFactory(timebank_balance=Decimal('5.00'))
        receiver2 = UserFactory(timebank_balance=Decimal('5.00'))
        service = ServiceFactory(
            user=provider,
            type='Offer',
            duration=Decimal('3.00'),
            schedule_type='One-Time',
            max_participants=2,
        )
        handshake1 = HandshakeFactory(service=service, requester=receiver1, status='accepted', provisioned_hours=Decimal('3.00'))
        handshake2 = HandshakeFactory(service=service, requester=receiver2, status='accepted', provisioned_hours=Decimal('3.00'))

        provision_timebank(handshake1)
        provision_timebank(handshake2)

        with transaction.atomic():
            complete_timebank_transfer(handshake1)

        provider.refresh_from_db()
        receiver1.refresh_from_db()
        receiver2.refresh_from_db()

        assert provider.timebank_balance == Decimal('0.00')
        assert receiver1.timebank_balance == Decimal('2.00')
        assert receiver2.timebank_balance == Decimal('2.00')

        with transaction.atomic():
            complete_timebank_transfer(handshake2)

        provider.refresh_from_db()
        receiver1.refresh_from_db()
        receiver2.refresh_from_db()

        assert provider.timebank_balance == Decimal('3.00')
        assert receiver1.timebank_balance == Decimal('2.00')
        assert receiver2.timebank_balance == Decimal('2.00')
        assert TransactionHistory.objects.filter(
            user=provider,
            transaction_type='transfer',
            handshake__service=service,
        ).count() == 1


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

    def test_release_timebank_for_need_service(self):
        """Removing a Need before acceptance returns its service-level reservation."""
        owner = UserFactory(timebank_balance=Decimal('1.00'))
        service = ServiceFactory(
            user=owner,
            type='Need',
            duration=Decimal('2.00'),
            reserved_timebank_hours=Decimal('2.00'),
        )

        release_timebank_for_need_service(service)

        owner.refresh_from_db()
        service.refresh_from_db()

        assert owner.timebank_balance == Decimal('3.00')
        assert service.reserved_timebank_hours == Decimal('0.00')
        assert TransactionHistory.objects.filter(
            user=owner,
            service=service,
            handshake=None,
            transaction_type='refund',
        ).exists()

    def test_cancel_timebank_transfer_keeps_need_service_reservation(self):
        """Cancelling an accepted Need agreement keeps the listing reservation."""
        owner = UserFactory(timebank_balance=Decimal('1.00'))
        helper = UserFactory(timebank_balance=Decimal('5.00'))
        service = ServiceFactory(
            user=owner,
            type='Need',
            duration=Decimal('2.00'),
            reserved_timebank_hours=Decimal('2.00'),
        )
        handshake = HandshakeFactory(
            service=service,
            requester=helper,
            status='accepted',
            provisioned_hours=Decimal('2.00'),
        )

        with transaction.atomic():
            cancel_timebank_transfer(handshake)

        owner.refresh_from_db()
        service.refresh_from_db()
        handshake.refresh_from_db()
        assert owner.timebank_balance == Decimal('1.00')
        assert service.reserved_timebank_hours == Decimal('2.00')
        assert handshake.status == 'cancelled'
        assert not TransactionHistory.objects.filter(
            user=owner,
            service=service,
            handshake=handshake,
            transaction_type='refund',
        ).exists()


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
