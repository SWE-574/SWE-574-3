import logging

from django.contrib.auth.signals import user_logged_in, user_login_failed
from django.db.models.signals import post_save, post_delete, pre_delete
from django.dispatch import receiver
from django.db import transaction
from django.utils import timezone

logger = logging.getLogger(__name__)
from .models import (
    ActivityEvent, ChatMessage, ChatRoom, Comment, Handshake, NegativeRep,
    Notification, ReputationRep, ScoreAuditLog, Service, Tag, User, UserFollow,
)
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

security_logger = logging.getLogger('api.security')


def _client_ip(request) -> str:
    if request is None:
        return 'unknown'
    forwarded = request.META.get('HTTP_X_FORWARDED_FOR') if hasattr(request, 'META') else None
    if forwarded:
        return forwarded.split(',')[0].strip()
    return request.META.get('REMOTE_ADDR', 'unknown') if hasattr(request, 'META') else 'unknown'


@receiver(user_logged_in)
def log_user_logged_in(sender, request, user, **kwargs):
    security_logger.info(
        'auth.login.success user_id=%s email=%s ip=%s',
        getattr(user, 'id', None), getattr(user, 'email', None), _client_ip(request),
    )


@receiver(user_login_failed)
def log_user_login_failed(sender, credentials, request=None, **kwargs):
    # `credentials` may include the email but never the password thanks to
    # Django stripping it before dispatching the signal. Still, only log the
    # email key to avoid accidental exposure if Django's behaviour changes.
    email = (credentials or {}).get('email') or (credentials or {}).get('username')
    security_logger.warning(
        'auth.login.failed email=%s ip=%s', email, _client_ip(request),
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


@receiver(post_save, sender=Service)
def emit_activity_for_service_create(sender, instance, created, **kwargs):
    """Emit an ActivityEvent when a publicly visible service is created
    (#482 activity feed). Hidden or non-active services produce no event."""
    if not created:
        return
    if instance.status != 'Active' or not instance.is_visible:
        return
    try:
        ActivityEvent.objects.create(
            actor=instance.user,
            verb=ActivityEvent.SERVICE_CREATED,
            service=instance,
            location=instance.location,
        )
    except Exception:
        logger.exception(
            'Failed to emit ActivityEvent for service create %s', instance.pk,
        )


@receiver(post_save, sender=Handshake)
def emit_activity_for_handshake_accept(sender, instance, created, **kwargs):
    """Emit an ActivityEvent when a handshake transitions to accepted so the
    activity feed can show 'X is joining service Y'. The acting user is the
    requester (the one whose interest got confirmed)."""
    if created:
        return
    if not getattr(instance, '_status_changed', False):
        return
    if instance.status != 'accepted':
        return
    try:
        svc = instance.service
        ActivityEvent.objects.create(
            actor=instance.requester,
            verb=ActivityEvent.HANDSHAKE_ACCEPTED,
            service=svc,
            target_user=svc.user,
            location=svc.location if svc else None,
        )
    except Exception:
        logger.exception(
            'Failed to emit ActivityEvent for handshake accept %s', instance.pk,
        )


@receiver(post_save, sender=Handshake)
def emit_activity_for_handshake_complete(sender, instance, created, **kwargs):
    """Emit a celebration event when a handshake transitions to completed.
    Pairs with the time-bank flourish on the activity feed card. Suppresses
    duplicates by relying on the (handshake, status='completed') transition
    being terminal -- the same row should not flip back."""
    if created:
        return
    if not getattr(instance, '_status_changed', False):
        return
    if instance.status != 'completed':
        return
    try:
        svc = instance.service
        ActivityEvent.objects.create(
            actor=instance.requester,
            verb=ActivityEvent.HANDSHAKE_COMPLETED,
            service=svc,
            target_user=svc.user if svc else None,
            location=svc.location if svc else None,
        )
    except Exception:
        logger.exception(
            'Failed to emit ActivityEvent for handshake complete %s', instance.pk,
        )


@receiver(post_save, sender=Handshake)
def emit_activity_for_event_filling_up(sender, instance, **kwargs):
    """Emit a one-shot event when a Service of type=Event reaches 80% of its
    max_participants. Idempotency: a (service, verb=EVENT_FILLING_UP) row is
    looked up before creation so the event fires at most once per service.
    """
    svc = instance.service
    if svc is None or svc.type != 'Event' or not svc.max_participants:
        return
    # Only count statuses that hold a participation slot.
    counted_statuses = ('accepted', 'completed', 'checked_in', 'attended')
    try:
        count = Handshake.objects.filter(
            service=svc, status__in=counted_statuses,
        ).count()
        if count < (0.8 * svc.max_participants):
            return
        # Idempotency: at most one filling-up event per service.
        already = ActivityEvent.objects.filter(
            service=svc, verb=ActivityEvent.EVENT_FILLING_UP,
        ).exists()
        if already:
            return
        ActivityEvent.objects.create(
            actor=svc.user,
            verb=ActivityEvent.EVENT_FILLING_UP,
            service=svc,
            location=svc.location,
        )
    except Exception:
        logger.exception(
            'Failed to emit ActivityEvent for event filling up service=%s',
            svc.pk if svc else None,
        )


@receiver(post_save, sender=User)
def emit_activity_for_new_neighbor(sender, instance, created, **kwargs):
    """Emit a one-shot welcome event when a user finishes onboarding so the
    activity feed can surface them to neighbors. The exists() check below
    makes this idempotent per actor: even if is_onboarded is flipped on/off
    repeatedly, the welcome event fires at most once."""
    if not instance.is_onboarded:
        return
    try:
        if ActivityEvent.objects.filter(
            actor=instance, verb=ActivityEvent.NEW_NEIGHBOR,
        ).exists():
            return
        ActivityEvent.objects.create(
            actor=instance,
            verb=ActivityEvent.NEW_NEIGHBOR,
        )
    except Exception:
        logger.exception(
            'Failed to emit ActivityEvent for new neighbor %s', instance.pk,
        )


# NOTE: producer for ActivityEvent.SERVICE_ENDORSED is intentionally not
# wired here. The Endorsement model lives on the #494 social-mechanics
# branch; once it merges into dev, the producer should be added here as a
# post_save receiver that creates an event with verb=SERVICE_ENDORSED,
# actor=endorsement.endorser, service=endorsement.service. The verb is
# already declared on ActivityEvent so the migration sets up the enum.


@receiver(post_save, sender=UserFollow)
def emit_activity_for_user_follow(sender, instance, created, **kwargs):
    """Emit an ActivityEvent when a follow edge is created so a viewer can
    see 'X started following Y' in the activity feed."""
    if not created:
        return
    try:
        ActivityEvent.objects.create(
            actor=instance.follower,
            verb=ActivityEvent.USER_FOLLOWED,
            target_user=instance.following,
        )
    except Exception:
        logger.exception(
            'Failed to emit ActivityEvent for follow %s', instance.pk,
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


@receiver(post_save, sender=UserFollow)
def notify_on_user_follow(sender, instance, created, **kwargs):
    """Notify the followed user when a new follow edge is created."""
    if not created:
        return
    from .utils import create_notification
    follower = instance.follower
    followed = instance.following
    follower_name = (follower.first_name or follower.email or 'Someone').strip()
    try:
        transaction.on_commit(lambda: create_notification(
            user=followed,
            notification_type='user_followed',
            title='New follower',
            message=f"{follower_name} started following you.",
        ))
    except Exception:
        logger.exception('Failed to queue follow notification for %s', instance.pk)

