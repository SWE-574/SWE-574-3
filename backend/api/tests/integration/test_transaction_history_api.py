"""
Integration tests for the TransactionHistory API endpoint.

GET /api/transactions/        - list (paginated, filterable by direction)
GET /api/transactions/{id}/   - retrieve single transaction
"""
import pytest
from decimal import Decimal
from django.core.cache import cache
from rest_framework import status

from api.tests.helpers.factories import (
    UserFactory,
    ServiceFactory,
    HandshakeFactory,
    TransactionHistoryFactory,
)
from api.tests.helpers.test_client import AuthenticatedAPIClient
from api.models import TransactionHistory


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_tx(user, tx_type, amount, balance_after=None, handshake=None):
    return TransactionHistoryFactory(
        user=user,
        transaction_type=tx_type,
        amount=amount,
        balance_after=balance_after if balance_after is not None else Decimal('5.00'),
        handshake=handshake,
    )


# ---------------------------------------------------------------------------
# Authentication
# ---------------------------------------------------------------------------

@pytest.mark.django_db
@pytest.mark.integration
class TestTransactionHistoryAuth:
    """Unauthenticated access is rejected."""

    def test_list_requires_auth(self):
        client = AuthenticatedAPIClient()
        response = client.get('/api/transactions/')
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_retrieve_requires_auth(self):
        user = UserFactory()
        tx = _make_tx(user, 'provision', Decimal('-2.00'))
        client = AuthenticatedAPIClient()
        response = client.get(f'/api/transactions/{tx.id}/')
        assert response.status_code == status.HTTP_401_UNAUTHORIZED


# ---------------------------------------------------------------------------
# List endpoint
# ---------------------------------------------------------------------------

@pytest.mark.django_db
@pytest.mark.integration
class TestTransactionHistoryList:
    """GET /api/transactions/ returns transactions for the authenticated user only."""

    def test_returns_own_transactions_only(self):
        user = UserFactory()
        other = UserFactory()
        _make_tx(user, 'provision', Decimal('-2.00'))
        _make_tx(user, 'transfer', Decimal('2.00'))
        _make_tx(other, 'provision', Decimal('-2.00'))  # must not appear

        client = AuthenticatedAPIClient().authenticate_user(user)
        response = client.get('/api/transactions/')

        assert response.status_code == status.HTTP_200_OK
        ids = {r['id'] for r in response.data['results']}
        other_txs = TransactionHistory.objects.filter(user=other).values_list('id', flat=True)
        for oid in other_txs:
            assert str(oid) not in ids

    def test_response_shape(self):
        user = UserFactory()
        _make_tx(user, 'provision', Decimal('-2.00'), balance_after=Decimal('3.00'))

        client = AuthenticatedAPIClient().authenticate_user(user)
        response = client.get('/api/transactions/')

        assert response.status_code == status.HTTP_200_OK
        assert 'results' in response.data
        assert 'summary' in response.data
        result = response.data['results'][0]
        for field in ('id', 'transaction_type', 'transaction_type_display', 'amount',
                      'balance_after', 'description', 'created_at'):
            assert field in result, f"Expected field '{field}' in transaction response"

    def test_summary_fields(self):
        user = UserFactory(timebank_balance=Decimal('6.00'))
        _make_tx(user, 'transfer', Decimal('4.00'), balance_after=Decimal('6.00'))
        _make_tx(user, 'provision', Decimal('-2.00'), balance_after=Decimal('2.00'))

        client = AuthenticatedAPIClient().authenticate_user(user)
        response = client.get('/api/transactions/')

        summary = response.data['summary']
        assert 'current_balance' in summary
        assert 'total_earned' in summary
        assert 'total_spent' in summary
        assert summary['total_earned'] == pytest.approx(4.0)
        assert summary['total_spent'] == pytest.approx(2.0)

    def test_ordered_newest_first(self):
        user = UserFactory()
        tx1 = _make_tx(user, 'provision', Decimal('-2.00'))
        tx2 = _make_tx(user, 'transfer', Decimal('2.00'))

        client = AuthenticatedAPIClient().authenticate_user(user)
        response = client.get('/api/transactions/')

        ids = [r['id'] for r in response.data['results']]
        # tx2 was created after tx1; it should appear first
        assert ids.index(str(tx2.id)) < ids.index(str(tx1.id))

    def test_empty_list_for_new_user(self):
        user = UserFactory()
        client = AuthenticatedAPIClient().authenticate_user(user)
        response = client.get('/api/transactions/')

        assert response.status_code == status.HTTP_200_OK
        assert response.data['results'] == []
        assert response.data['summary']['total_earned'] == pytest.approx(0.0)
        assert response.data['summary']['total_spent'] == pytest.approx(0.0)


# ---------------------------------------------------------------------------
# Direction filtering
# ---------------------------------------------------------------------------

@pytest.mark.django_db
@pytest.mark.integration
class TestTransactionHistoryDirectionFilter:
    """?direction= filter returns only credits or debits."""

    def setup_method(self):
        self.user = UserFactory()
        self.credit_tx = _make_tx(self.user, 'transfer', Decimal('3.00'))
        self.debit_tx = _make_tx(self.user, 'provision', Decimal('-2.00'))
        self.refund_tx = _make_tx(self.user, 'refund', Decimal('2.00'))
        self.adjustment_tx = _make_tx(self.user, 'adjustment', Decimal('1.00'))
        self.client = AuthenticatedAPIClient().authenticate_user(self.user)

    def test_filter_credit(self):
        response = self.client.get('/api/transactions/?direction=credit')
        assert response.status_code == status.HTTP_200_OK
        ids = {r['id'] for r in response.data['results']}
        assert str(self.credit_tx.id) in ids
        assert str(self.debit_tx.id) not in ids

    def test_filter_debit(self):
        response = self.client.get('/api/transactions/?direction=debit')
        assert response.status_code == status.HTTP_200_OK
        ids = {r['id'] for r in response.data['results']}
        assert str(self.debit_tx.id) in ids
        assert str(self.credit_tx.id) not in ids

    def test_filter_all_is_default(self):
        response_all = self.client.get('/api/transactions/?direction=all')
        response_default = self.client.get('/api/transactions/')
        assert len(response_all.data['results']) == len(response_default.data['results'])

    def test_filter_reservation(self):
        response = self.client.get('/api/transactions/?direction=reservation')
        assert response.status_code == status.HTTP_200_OK
        ids = {r['id'] for r in response.data['results']}
        assert str(self.debit_tx.id) in ids
        assert str(self.refund_tx.id) in ids
        assert str(self.credit_tx.id) not in ids
        assert str(self.adjustment_tx.id) not in ids

    def test_invalid_direction_falls_back_to_all(self):
        response = self.client.get('/api/transactions/?direction=bogus')
        assert response.status_code == status.HTTP_200_OK
        # Both transactions should be present
        ids = {r['id'] for r in response.data['results']}
        assert str(self.credit_tx.id) in ids
        assert str(self.debit_tx.id) in ids


# ---------------------------------------------------------------------------
# Pagination
# ---------------------------------------------------------------------------

@pytest.mark.django_db
@pytest.mark.integration
class TestTransactionHistoryPagination:
    """List endpoint is paginated."""

    def test_pagination_fields_present(self):
        user = UserFactory()
        TransactionHistoryFactory.create_batch(5, user=user, amount=Decimal('1.00'), balance_after=Decimal('5.00'))

        client = AuthenticatedAPIClient().authenticate_user(user)
        response = client.get('/api/transactions/')

        assert response.status_code == status.HTTP_200_OK
        assert 'count' in response.data
        assert 'results' in response.data
        assert response.data['count'] == 5

    def test_second_page_accessible(self):
        """If page size is smaller than total records, page=2 returns different results."""
        user = UserFactory()
        # Create 25 transactions — more than the default page size of 20
        TransactionHistoryFactory.create_batch(25, user=user, amount=Decimal('1.00'), balance_after=Decimal('5.00'))

        client = AuthenticatedAPIClient().authenticate_user(user)
        response_p1 = client.get('/api/transactions/?page=1')
        response_p2 = client.get('/api/transactions/?page=2')

        assert response_p1.status_code == status.HTTP_200_OK
        assert response_p2.status_code == status.HTTP_200_OK
        ids_p1 = {r['id'] for r in response_p1.data['results']}
        ids_p2 = {r['id'] for r in response_p2.data['results']}
        assert ids_p1.isdisjoint(ids_p2), "Pages should not overlap"

    def test_cache_keeps_different_page_sizes_separate(self):
        """A cached default page must not truncate larger insight/page_size requests."""
        cache.clear()
        user = UserFactory()
        TransactionHistoryFactory.create_batch(
            30,
            user=user,
            amount=Decimal('1.00'),
            balance_after=Decimal('5.00'),
        )

        client = AuthenticatedAPIClient().authenticate_user(user)
        response_default = client.get('/api/transactions/?page=1&page_size=20&direction=all')
        response_large = client.get('/api/transactions/?page=1&page_size=100&direction=all')

        assert response_default.status_code == status.HTTP_200_OK
        assert response_large.status_code == status.HTTP_200_OK
        assert len(response_default.data['results']) == 20
        assert len(response_large.data['results']) == 30


# ---------------------------------------------------------------------------
# Retrieve single transaction
# ---------------------------------------------------------------------------

@pytest.mark.django_db
@pytest.mark.integration
class TestTransactionHistoryRetrieve:
    """GET /api/transactions/{id}/ returns the correct transaction."""

    def test_retrieve_own_transaction(self):
        user = UserFactory()
        tx = _make_tx(user, 'transfer', Decimal('2.00'), balance_after=Decimal('5.00'))

        client = AuthenticatedAPIClient().authenticate_user(user)
        response = client.get(f'/api/transactions/{tx.id}/')

        assert response.status_code == status.HTTP_200_OK
        assert response.data['id'] == str(tx.id)
        assert response.data['transaction_type'] == 'transfer'

    def test_cannot_retrieve_other_users_transaction(self):
        owner = UserFactory()
        other = UserFactory()
        tx = _make_tx(owner, 'provision', Decimal('-2.00'))

        client = AuthenticatedAPIClient().authenticate_user(other)
        response = client.get(f'/api/transactions/{tx.id}/')

        assert response.status_code == status.HTTP_404_NOT_FOUND


# ---------------------------------------------------------------------------
# Side-effect verification: transactions created by timebank operations
# ---------------------------------------------------------------------------

@pytest.mark.django_db
@pytest.mark.integration
class TestTransactionHistorySideEffects:
    """
    Verify that key timebank operations (provision, transfer, refund)
    actually append entries visible via the API endpoint.
    """

    def test_provision_creates_transaction_record(self):
        """
        Provisioning hours (when a handshake is accepted) creates a provision
        transaction visible via GET /api/transactions/.
        """
        from api.utils import provision_timebank

        provider = UserFactory(timebank_balance=Decimal('10.00'))
        requester = UserFactory(timebank_balance=Decimal('5.00'))
        service = ServiceFactory(user=provider, type='Offer', duration=Decimal('2.00'))
        handshake = HandshakeFactory(
            service=service, requester=requester, status='pending',
            provisioned_hours=Decimal('2.00'),
        )

        # Provision happens on acceptance, not on interest expression
        provision_timebank(handshake)

        client = AuthenticatedAPIClient().authenticate_user(requester)
        tx_response = client.get('/api/transactions/?direction=debit')
        assert tx_response.status_code == status.HTTP_200_OK
        types = [r['transaction_type'] for r in tx_response.data['results']]
        assert 'provision' in types

    def test_transaction_type_display_is_human_readable(self):
        user = UserFactory()
        _make_tx(user, 'provision', Decimal('-2.00'))
        _make_tx(user, 'transfer', Decimal('2.00'))
        _make_tx(user, 'refund', Decimal('2.00'))

        client = AuthenticatedAPIClient().authenticate_user(user)
        response = client.get('/api/transactions/')

        displays = {r['transaction_type_display'] for r in response.data['results']}
        assert 'Provision' in displays
        assert 'Transfer' in displays
        assert 'Refund' in displays
