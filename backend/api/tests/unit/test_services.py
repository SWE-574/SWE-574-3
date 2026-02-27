"""
Unit tests for HandshakeService.

Tests business logic for expressing interest in services, including
validation for max_participants, balance checks, and duplicate interest prevention.
"""
from decimal import Decimal
from django.test import TestCase
from django.contrib.auth import get_user_model

from api.models import Service, Handshake
from api.services import HandshakeService

User = get_user_model()


class HandshakeServiceTestCase(TestCase):
    """Test cases for HandshakeService."""
    
    def setUp(self):
        """Set up test data."""
        self.user1 = User.objects.create_user(
            email='user1@test.com',
            password='testpass123',
            first_name='User',
            last_name='One',
            timebank_balance=Decimal('10.00')
        )
        self.user2 = User.objects.create_user(
            email='user2@test.com',
            password='testpass123',
            first_name='User',
            last_name='Two',
            timebank_balance=Decimal('5.00')
        )
        self.user3 = User.objects.create_user(
            email='user3@test.com',
            password='testpass123',
            first_name='User',
            last_name='Three',
            timebank_balance=Decimal('3.00')
        )
        self.user4 = User.objects.create_user(
            email='user4@test.com',
            password='testpass123',
            first_name='User',
            last_name='Four',
            timebank_balance=Decimal('5.00')
        )
        
        self.service_offer = Service.objects.create(
            user=self.user1,
            title='Test Offer Service',
            description='A test service',
            type='Offer',
            duration=Decimal('2.00'),
            location_type='Online',
            max_participants=2,
            schedule_type='One-Time'
        )
        
        self.service_need = Service.objects.create(
            user=self.user1,
            title='Test Need Service',
            description='A test need service',
            type='Need',
            duration=Decimal('1.50'),
            location_type='Online',
            max_participants=1,
            schedule_type='One-Time'
        )
    
    def test_can_express_interest_valid(self):
        """Test can_express_interest returns True for valid case."""
        is_valid, error = HandshakeService.can_express_interest(self.service_offer, self.user2)
        self.assertTrue(is_valid)
        self.assertIsNone(error)
    
    def test_can_express_interest_own_service(self):
        """Test cannot express interest in own service."""
        is_valid, error = HandshakeService.can_express_interest(self.service_offer, self.user1)
        self.assertFalse(is_valid)
        self.assertIn('own service', error)
    
    def test_can_express_interest_insufficient_balance_offer(self):
        """Test cannot express interest with insufficient balance for Offer service."""
        self.user2.timebank_balance = Decimal('1.00')
        self.user2.save()
        
        is_valid, error = HandshakeService.can_express_interest(self.service_offer, self.user2)
        self.assertFalse(is_valid)
        self.assertIn('Insufficient TimeBank balance', error)
    
    def test_can_express_interest_insufficient_balance_need(self):
        """Test cannot express interest with insufficient balance for Need service."""
        self.user1.timebank_balance = Decimal('1.00')
        self.user1.save()
        
        is_valid, error = HandshakeService.can_express_interest(self.service_need, self.user2)
        self.assertFalse(is_valid)
        self.assertIn('Insufficient TimeBank balance', error)
    
    def test_can_express_interest_valid_need(self):
        """Test can_express_interest returns True for valid Need service case."""
        self.user1.timebank_balance = Decimal('10.00')
        self.user1.save()
        
        is_valid, error = HandshakeService.can_express_interest(self.service_need, self.user2)
        self.assertTrue(is_valid)
        self.assertIsNone(error)
    
    def test_can_express_interest_max_participants(self):
        """Test cannot express interest when service is at max capacity."""
        Handshake.objects.create(
            service=self.service_offer,
            requester=self.user2,
            provisioned_hours=Decimal('2.00'),
            status='pending'
        )
        Handshake.objects.create(
            service=self.service_offer,
            requester=self.user3,
            provisioned_hours=Decimal('2.00'),
            status='accepted'
        )
        
        is_valid, error = HandshakeService.can_express_interest(self.service_offer, self.user4)
        self.assertFalse(is_valid)
        self.assertIn('maximum capacity', error)

    def test_one_time_capacity_counts_completed(self):
        """One-Time services should count completed handshakes toward capacity."""
        one_time_service = Service.objects.create(
            user=self.user1,
            title='One-time capacity test',
            description='Test',
            type='Offer',
            duration=Decimal('1.00'),
            location_type='Online',
            max_participants=1,
            schedule_type='One-Time',
        )
        Handshake.objects.create(
            service=one_time_service,
            requester=self.user2,
            provisioned_hours=Decimal('1.00'),
            status='completed',
        )

        is_valid, error = HandshakeService.can_express_interest(one_time_service, self.user3)
        self.assertFalse(is_valid)
        self.assertIn('maximum capacity', error)

    def test_recurrent_capacity_does_not_count_completed(self):
        """Recurrent services should not count completed handshakes toward capacity."""
        recurrent_service = Service.objects.create(
            user=self.user1,
            title='Recurrent capacity test',
            description='Test',
            type='Offer',
            duration=Decimal('1.00'),
            location_type='Online',
            max_participants=1,
            schedule_type='Recurrent',
        )
        Handshake.objects.create(
            service=recurrent_service,
            requester=self.user2,
            provisioned_hours=Decimal('1.00'),
            status='completed',
        )

        is_valid, error = HandshakeService.can_express_interest(recurrent_service, self.user3)
        self.assertTrue(is_valid)
        self.assertIsNone(error)
    
    def test_express_interest_success_offer(self):
        """Test successful express_interest for Offer service."""
        handshake = HandshakeService.express_interest(self.service_offer, self.user2)
        
        self.assertIsNotNone(handshake)
        self.assertEqual(handshake.service, self.service_offer)
        self.assertEqual(handshake.requester, self.user2)
        self.assertEqual(handshake.status, 'pending')
        self.assertEqual(handshake.provisioned_hours, Decimal('2.00'))
    
    def test_express_interest_success_need(self):
        """Test successful express_interest for Need service."""
        handshake = HandshakeService.express_interest(self.service_need, self.user2)
        
        self.assertIsNotNone(handshake)
        self.assertEqual(handshake.service, self.service_need)
        self.assertEqual(handshake.requester, self.user2)
        self.assertEqual(handshake.status, 'pending')
        self.assertEqual(handshake.provisioned_hours, Decimal('1.50'))
    
    def test_express_interest_duplicate(self):
        """Test cannot express interest twice."""
        HandshakeService.express_interest(self.service_offer, self.user2)
        
        with self.assertRaises(ValueError) as context:
            HandshakeService.express_interest(self.service_offer, self.user2)
        
        self.assertIn('already expressed interest', str(context.exception))
    
    def test_express_interest_max_participants_raises_error(self):
        """Test express_interest raises ValueError when at max capacity."""
        Handshake.objects.create(
            service=self.service_need,
            requester=self.user2,
            provisioned_hours=Decimal('1.50'),
            status='pending'
        )
        
        with self.assertRaises(ValueError) as context:
            HandshakeService.express_interest(self.service_need, self.user3)
        
        self.assertIn('maximum capacity', str(context.exception))
    
    def test_express_interest_creates_chat_message(self):
        """Test that express_interest creates initial chat message."""
        from api.models import ChatMessage
        
        handshake = HandshakeService.express_interest(self.service_offer, self.user2)
        
        messages = ChatMessage.objects.filter(handshake=handshake)
        self.assertEqual(messages.count(), 1)
        message = messages.first()
        self.assertIn('interested in your service', message.body)
        self.assertEqual(message.sender, self.user2)
        self.assertEqual(message.handshake, handshake)
    
    def test_express_interest_creates_notification(self):
        """Test that express_interest creates notification."""
        from api.models import Notification
        
        handshake = HandshakeService.express_interest(self.service_offer, self.user2)
        
        notifications = Notification.objects.filter(
            user=self.user1,
            related_handshake=handshake
        )
        self.assertEqual(notifications.count(), 1)
        notification = notifications.first()
        self.assertEqual(notification.type, 'handshake_request')
        self.assertEqual(notification.user, self.user1)
        self.assertEqual(notification.related_handshake, handshake)
        self.assertEqual(notification.related_service, self.service_offer)
    
    def test_can_express_interest_inactive_service(self):
        """Test cannot express interest in inactive service."""
        self.service_offer.status = 'Completed'
        self.service_offer.save()
        
        is_valid, error = HandshakeService.can_express_interest(self.service_offer, self.user2)
        self.assertFalse(is_valid)
        self.assertIn('not active', error)
    
    def test_express_interest_inactive_service_raises_error(self):
        """Test express_interest raises ValueError for inactive service."""
        self.service_offer.status = 'Cancelled'
        self.service_offer.save()
        
        with self.assertRaises(ValueError) as context:
            HandshakeService.express_interest(self.service_offer, self.user2)
        
        self.assertIn('not active', str(context.exception))
    
    def test_payer_determination_offer(self):
        """Test payer determination for Offer service - requester pays."""
        self.user2.timebank_balance = Decimal('1.00')
        self.user2.save()
        self.user1.timebank_balance = Decimal('10.00')
        self.user1.save()
        
        is_valid, error = HandshakeService.can_express_interest(self.service_offer, self.user2)
        self.assertFalse(is_valid)
        self.assertIn('You', error)
        self.assertIn('Insufficient TimeBank balance', error)
    
    def test_payer_determination_need(self):
        """Test payer determination for Need service - service owner pays."""
        self.user1.timebank_balance = Decimal('1.00')
        self.user1.save()
        self.user2.timebank_balance = Decimal('10.00')
        self.user2.save()
        
        is_valid, error = HandshakeService.can_express_interest(self.service_need, self.user2)
        self.assertFalse(is_valid)
        self.assertIn('User One', error)
        self.assertIn('Insufficient TimeBank balance', error)
    
    def test_lock_ordering_prevents_deadlock(self):
        """Test that locks are acquired in consistent order to prevent deadlocks."""
        service_user2 = Service.objects.create(
            user=self.user2,
            title='User2 Service',
            description='A service by user2',
            type='Offer',
            duration=Decimal('1.00'),
            location_type='Online',
            max_participants=1,
            schedule_type='One-Time'
        )
        
        self.user1.timebank_balance = Decimal('10.00')
        self.user1.save()
        self.user2.timebank_balance = Decimal('10.00')
        self.user2.save()
        
        handshake1 = HandshakeService.express_interest(service_user2, self.user1)
        self.assertIsNotNone(handshake1)
        self.assertEqual(handshake1.requester, self.user1)
        self.assertEqual(handshake1.service, service_user2)
        
        handshake2 = HandshakeService.express_interest(self.service_offer, self.user2)
        self.assertIsNotNone(handshake2)
        self.assertEqual(handshake2.requester, self.user2)
        self.assertEqual(handshake2.service, self.service_offer)

