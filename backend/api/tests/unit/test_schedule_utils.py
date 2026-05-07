"""
Unit tests for schedule_utils.py
Tests _user_scheduled_intervals, find_overlapping_pairs, and check_schedule_conflict.
"""
import pytest
from decimal import Decimal
from datetime import timedelta
from django.utils import timezone

from api.tests.helpers.factories import UserFactory, ServiceFactory, HandshakeFactory
from api.models import Service, Handshake
from api.schedule_utils import (
    _user_scheduled_intervals,
    find_overlapping_pairs,
    check_schedule_conflict,
    ScheduledInterval,
)


def _make_window(hours_ahead=0, span_hours=24):
    """Return (window_start, window_end) spanning span_hours from hours_ahead."""
    now = timezone.now()
    start = now + timedelta(hours=hours_ahead)
    end = start + timedelta(hours=span_hours)
    return start, end


@pytest.mark.django_db
@pytest.mark.unit
class TestUserScheduledIntervals:
    """Tests for _user_scheduled_intervals generator."""

    def test_returns_handshake_as_provider(self):
        provider = UserFactory()
        service = ServiceFactory(user=provider, type='Offer', duration=Decimal('2.00'))
        requester = UserFactory()
        scheduled = timezone.now() + timedelta(hours=2)
        HandshakeFactory(
            service=service,
            requester=requester,
            status='accepted',
            scheduled_time=scheduled,
            exact_duration=Decimal('2.00'),
        )
        w_start, w_end = _make_window(hours_ahead=0, span_hours=10)
        intervals = list(_user_scheduled_intervals(provider, w_start, w_end))
        assert len(intervals) == 1
        iv = intervals[0]
        assert iv.source_kind == 'handshake'
        assert iv.kind == 'service_session'

    def test_returns_handshake_as_requester(self):
        provider = UserFactory()
        service = ServiceFactory(user=provider, type='Offer', duration=Decimal('2.00'))
        requester = UserFactory()
        scheduled = timezone.now() + timedelta(hours=2)
        HandshakeFactory(
            service=service,
            requester=requester,
            status='accepted',
            scheduled_time=scheduled,
            exact_duration=Decimal('2.00'),
        )
        w_start, w_end = _make_window(hours_ahead=0, span_hours=10)
        intervals = list(_user_scheduled_intervals(requester, w_start, w_end))
        assert len(intervals) == 1
        assert intervals[0].source_kind == 'handshake'

    def test_returns_organized_event_handshake(self):
        organizer = UserFactory()
        service = ServiceFactory(user=organizer, type='Event', duration=Decimal('3.00'))
        participant = UserFactory()
        scheduled = timezone.now() + timedelta(hours=4)
        HandshakeFactory(
            service=service,
            requester=participant,
            status='accepted',
            scheduled_time=scheduled,
            provisioned_hours=Decimal('0.00'),
        )
        w_start, w_end = _make_window(hours_ahead=0, span_hours=10)
        # organizer gets event_organized
        intervals = list(_user_scheduled_intervals(organizer, w_start, w_end))
        handshake_ivs = [iv for iv in intervals if iv.source_kind == 'handshake']
        assert any(iv.kind == 'event_organized' for iv in handshake_ivs)
        # duration must fall back to service.duration, not zero
        event_iv = next(iv for iv in handshake_ivs if iv.kind == 'event_organized')
        assert event_iv.end - event_iv.start == timedelta(hours=float(service.duration))

    def test_returns_joined_event_handshake(self):
        organizer = UserFactory()
        service = ServiceFactory(user=organizer, type='Event', duration=Decimal('2.00'))
        participant = UserFactory()
        scheduled = timezone.now() + timedelta(hours=4)
        HandshakeFactory(
            service=service,
            requester=participant,
            status='accepted',
            scheduled_time=scheduled,
            provisioned_hours=Decimal('0.00'),
        )
        w_start, w_end = _make_window(hours_ahead=0, span_hours=10)
        intervals = list(_user_scheduled_intervals(participant, w_start, w_end))
        assert any(iv.kind == 'event_joined' for iv in intervals)
        # duration must fall back to service.duration, not zero
        event_iv = next(iv for iv in intervals if iv.kind == 'event_joined')
        assert event_iv.end - event_iv.start == timedelta(hours=float(service.duration))

    def test_returns_fixed_date_offer(self):
        owner = UserFactory()
        scheduled = timezone.now() + timedelta(hours=3)
        ServiceFactory(
            user=owner,
            type='Offer',
            duration=Decimal('1.00'),
            scheduled_time=scheduled,
            status='Active',
        )
        w_start, w_end = _make_window(hours_ahead=0, span_hours=10)
        intervals = list(_user_scheduled_intervals(owner, w_start, w_end))
        svc_ivs = [iv for iv in intervals if iv.source_kind == 'service']
        assert any(iv.kind == 'scheduled_commitment' for iv in svc_ivs)

    def test_returns_fixed_date_need(self):
        owner = UserFactory()
        scheduled = timezone.now() + timedelta(hours=3)
        ServiceFactory(
            user=owner,
            type='Need',
            duration=Decimal('1.00'),
            scheduled_time=scheduled,
            status='Active',
        )
        w_start, w_end = _make_window(hours_ahead=0, span_hours=10)
        intervals = list(_user_scheduled_intervals(owner, w_start, w_end))
        svc_ivs = [iv for iv in intervals if iv.source_kind == 'service']
        assert any(iv.kind == 'scheduled_commitment' for iv in svc_ivs)

    def test_excludes_completed_handshake(self):
        provider = UserFactory()
        service = ServiceFactory(user=provider, type='Offer', duration=Decimal('2.00'))
        requester = UserFactory()
        scheduled = timezone.now() + timedelta(hours=2)
        HandshakeFactory(
            service=service,
            requester=requester,
            status='completed',
            scheduled_time=scheduled,
        )
        w_start, w_end = _make_window(hours_ahead=0, span_hours=10)
        intervals = list(_user_scheduled_intervals(provider, w_start, w_end))
        handshake_ivs = [iv for iv in intervals if iv.source_kind == 'handshake']
        assert len(handshake_ivs) == 0

    def test_excludes_cancelled_handshake(self):
        provider = UserFactory()
        service = ServiceFactory(user=provider, type='Offer', duration=Decimal('2.00'))
        requester = UserFactory()
        scheduled = timezone.now() + timedelta(hours=2)
        HandshakeFactory(
            service=service,
            requester=requester,
            status='cancelled',
            scheduled_time=scheduled,
        )
        w_start, w_end = _make_window(hours_ahead=0, span_hours=10)
        intervals = list(_user_scheduled_intervals(provider, w_start, w_end))
        handshake_ivs = [iv for iv in intervals if iv.source_kind == 'handshake']
        assert len(handshake_ivs) == 0

    def test_excludes_denied_handshake(self):
        provider = UserFactory()
        service = ServiceFactory(user=provider, type='Offer', duration=Decimal('2.00'))
        requester = UserFactory()
        scheduled = timezone.now() + timedelta(hours=2)
        HandshakeFactory(
            service=service,
            requester=requester,
            status='denied',
            scheduled_time=scheduled,
        )
        w_start, w_end = _make_window(hours_ahead=0, span_hours=10)
        intervals = list(_user_scheduled_intervals(provider, w_start, w_end))
        handshake_ivs = [iv for iv in intervals if iv.source_kind == 'handshake']
        assert len(handshake_ivs) == 0

    def test_excludes_pending_handshake(self):
        """Only accepted/checked_in/attended are included."""
        provider = UserFactory()
        service = ServiceFactory(user=provider, type='Offer', duration=Decimal('2.00'))
        requester = UserFactory()
        scheduled = timezone.now() + timedelta(hours=2)
        HandshakeFactory(
            service=service,
            requester=requester,
            status='pending',
            scheduled_time=scheduled,
        )
        w_start, w_end = _make_window(hours_ahead=0, span_hours=10)
        intervals = list(_user_scheduled_intervals(provider, w_start, w_end))
        handshake_ivs = [iv for iv in intervals if iv.source_kind == 'handshake']
        assert len(handshake_ivs) == 0

    def test_respects_exclude_handshake(self):
        provider = UserFactory()
        service = ServiceFactory(user=provider, type='Offer', duration=Decimal('2.00'))
        requester = UserFactory()
        scheduled = timezone.now() + timedelta(hours=2)
        hs = HandshakeFactory(
            service=service,
            requester=requester,
            status='accepted',
            scheduled_time=scheduled,
            exact_duration=Decimal('2.00'),
        )
        w_start, w_end = _make_window(hours_ahead=0, span_hours=10)
        intervals = list(_user_scheduled_intervals(provider, w_start, w_end, exclude_handshake=hs))
        handshake_ivs = [iv for iv in intervals if iv.source_kind == 'handshake']
        assert len(handshake_ivs) == 0

    def test_checked_in_status_included(self):
        provider = UserFactory()
        service = ServiceFactory(user=provider, type='Event', duration=Decimal('2.00'))
        requester = UserFactory()
        scheduled = timezone.now() + timedelta(hours=2)
        HandshakeFactory(
            service=service,
            requester=requester,
            status='checked_in',
            scheduled_time=scheduled,
            provisioned_hours=Decimal('0.00'),
        )
        w_start, w_end = _make_window(hours_ahead=0, span_hours=10)
        intervals = list(_user_scheduled_intervals(provider, w_start, w_end))
        handshake_ivs = [iv for iv in intervals if iv.source_kind == 'handshake']
        assert len(handshake_ivs) == 1

    def test_event_handshake_duration_falls_back_to_service_duration(self):
        """
        When exact_duration is None and provisioned_hours is 0 (credit-free event
        convention), the interval duration must equal service.duration rather than zero.
        """
        organizer = UserFactory()
        service = ServiceFactory(user=organizer, type='Event', duration=Decimal('4.50'))
        participant = UserFactory()
        scheduled = timezone.now() + timedelta(hours=2)
        HandshakeFactory(
            service=service,
            requester=participant,
            status='accepted',
            scheduled_time=scheduled,
            exact_duration=None,
            provisioned_hours=Decimal('0.00'),
        )
        w_start, w_end = _make_window(hours_ahead=0, span_hours=10)
        intervals = list(_user_scheduled_intervals(participant, w_start, w_end))
        handshake_ivs = [iv for iv in intervals if iv.source_kind == 'handshake']
        assert len(handshake_ivs) == 1
        iv = handshake_ivs[0]
        expected_duration = timedelta(hours=float(service.duration))
        assert iv.end - iv.start == expected_duration, (
            f"Expected duration {expected_duration}, got {iv.end - iv.start}"
        )


@pytest.mark.unit
class TestFindOverlappingPairs:
    """Tests for find_overlapping_pairs."""

    def _make_interval(self, start_offset, duration_hours, service_id='svc1', kind='service_session'):
        """Helper to build a minimal ScheduledInterval without DB."""
        from unittest.mock import MagicMock
        now = timezone.now()
        start = now + timedelta(hours=start_offset)
        end = start + timedelta(hours=duration_hours)
        mock_obj = MagicMock()
        mock_obj.id = service_id
        return ScheduledInterval(
            start=start,
            end=end,
            kind=kind,
            source_obj=mock_obj,
            source_kind='service',
            _owner_user_id=None,
        )

    def test_overlapping_same_day(self):
        a = self._make_interval(0, 2, 'svc1')
        b = self._make_interval(1, 2, 'svc2')  # starts at +1h, overlaps with a
        pairs = find_overlapping_pairs([a, b])
        ids_involved = {p['item_id'] for p in pairs}
        assert 'svc1' in ids_involved
        assert 'svc2' in ids_involved

    def test_back_to_back_not_flagged(self):
        """Items where one ends exactly as the other begins should NOT be flagged."""
        a = self._make_interval(0, 2, 'svc1')   # 0h → 2h
        b = self._make_interval(2, 2, 'svc2')   # 2h → 4h  (back-to-back)
        pairs = find_overlapping_pairs([a, b])
        assert pairs == []

    def test_nested_intervals_flagged(self):
        """A fully contained interval is an overlap."""
        outer = self._make_interval(0, 4, 'outer')  # 0h → 4h
        inner = self._make_interval(1, 1, 'inner')  # 1h → 2h  (nested)
        pairs = find_overlapping_pairs([outer, inner])
        ids_involved = {p['item_id'] for p in pairs}
        assert 'outer' in ids_involved
        assert 'inner' in ids_involved

    def test_no_overlap_disjoint(self):
        a = self._make_interval(0, 1, 'svc1')   # 0h → 1h
        b = self._make_interval(3, 1, 'svc2')   # 3h → 4h
        pairs = find_overlapping_pairs([a, b])
        assert pairs == []

    def test_single_item_no_pairs(self):
        a = self._make_interval(0, 2, 'svc1')
        pairs = find_overlapping_pairs([a])
        assert pairs == []

    def test_empty_list(self):
        assert find_overlapping_pairs([]) == []


@pytest.mark.django_db
@pytest.mark.unit
class TestCheckScheduleConflictRegression:
    """Regression tests: external return shape of check_schedule_conflict must be preserved."""

    def test_returns_empty_when_no_conflicts(self):
        user = UserFactory()
        scheduled = timezone.now() + timedelta(days=10)
        result = check_schedule_conflict(user, scheduled, 2.0)
        assert result == []

    def test_returns_empty_for_null_scheduled_time(self):
        user = UserFactory()
        result = check_schedule_conflict(user, None, 2.0)
        assert result == []

    def test_conflict_dict_shape(self):
        """Conflict dicts must have: handshake_id, service_title, scheduled_time, duration, other_user."""
        provider = UserFactory()
        service = ServiceFactory(user=provider, type='Offer', duration=Decimal('2.00'))
        requester = UserFactory()
        scheduled = timezone.now() + timedelta(hours=2)
        HandshakeFactory(
            service=service,
            requester=requester,
            status='accepted',
            scheduled_time=scheduled,
            exact_duration=Decimal('2.00'),
        )
        # Check conflict: new session overlaps with existing handshake
        conflicts = check_schedule_conflict(provider, scheduled, 2.0)
        assert len(conflicts) == 1
        c = conflicts[0]
        assert 'handshake_id' in c
        assert 'service_title' in c
        assert 'scheduled_time' in c
        assert 'duration' in c
        assert 'other_user' in c
        assert c['service_title'] == service.title
        assert c['duration'] == 2.0

    def test_exclude_handshake_skips_it(self):
        provider = UserFactory()
        service = ServiceFactory(user=provider, type='Offer', duration=Decimal('2.00'))
        requester = UserFactory()
        scheduled = timezone.now() + timedelta(hours=2)
        hs = HandshakeFactory(
            service=service,
            requester=requester,
            status='accepted',
            scheduled_time=scheduled,
            exact_duration=Decimal('2.00'),
        )
        conflicts = check_schedule_conflict(provider, scheduled, 2.0, exclude_handshake=hs)
        assert conflicts == []


@pytest.mark.django_db
@pytest.mark.unit
class TestH1LowerBoundFilter:
    """H1: DB-level lower bound on scheduled_time prevents loading unbounded history."""

    def test_old_handshake_excluded_from_future_window(self):
        """A handshake 30 days in the past must NOT appear in a [today, today+60d] window."""
        provider = UserFactory()
        service = ServiceFactory(user=provider, type='Offer', duration=Decimal('2.00'))
        requester = UserFactory()
        # scheduled_time 30 days ago — well outside the lookback slack (24 h)
        old_time = timezone.now() - timedelta(days=30)
        HandshakeFactory(
            service=service,
            requester=requester,
            status='accepted',
            scheduled_time=old_time,
            exact_duration=Decimal('2.00'),
        )
        window_start = timezone.now()
        window_end = window_start + timedelta(days=60)
        intervals = list(_user_scheduled_intervals(provider, window_start, window_end))
        handshake_ivs = [iv for iv in intervals if iv.source_kind == 'handshake']
        assert len(handshake_ivs) == 0, (
            "Historical handshake (30 d ago) should not be loaded for a future window"
        )

    def test_event_starting_12h_before_window_with_18h_duration_is_included(self):
        """An event starting 12h before window_start but lasting 18h ends 6h inside
        the window — the 24h MAX_LOOKBACK slack must ensure it is fetched and returned."""
        organizer = UserFactory()
        # Service duration 18h — event ends 6h after window_start
        service = ServiceFactory(user=organizer, type='Event', duration=Decimal('18.00'))
        participant = UserFactory()
        window_start = timezone.now()
        window_end = window_start + timedelta(days=60)
        # scheduled 12h before window_start (within the 24h slack)
        scheduled = window_start - timedelta(hours=12)
        HandshakeFactory(
            service=service,
            requester=participant,
            status='accepted',
            scheduled_time=scheduled,
            provisioned_hours=Decimal('0.00'),  # credit-free event convention
        )
        intervals = list(_user_scheduled_intervals(participant, window_start, window_end))
        handshake_ivs = [iv for iv in intervals if iv.source_kind == 'handshake']
        assert len(handshake_ivs) == 1, (
            "Event starting 12h before window_start with 18h duration should be included "
            "via MAX_LOOKBACK slack"
        )
        iv = handshake_ivs[0]
        # The interval end must be inside the window
        assert iv.end > window_start, "Event must end after window_start"


@pytest.mark.django_db
@pytest.mark.unit
class TestIncludeServicesFlag:
    """M2: include_services=False skips Service-table queries."""

    def test_include_services_false_excludes_service_intervals(self):
        owner = UserFactory()
        scheduled = timezone.now() + timedelta(hours=3)
        ServiceFactory(
            user=owner,
            type='Offer',
            duration=Decimal('1.00'),
            scheduled_time=scheduled,
            status='Active',
        )
        window_start = timezone.now()
        window_end = window_start + timedelta(days=1)
        with_services = list(_user_scheduled_intervals(owner, window_start, window_end, include_services=True))
        without_services = list(_user_scheduled_intervals(owner, window_start, window_end, include_services=False))
        svc_ivs_with = [iv for iv in with_services if iv.source_kind == 'service']
        svc_ivs_without = [iv for iv in without_services if iv.source_kind == 'service']
        assert len(svc_ivs_with) >= 1, "include_services=True should return service intervals"
        assert len(svc_ivs_without) == 0, "include_services=False must skip service intervals"
