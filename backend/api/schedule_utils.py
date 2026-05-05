"""
Schedule conflict checking utilities
"""
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Iterable, List, Optional

from django.db.models import Q
from django.utils import timezone

from .models import Handshake, Service

# Maximum lookback from window_start applied at DB level to bound historical
# handshake/service queries.  24 hours covers any single session that starts
# just before the window but ends inside it (e.g. an 18-hour event).
# The in-memory check at the yield loop still discards rows that truly lie
# outside the window (start >= window_end or end <= window_start).
MAX_LOOKBACK = timedelta(hours=24)


@dataclass
class ScheduledInterval:
    """Typed representation of a user's scheduled time block."""

    start: datetime
    end: datetime
    kind: str  # 'service_session' | 'event_organized' | 'event_joined' | 'scheduled_commitment'
    source_obj: object  # Handshake or Service
    source_kind: str    # 'handshake' | 'service'
    _owner_user_id: object = field(default=None, repr=False)

    def overlaps(self, other_start: datetime, other_end: datetime) -> bool:
        """Return True when this interval overlaps with [other_start, other_end)."""
        return self.start < other_end and self.end > other_start

    def to_conflict_dict(self) -> dict:
        """
        Build the conflict dict shape expected by callers of check_schedule_conflict.
        Only valid when source_kind == 'handshake'.
        """
        h = self.source_obj
        other = h.service.user if h.requester_id == self._owner_user_id else h.requester
        return {
            'handshake_id': str(h.id),
            'service_title': h.service.title,
            'scheduled_time': h.scheduled_time,
            'duration': float(h.exact_duration or h.provisioned_hours),
            'other_user': other,
        }


_ACCEPTED_HANDSHAKE_STATUSES = ('accepted', 'checked_in', 'attended')


def _yield_service_intervals(qs, kind: str, window_start, window_end, owner_user_id):
    """Yield ScheduledInterval for each Service in *qs* that falls within the window."""
    for svc in qs:
        if not svc.scheduled_time:
            continue
        duration = float(svc.duration)
        s_start = svc.scheduled_time
        s_end = s_start + timedelta(hours=duration)
        if s_start >= window_end or s_end <= window_start:
            continue
        yield ScheduledInterval(
            start=s_start,
            end=s_end,
            kind=kind,
            source_obj=svc,
            source_kind='service',
            _owner_user_id=owner_user_id,
        )


def _user_scheduled_intervals(
    user,
    window_start: datetime,
    window_end: datetime,
    exclude_handshake: Optional[object] = None,
    include_services: bool = True,
) -> Iterable[ScheduledInterval]:
    """
    Yield ScheduledInterval for every commitment the user has in [window_start, window_end].

    Sources:
    - Accepted handshakes (status in 'accepted', 'checked_in', 'attended') where
      service.user == user OR requester == user, with a scheduled_time in the window.
    - Service.type='Event' owned by user with scheduled_time in window and status
      in ('Active', 'Agreed').  (only when include_services=True)
    - Service.type in ('Offer', 'Need') owned by user with scheduled_time in window
      and status='Active'.  (only when include_services=True)

    Each interval's _owner_user_id is set to user.id so to_conflict_dict can resolve
    the 'other_user' correctly.
    Handshakes whose id matches exclude_handshake.id are skipped.

    The DB query uses MAX_LOOKBACK (24 h) as a lower-bound slack so sessions that
    start just before window_start but end inside it are still fetched.  The in-memory
    filter (h_end <= window_start guard below) discards rows that truly lie outside.

    include_services=False skips the Service-table queries entirely; use this on hot
    paths (e.g. check_schedule_conflict) that only care about handshake conflicts.
    """
    # --- Handshake-sourced intervals ---
    hs_qs = (
        Handshake.objects
        .filter(
            status__in=_ACCEPTED_HANDSHAKE_STATUSES,
            scheduled_time__isnull=False,
            scheduled_time__gte=window_start - MAX_LOOKBACK,
            scheduled_time__lt=window_end,
        )
        .filter(
            Q(service__user=user) | Q(requester=user)
        )
        .select_related('service', 'service__user', 'requester')
    )
    if exclude_handshake is not None:
        hs_qs = hs_qs.exclude(id=exclude_handshake.id)

    for h in hs_qs:
        if not h.scheduled_time:
            continue
        raw = h.exact_duration or h.provisioned_hours
        if float(raw) == 0 and h.service.type == 'Event':
            raw = h.service.duration
        duration = float(raw)
        h_start = h.scheduled_time
        h_end = h_start + timedelta(hours=duration)
        # In-memory guard: catches rows fetched via the MAX_LOOKBACK slack that
        # still end before the window opens (e.g. a 1-hour session 20h ago).
        if h_start >= window_end or h_end <= window_start:
            continue

        # Determine kind
        service_type = h.service.type
        is_requester = (h.requester_id == user.id)
        if service_type == 'Event':
            kind = 'event_joined' if is_requester else 'event_organized'
        else:
            kind = 'service_session'

        yield ScheduledInterval(
            start=h_start,
            end=h_end,
            kind=kind,
            source_obj=h,
            source_kind='handshake',
            _owner_user_id=user.id,
        )

    if not include_services:
        return

    # --- Service-sourced intervals ---
    # Events owned by user
    event_qs = (
        Service.objects
        .filter(
            user=user,
            type='Event',
            status__in=('Active', 'Agreed'),
            scheduled_time__isnull=False,
            scheduled_time__gte=window_start - MAX_LOOKBACK,
            scheduled_time__lt=window_end,
        )
    )
    yield from _yield_service_intervals(event_qs, 'event_organized', window_start, window_end, user.id)

    # Offers/Needs with fixed scheduled_time owned by user
    fixed_qs = (
        Service.objects
        .filter(
            user=user,
            type__in=('Offer', 'Need'),
            status='Active',
            scheduled_time__isnull=False,
            scheduled_time__gte=window_start - MAX_LOOKBACK,
            scheduled_time__lt=window_end,
        )
    )
    yield from _yield_service_intervals(fixed_qs, 'scheduled_commitment', window_start, window_end, user.id)


def find_overlapping_pairs(intervals: List[ScheduledInterval]) -> List[dict]:
    """
    Return a list of overlap descriptors for items in `intervals` that overlap each other.

    Each entry has the shape:
        {'item_id': '<id>', 'overlaps_with': ['<id>', ...]}

    item_id is the string id of the source object (handshake.id or service.id).
    Back-to-back items (end == other.start) are NOT considered overlapping.
    """
    result: dict[str, set] = {}

    def _item_id(iv: ScheduledInterval) -> str:
        return str(iv.source_obj.id)

    for i in range(len(intervals)):
        for j in range(i + 1, len(intervals)):
            a = intervals[i]
            b = intervals[j]
            if a.overlaps(b.start, b.end):
                id_a = _item_id(a)
                id_b = _item_id(b)
                result.setdefault(id_a, set()).add(id_b)
                result.setdefault(id_b, set()).add(id_a)

    return [
        {'item_id': k, 'overlaps_with': sorted(v)}
        for k, v in result.items()
    ]


def check_schedule_conflict(
    user,
    scheduled_time: Optional[datetime],
    duration_hours: float,
    exclude_handshake: Optional[object] = None,
) -> List[dict]:
    """
    Check if a scheduled time conflicts with existing accepted handshakes.

    External signature and return shape are preserved for backward compatibility.
    Callers in services.py rely on the dict keys:
        handshake_id, service_title, scheduled_time, duration, other_user

    Args:
        user: User to check conflicts for
        scheduled_time: datetime of the new service
        duration_hours: float duration of the service in hours
        exclude_handshake: Handshake to exclude from conflict check (for updates)

    Returns:
        list of conflict dicts, or empty list if no conflicts
    """
    if not scheduled_time:
        return []

    window_start = scheduled_time
    window_end = scheduled_time + timedelta(hours=float(duration_hours))

    # include_services=False: skip Service-table queries on this hot path; only
    # handshake-sourced intervals produce conflict dicts (see filter below).
    intervals = list(
        _user_scheduled_intervals(
            user, window_start, window_end,
            exclude_handshake=exclude_handshake,
            include_services=False,
        )
    )

    # Only handshake-sourced intervals produce conflict dicts (preserves existing shape).
    return [
        iv.to_conflict_dict()
        for iv in intervals
        if iv.source_kind == 'handshake' and iv.overlaps(window_start, window_end)
    ]
