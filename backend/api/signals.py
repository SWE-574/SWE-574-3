import logging

from django.db.models.signals import post_save, post_delete, pre_delete
from django.dispatch import receiver
from django.db import transaction
from django.utils import timezone

logger = logging.getLogger(__name__)
from .models import Service, User, Tag, ChatRoom, Comment, ReputationRep, NegativeRep, Handshake, ChatMessage, Notification, ScoreAuditLog
from .cache_utils import (
    invalidate_on_service_change,
    invalidate_on_user_change,
    invalidate_on_tag_change,
    invalidate_on_handshake_change,
    invalidate_on_comment_change,
    invalidate_on_reputation_change,
    invalidate_service_detail,
    invalidate_hot_services
)
from .ranking import (
    FORMULA_VERSION,
    _compute_event_factors,
    _compute_service_factors,
)


@receiver(post_save, sender=Service)
def create_service_chat_room(sender, instance, created, **kwargs):
    """Create a public ChatRoom when a Service is created."""
    if created:
        ChatRoom.objects.create(
            name=f"Discussion: {instance.title}",
            type='public',
            related_service=instance
        )


@receiver([post_save, post_delete], sender=Service)
def invalidate_service_cache(sender, instance, **kwargs):
    invalidate_on_service_change(instance)


@receiver([post_save], sender=User)
def invalidate_user_cache(sender, instance, **kwargs):
    invalidate_on_user_change(instance)


@receiver([post_save, post_delete], sender=Tag)
def invalidate_tag_cache(sender, instance, **kwargs):
    invalidate_on_tag_change()


@receiver([post_save, post_delete], sender=Handshake)
def invalidate_handshake_cache(sender, instance, **kwargs):
    """Invalidate caches when handshake changes."""
    from .models import Handshake
    invalidate_on_handshake_change(instance)


def _update_service_hot_score(service):
    """Update hot_score + score_updated_at for a service and append a
    ScoreAuditLog row (NFR-17c / #308). Uses the same factor helpers as the
    update_hot_scores cron command so signal-driven and batch-driven recalcs
    write identical audit data.
    """
    if service and service.status == 'Active':
        try:
            if service.type == 'Event':
                f = _compute_event_factors(service)
                audit = ScoreAuditLog(
                    service=service,
                    positive_rep_count=f['positive_rep_count'],
                    negative_rep_count=f['negative_rep_count'],
                    comment_count=0,
                    quality=f['organiser_quality'],
                    activity=f['velocity'],
                    capacity_multiplier=f['capacity_multiplier'],
                    final_score=f['final_score'],
                    formula_version=FORMULA_VERSION,
                    formula_kind=ScoreAuditLog.EVENT,
                )
            else:
                f = _compute_service_factors(service)
                audit = ScoreAuditLog(
                    service=service,
                    positive_rep_count=f['positive_rep_count'],
                    negative_rep_count=f['negative_rep_count'],
                    comment_count=f['comment_count'],
                    hours_exchanged=f['hours_exchanged'],
                    quality=f['quality'],
                    activity=f['activity'],
                    capacity_multiplier=f['capacity_multiplier'],
                    final_score=f['final_score'],
                    formula_version=FORMULA_VERSION,
                    formula_kind=ScoreAuditLog.SERVICE,
                )
            # Use update() to avoid triggering save() signals recursively
            Service.objects.filter(pk=service.pk).update(
                hot_score=f['final_score'],
                score_updated_at=timezone.now(),
            )
            audit.save()
        except Exception:
            logger.exception(
                "hot_score update failed for service %s", service.pk
            )


@receiver([post_save, post_delete], sender=Comment)
def update_hot_score_on_comment_change(sender, instance, **kwargs):
    """Update hot_score when a comment is created, updated, or deleted."""
    if hasattr(instance, 'service') and instance.service:
        # Invalidate caches
        invalidate_on_comment_change(instance)
        # Recalc synchronously so the audit row + score_updated_at land in the
        # same transaction as the trigger. on_commit was previously used here
        # but pytest-django @django_db tests never fire on_commit callbacks,
        # which silently dropped audit writes (NFR-17c / #308). post_save
        # already runs after the row is INSERTed and is visible to subsequent
        # SELECTs in the same connection, so synchronous is correct.
        _update_service_hot_score(instance.service)


@receiver([post_save, post_delete], sender=ReputationRep)
def update_hot_score_on_reputation_change(sender, instance, **kwargs):
    """Update hot_score when positive reputation is created or deleted."""
    if hasattr(instance, 'receiver') and instance.receiver:
        # Invalidate caches
        invalidate_on_reputation_change(instance)
        # Get all active services owned by this user
        services = Service.objects.filter(
            user=instance.receiver,
            status='Active',
        )
        # Synchronous (see comment in update_hot_score_on_comment_change).
        for service in services:
            _update_service_hot_score(service)


@receiver([post_save, post_delete], sender=NegativeRep)
def update_hot_score_on_negative_rep_change(sender, instance, **kwargs):
    """Update hot_score when negative reputation is created or deleted."""
    if hasattr(instance, 'receiver') and instance.receiver:
        # Invalidate caches
        invalidate_on_reputation_change(instance)
        # Get all active services owned by this user
        services = Service.objects.filter(
            user=instance.receiver,
            status='Active',
        )
        # Synchronous (see comment in update_hot_score_on_comment_change).
        for service in services:
            _update_service_hot_score(service)


# -- Notification signals --

@receiver(post_save, sender=ChatMessage)
def notify_on_new_chat_message(sender, instance, created, **kwargs):
    """Create a notification when a new ChatMessage is created."""
    if not created:
        return
    from .utils import create_notification
    try:
        handshake = instance.handshake
        msg_sender = instance.sender
        other_user = (
            handshake.requester
            if handshake.service.user == msg_sender
            else handshake.service.user
        )
        transaction.on_commit(lambda: create_notification(
            user=other_user,
            notification_type='chat_message',
            title='New Message',
            message=f"New message from {msg_sender.first_name}",
            handshake=handshake,
        ))
    except Exception:
        logger.exception('Failed to queue chat notification for message %s', instance.pk)


@receiver(post_save, sender=Handshake)
def attribute_handshake_to_for_you_click(sender, instance, created, **kwargs):
    """For You CTR proxy (#481): when a handshake is created, look up the
    most recent For You click on this (viewer, service) within the
    attribution window and emit a kind=handshake row tagged with the same
    source. Lets the metrics endpoint compute click-to-handshake rate.
    """
    if not created:
        return
    try:
        from datetime import timedelta
        from django.conf import settings as _settings
        from django.utils import timezone as _tz
        from .models import ForYouEvent

        attribution_minutes = int(getattr(
            _settings, 'RANKING_FOR_YOU_ATTRIBUTION_MINUTES', 60,
        ))
        cutoff = _tz.now() - timedelta(minutes=attribution_minutes)
        last_click = (
            ForYouEvent.objects
            .filter(
                viewer=instance.requester,
                service=instance.service,
                kind=ForYouEvent.CLICK,
                occurred_at__gte=cutoff,
            )
            .order_by('-occurred_at')
            .first()
        )
        if last_click is not None:
            ForYouEvent.objects.create(
                service=instance.service,
                viewer=instance.requester,
                kind=ForYouEvent.HANDSHAKE,
                source=last_click.source,
            )
    except Exception:
        logger.exception(
            'For You handshake attribution failed for handshake %s', instance.pk,
        )


@receiver(post_save, sender=Handshake)
def notify_on_handshake_status_change(sender, instance, created, **kwargs):
    """Create notifications when a Handshake status transitions."""
    if created or not instance._status_changed:
        return
    from .utils import create_notification

    new_status = instance.status
    service = instance.service

    try:
        if new_status == 'denied':
            transaction.on_commit(lambda: create_notification(
                user=instance.requester,
                notification_type='handshake_denied',
                title='Handshake Denied',
                message=f"Your interest in '{service.title}' was not accepted.",
                handshake=instance,
                service=service,
            ))
        elif new_status == 'cancelled':
            transaction.on_commit(lambda: create_notification(
                user=instance.requester,
                notification_type='handshake_cancelled',
                title='Service Cancelled',
                message=f"The service '{service.title}' has been cancelled.",
                handshake=instance,
                service=service,
            ))
    except Exception:
        logger.exception('Failed to queue handshake notification for %s', instance.pk)
