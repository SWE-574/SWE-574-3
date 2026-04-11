from __future__ import annotations

import logging

# Utility functions for TimeBank and business logic

from decimal import Decimal
from contextlib import nullcontext
from django.db import transaction
from django.db.models import F, Q

from .models import DevicePushToken, Handshake, Notification, Service, User, TransactionHistory

logger = logging.getLogger(__name__)
from .cache_utils import invalidate_conversations, invalidate_transactions


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
            handshake=handshake,
            description=f"Hours escrowed for service '{handshake.service.title}' (provisioned {hours} hours)"
        )
        
        provider, _ = get_provider_and_receiver(handshake)
        invalidate_conversations(str(receiver.id))
        invalidate_conversations(str(provider.id))
        invalidate_transactions(str(receiver.id))
        
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
                handshake=handshake,
                description=f"Service completed: '{handshake.service.title}' ({hours} hours transferred)"
            )

            provider.karma_score = F("karma_score") + 5
            provider.save(update_fields=["karma_score"])
            provider.refresh_from_db(fields=["karma_score"])

        def invalidate_after_commit() -> None:
            for user_id in impacted_user_ids:
                invalidate_conversations(user_id)
                invalidate_transactions(user_id)

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
    
    Note: Caller must wrap in transaction.atomic() for atomicity.
    """
    # Refund for accepted, reported, or paused handshakes (all have escrowed hours)
    if handshake.status in ("accepted", "reported", "paused"):
        _, receiver = get_provider_and_receiver(handshake)
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
            handshake=handshake,
            description=f"Refund for cancelled service '{handshake.service.title}' ({hours} hours refunded)"
        )
        
        provider, _ = get_provider_and_receiver(handshake)
        invalidate_conversations(str(receiver.id))
        invalidate_conversations(str(provider.id))
        invalidate_transactions(str(receiver.id))
        invalidate_transactions(str(provider.id))

    handshake.status = "cancelled"
    handshake.save(update_fields=["status"])
    return True


def create_notification(
    user: User,
    notification_type: str,
    title: str,
    message: str,
    handshake: Handshake | None = None,
    service: Service | None = None,
) -> Notification:
    """Persist a notification and broadcast it via WebSocket."""
    notification = Notification.objects.create(
        user=user,
        type=notification_type,
        title=title,
        message=message,
        related_handshake=handshake,
        related_service=service
    )
    transaction.on_commit(lambda: _broadcast_notification(notification))
    return notification


def _broadcast_notification(notification: Notification) -> None:
    """Push a notification to the user's WebSocket group and send push notifications."""
    # WebSocket broadcast
    try:
        from channels.layers import get_channel_layer
        from asgiref.sync import async_to_sync
        from .serializers import NotificationSerializer

        channel_layer = get_channel_layer()
        if channel_layer is None:
            return
        async_to_sync(channel_layer.group_send)(
            f'notifications_{notification.user_id}',
            {
                'type': 'send_notification',
                'notification': NotificationSerializer(notification).data,
            },
        )
    except Exception:
        logger.exception('Failed to broadcast notification %s', notification.id)

    # Expo push notification
    _send_push_notification(notification)


def _send_push_notification(notification: Notification) -> None:
    """Send an Expo push notification to all active devices for the user."""
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

