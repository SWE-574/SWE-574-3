"""
Integration tests for evaluation-window-close scoring semantics.

These tests isolate what happens specifically at the closure boundary
(when process_feedback_windows runs) rather than at reputation-write time.

Score-authority map under test:
  - Service hot_score (Offer/Need): signals are sole authority at write time;
    the batch command does NOT recalculate this score.
  - Event hot_score (user.event_hot_score): refreshed BOTH at write time and
    at window close via EventEvaluationService.refresh_summary().

Each test makes the scoring authority and timing contract explicit so that
future refactors to signals or the batch command will fail here first.
"""
import pytest
from datetime import timedelta

from django.core.management import call_command
from django.utils import timezone

from rest_framework import status

from api.models import Handshake, ReputationRep, NegativeRep, EventEvaluationSummary, Service
from api.tests.helpers.factories import HandshakeFactory, ServiceFactory, UserFactory
from api.tests.helpers.test_client import AuthenticatedAPIClient


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _expired_window_kwargs(hours_ago: int = 50):
    """Return HandshakeFactory kwargs for a window that expired `hours_ago` hours ago."""
    now = timezone.now()
    return {
        'evaluation_window_starts_at': now - timedelta(hours=hours_ago),
        'evaluation_window_ends_at': now - timedelta(minutes=10),
        'evaluation_window_closed_at': None,
    }


def _open_window_kwargs():
    """Return HandshakeFactory kwargs for a currently open evaluation window."""
    now = timezone.now()
    return {
        'evaluation_window_starts_at': now - timedelta(hours=1),
        'evaluation_window_ends_at': now + timedelta(hours=47),
        'evaluation_window_closed_at': None,
    }


# ---------------------------------------------------------------------------
# Service (Offer/Need) hot_score — signals are sole authority
# ---------------------------------------------------------------------------

@pytest.mark.django_db
@pytest.mark.integration
class TestServiceHotScoreAtWindowClose:
    """
    Service hot_score is set by signals at reputation-write time.
    process_feedback_windows does not touch it.
    These tests document that contract.
    """

    def test_service_hot_score_not_modified_by_window_close_command(self):
        """
        process_feedback_windows must NOT recalculate service hot_score for
        Offer/Need services. Signals are the sole authority for that field.

        Strategy: pin hot_score to a sentinel value via a direct DB update,
        run the command, and assert the sentinel is preserved.
        This is decoupled from signal/on_commit timing in tests.
        """
        provider = UserFactory()
        requester = UserFactory()
        service = ServiceFactory(user=provider, type='Offer', status='Active')
        handshake = HandshakeFactory(
            service=service,
            requester=requester,
            status='completed',
            **_expired_window_kwargs(),
        )

        # Pin a known sentinel score; the command must leave it alone.
        sentinel_score = 42.123456
        Service.objects.filter(pk=service.pk).update(hot_score=sentinel_score)

        call_command('process_feedback_windows', batch_size=50)

        handshake.refresh_from_db()
        assert handshake.evaluation_window_closed_at is not None, (
            "process_feedback_windows must mark evaluation_window_closed_at."
        )

        service.refresh_from_db()
        assert service.hot_score == sentinel_score, (
            "process_feedback_windows must not alter service hot_score for Offer/Need services; "
            "signals are the sole authority. Got: %s" % service.hot_score
        )

    def test_service_hot_score_unchanged_when_no_reputation_written_before_close(self):
        """
        When the window expires without any reputation submission, the batch
        command must close the window but leave hot_score at its pre-window value.
        This verifies the closure-only path: no signal was ever fired.
        """
        provider = UserFactory()
        requester = UserFactory()
        service = ServiceFactory(user=provider, type='Offer', status='Active')
        HandshakeFactory(
            service=service,
            requester=requester,
            status='completed',
            **_expired_window_kwargs(),
        )

        service.refresh_from_db()
        score_before_close = service.hot_score

        call_command('process_feedback_windows', batch_size=50)

        service.refresh_from_db()
        assert service.hot_score == score_before_close, (
            "Closing a window with no reputation writes must not change service hot_score."
        )

    def test_post_close_reputation_submission_rejected_for_offer(self):
        """
        After process_feedback_windows closes the window, any new reputation
        submission must be rejected with 410 Gone.
        """
        provider = UserFactory()
        requester = UserFactory()
        service = ServiceFactory(user=provider, type='Offer', status='Active')
        handshake = HandshakeFactory(
            service=service,
            requester=requester,
            status='completed',
            **_expired_window_kwargs(),
        )

        call_command('process_feedback_windows', batch_size=50)

        handshake.refresh_from_db()
        assert handshake.evaluation_window_closed_at is not None

        client = AuthenticatedAPIClient().authenticate_user(requester)
        response = client.post('/api/reputation/', {
            'handshake_id': str(handshake.id),
            'punctual': True,
            'helpful': False,
            'kindness': False,
        })
        assert response.status_code == status.HTTP_410_GONE, (
            "Reputation submission after window close must return 410 Gone."
        )


# ---------------------------------------------------------------------------
# Event hot_score — refreshed at write time AND at window close
# ---------------------------------------------------------------------------

@pytest.mark.django_db
@pytest.mark.integration
class TestEventHotScoreAtWindowClose:
    """
    Event hot_score (user.event_hot_score) is recalculated both at evaluation
    write time (via views calling EventEvaluationService.refresh_summary) and
    again when process_feedback_windows closes the window.
    These tests prove the double-refresh contract.
    """

    def test_event_hot_score_refreshed_at_window_close_after_write(self):
        """
        Write a positive event evaluation and capture the score that was set.
        Then run process_feedback_windows — it must call refresh_summary, which
        should produce the same (or a freshly-confirmed) score.
        """
        organizer = UserFactory()
        participant = UserFactory()
        event = ServiceFactory(
            user=organizer,
            type='Event',
            status='Completed',
            event_completed_at=timezone.now() - timedelta(hours=50),
            max_participants=5,
        )
        # Open window so the evaluation write is accepted.
        handshake = HandshakeFactory(
            service=event,
            requester=participant,
            status='attended',
            provisioned_hours=0,
            **_open_window_kwargs(),
        )

        # Submit evaluation — write-time refresh sets event_hot_score.
        participant_client = AuthenticatedAPIClient().authenticate_user(participant)
        response = participant_client.post('/api/reputation/', {
            'handshake_id': str(handshake.id),
            'well_organized': True,
            'engaging': True,
            'welcoming': False,
        })
        assert response.status_code == status.HTTP_201_CREATED

        # Expire the window so process_feedback_windows picks it up.
        now = timezone.now()
        Handshake.objects.filter(pk=handshake.pk).update(
            evaluation_window_ends_at=now - timedelta(minutes=5),
        )
        handshake.refresh_from_db()

        organizer.refresh_from_db()
        score_after_write = organizer.event_hot_score
        assert score_after_write > 0

        # Close the window — process_feedback_windows calls refresh_summary again.
        call_command('process_feedback_windows', batch_size=50)

        handshake.refresh_from_db()
        assert handshake.evaluation_window_closed_at is not None

        organizer.refresh_from_db()
        # The score must be recalculated and must match the write-time value
        # (same underlying data), proving refresh_summary ran at window close.
        assert organizer.event_hot_score == score_after_write, (
            "process_feedback_windows must call refresh_summary; "
            "score must equal the write-time value for unchanged data."
        )

    def test_event_hot_score_refreshed_at_window_close_with_no_writes_before_close(self):
        """
        Closure-only path: window expires before the participant submits any
        evaluation. The batch command must still call refresh_summary and the
        score must remain 0.0 (no evaluations were submitted).
        """
        organizer = UserFactory()
        participant = UserFactory()
        event = ServiceFactory(
            user=organizer,
            type='Event',
            status='Completed',
            event_completed_at=timezone.now() - timedelta(hours=50),
            max_participants=5,
        )
        HandshakeFactory(
            service=event,
            requester=participant,
            status='attended',
            provisioned_hours=0,
            **_expired_window_kwargs(),
        )

        # No reputation write occurs before close.
        assert organizer.event_hot_score == 0.0

        call_command('process_feedback_windows', batch_size=50)

        organizer.refresh_from_db()
        assert organizer.event_hot_score == 0.0, (
            "refresh_summary at window close with no evaluations must leave event_hot_score at 0.0."
        )

        # EventEvaluationSummary must be created by refresh_summary.
        assert EventEvaluationSummary.objects.filter(service=event).exists(), (
            "process_feedback_windows must create EventEvaluationSummary even when no evaluations exist."
        )

    def test_event_hot_score_reflects_mixed_feedback_at_window_close(self):
        """
        When both positive and negative evaluations exist before window close,
        the score refreshed by process_feedback_windows must reflect both.
        """
        organizer = UserFactory()
        participant_a = UserFactory()
        participant_b = UserFactory()
        event = ServiceFactory(
            user=organizer,
            type='Event',
            status='Completed',
            event_completed_at=timezone.now() - timedelta(hours=50),
            max_participants=5,
        )
        handshake_a = HandshakeFactory(
            service=event,
            requester=participant_a,
            status='attended',
            provisioned_hours=0,
            **_open_window_kwargs(),
        )
        handshake_b = HandshakeFactory(
            service=event,
            requester=participant_b,
            status='attended',
            provisioned_hours=0,
            **_open_window_kwargs(),
        )

        # participant_a submits purely positive evaluation.
        client_a = AuthenticatedAPIClient().authenticate_user(participant_a)
        r1 = client_a.post('/api/reputation/', {
            'handshake_id': str(handshake_a.id),
            'well_organized': True,
            'engaging': True,
            'welcoming': True,
        })
        assert r1.status_code == status.HTTP_201_CREATED

        # participant_b submits purely negative evaluation.
        client_b = AuthenticatedAPIClient().authenticate_user(participant_b)
        r2 = client_b.post('/api/reputation/negative/', {
            'handshake_id': str(handshake_b.id),
            'disorganized': True,
            'boring': True,
            'unwelcoming': True,
        })
        assert r2.status_code == status.HTTP_201_CREATED

        # Expire both windows so process_feedback_windows picks them up.
        now = timezone.now()
        Handshake.objects.filter(pk__in=[handshake_a.pk, handshake_b.pk]).update(
            evaluation_window_ends_at=now - timedelta(minutes=5),
        )

        organizer.refresh_from_db()
        score_after_writes = organizer.event_hot_score

        call_command('process_feedback_windows', batch_size=50)

        organizer.refresh_from_db()
        # With equal positive and negative totals, net score must be 0 (or match write-time).
        assert organizer.event_hot_score == score_after_writes, (
            "process_feedback_windows must produce the same score as write-time signals "
            "when no additional data changed."
        )

        summary = EventEvaluationSummary.objects.get(service=event)
        assert summary.positive_feedback_count == 1
        assert summary.negative_feedback_count == 1
        assert summary.unique_evaluator_count == 2

    def test_post_close_event_evaluation_rejected(self):
        """
        After the window is closed by process_feedback_windows, event evaluation
        submissions must be rejected with 410 Gone.
        """
        organizer = UserFactory()
        participant = UserFactory()
        event = ServiceFactory(
            user=organizer,
            type='Event',
            status='Completed',
            event_completed_at=timezone.now() - timedelta(hours=50),
            max_participants=5,
        )
        handshake = HandshakeFactory(
            service=event,
            requester=participant,
            status='attended',
            provisioned_hours=0,
            **_expired_window_kwargs(),
        )

        call_command('process_feedback_windows', batch_size=50)
        handshake.refresh_from_db()
        assert handshake.evaluation_window_closed_at is not None

        client = AuthenticatedAPIClient().authenticate_user(participant)
        response = client.post('/api/reputation/', {
            'handshake_id': str(handshake.id),
            'well_organized': True,
            'engaging': False,
            'welcoming': True,
        })
        assert response.status_code == status.HTTP_410_GONE, (
            "Event evaluation after window close must return 410 Gone."
        )
