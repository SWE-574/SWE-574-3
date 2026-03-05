from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from api.models import Handshake
from api.services import EventEvaluationService


class Command(BaseCommand):
    help = 'Close expired feedback windows and finalize pending evaluation processing.'

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
                EventEvaluationService.refresh_summary(handshake.service)

        self.stdout.write(
            self.style.SUCCESS(
                f'Processed {len(expired_ids)} expired feedback windows; closed={updated}, event_services={len(event_service_ids)}.'
            )
        )
