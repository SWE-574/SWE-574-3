from django.db.models.signals import post_save, post_delete, pre_delete
from django.dispatch import receiver
from django.db import transaction
from .models import Service, User, Tag, ChatRoom, Comment, ReputationRep, NegativeRep, Handshake
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
from .ranking import calculate_hot_score


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
    """Update hot_score for a service."""
    if service and service.status == 'Active':
        try:
            new_score = calculate_hot_score(service)
            # Use update() to avoid triggering save() signals recursively
            Service.objects.filter(pk=service.pk).update(hot_score=new_score)
        except Exception:
            pass


@receiver([post_save, post_delete], sender=Comment)
def update_hot_score_on_comment_change(sender, instance, **kwargs):
    """Update hot_score when a comment is created, updated, or deleted."""
    if hasattr(instance, 'service') and instance.service:
        # Invalidate caches
        invalidate_on_comment_change(instance)
        # Use transaction.on_commit to ensure the comment change is committed first
        transaction.on_commit(lambda: _update_service_hot_score(instance.service))


@receiver([post_save, post_delete], sender=ReputationRep)
def update_hot_score_on_reputation_change(sender, instance, **kwargs):
    """Update hot_score when positive reputation is created or deleted."""
    if hasattr(instance, 'receiver') and instance.receiver:
        # Invalidate caches
        invalidate_on_reputation_change(instance)
        # Get all active services owned by this user
        services = list(Service.objects.filter(
            user=instance.receiver,
            status='Active'
        ).values_list('pk', flat=True))
        # Use transaction.on_commit to ensure the reputation change is committed first
        def update_scores():
            for service_id in services:
                try:
                    service = Service.objects.get(pk=service_id)
                    _update_service_hot_score(service)
                except Service.DoesNotExist:
                    pass
        transaction.on_commit(update_scores)


@receiver([post_save, post_delete], sender=NegativeRep)
def update_hot_score_on_negative_rep_change(sender, instance, **kwargs):
    """Update hot_score when negative reputation is created or deleted."""
    if hasattr(instance, 'receiver') and instance.receiver:
        # Invalidate caches
        invalidate_on_reputation_change(instance)
        # Get all active services owned by this user
        services = list(Service.objects.filter(
            user=instance.receiver,
            status='Active'
        ).values_list('pk', flat=True))
        # Use transaction.on_commit to ensure the negative rep change is committed first
        def update_scores():
            for service_id in services:
                try:
                    service = Service.objects.get(pk=service_id)
                    _update_service_hot_score(service)
                except Service.DoesNotExist:
                    pass
        transaction.on_commit(update_scores)
