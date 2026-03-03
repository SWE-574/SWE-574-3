"""
DRF Permission classes for the Event system.

These are purely additive and are only applied to Event-specific view actions.
No existing Offer/Need endpoints use these permissions.
"""
from __future__ import annotations

from django.utils import timezone
from rest_framework.permissions import BasePermission


class IsNotEventBanned(BasePermission):
    """
    Deny access when the authenticated user has an active event participation ban.

    Applied to: join_event, leave_event, checkin actions.
    """
    message = 'You are currently banned from joining events.'

    def has_permission(self, request, view) -> bool:
        user = request.user
        if not user or not user.is_authenticated:
            return False
        banned_until = getattr(user, 'is_event_banned_until', None)
        if banned_until and banned_until > timezone.now():
            self.message = (
                f'You are banned from joining events until '
                f'{banned_until.strftime("%Y-%m-%d %H:%M UTC")}.'
            )
            return False
        return True


class IsNotOrganizerBanned(BasePermission):
    """
    Deny access when the authenticated user has an active event organizer ban.

    Applied to: Event creation (checked inline in ServiceViewSet.create).
    """
    message = 'You are currently banned from creating events.'

    def has_permission(self, request, view) -> bool:
        user = request.user
        if not user or not user.is_authenticated:
            return False
        banned_until = getattr(user, 'is_organizer_banned_until', None)
        if banned_until and banned_until > timezone.now():
            self.message = (
                f'You are banned from creating events until '
                f'{banned_until.strftime("%Y-%m-%d %H:%M UTC")}.'
            )
            return False
        return True
