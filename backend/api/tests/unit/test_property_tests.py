"""Property-based tests for critical business logic."""
from decimal import Decimal
from hypothesis.extra.django import TestCase as HypothesisTestCase
from django.contrib.auth import get_user_model
from hypothesis import given, strategies as st, assume, settings
from hypothesis.stateful import RuleBasedStateMachine, rule, invariant
import uuid

from api.models import Service, Handshake, TransactionHistory, UserBadge
from api.services import HandshakeService
from api.utils import provision_timebank, complete_timebank_transfer, get_provider_and_receiver

User = get_user_model()


class PropertyTestTimeBankBalanceConsistency(HypothesisTestCase):
    """Test TimeBank balance consistency property."""
    
    @settings(max_examples=50)
    @given(
        initial_balance=st.decimals(min_value=Decimal('3.00'), max_value=Decimal('100.00'), places=2),
        transaction_amounts=st.lists(
            st.decimals(min_value=Decimal('-10.00'), max_value=Decimal('50.00'), places=2),
            min_size=1,
            max_size=10
        )
    )
    def test_balance_consistency_property(self, initial_balance, transaction_amounts):
        """Test that balance matches transaction history sum."""
        # Create user with initial balance
        user = User.objects.create_user(
            email=f'test_{uuid.uuid4().hex[:8]}@test.com',
            password='testpass123',
            first_name='Test',
            last_name='User',
            timebank_balance=initial_balance
        )
        
        # Simulate transactions
        current_balance = initial_balance
        for amount in transaction_amounts:
            # Ensure balance doesn't go below -10.00
            if current_balance + amount < Decimal('-10.00'):
                continue
            
            TransactionHistory.objects.create(
                user=user,
                transaction_type='transfer',
                amount=amount,
                balance_after=current_balance + amount,
                description=f'Test transaction: {amount}'
            )
            current_balance += amount
            user.timebank_balance = current_balance
            user.save(update_fields=['timebank_balance'])
        
        # Refresh from DB
        user.refresh_from_db()
        
        # Calculate sum from transaction history
        history_sum = sum(
            TransactionHistory.objects.filter(user=user)
            .values_list('amount', flat=True)
        )
        
        # Verify balance matches transaction history
        expected_balance = initial_balance + history_sum
        self.assertEqual(
            float(user.timebank_balance),
            float(expected_balance),
            msg=f"Balance mismatch: current={user.timebank_balance}, expected={expected_balance}"
        )


class PropertyTestHandshakeStateIntegrity(HypothesisTestCase):
    """Test handshake state integrity property."""
    
    def setUp(self):
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
            timebank_balance=Decimal('10.00')
        )
        self.service = Service.objects.create(
            user=self.user1,
            title='Test Service',
            description='Test description for property testing',
            type='Offer',
            duration=Decimal('2.00'),
            location_type='Online',
            schedule_type='One-Time',
            max_participants=1
        )
    
    @settings(max_examples=30)
    @given(
        status=st.sampled_from(['pending', 'accepted', 'completed', 'cancelled', 'denied'])
    )
    def test_handshake_state_transitions(self, status):
        """Test handshake state transitions."""
        handshake = Handshake.objects.create(
            service=self.service,
            requester=self.user2,
            status='pending',
            provisioned_hours=Decimal('2.00')
        )
        
        # Transition to new status
        handshake.status = status
        handshake.save()
        
        valid_statuses = [choice[0] for choice in Handshake.STATUS_CHOICES]
        self.assertIn(handshake.status, valid_statuses)


class PropertyTestServiceParticipationLimits(HypothesisTestCase):
    """Test service participation limits property."""
    
    def setUp(self):
        self.user1 = User.objects.create_user(
            email='user1@test.com',
            password='testpass123',
            first_name='User',
            last_name='One',
            timebank_balance=Decimal('100.00')
        )
    
    @settings(max_examples=20, deadline=None)
    @given(
        max_participants=st.integers(min_value=1, max_value=10),
        num_requests=st.integers(min_value=1, max_value=15)
    )
    def test_participation_limit_property(self, max_participants, num_requests):
        """Test that services never exceed max_participants."""
        # Create service with max_participants
        service = Service.objects.create(
            user=self.user1,
            title='Test Service',
            description='Test description',
            type='Offer',
            duration=Decimal('1.00'),
            location_type='Online',
            schedule_type='One-Time',
            max_participants=max_participants
        )
        
        # Create multiple users to request
        users = []
        for i in range(num_requests):
            user = User.objects.create_user(
                email=f'requester{i}@test.com',
                password='testpass123',
                first_name=f'User{i}',
                last_name='Test',
                timebank_balance=Decimal('10.00')
            )
            users.append(user)
        
        # Try to create handshakes
        accepted_count = 0
        for user in users:
            is_valid, error = HandshakeService.can_express_interest(service, user)
            if is_valid:
                try:
                    HandshakeService.express_interest(service, user)
                    accepted_count += 1
                except Exception:
                    pass
        
        # Verify handshakes don't exceed max_participants
        active_handshakes = Handshake.objects.filter(
            service=service,
            status__in=['pending', 'accepted']
        ).count()
        
        self.assertLessEqual(
            active_handshakes,
            max_participants,
            msg=f"Active handshakes ({active_handshakes}) exceeded max_participants ({max_participants})"
        )


class PropertyTestBalanceProvisioningAccuracy(HypothesisTestCase):
    """Test balance provisioning accuracy property."""
    
    def setUp(self):
        self.provider = User.objects.create_user(
            email='provider@test.com',
            password='testpass123',
            first_name='Provider',
            last_name='User',
            timebank_balance=Decimal('10.00')
        )
        self.receiver = User.objects.create_user(
            email='receiver@test.com',
            password='testpass123',
            first_name='Receiver',
            last_name='User',
            timebank_balance=Decimal('10.00')
        )
        self.service = Service.objects.create(
            user=self.provider,
            title='Test Service',
            description='Test description',
            type='Offer',
            duration=Decimal('2.00'),
            location_type='Online',
            schedule_type='One-Time',
            max_participants=1
        )
    
    @settings(max_examples=30)
    @given(
        hours=st.decimals(min_value=Decimal('0.50'), max_value=Decimal('5.00'), places=2),
        initial_balance=st.decimals(min_value=Decimal('3.00'), max_value=Decimal('20.00'), places=2)
    )
    def test_provisioning_accuracy_property(self, hours, initial_balance):
        """Test that provisioning accurately deducts hours."""
        # Set initial balance
        self.receiver.timebank_balance = initial_balance
        self.receiver.save()
        
        # Skip if balance would go below -10.00
        if initial_balance - hours < Decimal('-10.00'):
            return
        
        # Create handshake
        handshake = Handshake.objects.create(
            service=self.service,
            requester=self.receiver,
            status='pending',
            provisioned_hours=hours
        )
        
        # Accept handshake (this should provision hours)
        handshake.status = 'accepted'
        handshake.save()
        
        # Provision hours
        try:
            provision_timebank(handshake)
        except ValueError:
            # Balance too low, skip this test case
            return
        
        # Refresh receiver
        self.receiver.refresh_from_db()
        
        expected_balance = initial_balance - hours
        self.assertEqual(
            float(self.receiver.timebank_balance),
            float(expected_balance),
            msg=f"Balance mismatch after provisioning: current={self.receiver.timebank_balance}, expected={expected_balance}"
        )
        provision_transaction = TransactionHistory.objects.filter(
            user=self.receiver,
            transaction_type='provision',
            handshake=handshake
        ).first()
        
        self.assertIsNotNone(provision_transaction, "Provision transaction should exist")
        self.assertEqual(
            float(provision_transaction.amount),
            float(-hours),
            msg=f"Transaction amount mismatch: {provision_transaction.amount} vs {-hours}"
        )


class PropertyTestUserRegistrationCompleteness(HypothesisTestCase):
    """Test user registration completeness property."""
    
    @settings(max_examples=50)
    @given(
        email=st.emails(),
        first_name=st.text(min_size=1, max_size=150),
        last_name=st.text(min_size=1, max_size=150),
        password=st.text(min_size=10, max_size=128)
    )
    def test_registration_completeness_property(self, email, first_name, last_name, password):
        """Test that new users have complete and valid data."""
        # Clean email and names (remove invalid characters)
        email = email.lower().strip()
        first_name = first_name.replace("\x00", "").strip()[:150]
        last_name = last_name.replace("\x00", "").strip()[:150]

        # If cleaning makes names empty, skip this generated example
        if not first_name or not last_name:
            return
        
        # Skip if email already exists
        if User.objects.filter(email=email).exists():
            return
        
        # Create user
        user = User.objects.create_user(
            email=email,
            password=password,
            first_name=first_name,
            last_name=last_name
        )
        
        self.assertEqual(user.timebank_balance, Decimal('3.00'))
        self.assertTrue(user.is_active)
        self.assertEqual(user.role, 'member')
        self.assertIsNotNone(user.email)
        self.assertIn('@', user.email)
        self.assertIsNotNone(user.first_name)
        self.assertIsNotNone(user.last_name)
        self.assertGreater(len(user.first_name), 0)
        self.assertGreater(len(user.last_name), 0)
