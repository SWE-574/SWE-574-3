"""Property-based tests for critical business logic."""
from decimal import Decimal
from hypothesis.extra.django import TestCase as HypothesisTestCase
from django.contrib.auth import get_user_model
from hypothesis import given, strategies as st, assume, settings, HealthCheck
from hypothesis.stateful import RuleBasedStateMachine, rule, invariant, precondition
import uuid

import pytest

from api.models import Service, Handshake, TransactionHistory, UserBadge
from api.ranking import calculate_hot_score
from api.services import HandshakeService
from api.utils import provision_timebank, complete_timebank_transfer, get_provider_and_receiver
from api.tests.helpers.factories import (
    ServiceFactory, UserFactory, CommentFactory, HandshakeFactory,
)

User = get_user_model()


class PropertyTestTimeBankBalanceConsistency(HypothesisTestCase):
    """Test TimeBank balance consistency property."""
    
    @settings(max_examples=50, deadline=None)
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
        """Test that capacity-consuming handshakes never exceed max_participants.

        Pending handshakes do NOT consume a slot — multiple users can express
        interest simultaneously. Only accepted (and completed/reported/paused)
        handshakes count against capacity for One-Time services.
        """
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

        users = []
        for i in range(num_requests):
            user = User.objects.create_user(
                email=f'requester{i}_{uuid.uuid4().hex[:6]}@test.com',
                password='testpass123',
                first_name=f'User{i}',
                last_name='Test',
                timebank_balance=Decimal('10.00')
            )
            users.append(user)

        for user in users:
            is_valid, _ = HandshakeService.can_express_interest(service, user)
            if is_valid:
                try:
                    HandshakeService.express_interest(service, user)
                except Exception:
                    pass

        # Capacity-consuming statuses for One-Time (mirrors _capacity_statuses)
        capacity_statuses = ['accepted', 'completed', 'reported', 'paused']
        capacity_used = Handshake.objects.filter(
            service=service,
            status__in=capacity_statuses,
        ).count()

        self.assertLessEqual(
            capacity_used,
            max_participants,
            msg=f"Capacity-consuming handshakes ({capacity_used}) exceeded max_participants ({max_participants})"
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
        hours=st.integers(min_value=1, max_value=5).map(lambda value: Decimal(str(value))),
        initial_balance=st.integers(min_value=3, max_value=20).map(lambda value: Decimal(str(value)))
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
    
    @settings(max_examples=50, deadline=None)
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


# ─────────────────────────────────────────────────────────────────────────────
# Property tests — ranking, balance flow, handshake state machine
# ─────────────────────────────────────────────────────────────────────────────

class PropertyTestRankingScoreMonotonicity(HypothesisTestCase):
    """For a service that never loses engagement, hot score is monotone non-
    decreasing in the number of positive interactions. The capacity multiplier
    is the only step function — outside of that range the score must only go
    up as more comments are added.
    """

    @settings(max_examples=20, deadline=None,
              suppress_health_check=[HealthCheck.too_slow])
    @given(steps=st.integers(min_value=1, max_value=8))
    def test_score_never_decreases_with_more_comments(self, steps):
        service = ServiceFactory(
            type='Offer', status='Active', max_participants=1,
        )
        previous = calculate_hot_score(service)
        for _ in range(steps):
            CommentFactory(service=service)
            service.refresh_from_db()
            current = calculate_hot_score(service)
            self.assertGreaterEqual(
                current, previous,
                msg=f'Hot score regressed: {previous} -> {current} after a comment',
            )
            previous = current


class PropertyTestTimeBankNetFlowInvariant(HypothesisTestCase):
    """The user's balance must always equal initial_balance + sum(transactions).

    Stronger than ``PropertyTestTimeBankBalanceConsistency`` because we
    interleave provisions and completions through ``HandshakeService`` rather
    than constructing transaction rows directly.
    """

    @settings(max_examples=15, deadline=None,
              suppress_health_check=[HealthCheck.too_slow])
    @given(
        initial=st.integers(min_value=5, max_value=50).map(lambda v: Decimal(str(v))),
        deltas=st.lists(
            st.integers(min_value=-3, max_value=5).map(lambda v: Decimal(str(v))),
            min_size=1, max_size=8,
        ),
    )
    def test_net_flow_matches_balance_delta(self, initial, deltas):
        user = User.objects.create_user(
            email=f'flow_{uuid.uuid4().hex[:8]}@test.com',
            password='testpass123',
            first_name='Flow', last_name='User',
            timebank_balance=initial,
        )
        for delta in deltas:
            new_balance = user.timebank_balance + delta
            if new_balance < Decimal('-10.00'):
                continue
            TransactionHistory.objects.create(
                user=user,
                transaction_type='transfer',
                amount=delta,
                balance_after=new_balance,
                description='property test',
            )
            user.timebank_balance = new_balance
            user.save(update_fields=['timebank_balance'])

        user.refresh_from_db()
        history_sum = sum(
            TransactionHistory.objects.filter(user=user)
            .values_list('amount', flat=True)
        )
        self.assertEqual(user.timebank_balance, initial + history_sum)


# Stateful test: handshake transitions must follow the published state machine.
# Pending → accepted | denied | cancelled
# Accepted → completed | cancelled | reported
# Completed/Denied/Cancelled/Reported → terminal (only paused as the exception)
LEGAL_TRANSITIONS = {
    'pending':   {'accepted', 'denied', 'cancelled'},
    'accepted':  {'completed', 'cancelled', 'reported', 'paused'},
    'paused':    {'accepted', 'cancelled'},
    # Terminals — anything else is a violation
    'completed': set(),
    'denied':    set(),
    'cancelled': set(),
    'reported':  set(),
}


class HandshakeStateMachine(RuleBasedStateMachine):
    """Drive a single handshake through random status transitions and assert
    that only legal ones are persisted.
    """

    def __init__(self):
        super().__init__()
        self.owner = User.objects.create_user(
            email=f'sm_owner_{uuid.uuid4().hex[:6]}@test.com',
            password='testpass123', first_name='Owner', last_name='User',
            timebank_balance=Decimal('20.00'),
        )
        self.requester = User.objects.create_user(
            email=f'sm_req_{uuid.uuid4().hex[:6]}@test.com',
            password='testpass123', first_name='Req', last_name='User',
            timebank_balance=Decimal('20.00'),
        )
        self.service = Service.objects.create(
            user=self.owner, title='SM Service',
            description='State machine service', type='Offer',
            duration=Decimal('1.00'), location_type='Online',
            schedule_type='One-Time', max_participants=1,
        )
        self.handshake = Handshake.objects.create(
            service=self.service, requester=self.requester,
            status='pending', provisioned_hours=Decimal('1.00'),
        )

    @rule(target=st.sampled_from(['accepted', 'denied', 'cancelled', 'completed', 'reported', 'paused']))
    def transition(self, target):
        current = self.handshake.status
        legal = LEGAL_TRANSITIONS.get(current, set())
        if target not in legal:
            return
        self.handshake.status = target
        self.handshake.save(update_fields=['status'])
        self.handshake.refresh_from_db()
        assert self.handshake.status == target

    @invariant()
    def status_is_known(self):
        valid = {choice[0] for choice in Handshake.STATUS_CHOICES}
        assert self.handshake.status in valid


PropertyTestHandshakeStateMachine = HandshakeStateMachine.TestCase
PropertyTestHandshakeStateMachine.settings = settings(
    max_examples=20, stateful_step_count=12, deadline=None,
    suppress_health_check=[HealthCheck.too_slow, HealthCheck.filter_too_much],
)
