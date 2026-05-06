"""
Daily management command -- flags Recurrent services with no engagement growth.

FR-17f reframed (#305): rather than decaying hot_score 10%/week (which buries
old listings -- customer rejected), we mark stale recurring services with
is_stale_recurring=True. Phase 3 (Thompson Sampling) explicitly samples from
the stale-recurring pool so they get rotation rather than burial.

Run daily via cron. Self-throttles -- a service is re-checked at most once
per 7 days regardless of how often the command runs.
"""
from datetime import timedelta

from django.core.management.base import BaseCommand
from django.db.models import Q
from django.utils import timezone

from api.models import Service, Handshake


class Command(BaseCommand):
    help = "Flag Recurrent services with no engagement growth in the last 7 days"

    def handle(self, *args, **options):
        now = timezone.now()
        recheck_threshold = now - timedelta(days=7)
        recent_window_start = now - timedelta(days=7)
        prior_window_start = now - timedelta(days=14)

        # schedule_type literal verified against api.models.Service.SCHEDULE_CHOICES
        candidates = Service.objects.filter(
            schedule_type='Recurrent',
            status='Active',
        ).filter(
            Q(last_growth_check_at__isnull=True) | Q(last_growth_check_at__lt=recheck_threshold)
        )

        flagged = unflagged = 0
        for svc in candidates:
            # NOTE: Handshake has no dedicated completed_at; updated_at (auto_now)
            # is the proxy. May overcount if a completed handshake is later edited.
            recent = Handshake.objects.filter(
                service=svc,
                status='completed',
                updated_at__gte=recent_window_start,
            ).count()
            prior = Handshake.objects.filter(
                service=svc,
                status='completed',
                updated_at__gte=prior_window_start,
                updated_at__lt=recent_window_start,
            ).count()

            stale = recent <= prior  # not-larger means no growth
            Service.objects.filter(pk=svc.pk).update(
                is_stale_recurring=stale,
                last_growth_check_at=now,
            )
            flagged += int(stale)
            unflagged += int(not stale)

        total_recurring = Service.objects.filter(
            schedule_type='Recurrent', status='Active'
        ).count()
        skipped = total_recurring - flagged - unflagged
        self.stdout.write(self.style.SUCCESS(
            f'check_recurring_growth: flagged {flagged} stale, cleared {unflagged}, '
            f'skipped {skipped} (within 7d throttle)'
        ))
