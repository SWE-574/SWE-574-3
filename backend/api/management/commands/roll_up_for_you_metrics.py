"""Roll up ForYouEvent rows into ForYouDailyMetric so the admin metrics
endpoint can serve the last N days cheaply (#481). Run nightly.

Idempotent: the (date, kind, source) unique constraint means a re-run
overwrites the day's row rather than duplicating it.
"""
from datetime import timedelta

from django.core.management.base import BaseCommand
from django.db import transaction
from django.db.models import Count
from django.utils import timezone

from api.models import ForYouDailyMetric, ForYouEvent


class Command(BaseCommand):
    help = 'Roll up ForYouEvent rows into ForYouDailyMetric for the last N days.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--days', type=int, default=2,
            help='How many days back to roll up (default 2 to cover yesterday + today).',
        )
        parser.add_argument(
            '--prune-days', type=int, default=None,
            help=(
                'Optional. After rollup, delete ForYouEvent rows older than '
                'this many days. The append-only event log otherwise grows '
                'unbounded. Pruning runs in its own transaction so a delete '
                'failure does not roll back the rollup.'
            ),
        )

    def handle(self, *args, **options):
        days = options['days']
        prune_days = options.get('prune_days')
        end = timezone.now().date()
        start = end - timedelta(days=days - 1)

        with transaction.atomic():
            ForYouDailyMetric.objects.filter(
                date__gte=start, date__lte=end,
            ).delete()

            rows = (
                ForYouEvent.objects
                .filter(occurred_at__date__gte=start, occurred_at__date__lte=end)
                .values('occurred_at__date', 'kind', 'source')
                .annotate(
                    count=Count('id'),
                    unique_viewers=Count('viewer_id', distinct=True),
                )
            )

            ForYouDailyMetric.objects.bulk_create([
                ForYouDailyMetric(
                    date=row['occurred_at__date'],
                    kind=row['kind'],
                    source=row['source'],
                    count=row['count'],
                    unique_viewers=row['unique_viewers'],
                )
                for row in rows
            ])

        self.stdout.write(self.style.SUCCESS(
            f'Rolled up For You metrics from {start} through {end}.'
        ))

        if prune_days is not None and prune_days > 0:
            cutoff = end - timedelta(days=prune_days)
            with transaction.atomic():
                deleted, _ = ForYouEvent.objects.filter(
                    occurred_at__date__lt=cutoff,
                ).delete()
            self.stdout.write(self.style.SUCCESS(
                f'Pruned {deleted} ForYouEvent row(s) older than {cutoff}.'
            ))
