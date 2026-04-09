"""
Django management command to archive AdminAuditLog records older than the
configured retention window.

Records are exported to JSON (or CSV) files but NOT deleted, because the
database-level immutability trigger prevents deletion. The archive export
provides an offline copy for long-term storage.

Usage:
    python manage.py archive_audit_logs
    python manage.py archive_audit_logs --days=2555
    python manage.py archive_audit_logs --format=csv --output-dir=/mnt/archives
    python manage.py archive_audit_logs --dry-run

Recommended schedule (crontab):
    0 2 * * 0  cd /opt/thehive && docker compose exec -T backend \\
               python manage.py archive_audit_logs --output-dir=/mnt/archives
"""
import csv
import json
from datetime import timedelta
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand
from django.utils import timezone

from api.models import AdminAuditLog


class Command(BaseCommand):
    help = (
        'Export AdminAuditLog records older than AUDIT_RETENTION_DAYS to an '
        'archive file (JSON or CSV). Records are NOT deleted after export.'
    )

    def add_arguments(self, parser):
        parser.add_argument(
            '--days',
            type=int,
            default=None,
            help=(
                'Archive records older than this many days. '
                'Defaults to settings.AUDIT_RETENTION_DAYS.'
            ),
        )
        parser.add_argument(
            '--format',
            choices=['json', 'csv'],
            default='json',
            help='Output file format (default: json)',
        )
        parser.add_argument(
            '--output-dir',
            default='./audit_archives',
            help='Directory to write archive files into (default: ./audit_archives)',
        )
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Count matching records and print summary without writing files.',
        )

    def handle(self, *args, **options):
        days = options['days'] or getattr(settings, 'AUDIT_RETENTION_DAYS', 2555)
        fmt = options['format']
        output_dir = Path(options['output_dir'])
        dry_run = options['dry_run']

        cutoff = timezone.now() - timedelta(days=days)
        qs = AdminAuditLog.objects.filter(created_at__lt=cutoff).order_by('created_at')
        count = qs.count()

        if count == 0:
            self.stdout.write(
                self.style.WARNING(
                    f'No AdminAuditLog records older than {days} days found. Nothing to archive.'
                )
            )
            return

        if dry_run:
            self.stdout.write(
                self.style.WARNING(
                    f'DRY RUN: {count} records would be archived (older than {days} days, '
                    f'cutoff: {cutoff.isoformat()}).'
                )
            )
            return

        output_dir.mkdir(parents=True, exist_ok=True)
        timestamp = timezone.now().strftime('%Y%m%d_%H%M%S')
        filename = output_dir / f'audit_log_archive_{timestamp}.{fmt}'

        records = list(
            qs.values(
                'id', 'admin_id', 'action_type', 'target_entity',
                'target_id', 'reason', 'previous_role', 'new_role',
                'ip_address', 'created_at',
            )
        )

        for r in records:
            r['id'] = str(r['id'])
            r['admin_id'] = str(r['admin_id'])
            r['target_id'] = str(r['target_id'])
            r['created_at'] = r['created_at'].isoformat()

        if fmt == 'json':
            with open(filename, 'w', encoding='utf-8') as fh:
                json.dump(records, fh, indent=2, default=str)
        else:
            with open(filename, 'w', newline='', encoding='utf-8') as fh:
                writer = csv.DictWriter(fh, fieldnames=records[0].keys())
                writer.writeheader()
                writer.writerows(records)

        self.stdout.write(
            self.style.SUCCESS(
                f'Archived {count} AdminAuditLog records (older than {days} days) '
                f'to {filename}.'
            )
        )
