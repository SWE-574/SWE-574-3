"""
Django management command to update hot scores for all active services.

Run this via cron or scheduled task to keep hot scores up-to-date.
Recommended schedule: every 15-30 minutes.

Usage:
    python manage.py update_hot_scores
    python manage.py update_hot_scores --batch-size=1000

Cron example (every 15 minutes):
    */15 * * * * cd /path/to/project && docker compose exec -T backend python manage.py update_hot_scores
"""
from datetime import timedelta
from decimal import Decimal

from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from api.models import Service, ScoreAuditLog
from api.ranking import (
    FORMULA_VERSION,
    _compute_event_factors,
    _compute_service_factors,
    calculate_hot_scores_batch,
)


class Command(BaseCommand):
    help = 'Update hot scores for all active services'

    def add_arguments(self, parser):
        parser.add_argument(
            '--batch-size',
            type=int,
            default=500,
            help='Number of services to update per batch (default: 500)',
        )
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Calculate scores without saving (for testing)',
        )

    def handle(self, *args, **options):
        batch_size = options['batch_size']
        dry_run = options['dry_run']

        # Get all active services
        services = list(
            Service.objects.filter(status='Active')
            .select_related('user')
            .order_by('id')
        )

        total_count = len(services)

        if total_count == 0:
            self.stdout.write(
                self.style.WARNING('No active services to update')
            )
            return

        self.stdout.write(f'Calculating hot scores for {total_count} services...')

        # Calculate all scores using batch query optimization
        scores = calculate_hot_scores_batch(services)

        if dry_run:
            self.stdout.write(self.style.WARNING('DRY RUN - not saving changes'))
            for service in services[:10]:  # Show first 10 for preview
                old_score = service.hot_score
                new_score = scores.get(service.id, 0.0)
                self.stdout.write(
                    f'  {service.title[:40]}: {old_score:.6f} -> {new_score:.6f}'
                )
            if total_count > 10:
                self.stdout.write(f'  ... and {total_count - 10} more')
            return

        # Update services with new scores
        updated_count = 0
        now = timezone.now()

        # Process in batches
        for i in range(0, total_count, batch_size):
            batch = services[i:i + batch_size]

            with transaction.atomic():
                audit_rows = []
                for service in batch:
                    new_score = scores.get(service.id, 0.0)
                    if service.hot_score != new_score:
                        service.hot_score = new_score
                        updated_count += 1
                    service.score_updated_at = now

                    if service.type == 'Event':
                        f = _compute_event_factors(service)
                        audit_rows.append(ScoreAuditLog(
                            service=service,
                            positive_rep_count=f['positive_rep_count'],
                            negative_rep_count=f['negative_rep_count'],
                            comment_count=0,
                            hours_exchanged=Decimal('0'),
                            quality=f['organiser_quality'],
                            activity=f['velocity'],
                            capacity_multiplier=f['capacity_multiplier'],
                            newcomer_boost=f['newcomer_boost'],
                            final_score=f['final_score'],
                            formula_version=FORMULA_VERSION,
                            formula_kind=ScoreAuditLog.EVENT,
                        ))
                    else:
                        f = _compute_service_factors(service)
                        audit_rows.append(ScoreAuditLog(
                            service=service,
                            positive_rep_count=f['positive_rep_count'],
                            negative_rep_count=f['negative_rep_count'],
                            comment_count=f['comment_count'],
                            hours_exchanged=f['hours_exchanged'],
                            quality=f['quality'],
                            activity=f['activity'],
                            capacity_multiplier=f['capacity_multiplier'],
                            newcomer_boost=f['newcomer_boost'],
                            final_score=f['final_score'],
                            formula_version=FORMULA_VERSION,
                            formula_kind=ScoreAuditLog.SERVICE,
                        ))

                # Bulk update the batch (hot_score + score_updated_at)
                Service.objects.bulk_update(
                    batch,
                    ['hot_score', 'score_updated_at'],
                    batch_size=batch_size,
                )
                # Append-only audit rows for this batch
                ScoreAuditLog.objects.bulk_create(audit_rows, batch_size=batch_size)

            self.stdout.write(
                f'  Processed {min(i + batch_size, total_count)}/{total_count} services...'
            )

        self.stdout.write(
            self.style.SUCCESS(
                f'Successfully updated {updated_count} hot scores '
                f'(out of {total_count} active services)'
            )
        )

        # Retention: prune audit rows older than 30 days. Cheap (single DELETE
        # per cron run) and prevents the audit table from growing unbounded.
        cutoff = timezone.now() - timedelta(days=30)
        deleted, _ = ScoreAuditLog.objects.filter(recorded_at__lt=cutoff).delete()
        self.stdout.write(f'Pruned {deleted} audit rows older than 30 days')
