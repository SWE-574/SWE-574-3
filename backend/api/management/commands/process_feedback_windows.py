from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from api.models import Handshake, Notification
from api.services import EventEvaluationService
from api.utils import create_notification


class Command(BaseCommand):
    help = 'Close expired feedback windows and finalize pending evaluation processing.'
    EVENT_SCORE_ALERT_TITLE = 'Event Feedback Window Closed'

    def add_arguments(self, parser):
        parser.add_argument(
            '--batch-size',
            type=int,
            default=500,
            help='Maximum number of expired handshakes to process per run.',
        )

    def handle(self, *args, **options):
        now = timezone.now()
        batch_size = options['batch_size']

        expired_ids = list(
            Handshake.objects.filter(
                evaluation_window_closed_at__isnull=True,
                evaluation_window_ends_at__isnull=False,
                evaluation_window_ends_at__lte=now,
            )
            .order_by('evaluation_window_ends_at')
            .values_list('id', flat=True)[:batch_size]
        )

        if not expired_ids:
            self.stdout.write(self.style.SUCCESS('No expired feedback windows found.'))
            return

        with transaction.atomic():
            updated = Handshake.objects.filter(
                id__in=expired_ids,
                evaluation_window_closed_at__isnull=True,
            ).update(evaluation_window_closed_at=now)

        event_service_ids = list(
            Handshake.objects.filter(id__in=expired_ids, service__type='Event')
            .values_list('service_id', flat=True)
            .distinct()
        )

        for service_id in event_service_ids:
            handshake = Handshake.objects.select_related('service').filter(service_id=service_id).first()
            if handshake:
                service = handshake.service
                EventEvaluationService.refresh_summary(service)

                alert_exists = Notification.objects.filter(
                    user=service.user,
                    related_service=service,
                    type='positive_rep',
                    title=self.EVENT_SCORE_ALERT_TITLE,
                ).exists()
                if not alert_exists:
                    service.user.refresh_from_db(fields=['event_hot_score'])
                    create_notification(
                        user=service.user,
                        notification_type='positive_rep',
                        title=self.EVENT_SCORE_ALERT_TITLE,
                        message=(
                            f"Your 48-hour feedback window for '{service.title}' has closed. "
                            f"Your updated event score is {service.user.event_hot_score:.2f}."
                        ),
                        service=service,
                    )

        self.stdout.write(
            self.style.SUCCESS(
                f'Processed {len(expired_ids)} expired feedback windows; closed={updated}, event_services={len(event_service_ids)}.'
            )
        )
