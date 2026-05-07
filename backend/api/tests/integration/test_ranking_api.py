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

from django.conf import settings as django_settings


@pytest.mark.django_db
@pytest.mark.integration
class TestRankingQueryPerformance:
    """NFR-17a (#307): hot-score-sorted feed must return within 1 second on a
    1 000-service catalogue. Threshold lives in settings.RANKING_FEED_SLA_SECONDS
    so it can be tuned per environment without editing the test."""

    def test_hot_sort_returns_within_sla_with_1000_services(self, db):
        user = UserFactory()
        ServiceFactory.create_batch(1000, status='Active', user=user)

        client = APIClient()

        start = time.monotonic()
        response = client.get('/api/services/?ordering=-hot_score')
        elapsed = time.monotonic() - start

        assert response.status_code == 200
        assert elapsed < django_settings.RANKING_FEED_SLA_SECONDS, (
            f"Hot-sort query took {elapsed:.3f}s -- exceeds the "
            f"{django_settings.RANKING_FEED_SLA_SECONDS}s NFR-17a SLA. "
            "Check the (status, hot_score DESC) index and the serializer for N+1."
        )

    def test_hot_sort_with_mixed_types_returns_within_sla(self, db):
        user = UserFactory()
        ServiceFactory.create_batch(300, status='Active', type='Offer', user=user)
        ServiceFactory.create_batch(300, status='Active', type='Need', user=user)
        ServiceFactory.create_batch(300, status='Active', type='Event', user=user)

        client = APIClient()

        start = time.monotonic()
        response = client.get('/api/services/?ordering=-hot_score')
        elapsed = time.monotonic() - start

        assert response.status_code == 200
        assert elapsed < django_settings.RANKING_FEED_SLA_SECONDS, (
            f"Mixed-type hot-sort took {elapsed:.3f}s -- exceeds NFR-17a SLA."
        )


@pytest.mark.django_db
@pytest.mark.integration
class TestFeedEndToEndPerformance:
    """NFR-19a (#325): the full DRF stack (ordering, pagination, serialization,
    permissions) must return the discovery feed within 2 seconds for an
    anonymous user on a 1 000-service catalogue."""

    def test_anonymous_feed_under_e2e_sla(self, db):
        user = UserFactory()
        ServiceFactory.create_batch(1000, status='Active', user=user)

        client = APIClient()  # anonymous

        start = time.monotonic()
        response = client.get('/api/services/?ordering=-hot_score&page=1')
        elapsed = time.monotonic() - start

        assert response.status_code == 200
        assert elapsed < django_settings.RANKING_FEED_E2E_SLA_SECONDS, (
            f"Anonymous feed took {elapsed:.3f}s -- exceeds the "
            f"{django_settings.RANKING_FEED_E2E_SLA_SECONDS}s NFR-19a SLA."
        )


# ---------------------------------------------------------------------------
# NFR-17c — Score auditability (xfail — no audit log implemented)
# ---------------------------------------------------------------------------

@pytest.mark.django_db
@pytest.mark.integration
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
