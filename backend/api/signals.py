import logging
import re
import threading

from django.contrib.auth.signals import user_logged_in, user_login_failed
from django.db.models.signals import post_save, post_delete, pre_delete
from django.dispatch import receiver
from django.db import transaction
from django.utils import timezone

logger = logging.getLogger(__name__)
from .models import (
    ActivityEvent, ChatMessage, ChatRoom, Comment, Handshake, NegativeRep,
    Notification, PublicChatMessage, ReputationRep, ScoreAuditLog, ServiceGroupChatMessage, Service, Tag, User, UserFollow,
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

_HANDSHAKE_ACTIVE_STATUSES = ('accepted', 'checked_in', 'attended')


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


_QID_PATTERN = re.compile(r'^Q\d+$')


@receiver(post_save, sender=Tag)
def enrich_tag_with_wikidata_metadata(sender, instance, created, raw=False, **kwargs):
    """Backfill Tag.parent_qid + depth + entity_type via Wikidata.

    Skips when parent_qid is already populated (idempotent), when raw=True
    (loaddata / fixtures), and swallows any Wikidata failure so a
    Service.save can never block on a flaky Wikidata response. The 1h
    search cache and 24h claims cache make repeat calls cheap.

    Two paths:
      * QID-shaped tag id (Q12345) -> straight to claims fetch.
      * Free-text name -> resolve to a likely QID via wbsearchentities,
        then claims fetch. New non-QID tags now self-heal so the sibling
        expansion in TagStrategy reaches them.
    """
    if raw:
        return
    if instance.parent_qid:
        return
    try:
        from .wikidata import (
            fetch_wikidata_claims, resolve_entity_type, search_wikidata_items,
        )

        qid = instance.id if _QID_PATTERN.match(str(instance.id or '')) else None
        if qid is None and instance.name:
            results = search_wikidata_items(instance.name, limit=1)
            if results:
                candidate = results[0].get('id') or ''
                if _QID_PATTERN.match(candidate):
                    qid = candidate
        if qid is None:
            return

        claims = fetch_wikidata_claims(qid)
        if not claims:
            return
        ancestry = (claims.get('instance_of') or []) + (claims.get('subclass_of') or [])
        parent_qid = ancestry[0] if ancestry else None
        entity_type = resolve_entity_type(qid)

        update_fields = {}
        if parent_qid and not instance.parent_qid:
            update_fields['parent_qid'] = parent_qid
            update_fields['depth'] = 1
        if entity_type and not instance.entity_type:
            update_fields['entity_type'] = entity_type
        if update_fields:
            # update() avoids re-firing the post_save signal we're inside.
            Tag.objects.filter(pk=instance.pk).update(**update_fields)
    except Exception:
        logger.exception("Tag enrichment failed for tag %s", instance.pk)


@receiver([post_save, post_delete], sender=Handshake)
def invalidate_handshake_cache(sender, instance, **kwargs):
    """Invalidate caches when handshake changes."""
    from .models import Handshake
    invalidate_on_handshake_change(instance)


# Statuses that move the Phase 2 inputs: 'completed' feeds hours_exchanged on
# Offer/Need (via _compute_service_factors); 'accepted'/'checked_in'/'attended'
# feed rsvps_last_7d on Events (via _compute_event_factors). 'no_show' flips
# the capacity_multiplier ratio for both formulas.
_HOT_SCORE_RELEVANT_STATUSES = {
    'completed', 'accepted', 'checked_in', 'attended', 'no_show',
}


@receiver([post_save, post_delete], sender=Handshake)
def update_hot_score_on_handshake_change(sender, instance, **kwargs):
    """Recompute the parent service's hot_score on RSVP / completion changes.

    Without this, an event's velocity (rsvps_last_7d) and an offer's activity
    (hours_exchanged) drifted between rep changes -- the only other path that
    triggered a recompute. Demo data showed events ranking on stale stored
    scores derived from the wrong formula; this closes the feedback loop so
    every Phase 2 input feeds the persisted score in real time.
    """
    if instance.status not in _HOT_SCORE_RELEVANT_STATUSES:
        return
    service = getattr(instance, 'service', None)
    if service is None:
        return
    if service.pk in _services_being_deleted():
        return
    _update_service_hot_score(service)


_service_deletes_in_flight = threading.local()


def _services_being_deleted():
    if not hasattr(_service_deletes_in_flight, 'ids'):
        _service_deletes_in_flight.ids = set()
    return _service_deletes_in_flight.ids


@receiver(pre_delete, sender=Service)
def _track_service_delete_start(sender, instance, **kwargs):
    _services_being_deleted().add(instance.pk)


@receiver(post_delete, sender=Service)
def _track_service_delete_end(sender, instance, **kwargs):
    _services_being_deleted().discard(instance.pk)


def _update_service_hot_score(service):
    """Update hot_score + score_updated_at for a service and append a
    ScoreAuditLog row (NFR-17c / #308). Uses the same factor helpers as the
    update_hot_scores cron command so signal-driven and batch-driven recalcs
    write identical audit data.
    """
    if service and service.status == 'Active':
        # Skip when the parent Service is mid-deletion — cascaded child deletes
        # (Comment, ReputationRep, NegativeRep) fire post_delete before the
        # Service row is removed, and writing an audit row here would violate
        # the FK at COMMIT time once the cascade finishes.
        if service.pk in _services_being_deleted():
            return
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
                    capacity_boost_applied=f['capacity_boost_applied'],
                    newcomer_boost=f['newcomer_boost'],
                    newcomer_boost_applied=f['newcomer_boost_applied'],
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
                    capacity_boost_applied=f['capacity_boost_applied'],
                    newcomer_boost=f['newcomer_boost'],
                    newcomer_boost_applied=f['newcomer_boost_applied'],
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
        instance = ChatMessage.objects.select_related(
            'handshake__service', 'handshake__requester', 'sender'
        ).get(pk=instance.pk)
        handshake = instance.handshake
        msg_sender = instance.sender
        other_user = (
            handshake.requester
            if handshake.service.user_id == msg_sender.pk
            else handshake.service.user
        )
        if other_user.pk == msg_sender.pk:
            return
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

    Fires only on initial Handshake creation. Status transitions
    (pending -> accepted -> completed) are intentionally not attributed:
    CTR is defined here as click -> handshake-creation, not click ->
    completion. Completion-rate is a separate metric and is not measured
    by this signal. The early return on `created is False` enforces that.
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


@receiver(post_save, sender=ServiceGroupChatMessage)
def notify_on_group_chat_message(sender, instance, created, **kwargs):
    """Notify group chat participants (except the sender) when a new message is posted."""
    if not created:
        return
    from .utils import create_notification
    try:
        instance = ServiceGroupChatMessage.objects.select_related(
            'service__user', 'sender'
        ).get(pk=instance.pk)
        service = instance.service
        msg_sender = instance.sender

        participant_ids = set(
            Handshake.objects
            .filter(service=service, status__in=_HANDSHAKE_ACTIVE_STATUSES)
            .exclude(requester_id=msg_sender.pk)
            .values_list('requester_id', flat=True)
        )

        # Also notify the organiser if they are not the sender
        if service.user_id != msg_sender.pk:
            participant_ids.add(service.user_id)

        if not participant_ids:
            return

        recipients = list(User.objects.filter(pk__in=participant_ids))

        def _notify(recipients=recipients, msg_sender=msg_sender, service=service):
            if service.type == 'Event':
                title = 'New Event Chat Message'
                msg_text = f"{msg_sender.first_name} sent a message in the event '{service.title}'"
            else:
                title = 'New Message'
                msg_text = f"{msg_sender.first_name} sent a message in '{service.title}'"
            for user in recipients:
                create_notification(
                    user=user,
                    notification_type='chat_message',
                    title=title,
                    message=msg_text,
                    service=service,
                )

        transaction.on_commit(_notify)
    except Exception:
        logger.exception('Failed to queue group chat notification for message %s', instance.pk)


@receiver(post_save, sender=PublicChatMessage)
def notify_on_event_chat_message(sender, instance, created, **kwargs):
    """Notify event participants and organizer (except sender) when a new event chat message is posted."""
    if not created:
        return
    from .utils import create_notification
    try:
        instance = PublicChatMessage.objects.select_related(
            'room__related_service__user', 'sender'
        ).get(pk=instance.pk)
        room = instance.room
        if not room.related_service_id:
            return
        service = room.related_service
        msg_sender = instance.sender

        participant_ids = set(
            Handshake.objects
            .filter(service=service, status__in=_HANDSHAKE_ACTIVE_STATUSES)
            .exclude(requester_id=msg_sender.pk)
            .values_list('requester_id', flat=True)
        )
        if service.user_id != msg_sender.pk:
            participant_ids.add(service.user_id)

        if not participant_ids:
            return

        recipients = list(User.objects.filter(pk__in=participant_ids))

        def _notify(recipients=recipients, msg_sender=msg_sender, service=service):
            for user in recipients:
                create_notification(
                    user=user,
                    notification_type='chat_message',
                    title='New Event Chat Message',
                    message=f"{msg_sender.first_name} sent a message in the event '{service.title}'",
                    service=service,
                )

        transaction.on_commit(_notify)
    except Exception:
        logger.exception('Failed to queue event chat notification for message %s', instance.pk)


@receiver(post_save, sender=UserFollow)
def notify_on_user_follow(sender, instance, created, **kwargs):
    """Notify the followed user when a new follow edge is created."""
    if not created:
        return
    from .utils import create_notification
    try:
        follower = instance.follower
        followed = instance.following
        follower_name = (follower.first_name or follower.email or 'Someone').strip()
        transaction.on_commit(lambda: create_notification(
            user=followed,
            notification_type='user_followed',
            title='New Follower',
            message=f"{follower_name} started following you.",
            related_user=follower,
        ))
    except Exception:
        logger.exception('Failed to queue follow notification for %s', instance.pk)

