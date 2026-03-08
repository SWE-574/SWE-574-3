"""
Schedule conflict checking utilities
"""
from django.utils import timezone
from datetime import timedelta
from .models import Handshake, Service


def check_schedule_conflict(user, scheduled_time, duration_hours, exclude_handshake=None):
    """
    Check if a scheduled time conflicts with existing accepted handshakes.
    
    Args:
        user: User to check conflicts for
        scheduled_time: datetime of the new service
        duration_hours: float duration of the service
        exclude_handshake: Handshake to exclude from conflict check (for updates)
    
    Returns:
        list of conflicting handshakes, or empty list if no conflicts
    """
    if not scheduled_time:
        return []
    
    service_start = scheduled_time
    service_end = scheduled_time + timedelta(hours=duration_hours)
    
    from django.db import models
    
    # Get all accepted handshakes for this user (as provider or requester)
    user_handshakes = Handshake.objects.filter(
        status='accepted',
        scheduled_time__isnull=False
    ).filter(
        (models.Q(service__user=user) | models.Q(requester=user))
    )
    
    if exclude_handshake:
        user_handshakes = user_handshakes.exclude(id=exclude_handshake.id)
    
    conflicts = []
    for handshake in user_handshakes:
        if not handshake.scheduled_time:
            continue
            
        handshake_duration = float(handshake.exact_duration or handshake.provisioned_hours)
        handshake_start = handshake.scheduled_time
        handshake_end = handshake.scheduled_time + timedelta(hours=handshake_duration)
        
        # Check for overlap
        if (service_start < handshake_end and service_end > handshake_start):
            conflicts.append({
                'handshake_id': str(handshake.id),
                'service_title': handshake.service.title,
                'scheduled_time': handshake.scheduled_time,
                'duration': handshake_duration,
                'other_user': handshake.service.user if handshake.requester == user else handshake.requester
            })
    
    return conflicts

