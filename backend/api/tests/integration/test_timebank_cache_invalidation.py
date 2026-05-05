"""Integration tests for #348 — Redis invalidation in provision_timebank
and cancel_timebank_transfer must run on commit, not while the row lock is
held, and must NOT run when the surrounding transaction rolls back.
"""
from decimal import Decimal
from unittest.mock import patch

import pytest
from django.db import transaction

from api.tests.helpers.factories import HandshakeFactory, ServiceFactory, UserFactory
from api.utils import cancel_timebank_transfer, provision_timebank


def _build_offer_handshake(receiver_balance: Decimal = Decimal('5.00')):
    provider = UserFactory(timebank_balance=Decimal('5.00'))
    receiver = UserFactory(timebank_balance=receiver_balance)
    service = ServiceFactory(user=provider, type='Offer', duration=Decimal('2.00'))
    handshake = HandshakeFactory(
        service=service,
        requester=receiver,
        status='accepted',
        provisioned_hours=Decimal('2.00'),
    )
    return provider, receiver, service, handshake


@pytest.mark.django_db(transaction=True)
@pytest.mark.integration
class TestProvisionTimebankInvalidation:
    """provision_timebank wraps Redis invalidation in transaction.on_commit()."""

    def test_invalidations_run_after_commit_on_success(self):
        _, _, _, handshake = _build_offer_handshake()

        with patch('api.utils.invalidate_conversations') as inv_conv, \
             patch('api.utils.invalidate_transactions') as inv_tx:
            with transaction.atomic():
                provision_timebank(handshake)
                # While still inside the atomic block, neither callable
                # should have run yet — they're queued via on_commit.
                inv_conv.assert_not_called()
                inv_tx.assert_not_called()

            # After the outer transaction commits, on_commit fires.
            assert inv_conv.call_count == 2  # receiver + provider
            assert inv_tx.call_count == 1    # receiver only on provision

    def test_invalidations_skipped_on_rollback(self):
        _, _, _, handshake = _build_offer_handshake()

        with patch('api.utils.invalidate_conversations') as inv_conv, \
             patch('api.utils.invalidate_transactions') as inv_tx:
            try:
                with transaction.atomic():
                    provision_timebank(handshake)
                    raise RuntimeError('forced rollback for the test')
            except RuntimeError:
                pass

            # Cache invalidation must NOT fire on rollback — otherwise we'd
            # purge cache for state that never persisted.
            inv_conv.assert_not_called()
            inv_tx.assert_not_called()


@pytest.mark.django_db(transaction=True)
@pytest.mark.integration
class TestCancelTimebankInvalidation:
    """cancel_timebank_transfer wraps Redis invalidation in transaction.on_commit()."""

    def test_invalidations_run_after_commit_on_success(self):
        _, _, _, handshake = _build_offer_handshake()

        with patch('api.utils.invalidate_conversations') as inv_conv, \
             patch('api.utils.invalidate_transactions') as inv_tx:
            with transaction.atomic():
                cancel_timebank_transfer(handshake)
                inv_conv.assert_not_called()
                inv_tx.assert_not_called()

            assert inv_conv.call_count == 2  # receiver + provider
            assert inv_tx.call_count == 2    # receiver + provider on cancel

    def test_invalidations_skipped_on_rollback(self):
        _, _, _, handshake = _build_offer_handshake()

        with patch('api.utils.invalidate_conversations') as inv_conv, \
             patch('api.utils.invalidate_transactions') as inv_tx:
            try:
                with transaction.atomic():
                    cancel_timebank_transfer(handshake)
                    raise RuntimeError('forced rollback for the test')
            except RuntimeError:
                pass

            inv_conv.assert_not_called()
            inv_tx.assert_not_called()
