"""
Django management command to send completion reminders after service duration ends.

Usage:
    python manage.py send_completion_reminders
"""
from django.core.management.base import BaseCommand
from django.utils import timezone
from datetime import timedelta
from api.models import Handshake, Notification
from api.utils import create_notification


class Command(BaseCommand):
    help = 'Send completion reminders for services that have ended'

    def add_arguments(self, parser):
        parser.add_argument(
            '--hours-after',
            type=int,
            default=0,
            help='Hours after service end to send reminder (default: 0)',
        )

    def handle(self, *args, **options):
        hours_after = options['hours_after']
        now = timezone.now()
        
        # Find completed handshakes where service time has passed but not both confirmed
        completed_handshakes = Handshake.objects.filter(
            status='accepted',
            scheduled_time__isnull=False,
            provider_confirmed_complete=False,
            receiver_confirmed_complete=False
        ).select_related('service', 'requester', 'service__user')
        
        reminders_sent = 0
        
        for handshake in completed_handshakes:
            if not handshake.scheduled_time or not handshake.exact_duration:
                continue
                
            duration_hours = float(handshake.exact_duration or handshake.provisioned_hours)
            service_end_time = handshake.scheduled_time + timedelta(hours=duration_hours)
            reminder_time = service_end_time + timedelta(hours=hours_after)
            
            # Only send if service has ended and we're past the reminder time
            if now < reminder_time:
                continue
            
            # Check if reminder already sent (avoid duplicates)
            existing_reminder = Notification.objects.filter(
                user__in=[handshake.service.user, handshake.requester],
                type='service_confirmation',
                related_handshake=handshake,
                created_at__gte=now - timedelta(hours=1)  # Within last hour
            ).exists()
            
            if existing_reminder:
                continue
            
            # Send reminder to provider if not confirmed
            if not handshake.provider_confirmed_complete:
                create_notification(
                    user=handshake.service.user,
                    notification_type='service_confirmation',
                    title='Service Completion Reminder',
                    message=f"Please confirm completion of '{handshake.service.title}'",
                    handshake=handshake,
                    service=handshake.service
                )
                reminders_sent += 1
            
            # Send reminder to requester if not confirmed
            if not handshake.receiver_confirmed_complete:
                create_notification(
                    user=handshake.requester,
                    notification_type='service_confirmation',
                    title='Service Completion Reminder',
                    message=f"Please confirm completion of '{handshake.service.title}'",
                    handshake=handshake,
                    service=handshake.service
                )
                reminders_sent += 1
        
        self.stdout.write(
            self.style.SUCCESS(
                f'Successfully sent {reminders_sent} completion reminders'
            )
        )

