"""
Django management command to delete old notifications.

Removes Notification rows older than a configurable threshold (default 90 days)
to prevent unbounded table growth.

Usage:
    python manage.py cleanup_notifications
    python manage.py cleanup_notifications --days=60
"""
from django.core.management.base import BaseCommand
from django.utils import timezone
from datetime import timedelta

from api.models import Notification


class Command(BaseCommand):
    help = 'Delete notifications older than N days (default: 90)'

    def add_arguments(self, parser):
        parser.add_argument(
            '--days',
            type=int,
            default=90,
            help='Delete notifications older than this many days (default: 90)',
        )

    def handle(self, *args, **options):
        days = options['days']
        cutoff = timezone.now() - timedelta(days=days)
        count, _ = Notification.objects.filter(created_at__lt=cutoff).delete()
        self.stdout.write(self.style.SUCCESS(f'Deleted {count} notifications older than {days} days.'))
