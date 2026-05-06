"""Tests for the roll_up_for_you_metrics management command (#481)."""
from datetime import timedelta
from io import StringIO

import pytest
from django.core.management import call_command
from django.utils import timezone

from api.models import ForYouDailyMetric, ForYouEvent
from api.tests.helpers.factories import ServiceFactory, UserFactory


def _make_event(viewer, service, kind, occurred_at):
    """Bypass auto_now_add so we can place events in the past."""
    event = ForYouEvent.objects.create(
        service=service, viewer=viewer, kind=kind,
        source=ForYouEvent.SOURCE_FOR_YOU,
    )
    ForYouEvent.objects.filter(pk=event.pk).update(occurred_at=occurred_at)
    return event


@pytest.mark.django_db
@pytest.mark.unit
class TestRollUpForYouMetrics:
    def test_rollup_populates_unique_viewers(self):
        svc = ServiceFactory(type='Offer', status='Active')
        v1 = UserFactory()
        v2 = UserFactory()
        now = timezone.now()
        # 3 impressions from v1, 1 from v2 -> count=4, unique=2.
        for _ in range(3):
            _make_event(v1, svc, ForYouEvent.IMPRESSION, now)
        _make_event(v2, svc, ForYouEvent.IMPRESSION, now)

        out = StringIO()
        call_command('roll_up_for_you_metrics', '--days=1', stdout=out)

        row = ForYouDailyMetric.objects.get(
            kind=ForYouEvent.IMPRESSION, date=now.date(),
        )
        assert row.count == 4
        assert row.unique_viewers == 2

    def test_prune_days_deletes_old_events_and_keeps_recent(self):
        svc = ServiceFactory(type='Offer', status='Active')
        viewer = UserFactory()
        now = timezone.now()

        old = _make_event(
            viewer, svc, ForYouEvent.IMPRESSION, now - timedelta(days=45),
        )
        recent = _make_event(
            viewer, svc, ForYouEvent.IMPRESSION, now - timedelta(days=2),
        )

        call_command(
            'roll_up_for_you_metrics',
            '--days=3', '--prune-days=30',
            stdout=StringIO(),
        )

        assert not ForYouEvent.objects.filter(pk=old.pk).exists()
        assert ForYouEvent.objects.filter(pk=recent.pk).exists()

    def test_no_prune_flag_keeps_all_events(self):
        svc = ServiceFactory(type='Offer', status='Active')
        viewer = UserFactory()
        now = timezone.now()
        old = _make_event(
            viewer, svc, ForYouEvent.IMPRESSION, now - timedelta(days=45),
        )

        call_command('roll_up_for_you_metrics', '--days=2', stdout=StringIO())

        # Without --prune-days, even very old rows are preserved.
        assert ForYouEvent.objects.filter(pk=old.pk).exists()
