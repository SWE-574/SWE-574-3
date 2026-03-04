"""
Unit tests for EventHandshakeService lifecycle.

Covers: join, leave, check-in, complete (with no-show escalation & banning),
        and cancel (with organizer lockdown ban).
"""
import pytest
from decimal import Decimal
from datetime import timedelta

from django.utils import timezone

from api.models import Handshake, Service
from api.services import EventHandshakeService
from api.tests.helpers.factories import ServiceFactory, UserFactory, HandshakeFactory


# ─── Helpers ───────────────────────────────────────────────────────────────────

def _event_service(organizer=None, *, max_participants=10, hours_until_start=48):
    """Create an active Event with a future scheduled_time."""
    return ServiceFactory(
        user=organizer or UserFactory(),
        type='Event',
        status='Active',
        max_participants=max_participants,
        schedule_type='One-Time',
        scheduled_time=timezone.now() + timedelta(hours=hours_until_start),
        duration=Decimal('1.00'),
    )


# ─── join_event ────────────────────────────────────────────────────────────────

@pytest.mark.django_db
@pytest.mark.unit
class TestJoinEvent:

    def test_join_creates_accepted_handshake(self):
        service = _event_service()
        user = UserFactory()
        hs = EventHandshakeService.join_event(service, user)
        assert hs.status == 'accepted'
        assert hs.provisioned_hours == Decimal('0')
        assert hs.requester_id == user.pk

    def test_join_own_event_raises(self):
        organizer = UserFactory()
        service = _event_service(organizer=organizer)
        with pytest.raises(ValueError, match='cannot join your own'):
            EventHandshakeService.join_event(service, organizer)

    def test_join_duplicate_raises(self):
        service = _event_service()
        user = UserFactory()
        EventHandshakeService.join_event(service, user)
        with pytest.raises(ValueError, match='already joined'):
            EventHandshakeService.join_event(service, user)

    def test_join_full_event_raises(self):
        service = _event_service(max_participants=1)
        EventHandshakeService.join_event(service, UserFactory())
        with pytest.raises(ValueError, match='full'):
            EventHandshakeService.join_event(service, UserFactory())

    def test_join_non_event_raises(self):
        service = ServiceFactory(type='Offer', status='Active')
        with pytest.raises(ValueError, match='not an event'):
            EventHandshakeService.join_event(service, UserFactory())

    def test_join_past_event_raises(self):
        service = ServiceFactory(
            type='Event', status='Active', max_participants=10,
            schedule_type='One-Time',
            scheduled_time=timezone.now() - timedelta(hours=1),
        )
        with pytest.raises(ValueError, match='already started'):
            EventHandshakeService.join_event(service, UserFactory())

    def test_banned_user_cannot_join(self):
        service = _event_service()
        user = UserFactory()
        user.is_event_banned_until = timezone.now() + timedelta(days=7)
        user.save(update_fields=['is_event_banned_until'])
        with pytest.raises(PermissionError, match='banned'):
            EventHandshakeService.join_event(service, user)


# ─── leave_event ───────────────────────────────────────────────────────────────

@pytest.mark.django_db
@pytest.mark.unit
class TestLeaveEvent:

    def test_leave_before_lockdown(self):
        service = _event_service(hours_until_start=48)
        user = UserFactory()
        hs = EventHandshakeService.join_event(service, user)
        result = EventHandshakeService.leave_event(hs, user)
        assert result.status == 'cancelled'

    def test_leave_during_lockdown_raises(self):
        service = _event_service(hours_until_start=12)  # within 24h
        user = UserFactory()
        hs = EventHandshakeService.join_event(service, user)
        with pytest.raises(ValueError, match='24 hours'):
            EventHandshakeService.leave_event(hs, user)

    def test_leave_wrong_user_raises(self):
        service = _event_service()
        user = UserFactory()
        hs = EventHandshakeService.join_event(service, user)
        with pytest.raises(PermissionError, match='Only the participant'):
            EventHandshakeService.leave_event(hs, UserFactory())


# ─── checkin ───────────────────────────────────────────────────────────────────

@pytest.mark.django_db
@pytest.mark.unit
class TestCheckin:

    def test_checkin_during_lockdown(self):
        service = _event_service(hours_until_start=12)  # within 24h
        user = UserFactory()
        hs = EventHandshakeService.join_event(service, user)
        result = EventHandshakeService.checkin(hs, user)
        assert result.status == 'checked_in'

    def test_checkin_outside_lockdown_raises(self):
        service = _event_service(hours_until_start=48)
        user = UserFactory()
        hs = EventHandshakeService.join_event(service, user)
        with pytest.raises(ValueError, match='24 hours'):
            EventHandshakeService.checkin(hs, user)

    def test_checkin_wrong_user_raises(self):
        service = _event_service(hours_until_start=12)
        user = UserFactory()
        hs = EventHandshakeService.join_event(service, user)
        with pytest.raises(PermissionError, match='Only the participant'):
            EventHandshakeService.checkin(hs, UserFactory())


# ─── complete_event ────────────────────────────────────────────────────────────

@pytest.mark.django_db
@pytest.mark.unit
class TestCompleteEvent:

    def test_complete_marks_service_completed(self):
        organizer = UserFactory()
        service = _event_service(organizer=organizer)
        EventHandshakeService.complete_event(service, organizer)
        service.refresh_from_db()
        assert service.status == 'Completed'

    def test_unchecked_participants_become_no_show(self):
        organizer = UserFactory()
        service = _event_service(organizer=organizer)
        user = UserFactory()
        hs = EventHandshakeService.join_event(service, user)

        EventHandshakeService.complete_event(service, organizer)
        hs.refresh_from_db()
        assert hs.status == 'no_show'

    def test_checked_in_participants_remain(self):
        organizer = UserFactory()
        service = _event_service(organizer=organizer, hours_until_start=12)
        user = UserFactory()
        hs = EventHandshakeService.join_event(service, user)
        EventHandshakeService.checkin(hs, user)

        EventHandshakeService.complete_event(service, organizer)
        hs.refresh_from_db()
        assert hs.status == 'checked_in'

    def test_three_no_shows_triggers_ban(self):
        """After 3 cumulative no-shows the user gets a 14-day event ban."""
        organizer = UserFactory()
        user = UserFactory()

        for _ in range(3):
            svc = _event_service(organizer=organizer)
            EventHandshakeService.join_event(svc, user)
            EventHandshakeService.complete_event(svc, organizer)

        user.refresh_from_db()
        assert user.no_show_count >= 3
        assert user.is_event_banned_until is not None
        assert user.is_event_banned_until > timezone.now()

    def test_no_show_count_increments(self):
        organizer = UserFactory()
        user = UserFactory()
        service = _event_service(organizer=organizer)
        EventHandshakeService.join_event(service, user)

        EventHandshakeService.complete_event(service, organizer)
        user.refresh_from_db()
        assert user.no_show_count == 1

    def test_no_show_updated_at_is_set(self):
        """Bulk update of handshakes must update the updated_at timestamp."""
        organizer = UserFactory()
        service = _event_service(organizer=organizer)
        user = UserFactory()
        hs = EventHandshakeService.join_event(service, user)
        old_ts = hs.updated_at

        EventHandshakeService.complete_event(service, organizer)
        hs.refresh_from_db()
        assert hs.updated_at >= old_ts

    def test_complete_by_non_organizer_raises(self):
        organizer = UserFactory()
        service = _event_service(organizer=organizer)
        with pytest.raises(PermissionError, match='organizer'):
            EventHandshakeService.complete_event(service, UserFactory())

    def test_complete_non_event_raises(self):
        service = ServiceFactory(type='Offer', status='Active')
        with pytest.raises(ValueError, match='not an event'):
            EventHandshakeService.complete_event(service, service.user)


# ─── cancel_event ──────────────────────────────────────────────────────────────

@pytest.mark.django_db
@pytest.mark.unit
class TestCancelEvent:

    def test_cancel_marks_service_cancelled(self):
        organizer = UserFactory()
        service = _event_service(organizer=organizer)
        EventHandshakeService.cancel_event(service, organizer)
        service.refresh_from_db()
        assert service.status == 'Cancelled'

    def test_cancel_cancels_participant_handshakes(self):
        organizer = UserFactory()
        service = _event_service(organizer=organizer)
        user = UserFactory()
        hs = EventHandshakeService.join_event(service, user)

        EventHandshakeService.cancel_event(service, organizer)
        hs.refresh_from_db()
        assert hs.status == 'cancelled'

    def test_cancel_updated_at_is_set(self):
        """Bulk cancellation must update the updated_at timestamp."""
        organizer = UserFactory()
        service = _event_service(organizer=organizer)
        user = UserFactory()
        hs = EventHandshakeService.join_event(service, user)
        old_ts = hs.updated_at

        EventHandshakeService.cancel_event(service, organizer)
        hs.refresh_from_db()
        assert hs.updated_at >= old_ts

    def test_cancel_in_lockdown_with_participants_bans_organizer(self):
        organizer = UserFactory()
        service = _event_service(organizer=organizer, hours_until_start=12)
        EventHandshakeService.join_event(service, UserFactory())

        EventHandshakeService.cancel_event(service, organizer)
        organizer.refresh_from_db()
        assert organizer.is_organizer_banned_until is not None
        assert organizer.is_organizer_banned_until > timezone.now()

    def test_cancel_outside_lockdown_no_ban(self):
        organizer = UserFactory()
        service = _event_service(organizer=organizer, hours_until_start=48)
        EventHandshakeService.join_event(service, UserFactory())

        EventHandshakeService.cancel_event(service, organizer)
        organizer.refresh_from_db()
        assert organizer.is_organizer_banned_until is None

    def test_cancel_in_lockdown_without_participants_no_ban(self):
        organizer = UserFactory()
        service = _event_service(organizer=organizer, hours_until_start=12)

        EventHandshakeService.cancel_event(service, organizer)
        organizer.refresh_from_db()
        assert organizer.is_organizer_banned_until is None

    def test_cancel_by_non_organizer_raises(self):
        organizer = UserFactory()
        service = _event_service(organizer=organizer)
        with pytest.raises(PermissionError, match='organizer'):
            EventHandshakeService.cancel_event(service, UserFactory())

    def test_cancel_non_event_raises(self):
        service = ServiceFactory(type='Offer', status='Active')
        with pytest.raises(ValueError, match='not an event'):
            EventHandshakeService.cancel_event(service, service.user)
