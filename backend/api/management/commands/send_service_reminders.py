"""
Django management command to send service reminders.
Run this via cron or scheduled task to send reminders before scheduled services.

Usage:
    python manage.py send_service_reminders
"""
from django.core.management.base import BaseCommand
from django.utils import timezone
from datetime import timedelta
from api.models import Handshake, Notification
from api.utils import create_notification


class Command(BaseCommand):
    help = 'Send service reminders for upcoming services'

    def add_arguments(self, parser):
        parser.add_argument(
            '--hours-before',
            type=int,
            default=24,
            help='Hours before service to send reminder (default: 24)',
        )

    def handle(self, *args, **options):
        hours_before = options['hours_before']
        now = timezone.now()
        reminder_time = now + timedelta(hours=hours_before)
        
        # Find handshakes with scheduled times within the reminder window
        # (between now and reminder_time)
        upcoming_handshakes = Handshake.objects.filter(
            status='accepted',
            scheduled_time__isnull=False,
            scheduled_time__gte=now,
            scheduled_time__lte=reminder_time
        ).select_related('service', 'requester', 'service__user')
        
        reminders_sent = 0
        
        for handshake in upcoming_handshakes:
            # Check if reminder already sent (avoid duplicates)
            existing_reminder = Notification.objects.filter(
                user__in=[handshake.service.user, handshake.requester],
                type='service_reminder',
                related_handshake=handshake,
                created_at__gte=now - timedelta(hours=1)  # Within last hour
            ).exists()
            
            if existing_reminder:
                continue
            
            service_time = handshake.scheduled_time
            time_str = service_time.strftime('%Y-%m-%d %H:%M')
            
            # Send reminder to provider
            create_notification(
                user=handshake.service.user,
                notification_type='service_reminder',
                title='Service Reminder',
                message=f"Your service '{handshake.service.title}' is scheduled for {time_str}",
                handshake=handshake,
                service=handshake.service
            )
            
            # Send reminder to requester
            create_notification(
                user=handshake.requester,
                notification_type='service_reminder',
                title='Service Reminder',
                message=f"Your service '{handshake.service.title}' is scheduled for {time_str}",
                handshake=handshake,
                service=handshake.service
            )
            
            reminders_sent += 2
        
        self.stdout.write(
            self.style.SUCCESS(
                f'Successfully sent {reminders_sent} reminders for {upcoming_handshakes.count()} services'
            )
        )

