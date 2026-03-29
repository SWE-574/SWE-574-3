"""
Integration tests for Ranking API — NFR-17a, NFR-17c

NFR-17a: Hot-score sort query completes within 1 second for a realistic catalogue.
NFR-17c: Score inputs and update timestamps are auditable after recalculation.

All tests in this file are currently xfail:
- NFR-17a: No performance baseline exists; no test enforces the 1s SLA.
- NFR-17c: No audit log or score-history field has been implemented.
"""
import time
import pytest
from decimal import Decimal
from rest_framework.test import APIClient

from api.tests.helpers.factories import (
    ServiceFactory,
    UserFactory,
    HandshakeFactory,
    ReputationRepFactory,
)


# ---------------------------------------------------------------------------
# NFR-17a — Ranking query performance (xfail — no benchmark enforced yet)
# ---------------------------------------------------------------------------

@pytest.mark.django_db
@pytest.mark.integration
@pytest.mark.xfail(reason="NFR-17a: no performance test exists yet; 1s SLA not enforced", strict=False)
class TestRankingQueryPerformance:
    """
    The discovery feed must return a hot-score-sorted page within 1 second
    when the active catalogue contains ~1 000 services (NFR-17a).

    This test is xfail because:
    - No benchmark guard exists anywhere in the test suite.
    - The index on (status, -hot_score) may be sufficient, but it has never
      been measured under load in the test environment.
    """

    def test_hot_sort_returns_within_1_second_with_1000_services(self, db):
        """
        Seed 1 000 Active services, request the first page ordered by hot_score,
        and assert the round-trip completes in under 1 second.
        """
        # Arrange — bulk-create services to avoid N factory DB hits
        user = UserFactory()
        ServiceFactory.create_batch(1000, status='Active', user=user)

        client = APIClient()

        # Act
        start = time.monotonic()
        response = client.get('/api/services/?ordering=-hot_score')
        elapsed = time.monotonic() - start

        # Assert
        assert response.status_code == 200
        assert elapsed < 1.0, (
            f"Hot-sort query took {elapsed:.3f}s — exceeds the 1s NFR-17a SLA. "
            "Add a composite index on (status, hot_score DESC) or investigate N+1 queries."
        )

    def test_hot_sort_with_mixed_types_returns_within_1_second(self, db):
        """
        Mixed Offer/Need/Event catalogue of 300 services per type should still
        return page 1 within 1 second (unified feed, no type filter).
        """
        user = UserFactory()
        ServiceFactory.create_batch(300, status='Active', type='Offer', user=user)
        ServiceFactory.create_batch(300, status='Active', type='Need', user=user)
        ServiceFactory.create_batch(300, status='Active', type='Event', user=user)

        client = APIClient()

        start = time.monotonic()
        response = client.get('/api/services/?ordering=-hot_score')
        elapsed = time.monotonic() - start

        assert response.status_code == 200
        assert elapsed < 1.0, (
            f"Mixed-type hot-sort took {elapsed:.3f}s — exceeds NFR-17a SLA."
        )


# ---------------------------------------------------------------------------
# NFR-17c — Score auditability (xfail — no audit log implemented)
# ---------------------------------------------------------------------------

@pytest.mark.django_db
@pytest.mark.integration
@pytest.mark.xfail(reason="NFR-17c: no audit log or score-history field implemented", strict=False)
class TestScoreAuditability:
    """
    Score inputs (P, N, C, HoursExchanged) and the timestamp of each recalculation
    must be queryable after the fact (NFR-17c).

    This test is xfail because no audit mechanism exists:
    - Service has no score_updated_at field.
    - There is no ScoreAuditLog model or equivalent.
    """

    def _get_audit_record(self, service):
        """
        Attempt to fetch the most recent audit record for a service.
        Raises AttributeError / ImportError if the audit mechanism is missing —
        which is the expected state that keeps these tests xfail.
        """
        from api.models import ScoreAuditLog  # noqa: PLC0415 — lazy import, expected to fail
        return ScoreAuditLog.objects.filter(service=service).latest('recorded_at')

    def test_score_update_timestamp_is_recorded(self, db):
        """
        After a reputation rep is added and hot_score is recalculated, the service
        must expose a non-null score_updated_at timestamp.
        """
        provider = UserFactory()
        requester = UserFactory()
        service = ServiceFactory(user=provider, status='Active')
        handshake = HandshakeFactory(service=service, requester=requester, status='completed')
        ReputationRepFactory(handshake=handshake, giver=requester, receiver=provider)

        service.refresh_from_db()

        # score_updated_at must exist and be recent
        assert hasattr(service, 'score_updated_at'), (
            "Service.score_updated_at field is missing — add it for NFR-17c."
        )
        assert service.score_updated_at is not None

    def test_score_inputs_are_auditable_after_recalculation(self, db):
        """
        After recalculation the audit log must record the raw inputs used:
        positive_rep_count, negative_rep_count, comment_count, hours_exchanged.
        """
        provider = UserFactory()
        requester = UserFactory()
        service = ServiceFactory(user=provider, status='Active')
        handshake = HandshakeFactory(service=service, requester=requester, status='completed')
        ReputationRepFactory(handshake=handshake, giver=requester, receiver=provider)

        service.refresh_from_db()

        record = self._get_audit_record(service)
        assert hasattr(record, 'positive_rep_count')
        assert hasattr(record, 'negative_rep_count')
        assert hasattr(record, 'comment_count')
        assert hasattr(record, 'hours_exchanged')
        assert record.positive_rep_count >= 1

    def test_score_history_shows_multiple_entries_over_time(self, db):
        """
        Each recalculation must append a new audit entry, not overwrite the previous one,
        so that score trajectory is reconstructible.
        """
        from api.models import ScoreAuditLog  # noqa: PLC0415

        provider = UserFactory()
        service = ServiceFactory(user=provider, status='Active')

        # First recalculation
        requester1 = UserFactory()
        hs1 = HandshakeFactory(service=service, requester=requester1, status='completed')
        ReputationRepFactory(handshake=hs1, giver=requester1, receiver=provider)

        # Second recalculation
        requester2 = UserFactory()
        hs2 = HandshakeFactory(service=service, requester=requester2, status='completed')
        ReputationRepFactory(handshake=hs2, giver=requester2, receiver=provider)

        service.refresh_from_db()

        entry_count = ScoreAuditLog.objects.filter(service=service).count()
        assert entry_count >= 2, (
            f"Expected at least 2 audit entries after 2 recalculations, got {entry_count}. "
            "The audit log must append, not upsert."
        )
