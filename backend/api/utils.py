from __future__ import annotations

import logging

# Utility functions for TimeBank and business logic

from decimal import Decimal
from contextlib import nullcontext
from django.db import transaction
from django.db.models import F, Q

from .models import DevicePushToken, Handshake, Notification, Report, Service, User, TransactionHistory

logger = logging.getLogger(__name__)
from .cache_utils import invalidate_conversations, invalidate_transactions, invalidate_user_profile


def can_user_post_offer(user: User) -> bool:
    """Allow posting until the user owes more than 10 hours."""
    return user.timebank_balance >= Decimal("-10.00")


def get_provider_and_receiver(handshake: Handshake) -> tuple[User, User]:
    """
    Determine who is the provider and who is the receiver based on service type.
    
    - If service type is "Offer": service.user is provider, requester is receiver
    - If service type is "Need": requester is provider, service.user is receiver
    
    Returns: (provider, receiver)
    """
    service = handshake.service
    if service.type == 'Offer':
        # Service creator offers help → they are provider
        provider = service.user
        receiver = handshake.requester
    else:  # service.type == 'Need'
        # Service creator needs help → they are receiver
        provider = handshake.requester
        receiver = service.user
    return provider, receiver


def get_verified_reviews_role_filter(target_user, role: str):
    """
    Return a Q object to filter Comment querysets for verified reviews where the
    reviewed user (profile owner) had the given role in the handshake.
    
    - target_user: User instance or user id (UUID).
    - role: 'provider' or 'receiver'.
    
    Offer: provider = service.user, receiver = requester.
    Need: provider = requester, receiver = service.user.
    """
    target_id = target_user.pk if hasattr(target_user, 'pk') else target_user
    if role == 'provider':
        return (
            Q(
                related_handshake__service__type='Offer',
                service__user_id=target_id,
                related_handshake__requester=F('user'),
            )
            | Q(
                related_handshake__service__type='Need',
                related_handshake__requester_id=target_id,
                service__user=F('user'),
            )
        )
    if role == 'receiver':
        return (
            Q(
                related_handshake__service__type='Offer',
                related_handshake__requester_id=target_id,
                service__user=F('user'),
            )
            | Q(
                related_handshake__service__type='Need',
                service__user_id=target_id,
                related_handshake__requester=F('user'),
            )
        )
    return Q()


def provision_timebank(handshake: Handshake) -> bool:
    """Escrow hours from the receiver when a handshake is accepted."""
    with transaction.atomic():
        _, receiver = get_provider_and_receiver(handshake)
        receiver = User.objects.select_for_update().get(id=receiver.id)
        hours = handshake.provisioned_hours

        # Validate projected balance before transaction (should not go below -10.00)
        projected_balance = receiver.timebank_balance - hours
        if projected_balance < Decimal("-10.00"):
            raise ValueError("Transaction would exceed maximum debt limit of 10 hours")

        # Use F() expression for atomic balance update
        receiver.timebank_balance = F("timebank_balance") - hours
        receiver.save(update_fields=["timebank_balance"])
        
        # Refresh to get the actual balance value after atomic update
        receiver.refresh_from_db(fields=["timebank_balance"])
        
        # Validate balance after transaction (should not go below -10.00)
        if receiver.timebank_balance < Decimal("-10.00"):
            raise ValueError("Transaction would exceed maximum debt limit of 10 hours")
        
        # Record transaction history
        TransactionHistory.objects.create(
            user=receiver,
            transaction_type='provision',
            amount=-hours,  # Negative for debit
            balance_after=receiver.timebank_balance,
            service=handshake.service,
            handshake=handshake,
            description=f"Hours escrowed for service '{handshake.service.title}' (provisioned {hours} hours)"
        )
        
        provider, _ = get_provider_and_receiver(handshake)
        receiver_id = str(receiver.id)
        provider_id = str(provider.id)

        def _invalidate_after_commit() -> None:
            invalidate_conversations(receiver_id)
            invalidate_conversations(provider_id)
            invalidate_transactions(receiver_id)
            invalidate_user_profile(receiver_id)

        # Defer Redis SCAN+DEL until after the row lock is released and the
        # transaction has actually committed — running these inside the atomic
        # block both stretches the lock window and risks invalidating cache
        # for a transaction that ends up rolling back.
        transaction.on_commit(_invalidate_after_commit)

        return True


def reserve_timebank_for_need_service(service: Service) -> bool:
    """Reserve hours immediately when a Need service is created."""
    with transaction.atomic():
        service = Service.objects.select_for_update().select_related('user').get(id=service.id)
        if service.type != 'Need':
            return False

        hours = Decimal(service.duration)
        if service.reserved_timebank_hours > 0:
            return True

        receiver = User.objects.select_for_update().get(id=service.user_id)
        projected_balance = receiver.timebank_balance - hours
        if projected_balance < Decimal("-10.00"):
            raise ValueError("Transaction would exceed maximum debt limit of 10 hours")

        receiver.timebank_balance = F("timebank_balance") - hours
        receiver.save(update_fields=["timebank_balance"])
        receiver.refresh_from_db(fields=["timebank_balance"])

        service.reserved_timebank_hours = hours
        service.save(update_fields=["reserved_timebank_hours"])

        TransactionHistory.objects.create(
            user=receiver,
            transaction_type='provision',
            amount=-hours,
            balance_after=receiver.timebank_balance,
            service=service,
            description=f"Hours reserved for request '{service.title}' ({hours} hours reserved)",
        )

        invalidate_transactions(str(receiver.id))
        invalidate_user_profile(str(receiver.id))
        return True


def release_timebank_for_need_service(service: Service) -> bool:
    """Release a Need service's upfront reservation when it is cancelled."""
    with transaction.atomic():
        service = Service.objects.select_for_update().select_related('user').get(id=service.id)
        if service.type != 'Need':
            return False

        hours = Decimal(service.reserved_timebank_hours or Decimal('0.00'))
        if hours <= 0:
            return False

        receiver = User.objects.select_for_update().get(id=service.user_id)
        receiver.timebank_balance = F("timebank_balance") + hours
        receiver.save(update_fields=["timebank_balance"])
        receiver.refresh_from_db(fields=["timebank_balance"])

        service.reserved_timebank_hours = Decimal('0.00')
        service.save(update_fields=["reserved_timebank_hours"])

        TransactionHistory.objects.create(
            user=receiver,
            transaction_type='refund',
            amount=hours,
            balance_after=receiver.timebank_balance,
            service=service,
            description=f"Refund for cancelled request '{service.title}' ({hours} hours refunded)",
        )

        invalidate_transactions(str(receiver.id))
        invalidate_user_profile(str(receiver.id))
        return True


def ensure_accepted_handshake_reservation(handshake: Handshake) -> bool:
    """Provision accepted handshakes without double-debiting Need services."""
    with transaction.atomic():
        handshake = Handshake.objects.select_for_update().select_related(
            'service',
            'service__user',
            'requester',
        ).get(id=handshake.id)
        service = Service.objects.select_for_update().get(id=handshake.service.id)

        if service.type != 'Need' or service.reserved_timebank_hours <= 0:
            return provision_timebank(handshake)

        receiver = User.objects.select_for_update().get(id=service.user_id)
        reserved_hours = Decimal(service.reserved_timebank_hours)
        target_hours = Decimal(handshake.provisioned_hours)
        difference = target_hours - reserved_hours

        if difference > 0:
            projected_balance = receiver.timebank_balance - difference
            if projected_balance < Decimal("-10.00"):
                raise ValueError("Transaction would exceed maximum debt limit of 10 hours")

            receiver.timebank_balance = F("timebank_balance") - difference
            receiver.save(update_fields=["timebank_balance"])
            receiver.refresh_from_db(fields=["timebank_balance"])

            TransactionHistory.objects.create(
                user=receiver,
                transaction_type='provision',
                amount=-difference,
                balance_after=receiver.timebank_balance,
                service=service,
                handshake=handshake,
                description=(
                    f"Additional hours reserved for request '{service.title}' "
                    f"(adjusted from {reserved_hours} to {target_hours} hours)"
                ),
            )
        elif difference < 0:
            refund_amount = abs(difference)
            receiver.timebank_balance = F("timebank_balance") + refund_amount
            receiver.save(update_fields=["timebank_balance"])
            receiver.refresh_from_db(fields=["timebank_balance"])

            TransactionHistory.objects.create(
                user=receiver,
                transaction_type='refund',
                amount=refund_amount,
                balance_after=receiver.timebank_balance,
                service=service,
                handshake=handshake,
                description=(
                    f"Reserved request hours adjusted for '{service.title}' "
                    f"(refunded {refund_amount} hours, changed from {reserved_hours} to {target_hours} hours)"
                ),
            )

        if difference != 0:
            service.reserved_timebank_hours = target_hours
            service.save(update_fields=["reserved_timebank_hours"])

        provider, _ = get_provider_and_receiver(handshake)
        receiver_id = str(receiver.id)
        provider_id = str(provider.id)

        def _invalidate_after_commit() -> None:
            invalidate_conversations(receiver_id)
            invalidate_conversations(provider_id)
            invalidate_transactions(receiver_id)
            invalidate_user_profile(receiver_id)

        transaction.on_commit(_invalidate_after_commit)
        return True

def _is_group_one_time_service(service: Service) -> bool:
    return (
        service.type in ('Offer', 'Need')
        and service.schedule_type == 'One-Time'
        and service.max_participants > 1
    )


def complete_timebank_transfer(handshake: Handshake) -> bool:
    """Credit the provider once both parties confirm completion.
    
    Note: Caller must wrap in transaction.atomic() for atomicity.
    """
    atomic_ctx = nullcontext() if transaction.get_connection().in_atomic_block else transaction.atomic()
    with atomic_ctx:
        handshake = Handshake.objects.select_for_update().select_related('service', 'service__user', 'requester').get(id=handshake.id)

        # Idempotency: if already completed, avoid double-credit.
        if handshake.status == 'completed':
            return True

        service = Service.objects.select_for_update().get(id=handshake.service.id)
        provider, receiver = get_provider_and_receiver(handshake)
        impacted_user_ids: set[str] = {str(provider.id), str(receiver.id)}

        handshake.status = "completed"
        handshake.save(update_fields=["status"])

        if not _is_group_one_time_service(service):
            provider = User.objects.select_for_update().get(id=provider.id)
            hours = handshake.provisioned_hours

            provider.timebank_balance = F("timebank_balance") + hours
            provider.save(update_fields=["timebank_balance"])
            provider.refresh_from_db(fields=["timebank_balance"])

            TransactionHistory.objects.create(
                user=provider,
                transaction_type='transfer',
                amount=hours,
                balance_after=provider.timebank_balance,
                service=service,
                handshake=handshake,
                description=f"Service completed: '{handshake.service.title}' ({hours} hours transferred)"
            )

            provider.karma_score = F("karma_score") + 5
            provider.save(update_fields=["karma_score"])
            provider.refresh_from_db(fields=["karma_score"])

        if service.type == 'Need' and service.reserved_timebank_hours > 0:
            service.reserved_timebank_hours = Decimal('0.00')
            service.save(update_fields=["reserved_timebank_hours"])

        def invalidate_after_commit() -> None:
            for user_id in impacted_user_ids:
                invalidate_conversations(user_id)
                invalidate_transactions(user_id)
                invalidate_user_profile(user_id)

        transaction.on_commit(invalidate_after_commit)

        # Option B: One-Time services become Completed only when all participant handshakes are completed.
        if service.schedule_type == 'One-Time':
            # Compute post-completion counts without depending on an in-transaction status flip.
            completed_excluding_current = Handshake.objects.filter(
                service=service,
                status='completed',
            ).exclude(id=handshake.id).count()

            active_excluding_current = Handshake.objects.filter(
                service=service,
                status__in=['pending', 'accepted', 'reported', 'paused'],
            ).exclude(id=handshake.id).count()

            completed_count_after = completed_excluding_current + 1
            active_count_after = active_excluding_current

            if active_count_after == 0 and completed_count_after > 0 and service.status not in ('Completed',):
                service.status = 'Completed'
                service.save(update_fields=['status'])

            if _is_group_one_time_service(service) and active_count_after == 0:
                provider = User.objects.select_for_update().get(id=provider.id)
                already_paid = TransactionHistory.objects.filter(
                    user=provider,
                    transaction_type='transfer',
                    handshake__service=service,
                ).exists()
                if not already_paid:
                    hours = Decimal(service.duration)
                    provider.timebank_balance = F("timebank_balance") + hours
                    provider.save(update_fields=["timebank_balance"])
                    provider.refresh_from_db(fields=["timebank_balance"])

                    TransactionHistory.objects.create(
                        user=provider,
                        transaction_type='transfer',
                        amount=hours,
                        balance_after=provider.timebank_balance,
                        service=service,
                        handshake=handshake,
                        description=(
                            f"Group service completed: '{service.title}' "
                            f"({hours} hours transferred after all participants completed)"
                        )
                    )

                    provider.karma_score = F("karma_score") + 5
                    provider.save(update_fields=["karma_score"])
                    provider.refresh_from_db(fields=["karma_score"])

        return True


def cancel_timebank_transfer(handshake: Handshake) -> bool:
    """Refund escrowed hours when a handshake is cancelled.

    Need services reserve time at the listing level. Cancelling an accepted
    helper agreement should reopen/keep the Need with its reservation intact;
    the reserved hours are returned only when the Need listing itself is
    cancelled/deleted via release_timebank_for_need_service().
    
    Note: Caller must wrap in transaction.atomic() for atomicity.
    """
    # Refund for accepted, reported, or paused handshakes (all have escrowed hours)
    if handshake.status in ("accepted", "reported", "paused"):
        service = Service.objects.select_for_update().get(id=handshake.service.id)
        provider, receiver = get_provider_and_receiver(handshake)

        if service.type != 'Need':
            receiver = User.objects.select_for_update().get(id=receiver.id)
            hours = handshake.provisioned_hours

            # Use F() expression for atomic balance update
            receiver.timebank_balance = F("timebank_balance") + hours
            receiver.save(update_fields=["timebank_balance"])

            # Refresh to get the actual balance value after atomic update
            receiver.refresh_from_db(fields=["timebank_balance"])

            # Record transaction history
            TransactionHistory.objects.create(
                user=receiver,
                transaction_type='refund',
                amount=hours,  # Positive for refund
                balance_after=receiver.timebank_balance,
                service=handshake.service,
                handshake=handshake,
                description=f"Refund for cancelled service '{handshake.service.title}' ({hours} hours refunded)"
            )

        receiver_id = str(receiver.id)
        provider_id = str(provider.id)

        def _invalidate_after_commit() -> None:
            invalidate_conversations(receiver_id)
            invalidate_conversations(provider_id)
            invalidate_transactions(receiver_id)
            invalidate_transactions(provider_id)
            invalidate_user_profile(receiver_id)

        # Defer Redis SCAN+DEL until after commit — same reasoning as
        # provision_timebank: keep the row lock short and avoid invalidating
        # cache for a rolled-back transaction.
        transaction.on_commit(_invalidate_after_commit)

    handshake.status = "cancelled"
    handshake.save(update_fields=["status"])
    return True


def notify_reporter_of_receipt(report: Report) -> None:
    """Tell the reporter we received their report. Moderator identity omitted."""
    create_notification(
        user=report.reporter,
        notification_type='report_received',
        title='Report received',
        message='Thanks — your report has been received and will be reviewed by a moderator.',
        service=report.reported_service,
        handshake=report.related_handshake,
        report=report,
    )


def notify_reporter_of_state_change(report: Report) -> None:
    """Tell the reporter their report was resolved or dismissed.

    No moderator PII is exposed; the message is intentionally generic so the
    reporter knows action was taken without learning who the moderator was.
    """
    if report.status == 'resolved':
        notification_type = 'report_resolved'
        title = 'Your report was resolved'
        message = (
            'A moderator reviewed your report and took action. '
            'Thanks for helping keep the community safe.'
        )
    elif report.status == 'dismissed':
        notification_type = 'report_dismissed'
        title = 'Your report was reviewed'
        message = (
            "A moderator reviewed your report and didn't find a violation. "
            'Thanks for flagging it.'
        )
    else:
        return

    create_notification(
        user=report.reporter,
        notification_type=notification_type,
        title=title,
        message=message,
        service=report.reported_service,
        handshake=report.related_handshake,
        report=report,
    )


def create_notification(
    user: User,
    notification_type: str,
    title: str,
    message: str,
    handshake: Handshake | None = None,
    service: Service | None = None,
    report: Report | None = None,
) -> Notification:
    """Persist a notification and broadcast it via WebSocket."""
    notification = Notification.objects.create(
        user=user,
        type=notification_type,
        title=title,
        message=message,
        related_handshake=handshake,
        related_service=service,
        related_report=report,
    )
    transaction.on_commit(lambda: _broadcast_notification(notification))
    return notification


def _notification_payload_for_channels(notification: Notification) -> dict:
    """
    Channel layer (Redis/msgpack) cannot serialize UUID/datetime objects.
    Round-trip through JSON with default=str so all values are msgpack-safe.
    """
    import json
    from .serializers import NotificationSerializer

    raw = NotificationSerializer(notification).data
    return json.loads(json.dumps(raw, default=str))


def _broadcast_notification(notification: Notification) -> None:
    """Push a notification to the user's WebSocket group and send push notifications."""
    # WebSocket broadcast
    try:
        from channels.layers import get_channel_layer
        from asgiref.sync import async_to_sync

        channel_layer = get_channel_layer()
        if channel_layer is None:
            return
        async_to_sync(channel_layer.group_send)(
            f'notifications_{notification.user_id}',
            {
                'type': 'send_notification',
                'notification': _notification_payload_for_channels(notification),
            },
        )
    except Exception:
        logger.exception('Failed to broadcast notification %s', notification.id)

    # Expo push notification
    _send_push_notification(notification)


# Map specific Notification.type values to user-facing preference categories.
# Keys absent from this map fall under 'system' so users can mute moderation
# pings without losing essential transactional ones.
NOTIFICATION_CATEGORY_MAP: dict[str, str] = {
    'handshake_request': 'handshakes',
    'handshake_accepted': 'handshakes',
    'handshake_denied': 'handshakes',
    'handshake_cancellation_requested': 'handshakes',
    'handshake_cancellation_rejected': 'handshakes',
    'handshake_cancelled': 'handshakes',
    'service_updated': 'services',
    'service_reminder': 'services',
    'service_confirmation': 'services',
    'chat_message': 'chat',
    'positive_rep': 'reputation',
    'admin_warning': 'system',
    'dispute_resolved': 'system',
    'report_received': 'reports',
    'report_resolved': 'reports',
    'report_dismissed': 'reports',
}


def user_wants_push(user: User, notification_type: str) -> bool:
    """Check the user's notification preferences before delivering a push (#370).

    Defaults to True (deliver) when the user has no preferences set or when
    a category is missing — opt-out, not opt-in. Two switches matter:

      - prefs.get('push') == False   -> master push off; nothing delivered.
      - prefs.get(category) == False -> category muted; this push is skipped.
    """
    prefs = getattr(user, 'notification_preferences', None) or {}
    if prefs.get('push') is False:
        return False
    category = NOTIFICATION_CATEGORY_MAP.get(notification_type, 'system')
    return prefs.get(category) is not False


def _send_push_notification(notification: Notification) -> None:
    """Send an Expo push notification to all active devices for the user."""
    if not user_wants_push(notification.user, notification.type):
        return

    try:
        from exponent_server_sdk import (
            DeviceNotRegisteredError,
            PushClient,
            PushMessage,
            PushServerError,
        )
    except ImportError:
        logger.debug('exponent-server-sdk not installed, skipping push notification')
        return

    tokens = DevicePushToken.objects.filter(
        user=notification.user, is_active=True,
    ).values_list('token', flat=True)

    if not tokens:
        return

    badge_count = Notification.objects.filter(
        user=notification.user, is_read=False,
    ).count()

    push_data = {
        'type': notification.type,
        'notification_id': str(notification.id),
        'related_handshake': str(notification.related_handshake_id) if notification.related_handshake_id else None,
        'related_service': str(notification.related_service_id) if notification.related_service_id else None,
    }

    messages = [
        PushMessage(
            to=token,
            title=notification.title,
            body=notification.message,
            data=push_data,
            sound='default',
            badge=badge_count,
        )
        for token in tokens
    ]

    try:
        push_client = PushClient()
        responses = push_client.publish_multiple(messages)
        for i, response in enumerate(responses):
            try:
                response.validate_response()
            except DeviceNotRegisteredError:
                DevicePushToken.objects.filter(token=tokens[i]).update(is_active=False)
                logger.info('Deactivated unregistered push token for user %s', notification.user_id)
            except Exception:
                logger.warning('Push delivery error for token %s', tokens[i])
    except PushServerError:
        logger.exception('Expo push server error for notification %s', notification.id)
    except Exception:
        logger.exception('Failed to send push notification %s', notification.id)

