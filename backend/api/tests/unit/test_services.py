"""
Unit tests for HandshakeService.

Tests business logic for expressing interest in services, including
validation for max_participants, balance checks, and duplicate interest prevention.
"""
from datetime import timedelta
from decimal import Decimal
from types import SimpleNamespace

import pytest
from django.contrib.auth import get_user_model
from django.utils import timezone

from api.models import Handshake, Service, TransactionHistory
from api.services import HandshakeService, HandshakeServiceError

User = get_user_model()


@pytest.fixture
def env(db):
    user1 = User.objects.create_user(
        email='user1@test.com', password='testpass123',
        first_name='User', last_name='One',
        timebank_balance=Decimal('10.00'),
    )
    user2 = User.objects.create_user(
        email='user2@test.com', password='testpass123',
        first_name='User', last_name='Two',
        timebank_balance=Decimal('5.00'),
    )
    user3 = User.objects.create_user(
        email='user3@test.com', password='testpass123',
        first_name='User', last_name='Three',
        timebank_balance=Decimal('3.00'),
    )
    user4 = User.objects.create_user(
        email='user4@test.com', password='testpass123',
        first_name='User', last_name='Four',
        timebank_balance=Decimal('5.00'),
    )

    service_offer = Service.objects.create(
        user=user1, title='Test Offer Service', description='A test service',
        type='Offer', duration=Decimal('2.00'), location_type='Online',
        max_participants=2, schedule_type='One-Time',
    )
    service_need = Service.objects.create(
        user=user1, title='Test Need Service', description='A test need service',
        type='Need', duration=Decimal('2.00'), location_type='Online',
        max_participants=1, schedule_type='One-Time',
    )

    return SimpleNamespace(
        user1=user1, user2=user2, user3=user3, user4=user4,
        service_offer=service_offer, service_need=service_need,
    )


@pytest.mark.django_db
def test_can_express_interest_valid(env):
    is_valid, error = HandshakeService.can_express_interest(env.service_offer, env.user2)
    assert is_valid
    assert error is None


@pytest.mark.django_db
def test_can_express_interest_own_service(env):
    is_valid, error = HandshakeService.can_express_interest(env.service_offer, env.user1)
    assert not is_valid
    assert 'own service' in error


@pytest.mark.django_db
def test_can_express_interest_insufficient_balance_offer(env):
    env.user2.timebank_balance = Decimal('-9.00')
    env.user2.save()

    is_valid, error = HandshakeService.can_express_interest(env.service_offer, env.user2)
    assert not is_valid
    assert 'Insufficient TimeBank balance' in error


@pytest.mark.django_db
def test_can_express_interest_insufficient_balance_need(env):
    env.user1.timebank_balance = Decimal('-10.01')

    is_valid, error = HandshakeService.can_express_interest(env.service_need, env.user2)
    assert not is_valid
    assert 'Insufficient TimeBank balance' in error


@pytest.mark.django_db
def test_can_express_interest_allows_offer_debt_within_limit(env):
    env.user2.timebank_balance = Decimal('-1.00')
    env.user2.save()
    env.service_offer.duration = Decimal('6.00')
    env.service_offer.save(update_fields=['duration'])

    is_valid, error = HandshakeService.can_express_interest(env.service_offer, env.user2)

    assert is_valid
    assert error is None


@pytest.mark.django_db
def test_can_express_interest_need_uses_existing_reservation_balance(env):
    env.user1.timebank_balance = Decimal('-1.00')
    env.user1.save()
    env.service_need.duration = Decimal('6.00')
    env.service_need.save(update_fields=['duration'])

    is_valid, error = HandshakeService.can_express_interest(env.service_need, env.user2)

    assert is_valid
    assert error is None


@pytest.mark.django_db
def test_can_express_interest_valid_need(env):
    env.user1.timebank_balance = Decimal('10.00')
    env.user1.save()

    is_valid, error = HandshakeService.can_express_interest(env.service_need, env.user2)
    assert is_valid
    assert error is None


@pytest.mark.django_db
def test_can_express_interest_max_participants(env):
    Handshake.objects.create(
        service=env.service_offer, requester=env.user2,
        provisioned_hours=Decimal('2.00'), status='accepted',
    )
    Handshake.objects.create(
        service=env.service_offer, requester=env.user3,
        provisioned_hours=Decimal('2.00'), status='accepted',
    )

    is_valid, error = HandshakeService.can_express_interest(env.service_offer, env.user4)
    assert not is_valid
    assert 'maximum capacity' in error


@pytest.mark.django_db
def test_pending_does_not_count_toward_capacity_one_time(env):
    Handshake.objects.create(
        service=env.service_need, requester=env.user2,
        provisioned_hours=Decimal('2.00'), status='pending',
    )

    is_valid, error = HandshakeService.can_express_interest(env.service_need, env.user3)
    assert is_valid
    assert error is None


@pytest.mark.django_db
def test_one_time_capacity_counts_completed(env):
    one_time_service = Service.objects.create(
        user=env.user1, title='One-time capacity test', description='Test',
        type='Offer', duration=Decimal('1.00'), location_type='Online',
        max_participants=1, schedule_type='One-Time',
    )
    Handshake.objects.create(
        service=one_time_service, requester=env.user2,
        provisioned_hours=Decimal('1.00'), status='completed',
    )

    is_valid, error = HandshakeService.can_express_interest(one_time_service, env.user3)
    assert not is_valid
    assert 'maximum capacity' in error


@pytest.mark.django_db
def test_recurrent_capacity_does_not_count_completed(env):
    recurrent_service = Service.objects.create(
        user=env.user1, title='Recurrent capacity test', description='Test',
        type='Offer', duration=Decimal('1.00'), location_type='Online',
        max_participants=1, schedule_type='Recurrent',
    )
    Handshake.objects.create(
        service=recurrent_service, requester=env.user2,
        provisioned_hours=Decimal('1.00'), status='completed',
    )

    is_valid, error = HandshakeService.can_express_interest(recurrent_service, env.user3)
    assert is_valid
    assert error is None


@pytest.mark.django_db
def test_express_interest_success_offer(env):
    handshake = HandshakeService.express_interest(env.service_offer, env.user2)

    assert handshake is not None
    assert handshake.service == env.service_offer
    assert handshake.requester == env.user2
    assert handshake.status == 'pending'
    assert handshake.provisioned_hours == Decimal('2.00')


@pytest.mark.django_db
def test_approve_refetches_locked_handshake_state(env):
    """A stale pending instance must not approve after another request cancels it."""
    handshake = Handshake.objects.create(
        service=env.service_offer, requester=env.user2,
        provisioned_hours=Decimal('1.00'), status='pending',
        provider_initiated=True, exact_duration=Decimal('1.00'),
        scheduled_time=timezone.now() + timedelta(days=1),
    )
    stale_pending = Handshake.objects.get(pk=handshake.pk)
    Handshake.objects.filter(pk=handshake.pk).update(status='cancelled')

    with pytest.raises(HandshakeServiceError) as context:
        HandshakeService.approve(stale_pending, env.user2)

    assert 'not pending' in str(context.value)
    handshake.refresh_from_db()
    assert handshake.status == 'cancelled'
    assert not TransactionHistory.objects.filter(handshake=handshake).exists()


@pytest.mark.django_db
def test_express_interest_success_need(env):
    handshake = HandshakeService.express_interest(env.service_need, env.user2)

    assert handshake is not None
    assert handshake.service == env.service_need
    assert handshake.requester == env.user2
    assert handshake.status == 'pending'
    assert handshake.provisioned_hours == Decimal('2.00')


@pytest.mark.django_db
def test_express_interest_duplicate(env):
    HandshakeService.express_interest(env.service_offer, env.user2)

    with pytest.raises(ValueError) as context:
        HandshakeService.express_interest(env.service_offer, env.user2)

    assert 'already expressed interest' in str(context.value)


@pytest.mark.django_db
def test_express_interest_max_participants_raises_error(env):
    Handshake.objects.create(
        service=env.service_need, requester=env.user2,
        provisioned_hours=Decimal('2.00'), status='accepted',
    )

    with pytest.raises(ValueError) as context:
        HandshakeService.express_interest(env.service_need, env.user3)

    assert 'maximum capacity' in str(context.value)


@pytest.mark.django_db
def test_express_interest_creates_chat_message(env):
    from api.models import ChatMessage

    handshake = HandshakeService.express_interest(env.service_offer, env.user2)

    messages = ChatMessage.objects.filter(handshake=handshake)
    assert messages.count() == 1
    message = messages.first()
    assert 'interested in your service' in message.body
    assert message.sender == env.user2
    assert message.handshake == handshake


@pytest.mark.django_db
def test_express_interest_creates_notification(env):
    from api.models import Notification

    handshake = HandshakeService.express_interest(env.service_offer, env.user2)

    notifications = Notification.objects.filter(
        user=env.user1, related_handshake=handshake,
    )
    assert notifications.count() == 1
    notification = notifications.first()
    assert notification.type == 'handshake_request'
    assert notification.user == env.user1
    assert notification.related_handshake == handshake
    assert notification.related_service == env.service_offer


@pytest.mark.django_db
def test_can_express_interest_inactive_service(env):
    env.service_offer.status = 'Completed'
    env.service_offer.save()

    is_valid, error = HandshakeService.can_express_interest(env.service_offer, env.user2)
    assert not is_valid
    assert 'not active' in error


@pytest.mark.django_db
def test_express_interest_inactive_service_raises_error(env):
    env.service_offer.status = 'Cancelled'
    env.service_offer.save()

    with pytest.raises(ValueError) as context:
        HandshakeService.express_interest(env.service_offer, env.user2)

    assert 'not active' in str(context.value)


@pytest.mark.django_db
def test_payer_determination_offer(env):
    """Offer service - requester pays."""
    env.user2.timebank_balance = Decimal('-9.00')
    env.user2.save()
    env.user1.timebank_balance = Decimal('10.00')
    env.user1.save()

    is_valid, error = HandshakeService.can_express_interest(env.service_offer, env.user2)
    assert not is_valid
    assert 'You' in error
    assert 'Insufficient TimeBank balance' in error


@pytest.mark.django_db
def test_payer_determination_need(env):
    """Need interest checks the service owner's reserved balance."""
    env.user1.timebank_balance = Decimal('-9.00')
    env.user1.save()
    env.user2.timebank_balance = Decimal('10.00')
    env.user2.save()

    is_valid, error = HandshakeService.can_express_interest(env.service_need, env.user2)
    assert is_valid
    assert error is None


@pytest.mark.django_db
def test_lock_ordering_prevents_deadlock(env):
    """Locks are acquired in consistent order to prevent deadlocks."""
    service_user2 = Service.objects.create(
        user=env.user2, title='User2 Service', description='A service by user2',
        type='Offer', duration=Decimal('1.00'), location_type='Online',
        max_participants=1, schedule_type='One-Time',
    )

    env.user1.timebank_balance = Decimal('10.00')
    env.user1.save()
    env.user2.timebank_balance = Decimal('10.00')
    env.user2.save()

    handshake1 = HandshakeService.express_interest(service_user2, env.user1)
    assert handshake1 is not None
    assert handshake1.requester == env.user1
    assert handshake1.service == service_user2

    handshake2 = HandshakeService.express_interest(env.service_offer, env.user2)
    assert handshake2 is not None
    assert handshake2.requester == env.user2
    assert handshake2.service == env.service_offer
