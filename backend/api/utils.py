from __future__ import annotations

# Utility functions for TimeBank and business logic

from decimal import Decimal
from contextlib import nullcontext
from django.db import transaction
from django.db.models import F

from .models import Handshake, Notification, Service, User, TransactionHistory
from .cache_utils import invalidate_conversations, invalidate_transactions


def can_user_post_offer(user: User) -> bool:
    """Allow posting until the user owes more than 10 hours."""
    return user.timebank_balance <= Decimal("10.00")


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


def provision_timebank(handshake: Handshake) -> bool:
    """Escrow hours from the receiver when a handshake is accepted."""
    with transaction.atomic():
        _, receiver = get_provider_and_receiver(handshake)
        receiver = User.objects.select_for_update().get(id=receiver.id)
        hours = handshake.provisioned_hours

        # Validate balance before transaction
        if receiver.timebank_balance < hours:
            raise ValueError("Insufficient TimeBank balance")

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

        provider, receiver = get_provider_and_receiver(handshake)
        provider = User.objects.select_for_update().get(id=provider.id)
        hours = handshake.provisioned_hours

        # Use F() expression for atomic balance update
        provider.timebank_balance = F("timebank_balance") + hours
        provider.save(update_fields=["timebank_balance"])

        # Refresh to get the actual balance value after atomic update
        provider.refresh_from_db(fields=["timebank_balance"])

        # Record transaction history
        TransactionHistory.objects.create(
            user=provider,
            transaction_type='transfer',
            amount=hours,  # Positive for credit
            balance_after=provider.timebank_balance,
            handshake=handshake,
            description=f"Service completed: '{handshake.service.title}' ({hours} hours transferred)"
        )

        # Award karma for completing handshake as provider (+5)
        provider.karma_score = F("karma_score") + 5
        provider.save(update_fields=["karma_score"])
        provider.refresh_from_db(fields=["karma_score"])

        receiver_id = str(receiver.id)
        provider_id = str(provider.id)

        def invalidate_after_commit() -> None:
            invalidate_conversations(provider_id)
            invalidate_conversations(receiver_id)
            invalidate_transactions(provider_id)
            invalidate_transactions(receiver_id)

        transaction.on_commit(invalidate_after_commit)

        # Option B: One-Time services become Completed only when all participant handshakes are completed.
        service = Service.objects.select_for_update().get(id=handshake.service.id)
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

            if active_count_after == 0 and completed_count_after > 0 and service.status != 'Completed':
                service.status = 'Completed'
                service.save(update_fields=['status'])

        handshake.status = "completed"
        handshake.save(update_fields=["status"])

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
    """Persist a notification and return the instance."""
    return Notification.objects.create(
        user=user,
        type=notification_type,
        title=title,
        message=message,
        related_handshake=handshake,
        related_service=service
    )

