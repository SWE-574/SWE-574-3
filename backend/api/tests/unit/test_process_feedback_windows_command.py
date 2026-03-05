"""Unit tests for process_feedback_windows management command."""

from datetime import timedelta

import pytest
from django.core.management import call_command
from django.utils import timezone

from api.models import Handshake, Notification
from api.tests.helpers.factories import HandshakeFactory, ServiceFactory, UserFactory


@pytest.mark.django_db
@pytest.mark.unit
class TestProcessFeedbackWindowsCommand:
    def test_creates_organizer_score_notification_once(self):
        organizer = UserFactory(first_name='Organizer')
        service = ServiceFactory(
            user=organizer,
            type='Event',
            status='Completed',
            event_completed_at=timezone.now() - timedelta(hours=50),
            max_participants=5,
        )
        handshake = HandshakeFactory(
            service=service,
            requester=UserFactory(),
            status='attended',
            provisioned_hours=0,
            evaluation_window_starts_at=timezone.now() - timedelta(hours=50),
            evaluation_window_ends_at=timezone.now() - timedelta(minutes=10),
            evaluation_window_closed_at=None,
        )

        call_command('process_feedback_windows', batch_size=50)
        handshake.refresh_from_db()
        assert handshake.evaluation_window_closed_at is not None

        assert Notification.objects.filter(
            user=organizer,
            related_service=service,
            type='positive_rep',
            title='Event Feedback Window Closed',
        ).count() == 1

        # Running the command again should not duplicate the organizer alert.
        call_command('process_feedback_windows', batch_size=50)
        assert Notification.objects.filter(
            user=organizer,
            related_service=service,
            type='positive_rep',
            title='Event Feedback Window Closed',
        ).count() == 1
