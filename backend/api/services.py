from __future__ import annotations

from decimal import Decimal
from datetime import timedelta
from django.db import transaction
from django.db import models as django_models
from django.db.utils import OperationalError
from django.utils import timezone

from .models import Handshake, Service, User, ChatMessage
from .utils import create_notification
from .cache_utils import invalidate_conversations


class HandshakeService:
    """Service class for handshake business logic, following Fat Utils pattern."""

    @staticmethod
    def _capacity_statuses(service: Service) -> list[str]:
        """Handshake statuses that count toward max_participants capacity.

        Per SRS FR-E01f: slots are consumed when a handshake is ACCEPTED,
        not while it is still pending. This applies to both schedule types:

          One-Time  → accepted, completed, reported, paused
                       (completed still occupies the slot for a one-time session)
          Recurrent → accepted, reported, paused
                       (completed frees the slot so another participant can join)

        'pending' never counts toward capacity for either type: multiple users
        may express interest simultaneously and chat with the provider; a slot
        is only consumed once the provider accepts.
        """
        if service.schedule_type == 'One-Time':
            return ['accepted', 'completed', 'reported', 'paused']
        # Recurrent: completed sessions free the slot; only active accepted count
        return ['accepted', 'reported', 'paused']

    @staticmethod
    def _existing_interest_statuses(service: Service) -> list[str]:
        """Statuses that prevent the SAME user from expressing interest again.

        Separate from capacity: a user with an existing pending/active request
        should not be allowed to create a second one. For Recurrent services,
        a completed handshake opens the slot for re-participation.
        """
        if service.schedule_type == 'One-Time':
            return ['pending', 'accepted', 'completed', 'reported', 'paused']
        # Recurrent: completed allows re-joining; pending/accepted/active block duplicate
        return ['pending', 'accepted', 'reported', 'paused']
    
    @staticmethod
    def can_express_interest(service: Service, user: User) -> tuple[bool, str | None]:
        """
        Validates if user can express interest in a service.
        
        Returns:
            tuple[bool, str | None]: (is_valid, error_message)
        """
        # Check if service exists and is active
        if service.status != 'Active':
            return False, 'Service is not active'
        
        # Check if user is trying to express interest in their own service
        if service.user == user:
            return False, 'Cannot express interest in your own service'
        
        # Check for existing handshake (per-user duplicate prevention)
        existing_statuses = HandshakeService._existing_interest_statuses(service)
        existing = Handshake.objects.filter(service=service, requester=user, status__in=existing_statuses).first()

        if existing:
            return False, 'You have already expressed interest'
        
        # Check max_participants
        capacity_statuses = HandshakeService._capacity_statuses(service)
        current_participants = Handshake.objects.filter(service=service, status__in=capacity_statuses).count()
        
        if current_participants >= service.max_participants:
            return False, f'Service has reached maximum capacity ({service.max_participants} participants)'
        
        # Check hard cap on pending requests (REQ-SRV-006: 50 request limit)
        pending_requests = Handshake.objects.filter(
            service=service,
            status='pending'
        ).count()
        
        if pending_requests >= 50:
            return False, 'Service has reached the maximum number of pending requests (50). Please wait for some requests to be processed.'
        
        # Determine payer and check balance
        payer = HandshakeService._determine_payer(service, user)
        if payer.timebank_balance < service.duration:
            payer_name = "You" if payer == user else f"{payer.first_name} {payer.last_name}"
            verb = "need" if payer == user else "needs"
            return False, f'Insufficient TimeBank balance. {payer_name} {verb} {service.duration} hours, have {payer.timebank_balance}'
        
        return True, None
    
    @staticmethod
    def express_interest(service: Service, requester: User) -> Handshake:
        """
        Main business logic for expressing interest in a service.
        
        All validations are performed inside a transaction with row-level locking
        to prevent TOCTOU race conditions.
        
        Args:
            service: The service to express interest in
            requester: The user expressing interest
            
        Returns:
            Handshake: The created handshake instance
            
        Raises:
            ValueError: If validation fails (with descriptive error message)
            OperationalError: If a database deadlock occurs (should be retried by caller)
        """
        # Create handshake within transaction with row-level locking
        # Acquire locks in consistent order (by user ID) to prevent deadlocks
        # when two users simultaneously express interest in each other's services
        with transaction.atomic():
            # Lock service first
            service = Service.objects.select_related('user').select_for_update().get(pk=service.pk)
            
            # Determine service owner ID before locking
            service_owner_id = service.user.pk
            
            # Lock users in consistent order (by ID) to prevent deadlocks
            # This ensures all transactions acquire locks in the same order
            if requester.pk < service_owner_id:
                # Lock requester first, then service owner
                requester = User.objects.select_for_update().get(pk=requester.pk)
                service_owner = User.objects.select_for_update().get(pk=service_owner_id)
            else:
                # Lock service owner first, then requester
                service_owner = User.objects.select_for_update().get(pk=service_owner_id)
                requester = User.objects.select_for_update().get(pk=requester.pk)
            
            # Validate service exists and is active (inside transaction)
            if service.status != 'Active':
                raise ValueError('Service is not active')
            
            # Check if user is trying to express interest in their own service
            # Use locked service_owner for comparison
            if service_owner.pk == requester.pk:
                raise ValueError('Cannot express interest in your own service')
            
            # Check for existing handshake (inside transaction with locked data)
            HandshakeService._check_existing_handshake(service, requester)
            
            # Check max_participants (inside transaction with locked data)
            HandshakeService._check_max_participants(service)
            
            # Check hard cap on pending requests (REQ-SRV-006: 50 request limit)
            pending_requests = Handshake.objects.filter(
                service=service,
                status='pending'
            ).count()
            
            if pending_requests >= 50:
                raise ValueError('Service has reached the maximum number of pending requests (50). Please wait for some requests to be processed.')
            
            # Determine payer and check balance (inside transaction with locked data)
            payer = HandshakeService._determine_payer(service, requester)
            # Use locked user objects
            if payer.pk == requester.pk:
                payer = requester
            else:
                payer = service_owner
            HandshakeService._check_balance(payer, service, requester)
            
            # Create handshake
            handshake = HandshakeService._create_handshake(service, requester)
            
            # Send notifications (use locked service_owner)
            HandshakeService._send_notifications(service, handshake, requester, service_owner)
            
            # Create initial chat message
            HandshakeService._create_initial_message(handshake, requester, service)
        
        # Invalidate caches AFTER transaction commits to prevent race condition:
        # If we invalidate before commit, another request could see cache miss,
        # query DB (seeing old data), and cache stale data before our transaction commits.
        HandshakeService._invalidate_caches(requester, service_owner)
        
        return handshake
        # Note: OperationalError (deadlocks) will propagate to caller for retry handling
    
    @staticmethod
    def _check_own_service(service: Service, user: User) -> None:
        """Check if user is trying to express interest in their own service."""
        if service.user == user:
            raise ValueError('Cannot express interest in your own service')
    
    @staticmethod
    def _check_max_participants(service: Service) -> None:
        """Validates service hasn't reached max_participants."""
        capacity_statuses = HandshakeService._capacity_statuses(service)
        current_participants = Handshake.objects.filter(service=service, status__in=capacity_statuses).count()
        
        if current_participants >= service.max_participants:
            raise ValueError(
                f'Service has reached maximum capacity ({service.max_participants} participants)'
            )
    
    @staticmethod
    def _check_existing_handshake(service: Service, user: User) -> None:
        """Checks for an existing handshake that should block re-interest."""
        existing_statuses = HandshakeService._existing_interest_statuses(service)
        existing = Handshake.objects.filter(service=service, requester=user, status__in=existing_statuses).first()

        if existing:
            raise ValueError('You have already expressed interest')
    
    @staticmethod
    def _determine_payer(service: Service, requester: User) -> User:
        """
        Determines who will pay based on service type.
        
        - For "Offer" posts: requester (receiver) pays
        - For "Need" posts: service owner (receiver) pays
        """
        if service.type == 'Offer':
            return requester  # Requester is the receiver
        else:  # service.type == 'Need'
            return service.user  # Service owner is the receiver
    
    @staticmethod
    def _check_balance(payer: User, service: Service, requester: User) -> None:
        """Validates payer has sufficient balance using Decimal."""
        if payer.timebank_balance < service.duration:
            payer_name = "You" if payer == requester else f"{payer.first_name} {payer.last_name}"
            verb = "need" if payer == requester else "needs"
            raise ValueError(
                f'Insufficient TimeBank balance. {payer_name} {verb} {service.duration} hours, have {payer.timebank_balance}'
            )
    
    @staticmethod
    def _create_handshake(service: Service, requester: User) -> Handshake:
        """Creates handshake record."""
        return Handshake.objects.create(
            service=service,
            requester=requester,
            provisioned_hours=service.duration,
            status='pending'
        )
    
    @staticmethod
    def _send_notifications(service: Service, handshake: Handshake, requester: User, service_owner: User) -> None:
        """Creates notifications."""
        create_notification(
            user=service_owner,
            notification_type='handshake_request',
            title='New Interest in Your Service',
            message=f"{requester.first_name} expressed interest in '{service.title}'",
            handshake=handshake,
            service=service
        )
    
    @staticmethod
    def _create_initial_message(handshake: Handshake, requester: User, service: Service) -> ChatMessage:
        """Creates initial chat message."""
        return ChatMessage.objects.create(
            handshake=handshake,
            sender=requester,
            body=f"Hi! I'm interested in your service: {service.title}"
        )
    
    @staticmethod
    def _invalidate_caches(requester: User, service_owner: User) -> None:
        """Invalidates conversation caches for both users."""
        invalidate_conversations(str(requester.id))
        invalidate_conversations(str(service_owner.id))


# ---------------------------------------------------------------------------
# Event-specific service layer — completely separate from HandshakeService.
# None of the methods below call into or modify HandshakeService.
# ---------------------------------------------------------------------------

class EventHandshakeService:
    """
    Business logic for the Event participation lifecycle.

    Events are credit-free: no TimeBank balance checks, no provisioning.
    Handshakes for Events are created directly with status='accepted' and
    provisioned_hours=0, bypassing the initiate→approve flow entirely.
    """

    # Statuses that consume a capacity slot for Events.
    # 'no_show' still occupies the slot (event already happened).
    EVENT_CAPACITY_STATUSES = ['accepted', 'checked_in', 'no_show']

    # Statuses that block a user from joining the same Event again.
    EVENT_BLOCK_STATUSES = ['accepted', 'checked_in', 'no_show']

    @staticmethod
    def join_event(service: Service, requester: User) -> Handshake:
        """
        Immediately RSVP a user to an Event.

        Creates an 'accepted' Handshake with provisioned_hours=0.
        Skips the initiate→approve flow used by Offer/Need.

        Raises:
            PermissionError: user is event-banned.
            ValueError: own event, duplicate RSVP, capacity full, event in past,
                        service is not an active Event.
        """
        with transaction.atomic():
            service = Service.objects.select_for_update().get(pk=service.pk)
            requester = User.objects.select_for_update().get(pk=requester.pk)

            # --- guards ---
            if service.type != 'Event':
                raise ValueError('Service is not an event.')

            if service.status != 'Active':
                raise ValueError('Event is not active.')

            if service.user_id == requester.pk:
                raise ValueError('You cannot join your own event.')

            # Ban check (re-read from locked row to be authoritative)
            if requester.is_event_banned_until and requester.is_event_banned_until > timezone.now():
                raise PermissionError(
                    f'You are banned from joining events until '
                    f'{requester.is_event_banned_until.strftime("%Y-%m-%d %H:%M UTC")}.'
                )

            # Event must have a future scheduled_time
            if not service.scheduled_time:
                raise ValueError('Event has no scheduled time configured.')
            if service.scheduled_time <= timezone.now():
                raise ValueError('Cannot join an event that has already started or passed.')

            # Duplicate check
            already_joined = Handshake.objects.filter(
                service=service,
                requester=requester,
                status__in=EventHandshakeService.EVENT_BLOCK_STATUSES,
            ).exists()
            if already_joined:
                raise ValueError('You have already joined this event.')

            # Capacity check
            current = Handshake.objects.filter(
                service=service,
                status__in=EventHandshakeService.EVENT_CAPACITY_STATUSES,
            ).count()
            if current >= service.max_participants:
                raise ValueError(
                    f'Event is full ({service.max_participants} participants max).'
                )

            # --- create ---
            handshake = Handshake.objects.create(
                service=service,
                requester=requester,
                status='accepted',
                provisioned_hours=Decimal('0'),
                scheduled_time=service.scheduled_time,
            )

            create_notification(
                user=service.user,
                notification_type='handshake_request',
                title='New Event RSVP',
                message=f"{requester.first_name} {requester.last_name} joined your event '{service.title}'.",
                handshake=handshake,
                service=service,
            )

        invalidate_conversations(str(requester.id))
        invalidate_conversations(str(service.user_id))
        return handshake

    @staticmethod
    def leave_event(handshake: Handshake, requester: User) -> Handshake:
        """
        Participant cancels their own Event RSVP before the lockdown window.

        Raises:
            PermissionError: caller is not the participant.
            ValueError: wrong service type, wrong status, inside lockdown window.
        """
        if handshake.requester_id != requester.pk:
            raise PermissionError('Only the participant can cancel their own RSVP.')

        if handshake.service.type != 'Event':
            raise ValueError('This action is only valid for Event handshakes.')

        if handshake.status not in ('accepted',):
            raise ValueError(
                f'Cannot leave: handshake is already "{handshake.status}".'
            )

        if handshake.service.is_in_lockdown_window:
            raise ValueError(
                'Cannot cancel your RSVP within 24 hours of the event start.'
            )

        with transaction.atomic():
            handshake.status = 'cancelled'
            handshake.save(update_fields=['status', 'updated_at'])

            create_notification(
                user=handshake.service.user,
                notification_type='handshake_cancelled',
                title='RSVP Cancelled',
                message=f"{requester.first_name} {requester.last_name} cancelled their RSVP "
                        f"for '{handshake.service.title}'.",
                handshake=handshake,
                service=handshake.service,
            )

        invalidate_conversations(str(requester.id))
        invalidate_conversations(str(handshake.service.user_id))
        return handshake

    @staticmethod
    def checkin(handshake: Handshake, requester: User) -> Handshake:
        """
        Participant checks in to an Event during the lockdown window.

        Validates that:
        - Caller is the participant.
        - Handshake is in 'accepted' status.
        - Event is within the 24-hour lockdown window.

        Raises:
            PermissionError: caller is not the participant.
            ValueError: wrong type/status, not in lockdown window.
        """
        if handshake.requester_id != requester.pk:
            raise PermissionError('Only the participant can check in.')

        if handshake.service.type != 'Event':
            raise ValueError('Check-in is only valid for Event handshakes.')

        if handshake.status != 'accepted':
            raise ValueError(
                f'Cannot check in: handshake is already "{handshake.status}".'
            )

        if not handshake.service.is_in_lockdown_window:
            raise ValueError(
                'Check-in is only available within 24 hours of the event start.'
            )

        with transaction.atomic():
            handshake.status = 'checked_in'
            handshake.save(update_fields=['status', 'updated_at'])

            create_notification(
                user=handshake.service.user,
                notification_type='handshake_accepted',
                title='Participant Checked In',
                message=f"{requester.first_name} {requester.last_name} has checked in "
                        f"for '{handshake.service.title}'.",
                handshake=handshake,
                service=handshake.service,
            )

        return handshake

    @staticmethod
    def complete_event(service: Service, organizer: User) -> None:
        """
        Organizer marks an Event as Completed.

        All handshakes still in 'accepted' (not checked in) become 'no_show'.
        Users reaching 3 no-shows receive a 14-day participation ban.

        Raises:
            PermissionError: caller is not the organizer.
            ValueError: wrong type or wrong service status.
        """
        if service.type != 'Event':
            raise ValueError('Service is not an event.')

        if service.user_id != organizer.pk:
            raise PermissionError('Only the event organizer can mark it as completed.')

        if service.status not in ('Active', 'Agreed'):
            raise ValueError(f'Cannot complete event with status "{service.status}".')

        with transaction.atomic():
            # Re-lock service and organizer rows
            service = Service.objects.select_for_update().get(pk=service.pk)
            organizer = User.objects.select_for_update().get(pk=organizer.pk)

            # Bulk-mark unchecked participants as no-shows (single SQL UPDATE)
            no_show_qs = Handshake.objects.filter(service=service, status='accepted')
            no_show_requester_ids = list(no_show_qs.values_list('requester_id', flat=True))
            no_show_qs.update(status='no_show')

            # Process ban logic per affected user
            BAN_THRESHOLD = 3
            BAN_DURATION_DAYS = 14

            for user_id in no_show_requester_ids:
                # Atomic increment + read in a single locked update
                User.objects.filter(pk=user_id).update(
                    no_show_count=django_models.F('no_show_count') + 1
                )
                user = User.objects.select_for_update().get(pk=user_id)

                if user.no_show_count >= BAN_THRESHOLD:
                    user.is_event_banned_until = timezone.now() + timedelta(days=BAN_DURATION_DAYS)
                    user.save(update_fields=['is_event_banned_until'])

                handshake = Handshake.objects.filter(
                    service=service, requester_id=user_id
                ).first()
                create_notification(
                    user=user,
                    notification_type='handshake_cancelled',
                    title='Marked as No-Show',
                    message=f"You were marked as a no-show for '{service.title}'."
                    + (
                        f" You have been banned from joining events for {BAN_DURATION_DAYS} days."
                        if user.no_show_count >= BAN_THRESHOLD else ''
                    ),
                    handshake=handshake,
                    service=service,
                )

            service.status = 'Completed'
            service.save(update_fields=['status', 'updated_at'])

    @staticmethod
    def cancel_event(service: Service, organizer: User) -> None:
        """
        Organizer cancels an Event.

        If inside the 24-hour lockdown window AND accepted participants exist,
        the organizer receives a 30-day ban from creating events.
        No TimeBank reversal is needed (provisioned_hours=0 for all participants).

        Raises:
            PermissionError: caller is not the organizer.
            ValueError: wrong type or wrong service status.
        """
        if service.type != 'Event':
            raise ValueError('Service is not an event.')

        if service.user_id != organizer.pk:
            raise PermissionError('Only the event organizer can cancel it.')

        if service.status not in ('Active', 'Agreed'):
            raise ValueError(f'Cannot cancel event with status "{service.status}".')

        BAN_DURATION_DAYS = 30

        with transaction.atomic():
            service = Service.objects.select_for_update().get(pk=service.pk)
            organizer = User.objects.select_for_update().get(pk=organizer.pk)

            active_participants_qs = Handshake.objects.filter(
                service=service, status__in=['accepted', 'checked_in']
            )
            has_participants = active_participants_qs.exists()

            # Apply organizer ban if cancelling within lockdown with participants
            if service.is_in_lockdown_window and has_participants:
                organizer.is_organizer_banned_until = timezone.now() + timedelta(days=BAN_DURATION_DAYS)
                organizer.save(update_fields=['is_organizer_banned_until'])

            # Notify all active participants
            participant_ids = list(
                active_participants_qs.values_list('requester_id', flat=True)
            )
            active_participants_qs.update(status='cancelled')

            for user_id in participant_ids:
                participant = User.objects.get(pk=user_id)
                handshake = Handshake.objects.filter(
                    service=service, requester_id=user_id
                ).first()
                create_notification(
                    user=participant,
                    notification_type='handshake_cancelled',
                    title='Event Cancelled',
                    message=f"The event '{service.title}' has been cancelled by the organizer.",
                    handshake=handshake,
                    service=service,
                )

            service.status = 'Cancelled'
            service.save(update_fields=['status', 'updated_at'])
