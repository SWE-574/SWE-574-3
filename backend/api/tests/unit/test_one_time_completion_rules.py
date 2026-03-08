"""Unit tests for One-Time completion rules.

One-Time services should be marked Completed once the last active
participant handshake completes (i.e., no pending/accepted/reported/paused
handshakes remain).
"""

from decimal import Decimal

import pytest
from django.db import transaction

from api.tests.helpers.factories import ServiceFactory, HandshakeFactory, UserFactory
from api.utils import complete_timebank_transfer


@pytest.mark.django_db
@pytest.mark.unit
def test_one_time_service_completes_only_after_all_participants_complete():
    provider = UserFactory(timebank_balance=Decimal('0.00'))
    receiver1 = UserFactory()
    receiver2 = UserFactory()

    service = ServiceFactory(
        user=provider,
        type='Offer',
        duration=Decimal('1.00'),
        schedule_type='One-Time',
        max_participants=2,
        status='Active',
    )

    handshake1 = HandshakeFactory(service=service, requester=receiver1, status='accepted', provisioned_hours=Decimal('1.00'))
    handshake2 = HandshakeFactory(service=service, requester=receiver2, status='accepted', provisioned_hours=Decimal('1.00'))

    with transaction.atomic():
        assert complete_timebank_transfer(handshake1) is True

    service.refresh_from_db()
    handshake1.refresh_from_db()
    handshake2.refresh_from_db()

    assert handshake1.status == 'completed'
    assert service.status == 'Active'

    with transaction.atomic():
        assert complete_timebank_transfer(handshake2) is True

    service.refresh_from_db()
    handshake2.refresh_from_db()

    assert handshake2.status == 'completed'
    assert service.status == 'Completed'


@pytest.mark.django_db
@pytest.mark.unit
def test_one_time_service_can_complete_below_max_participants():
    """A One-Time service can be completed even if it never fills to max_participants."""
    provider = UserFactory(timebank_balance=Decimal('0.00'))
    receiver = UserFactory()

    service = ServiceFactory(
        user=provider,
        type='Offer',
        duration=Decimal('1.00'),
        schedule_type='One-Time',
        max_participants=4,
        status='Active',
    )

    handshake = HandshakeFactory(
        service=service,
        requester=receiver,
        status='accepted',
        provisioned_hours=Decimal('1.00'),
    )

    with transaction.atomic():
        assert complete_timebank_transfer(handshake) is True

    service.refresh_from_db()
    handshake.refresh_from_db()

    assert handshake.status == 'completed'
    assert service.status == 'Completed'


@pytest.mark.django_db
@pytest.mark.unit
def test_recurrent_service_is_not_auto_completed():
    provider = UserFactory(timebank_balance=Decimal('0.00'))
    receiver = UserFactory()

    service = ServiceFactory(
        user=provider,
        type='Offer',
        duration=Decimal('1.00'),
        schedule_type='Recurrent',
        max_participants=1,
        status='Active',
    )

    handshake = HandshakeFactory(service=service, requester=receiver, status='accepted', provisioned_hours=Decimal('1.00'))

    with transaction.atomic():
        assert complete_timebank_transfer(handshake) is True

    service.refresh_from_db()
    handshake.refresh_from_db()

    assert handshake.status == 'completed'
    assert service.status == 'Active'
