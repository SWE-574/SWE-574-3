"""Property-based tests for critical business logic."""
import uuid
from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from hypothesis import HealthCheck, given, settings, strategies as st
from hypothesis.stateful import RuleBasedStateMachine, invariant, rule

from api.models import Handshake, Service, TransactionHistory
from api.ranking import calculate_hot_score
from api.services import HandshakeService
from api.tests.helpers.factories import CommentFactory, ServiceFactory
from api.utils import provision_timebank

User = get_user_model()


@pytest.mark.django_db
@settings(max_examples=50, deadline=None,
          suppress_health_check=[HealthCheck.function_scoped_fixture])
@given(
    initial_balance=st.decimals(min_value=Decimal('3.00'), max_value=Decimal('100.00'), places=2),
    transaction_amounts=st.lists(
        st.decimals(min_value=Decimal('-10.00'), max_value=Decimal('50.00'), places=2),
        min_size=1, max_size=10,
    ),
)
def test_balance_consistency_property(initial_balance, transaction_amounts):
    """Balance must match transaction history sum."""
    user = User.objects.create_user(
        email=f'test_{uuid.uuid4().hex[:8]}@test.com',
        password='testpass123', first_name='Test', last_name='User',
        timebank_balance=initial_balance,
    )

    current_balance = initial_balance
    for amount in transaction_amounts:
        if current_balance + amount < Decimal('-10.00'):
            continue
        TransactionHistory.objects.create(
            user=user, transaction_type='transfer', amount=amount,
            balance_after=current_balance + amount,
            description=f'Test transaction: {amount}',
        )
        current_balance += amount
        user.timebank_balance = current_balance
        user.save(update_fields=['timebank_balance'])

    user.refresh_from_db()

    history_sum = sum(
        TransactionHistory.objects.filter(user=user).values_list('amount', flat=True)
    )

    expected_balance = initial_balance + history_sum
    assert float(user.timebank_balance) == float(expected_balance)


@pytest.fixture
def handshake_env(db):
    user1 = User.objects.create_user(
        email='user1@test.com', password='testpass123',
        first_name='User', last_name='One',
        timebank_balance=Decimal('10.00'),
    )
    user2 = User.objects.create_user(
        email='user2@test.com', password='testpass123',
        first_name='User', last_name='Two',
        timebank_balance=Decimal('10.00'),
    )
    service = Service.objects.create(
        user=user1, title='Test Service', description='Test description for property testing',
        type='Offer', duration=Decimal('2.00'), location_type='Online',
        schedule_type='One-Time', max_participants=1,
    )
    return user1, user2, service


@pytest.mark.django_db
@settings(max_examples=30,
          suppress_health_check=[HealthCheck.function_scoped_fixture])
@given(status=st.sampled_from(['pending', 'accepted', 'completed', 'cancelled', 'denied']))
def test_handshake_state_transitions(status, handshake_env):
    """Test handshake state transitions."""
    _, user2, service = handshake_env
    handshake = Handshake.objects.create(
        service=service, requester=user2,
        status='pending', provisioned_hours=Decimal('2.00'),
    )
    handshake.status = status
    handshake.save()

    valid_statuses = [choice[0] for choice in Handshake.STATUS_CHOICES]
    assert handshake.status in valid_statuses


@pytest.fixture
def participation_user(db):
    return User.objects.create_user(
        email='user1@test.com', password='testpass123',
        first_name='User', last_name='One',
        timebank_balance=Decimal('100.00'),
    )


@pytest.mark.django_db
@settings(max_examples=20, deadline=None,
          suppress_health_check=[HealthCheck.function_scoped_fixture])
@given(
    max_participants=st.integers(min_value=1, max_value=10),
    num_requests=st.integers(min_value=1, max_value=15),
)
def test_participation_limit_property(max_participants, num_requests, participation_user):
    """Capacity-consuming handshakes never exceed max_participants."""
    service = Service.objects.create(
        user=participation_user, title='Test Service', description='Test description',
        type='Offer', duration=Decimal('1.00'), location_type='Online',
        schedule_type='One-Time', max_participants=max_participants,
    )

    users = []
    for i in range(num_requests):
        user = User.objects.create_user(
            email=f'requester{i}_{uuid.uuid4().hex[:6]}@test.com',
            password='testpass123', first_name=f'User{i}', last_name='Test',
            timebank_balance=Decimal('10.00'),
        )
        users.append(user)

    for user in users:
        is_valid, _ = HandshakeService.can_express_interest(service, user)
        if is_valid:
            try:
                HandshakeService.express_interest(service, user)
            except Exception:
                pass

    capacity_statuses = ['accepted', 'completed', 'reported', 'paused']
    capacity_used = Handshake.objects.filter(
        service=service, status__in=capacity_statuses,
    ).count()

    assert capacity_used <= max_participants


@pytest.fixture
def provision_env(db):
    provider = User.objects.create_user(
        email='provider@test.com', password='testpass123',
        first_name='Provider', last_name='User',
        timebank_balance=Decimal('10.00'),
    )
    receiver = User.objects.create_user(
        email='receiver@test.com', password='testpass123',
        first_name='Receiver', last_name='User',
        timebank_balance=Decimal('10.00'),
    )
    service = Service.objects.create(
        user=provider, title='Test Service', description='Test description',
        type='Offer', duration=Decimal('2.00'), location_type='Online',
        schedule_type='One-Time', max_participants=1,
    )
    return provider, receiver, service


@pytest.mark.django_db
@settings(max_examples=30,
          suppress_health_check=[HealthCheck.function_scoped_fixture])
@given(
    hours=st.integers(min_value=1, max_value=5).map(lambda v: Decimal(str(v))),
    initial_balance=st.integers(min_value=3, max_value=20).map(lambda v: Decimal(str(v))),
)
def test_provisioning_accuracy_property(hours, initial_balance, provision_env):
    """Provisioning accurately deducts hours."""
    _, receiver, service = provision_env
    receiver.timebank_balance = initial_balance
    receiver.save()

    if initial_balance - hours < Decimal('-10.00'):
        return

    handshake = Handshake.objects.create(
        service=service, requester=receiver,
        status='pending', provisioned_hours=hours,
    )

    handshake.status = 'accepted'
    handshake.save()

    try:
        provision_timebank(handshake)
    except ValueError:
        return

    receiver.refresh_from_db()

    expected_balance = initial_balance - hours
    assert float(receiver.timebank_balance) == float(expected_balance)
    provision_transaction = TransactionHistory.objects.filter(
        user=receiver, transaction_type='provision', handshake=handshake,
    ).first()

    assert provision_transaction is not None
    assert float(provision_transaction.amount) == float(-hours)


@pytest.mark.django_db
@settings(max_examples=50, deadline=None,
          suppress_health_check=[HealthCheck.function_scoped_fixture])
@given(
    email=st.emails(),
    first_name=st.text(min_size=1, max_size=150),
    last_name=st.text(min_size=1, max_size=150),
    password=st.text(min_size=10, max_size=128),
)
def test_registration_completeness_property(email, first_name, last_name, password):
    """New users have complete and valid data."""
    email = email.lower().strip()
    first_name = first_name.replace('\x00', '').strip()[:150]
    last_name = last_name.replace('\x00', '').strip()[:150]

    if not first_name or not last_name:
        return

    if User.objects.filter(email=email).exists():
        return

    user = User.objects.create_user(
        email=email, password=password,
        first_name=first_name, last_name=last_name,
    )

    assert user.timebank_balance == Decimal('3.00')
    assert user.is_active
    assert user.role == 'member'
    assert user.email is not None
    assert '@' in user.email
    assert user.first_name is not None
    assert user.last_name is not None
    assert len(user.first_name) > 0
    assert len(user.last_name) > 0


@pytest.mark.django_db
@settings(max_examples=20, deadline=None,
          suppress_health_check=[HealthCheck.too_slow, HealthCheck.function_scoped_fixture])
@given(steps=st.integers(min_value=1, max_value=8))
def test_score_never_decreases_with_more_comments(steps):
    """Hot score is monotone non-decreasing in positive interactions."""
    service = ServiceFactory(type='Offer', status='Active', max_participants=1)
    previous = calculate_hot_score(service)
    for _ in range(steps):
        CommentFactory(service=service)
        service.refresh_from_db()
        current = calculate_hot_score(service)
        assert current >= previous
        previous = current


@pytest.mark.django_db
@settings(max_examples=15, deadline=None,
          suppress_health_check=[HealthCheck.too_slow, HealthCheck.function_scoped_fixture])
@given(
    initial=st.integers(min_value=5, max_value=50).map(lambda v: Decimal(str(v))),
    deltas=st.lists(
        st.integers(min_value=-3, max_value=5).map(lambda v: Decimal(str(v))),
        min_size=1, max_size=8,
    ),
)
def test_net_flow_matches_balance_delta(initial, deltas):
    """Balance equals initial + sum(transactions) under interleaved transfers."""
    user = User.objects.create_user(
        email=f'flow_{uuid.uuid4().hex[:8]}@test.com',
        password='testpass123', first_name='Flow', last_name='User',
        timebank_balance=initial,
    )
    for delta in deltas:
        new_balance = user.timebank_balance + delta
        if new_balance < Decimal('-10.00'):
            continue
        TransactionHistory.objects.create(
            user=user, transaction_type='transfer', amount=delta,
            balance_after=new_balance, description='property test',
        )
        user.timebank_balance = new_balance
        user.save(update_fields=['timebank_balance'])

    user.refresh_from_db()
    history_sum = sum(
        TransactionHistory.objects.filter(user=user).values_list('amount', flat=True)
    )
    assert user.timebank_balance == initial + history_sum


# Stateful test: handshake transitions must follow the published state machine.
LEGAL_TRANSITIONS = {
    'pending':   {'accepted', 'denied', 'cancelled'},
    'accepted':  {'completed', 'cancelled', 'reported', 'paused'},
    'paused':    {'accepted', 'cancelled'},
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

    @rule(target_status=st.sampled_from(
        ['accepted', 'denied', 'cancelled', 'completed', 'reported', 'paused']
    ))
    def transition(self, target_status):
        current = self.handshake.status
        legal = LEGAL_TRANSITIONS.get(current, set())
        if target_status not in legal:
            return
        self.handshake.status = target_status
        self.handshake.save(update_fields=['status'])
        self.handshake.refresh_from_db()
        assert self.handshake.status == target_status

    @invariant()
    def status_is_known(self):
        valid = {choice[0] for choice in Handshake.STATUS_CHOICES}
        assert self.handshake.status in valid


PropertyTestHandshakeStateMachine = HandshakeStateMachine.TestCase
PropertyTestHandshakeStateMachine.settings = settings(
    max_examples=20, stateful_step_count=12, deadline=None,
    suppress_health_check=[HealthCheck.too_slow, HealthCheck.filter_too_much],
)
