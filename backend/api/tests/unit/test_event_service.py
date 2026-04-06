"""
Unit tests for EventHandshakeService lifecycle.

Covers: join, leave, check-in, complete (with no-show escalation & banning),
        and cancel (with organizer lockdown ban).
"""
import pytest
from decimal import Decimal
from datetime import timedelta

from django.utils import timezone

from api.models import Handshake, Notification, Service
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

    def test_checkin_after_event_start_raises(self):
        service = _event_service(hours_until_start=-1)
        user = UserFactory()
        hs = HandshakeFactory(service=service, requester=user, status='accepted')
        with pytest.raises(ValueError, match='no longer available'):
            EventHandshakeService.checkin(hs, user)


# ─── mark_attended ────────────────────────────────────────────────────────────

@pytest.mark.django_db
@pytest.mark.unit
class TestMarkAttended:

    def test_organizer_can_mark_checked_in_as_attended(self):
        organizer = UserFactory()
        service = _event_service(organizer=organizer, hours_until_start=12)
        participant = UserFactory()
        hs = EventHandshakeService.join_event(service, participant)
        EventHandshakeService.checkin(hs, participant)

        result = EventHandshakeService.mark_attended(hs, organizer)
        assert result.status == 'attended'

    def test_non_organizer_cannot_mark_attended(self):
        organizer = UserFactory()
        service = _event_service(organizer=organizer, hours_until_start=12)
        participant = UserFactory()
        hs = EventHandshakeService.join_event(service, participant)
        EventHandshakeService.checkin(hs, participant)

        with pytest.raises(PermissionError, match='organizer'):
            EventHandshakeService.mark_attended(hs, UserFactory())

    def test_only_checked_in_can_be_marked_attended(self):
        organizer = UserFactory()
        service = _event_service(organizer=organizer, hours_until_start=12)
        participant = UserFactory()
        hs = EventHandshakeService.join_event(service, participant)

        with pytest.raises(ValueError, match='Cannot mark attended'):
            EventHandshakeService.mark_attended(hs, organizer)


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

    def test_checked_in_participants_become_no_show(self):
        organizer = UserFactory()
        service = _event_service(organizer=organizer, hours_until_start=12)
        user = UserFactory()
        hs = EventHandshakeService.join_event(service, user)
        EventHandshakeService.checkin(hs, user)

        EventHandshakeService.complete_event(service, organizer)
        hs.refresh_from_db()
        assert hs.status == 'no_show'

    def test_attended_participants_remain_attended(self):
        organizer = UserFactory()
        service = _event_service(organizer=organizer, hours_until_start=12)
        user = UserFactory()
        hs = EventHandshakeService.join_event(service, user)
        EventHandshakeService.checkin(hs, user)
        EventHandshakeService.mark_attended(hs, organizer)

        EventHandshakeService.complete_event(service, organizer)
        hs.refresh_from_db()
        assert hs.status == 'attended'

    def test_complete_event_prompts_attended_participants_for_feedback(self):
        organizer = UserFactory(first_name='Host')
        service = _event_service(organizer=organizer, hours_until_start=12)

        attended_user = UserFactory()
        attended_hs = EventHandshakeService.join_event(service, attended_user)
        EventHandshakeService.checkin(attended_hs, attended_user)
        EventHandshakeService.mark_attended(attended_hs, organizer)

        no_show_user = UserFactory()
        EventHandshakeService.join_event(service, no_show_user)

        EventHandshakeService.complete_event(service, organizer)

        assert Notification.objects.filter(
            user=attended_user,
            type='positive_rep',
            title='Leave Feedback',
            related_service=service,
            related_handshake=attended_hs,
        ).exists()
        assert not Notification.objects.filter(
            user=no_show_user,
            type='positive_rep',
            title='Leave Feedback',
            related_service=service,
        ).exists()

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


# ─── FR-19i: QR + GPS dual-factor check-in (xfail — not yet implemented) ──────

try:
    from api.services import EventHandshakeService as _EHS_qr
    _qr_checkin = getattr(_EHS_qr, 'checkin_with_qr', None)
    _gps_checkin = getattr(_EHS_qr, 'checkin_with_proximity', None)
except ImportError:
    _qr_checkin = None
    _gps_checkin = None


@pytest.mark.django_db
@pytest.mark.unit
@pytest.mark.xfail(
    reason="FR-19i: QR token validation not yet implemented in EventHandshakeService",
    strict=False,
)
class TestCheckinQRValidation:
    """
    FR-19i requires a valid QR token as the first factor of attendance verification.

    These tests are xfail because:
    - No QR token is generated when a handshake is accepted.
    - EventHandshakeService has no checkin_with_qr() method.
    - The check-in endpoint does not validate any token.
    """

    def setUp(self):
        if _qr_checkin is None:
            pytest.xfail("checkin_with_qr not yet implemented — FR-19i")

    def test_checkin_with_valid_qr_token_succeeds(self):
        """Valid QR token issued for the handshake should allow check-in."""
        organizer = UserFactory()
        service = _event_service(organizer=organizer, hours_until_start=12)
        participant = UserFactory()
        hs = EventHandshakeService.join_event(service, participant)

        # The token should have been generated when the handshake was accepted
        assert hasattr(hs, 'qr_token') and hs.qr_token, "No QR token generated on accepted handshake."
        result = _qr_checkin(hs, participant, qr_token=hs.qr_token)
        assert result.status == 'checked_in'

    def test_checkin_with_invalid_qr_token_raises(self):
        """An incorrect QR token must be rejected."""
        organizer = UserFactory()
        service = _event_service(organizer=organizer, hours_until_start=12)
        participant = UserFactory()
        hs = EventHandshakeService.join_event(service, participant)

        with pytest.raises((ValueError, PermissionError), match='[Ii]nvalid.*[Tt]oken|[Qq][Rr]'):
            _qr_checkin(hs, participant, qr_token='bad-token-value')

    def test_qr_token_is_single_use(self):
        """Using the same QR token twice must fail on the second attempt."""
        organizer = UserFactory()
        service = _event_service(organizer=organizer, hours_until_start=12)
        p1 = UserFactory()
        p2 = UserFactory()
        hs1 = EventHandshakeService.join_event(service, p1)
        hs2 = EventHandshakeService.join_event(service, p2)

        _qr_checkin(hs1, p1, qr_token=hs1.qr_token)

        # Reusing hs1's token for a different handshake must fail
        with pytest.raises((ValueError, PermissionError)):
            _qr_checkin(hs2, p2, qr_token=hs1.qr_token)

    def test_qr_token_belongs_to_correct_handshake(self):
        """A token generated for one handshake cannot be used for a different participant."""
        organizer = UserFactory()
        service = _event_service(organizer=organizer, hours_until_start=12)
        p1 = UserFactory()
        p2 = UserFactory()
        hs1 = EventHandshakeService.join_event(service, p1)
        hs2 = EventHandshakeService.join_event(service, p2)

        with pytest.raises((ValueError, PermissionError)):
            _qr_checkin(hs2, p2, qr_token=hs1.qr_token)


@pytest.mark.django_db
@pytest.mark.unit
@pytest.mark.xfail(
    reason="FR-19i: GPS proximity check not yet implemented in EventHandshakeService",
    strict=False,
)
class TestCheckinGPSProximity:
    """
    FR-19i requires the check-in request to include GPS coordinates that are within
    100m of the event's real location. Online events skip the GPS check.

    These tests are xfail because no proximity validation exists in the codebase.
    """

    def setUp(self):
        if _gps_checkin is None:
            pytest.xfail("checkin_with_proximity not yet implemented — FR-19i")

    def test_checkin_within_100m_succeeds(self):
        """GPS coordinates within 100m of the event location should pass the proximity check."""
        organizer = UserFactory()
        service = ServiceFactory(
            user=organizer, type='Event', status='Active',
            max_participants=10, schedule_type='One-Time',
            scheduled_time=timezone.now() + timedelta(hours=12),
            duration=Decimal('1.00'),
            location_type='In-Person',
            location_lat=Decimal('41.012345'),
            location_lng=Decimal('28.974321'),
        )
        participant = UserFactory()
        hs = EventHandshakeService.join_event(service, participant)

        # Coordinates ~50m away (well within 100m)
        result = _gps_checkin(hs, participant, lat=41.012345, lng=28.974800)
        assert result.status == 'checked_in'

    def test_checkin_beyond_100m_raises(self):
        """GPS coordinates more than 100m from the event location must be rejected."""
        organizer = UserFactory()
        service = ServiceFactory(
            user=organizer, type='Event', status='Active',
            max_participants=10, schedule_type='One-Time',
            scheduled_time=timezone.now() + timedelta(hours=12),
            duration=Decimal('1.00'),
            location_type='In-Person',
            location_lat=Decimal('41.012345'),
            location_lng=Decimal('28.974321'),
        )
        participant = UserFactory()
        hs = EventHandshakeService.join_event(service, participant)

        # Coordinates ~2km away
        with pytest.raises((ValueError, PermissionError), match='[Pp]roximity|[Dd]istance|[Ll]ocation'):
            _gps_checkin(hs, participant, lat=41.030000, lng=28.974321)

    def test_online_event_skips_proximity_check(self):
        """Online events should not require GPS coordinates for check-in."""
        organizer = UserFactory()
        service = ServiceFactory(
            user=organizer, type='Event', status='Active',
            max_participants=10, schedule_type='One-Time',
            scheduled_time=timezone.now() + timedelta(hours=12),
            duration=Decimal('1.00'),
            location_type='Online',
            location_lat=None,
            location_lng=None,
        )
        participant = UserFactory()
        hs = EventHandshakeService.join_event(service, participant)

        # No GPS required for online events
        result = _gps_checkin(hs, participant, lat=None, lng=None)
        assert result.status == 'checked_in'

    def test_missing_gps_coordinates_for_inperson_event_raises(self):
        """Submitting no GPS for an in-person event must be rejected."""
        organizer = UserFactory()
        service = ServiceFactory(
            user=organizer, type='Event', status='Active',
            max_participants=10, schedule_type='One-Time',
            scheduled_time=timezone.now() + timedelta(hours=12),
            duration=Decimal('1.00'),
            location_type='In-Person',
            location_lat=Decimal('41.012345'),
            location_lng=Decimal('28.974321'),
        )
        participant = UserFactory()
        hs = EventHandshakeService.join_event(service, participant)

        with pytest.raises((ValueError, TypeError)):
            _gps_checkin(hs, participant, lat=None, lng=None)
