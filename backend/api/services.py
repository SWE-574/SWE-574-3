from __future__ import annotations

from decimal import Decimal, InvalidOperation
from datetime import timedelta
from django.conf import settings
from django.db import transaction
from django.db import models as django_models
from django.db.models import F, Q
from django.db.utils import OperationalError
from django.utils import timezone
import logging

from .models import (
    Handshake, Service, User, ChatMessage, ReputationRep, NegativeRep,
    EventEvaluationSummary, Report, TransactionHistory, Notification,
    Comment, Badge,
)
from .utils import (
    create_notification,
    provision_timebank,
    complete_timebank_transfer,
    cancel_timebank_transfer,
    get_provider_and_receiver,
)
from .cache_utils import invalidate_conversations, invalidate_transactions


def _to_bool(value):
    """Coerce a request-data value (possibly string) to a Python bool."""
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value.lower() in ('true', '1', 'yes')
    return bool(value)


class HandshakeServiceError(Exception):
    """Raised by HandshakeService methods to signal a business rule violation.

    Attributes:
        code: An ``ErrorCodes`` string for the API response.
        status_code: The HTTP status code the view should return.
    """

    def __init__(self, message: str, code: str = "INVALID_INPUT", status_code: int = 400) -> None:
        super().__init__(message)
        self.code = code
        self.status_code = status_code

logger = logging.getLogger(__name__)


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

        if (
            service.type == 'Offer'
            and service.schedule_type == 'One-Time'
            and service.max_participants > 1
            and service.scheduled_time is not None
            and service.scheduled_time <= timezone.now()
        ):
            return False, 'This group offer has already started or expired'
        
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

            if (
                service.type == 'Offer'
                and service.schedule_type == 'One-Time'
                and service.max_participants > 1
                and service.scheduled_time is not None
                and service.scheduled_time <= timezone.now()
            ):
                raise ValueError('This group offer has already started or expired')
            
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
            
            # Create initial chat message.
            initial_message = HandshakeService._create_initial_message(handshake, requester, service)

            # Broadcast only after the transaction is committed, so websocket consumers
            # can read the message row and we avoid rolling back handshake creation if
            # websocket transport is temporarily unavailable.
            transaction.on_commit(
                lambda: HandshakeService._broadcast_private_message(
                    handshake_id=handshake.id,
                    message_id=initial_message.id,
                )
            )
        
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
    def _broadcast_private_message(handshake_id, message_id) -> None:
        """Push a private chat message over websocket group transport."""
        try:
            from channels.layers import get_channel_layer
            from asgiref.sync import async_to_sync
            from .serializers import ChatMessageSerializer

            channel_layer = get_channel_layer()
            if not channel_layer:
                return

            message = ChatMessage.objects.select_related('sender', 'handshake').get(id=message_id)
            serializer = ChatMessageSerializer(message)

            async_to_sync(channel_layer.group_send)(
                f'chat_{handshake_id}',
                {
                    'type': 'chat_message',
                    'message': serializer.data,
                },
            )
        except Exception:
            # Realtime delivery should not block core interest/handshake creation.
            logger.warning(
                "Failed to broadcast private chat message",
                extra={"handshake_id": str(handshake_id), "message_id": str(message_id)},
                exc_info=True,
            )
    
    @staticmethod
    def _invalidate_caches(requester: User, service_owner: User) -> None:
        """Invalidates conversation caches for both users."""
        invalidate_conversations(str(requester.id))
        invalidate_conversations(str(service_owner.id))

    # ------------------------------------------------------------------
    # Handshake lifecycle methods (initiate → approve → confirm/cancel)
    # ------------------------------------------------------------------

    @staticmethod
    def _build_maps_url(exact_location: str, lat, lng) -> str:
        from urllib.parse import quote
        if lat is not None and lng is not None:
            try:
                return f"https://www.google.com/maps?q={float(lat)},{float(lng)}"
            except (TypeError, ValueError):
                pass
        return f"https://www.google.com/maps/search/?api=1&query={quote(exact_location)}"

    @staticmethod
    def initiate(handshake: Handshake, user: User, data: dict) -> tuple[Handshake, ChatMessage | None]:
        """
        Service-owner initiates the handshake by providing session details.

        Returns (handshake, session_chat_message). The caller is responsible
        for broadcasting ``session_chat_message`` over the WebSocket layer.

        Raises:
            HandshakeServiceError: On permission or business rule violations.
        """
        from .exceptions import ErrorCodes

        if handshake.service.user != user:
            raise HandshakeServiceError(
                'Only the service owner can initiate the handshake',
                code=ErrorCodes.PERMISSION_DENIED, status_code=403,
            )
        if handshake.status != 'pending':
            raise HandshakeServiceError('Handshake is not pending', code=ErrorCodes.INVALID_STATE)
        if handshake.provider_initiated:
            raise HandshakeServiceError(
                'You have already initiated this handshake', code=ErrorCodes.ALREADY_EXISTS,
            )

        service = handshake.service
        is_fixed_group_offer = (
            service.type == 'Offer'
            and service.schedule_type == 'One-Time'
            and service.max_participants > 1
        )

        if is_fixed_group_offer:
            if not service.location_area or not service.scheduled_time:
                raise HandshakeServiceError(
                    'This group offer is missing its fixed meeting details.',
                    code=ErrorCodes.INVALID_STATE,
                )

            handshake.provider_initiated = True
            handshake.exact_duration = service.duration
            handshake.scheduled_time = service.scheduled_time
            if service.location_type == 'Online':
                handshake.exact_location = ''
                handshake.exact_location_guide = ''
                handshake.exact_location_maps_url = None
            else:
                handshake.exact_location = service.session_exact_location or service.location_area
                handshake.exact_location_guide = service.session_location_guide
                if service.session_exact_location_lat is not None and service.session_exact_location_lng is not None:
                    handshake.exact_location_maps_url = HandshakeService._build_maps_url(
                        handshake.exact_location,
                        service.session_exact_location_lat,
                        service.session_exact_location_lng,
                    )
                elif service.location_lat is not None and service.location_lng is not None:
                    handshake.exact_location_maps_url = HandshakeService._build_maps_url(
                        handshake.exact_location, service.location_lat, service.location_lng,
                    )
                else:
                    from urllib.parse import quote
                    handshake.exact_location_maps_url = (
                        f"https://www.google.com/maps/search/?api=1&query="
                        f"{quote(service.session_exact_location or service.location_area or '')}"
                    )
            handshake.save()

            invalidate_conversations(str(service.user.id))
            invalidate_conversations(str(handshake.requester.id))

            create_notification(
                user=handshake.requester,
                notification_type='handshake_request',
                title='Group Offer Details Shared',
                message=(
                    f"{user.first_name} shared the fixed session details for "
                    f"'{handshake.service.title}'. Please review and approve."
                ),
                handshake=handshake,
                service=handshake.service,
            )

            from django.utils import timezone as tz
            loc = handshake.exact_location or ''
            guide = (handshake.exact_location_guide or '').strip()
            summary_time = tz.localtime(handshake.scheduled_time).strftime('%b %d, %Y %I:%M %p')
            parts = [f"\U0001F4C5 {summary_time}"]
            if loc:
                parts.append(f"\U0001F4CD {loc}")
            if guide:
                parts.append(f"\U0001F9ED {guide}")
            if handshake.exact_location_maps_url:
                parts.append(f"\U0001F517 {handshake.exact_location_maps_url}")
            session_msg = ChatMessage.objects.create(
                handshake=handshake, sender=user, body=" | ".join(parts),
            )
            return handshake, session_msg

        # --- standard (non-fixed-group) initiation ---
        from .timezone_utils import validate_and_normalize_datetime, validate_future_datetime
        from .exceptions import ErrorCodes

        exact_location = (data.get('exact_location') or '').strip()
        exact_duration = data.get('exact_duration')
        scheduled_time = data.get('scheduled_time')
        exact_location_lat = data.get('exact_location_lat')
        exact_location_lng = data.get('exact_location_lng')

        requires_exact_location = handshake.service.location_type != 'Online'
        if requires_exact_location and not exact_location:
            raise HandshakeServiceError('Exact location is required', code=ErrorCodes.VALIDATION_ERROR)
        if not exact_duration:
            raise HandshakeServiceError('Exact duration is required', code=ErrorCodes.VALIDATION_ERROR)
        if not scheduled_time:
            raise HandshakeServiceError('Scheduled time is required', code=ErrorCodes.VALIDATION_ERROR)

        parsed_time, parse_error = validate_and_normalize_datetime(scheduled_time)
        if parse_error:
            raise HandshakeServiceError(parse_error, code=ErrorCodes.VALIDATION_ERROR)

        future_error = validate_future_datetime(parsed_time)
        if future_error:
            raise HandshakeServiceError(future_error, code=ErrorCodes.VALIDATION_ERROR)

        try:
            exact_duration_decimal = Decimal(str(exact_duration))
            if exact_duration_decimal <= 0:
                raise HandshakeServiceError(
                    'Duration must be greater than 0', code=ErrorCodes.VALIDATION_ERROR,
                )
            if (
                handshake.service.type in ('Offer', 'Need')
                and exact_duration_decimal != exact_duration_decimal.to_integral_value()
            ):
                raise HandshakeServiceError(
                    'Duration must be a whole number of hours', code=ErrorCodes.VALIDATION_ERROR,
                )
        except (InvalidOperation, ValueError, TypeError) as exc:
            if isinstance(exc, HandshakeServiceError):
                raise
            raise HandshakeServiceError('Invalid duration format', code=ErrorCodes.VALIDATION_ERROR) from exc

        from .schedule_utils import check_schedule_conflict
        conflicts = check_schedule_conflict(
            user, parsed_time, float(exact_duration_decimal), exclude_handshake=handshake,
        )
        if conflicts:
            info = conflicts[0]
            other_user_name = f"{info['other_user'].first_name} {info['other_user'].last_name}".strip()
            conflict_time = info['scheduled_time'].strftime('%Y-%m-%d %H:%M')
            err = HandshakeServiceError('Schedule conflict detected', code=ErrorCodes.CONFLICT)
            err.extra = {
                'conflict': True,
                'conflict_details': {
                    'service_title': info['service_title'],
                    'scheduled_time': conflict_time,
                    'other_user': other_user_name,
                },
            }
            raise err

        if exact_location:
            handshake.exact_location_maps_url = HandshakeService._build_maps_url(
                exact_location, exact_location_lat, exact_location_lng,
            )
        else:
            handshake.exact_location_maps_url = None

        handshake.provider_initiated = True
        handshake.exact_location = exact_location
        handshake.exact_duration = exact_duration_decimal
        handshake.scheduled_time = parsed_time
        handshake.save()

        invalidate_conversations(str(service.user.id))
        invalidate_conversations(str(handshake.requester.id))

        create_notification(
            user=handshake.requester,
            notification_type='handshake_request',
            title='Service Details Provided',
            message=(
                f"{user.first_name} has provided session details for "
                f"'{handshake.service.title}'. Please review and approve."
            ),
            handshake=handshake,
            service=handshake.service,
        )

        from django.utils import timezone as tz
        summary_time = tz.localtime(parsed_time).strftime('%b %d, %Y %I:%M %p')
        parts = [f"\U0001F4C5 {summary_time}"]
        if exact_location:
            parts.append(f"\U0001F4CD {exact_location}")
        if handshake.exact_location_maps_url:
            parts.append(f"\U0001F517 {handshake.exact_location_maps_url}")
        session_msg = ChatMessage.objects.create(
            handshake=handshake, sender=user, body=" | ".join(parts),
        )
        return handshake, session_msg

    @staticmethod
    def approve(handshake: Handshake, user: User) -> tuple[Handshake, ChatMessage]:
        """
        Requester approves session details, triggering TimeBank provisioning.

        Returns (handshake, approve_chat_message). Caller broadcasts the message.

        Raises:
            HandshakeServiceError: On permission or business rule violations.
        """
        from .exceptions import ErrorCodes

        if handshake.requester != user:
            raise HandshakeServiceError(
                'Only the requester can approve the handshake',
                code=ErrorCodes.PERMISSION_DENIED, status_code=403,
            )
        if handshake.status != 'pending':
            raise HandshakeServiceError('Handshake is not pending', code=ErrorCodes.INVALID_STATE)
        if not handshake.provider_initiated:
            raise HandshakeServiceError(
                'Provider must initiate the handshake first', code=ErrorCodes.INVALID_STATE,
            )
        # Online sessions do not share an exact location, but in-person sessions still require it.
        requires_exact_location = handshake.service.location_type != 'Online'
        if requires_exact_location:
            missing = (
                not handshake.exact_location
                or not handshake.exact_duration
                or not handshake.scheduled_time
            )
            msg = 'Provider must provide exact location, duration, and scheduled time before approval'
        else:
            missing = not handshake.exact_duration or not handshake.scheduled_time
            msg = 'Provider must provide duration and scheduled time before approval'

        if missing:
            err = HandshakeServiceError(msg, code=ErrorCodes.INVALID_STATE)
            err.extra = {'requires_details': True}
            raise err

        if handshake.service.type in ('Offer', 'Need') and handshake.exact_duration is not None:
            handshake.provisioned_hours = handshake.exact_duration
            handshake.save(update_fields=['provisioned_hours'])

        try:
            provision_timebank(handshake)
        except ValueError as exc:
            raise HandshakeServiceError(
                str(exc), code=ErrorCodes.INSUFFICIENT_BALANCE,
            ) from exc

        handshake.status = 'accepted'
        handshake.requester_initiated = True
        handshake.save()

        from django.utils import timezone as tz
        from datetime import timedelta as _timedelta

        summary_time = tz.localtime(handshake.scheduled_time).strftime('%b %d, %Y %I:%M %p')
        loc = handshake.exact_location or ''
        approve_body = f"Session approved! See you on {summary_time}."
        if loc:
            approve_body = f"Session approved! See you on {summary_time} at {loc}."
        approve_msg = ChatMessage.objects.create(
            handshake=handshake,
            sender=user,
            body=approve_body,
        )

        create_notification(
            user=handshake.service.user,
            notification_type='handshake_accepted',
            title='Handshake Approved',
            message=(
                f"{user.first_name} has approved the handshake for "
                f"'{handshake.service.title}'. The handshake is now accepted."
            ),
            handshake=handshake,
            service=handshake.service,
        )

        service_time = handshake.scheduled_time
        duration_hours = float(handshake.exact_duration)
        completion_time = service_time + _timedelta(hours=duration_hours)

        if service_time > timezone.now():
            for party in (handshake.service.user, handshake.requester):
                create_notification(
                    user=party,
                    notification_type='service_reminder',
                    title='Service Reminder',
                    message=(
                        f"Your service '{handshake.service.title}' is scheduled for "
                        f"{service_time.strftime('%Y-%m-%d %H:%M')}"
                    ),
                    handshake=handshake,
                    service=handshake.service,
                )

        if completion_time > timezone.now():
            for party in (handshake.service.user, handshake.requester):
                create_notification(
                    user=party,
                    notification_type='service_confirmation',
                    title='Service Completion Reminder',
                    message=(
                        f"Please confirm completion of '{handshake.service.title}' "
                        f"after {completion_time.strftime('%Y-%m-%d %H:%M')}"
                    ),
                    handshake=handshake,
                    service=handshake.service,
                )

        return handshake, approve_msg

    @staticmethod
    def accept(handshake: Handshake, user: User) -> Handshake:
        """
        Service provider accepts a pending handshake (Need/Offer without the
        initiate→approve flow, or when provider is the one accepting interest).

        Raises:
            HandshakeServiceError: On permission or business rule violations.
        """
        from .exceptions import ErrorCodes

        if handshake.service.user != user:
            raise HandshakeServiceError(
                'Only the service provider can accept',
                code=ErrorCodes.PERMISSION_DENIED, status_code=403,
            )
        if handshake.status != 'pending':
            raise HandshakeServiceError('Handshake is not pending', code=ErrorCodes.INVALID_STATE)

        try:
            provision_timebank(handshake)
        except ValueError as exc:
            raise HandshakeServiceError(
                str(exc), code=ErrorCodes.INSUFFICIENT_BALANCE,
            ) from exc

        service = handshake.service
        with transaction.atomic():
            handshake.status = 'accepted'
            handshake.save()

            if service.schedule_type == 'One-Time':
                accepted_count = Handshake.objects.filter(
                    service=service,
                    status__in=['accepted', 'completed', 'reported', 'paused'],
                ).count()

                if accepted_count >= service.max_participants:
                    other_pending = Handshake.objects.filter(
                        service=service, status='pending',
                    ).exclude(pk=handshake.pk)

                    denied_requesters = list(other_pending.values_list('requester_id', flat=True))
                    other_pending.update(status='denied')

                    users_by_id = User.objects.in_bulk(denied_requesters)
                    for requester_id in denied_requesters:
                        u = users_by_id.get(requester_id)
                        if u is None:
                            continue
                        create_notification(
                            user=u,
                            notification_type='handshake_denied',
                            title='Request Not Accepted',
                            message=f"All slots for '{service.title}' are now filled.",
                            service=service,
                        )
                        invalidate_conversations(str(requester_id))

                    if service.status == 'Active':
                        Service.objects.filter(pk=service.pk).update(status='Agreed')

        invalidate_conversations(str(handshake.requester.id))
        invalidate_conversations(str(service.user.id))

        create_notification(
            user=handshake.requester,
            notification_type='handshake_accepted',
            title='Handshake Accepted',
            message=f"Your interest in '{service.title}' has been accepted!",
            handshake=handshake,
            service=service,
        )
        return handshake

    @staticmethod
    def confirm_completion(handshake: Handshake, user: User, hours=None) -> Handshake:
        """
        Record one party's confirmation of service completion.

        When both parties confirm, triggers the TimeBank transfer and opens
        the evaluation window.

        Raises:
            HandshakeServiceError: On permission or business rule violations.
        """
        from .exceptions import ErrorCodes

        provider, receiver = get_provider_and_receiver(handshake)
        is_provider = provider == user
        is_receiver = receiver == user

        if not (is_provider or is_receiver):
            raise HandshakeServiceError('Not authorized', code=ErrorCodes.PERMISSION_DENIED, status_code=403)
        if handshake.status != 'accepted':
            raise HandshakeServiceError('Handshake must be accepted', code=ErrorCodes.INVALID_STATE)

        if hours is not None:
            try:
                hours_decimal = Decimal(str(hours))
                if hours_decimal <= 0:
                    raise HandshakeServiceError(
                        'Hours must be greater than 0', code=ErrorCodes.VALIDATION_ERROR,
                    )
                if hours_decimal > 24:
                    raise HandshakeServiceError(
                        'Hours cannot exceed 24', code=ErrorCodes.VALIDATION_ERROR,
                    )
                if (
                    handshake.service.type in ('Offer', 'Need')
                    and hours_decimal != hours_decimal.to_integral_value()
                ):
                    raise HandshakeServiceError(
                        'Hours must be a whole number', code=ErrorCodes.VALIDATION_ERROR,
                    )

                old_hours = handshake.provisioned_hours
                if handshake.status == 'accepted' and hours_decimal != old_hours:
                    difference = hours_decimal - old_hours
                    # receiver is the one who pays hours
                    payer = handshake.requester
                    with transaction.atomic():
                        payer_locked = User.objects.select_for_update().get(id=payer.id)
                        if difference > 0:
                            if payer_locked.timebank_balance < difference:
                                raise HandshakeServiceError(
                                    f'Insufficient balance. Need {difference} more hours',
                                    code=ErrorCodes.INSUFFICIENT_BALANCE,
                                )
                            payer_locked.timebank_balance = F("timebank_balance") - difference
                            payer_locked.save(update_fields=["timebank_balance"])
                            payer_locked.refresh_from_db(fields=["timebank_balance"])
                            TransactionHistory.objects.create(
                                user=payer_locked,
                                transaction_type='provision',
                                amount=-difference,
                                balance_after=payer_locked.timebank_balance,
                                handshake=handshake,
                                description=(
                                    f"Additional hours escrowed for '{handshake.service.title}' "
                                    f"(adjusted from {old_hours} to {hours_decimal} hours)"
                                ),
                            )
                            invalidate_transactions(str(payer_locked.id))
                        else:
                            payer_locked.timebank_balance = F("timebank_balance") + abs(difference)
                            payer_locked.save(update_fields=["timebank_balance"])
                            payer_locked.refresh_from_db(fields=["timebank_balance"])
                            TransactionHistory.objects.create(
                                user=payer_locked,
                                transaction_type='refund',
                                amount=abs(difference),
                                balance_after=payer_locked.timebank_balance,
                                handshake=handshake,
                                description=(
                                    f"Hours adjusted for '{handshake.service.title}' "
                                    f"(refunded {abs(difference)} hours, changed from {old_hours} to {hours_decimal} hours)"
                                ),
                            )
                            invalidate_transactions(str(payer_locked.id))

                handshake.provisioned_hours = hours_decimal
            except (InvalidOperation, ValueError, TypeError) as exc:
                if isinstance(exc, HandshakeServiceError):
                    raise
                raise HandshakeServiceError('Invalid hours value', code=ErrorCodes.VALIDATION_ERROR) from exc

        if is_provider:
            handshake.provider_confirmed_complete = True
        else:
            handshake.receiver_confirmed_complete = True

        handshake.save()

        invalidate_conversations(str(handshake.service.user.id))
        invalidate_conversations(str(handshake.requester.id))

        if handshake.provider_confirmed_complete and handshake.receiver_confirmed_complete:
            with transaction.atomic():
                complete_timebank_transfer(handshake)
                window_start = timezone.now()
                Handshake.objects.filter(id=handshake.id).update(
                    evaluation_window_starts_at=window_start,
                    evaluation_window_ends_at=window_start + timedelta(hours=settings.FEEDBACK_WINDOW_HOURS),
                    evaluation_window_closed_at=None,
                )
                handshake.refresh_from_db(
                    fields=['status', 'evaluation_window_starts_at', 'evaluation_window_ends_at',
                            'evaluation_window_closed_at'],
                )
                create_notification(
                    user=handshake.service.user,
                    notification_type='positive_rep',
                    title='Leave Feedback',
                    message=(
                        f"Service completed! Would you like to leave positive feedback "
                        f"for {handshake.requester.first_name}?"
                    ),
                    handshake=handshake,
                )
                create_notification(
                    user=handshake.requester,
                    notification_type='positive_rep',
                    title='Leave Feedback',
                    message=(
                        f"Service completed! Would you like to leave positive feedback "
                        f"for {handshake.service.user.first_name}?"
                    ),
                    handshake=handshake,
                )

        return handshake

    @staticmethod
    def cancel(handshake: Handshake, user: User) -> Handshake:
        """
        Directly cancel a pending handshake.

        Raises:
            HandshakeServiceError: On permission or state violations.
        """
        from .exceptions import ErrorCodes

        if handshake.service.user != user and handshake.requester != user:
            raise HandshakeServiceError(
                'Only the service owner or the requester can cancel this handshake',
                code=ErrorCodes.PERMISSION_DENIED, status_code=403,
            )

        with transaction.atomic():
            locked = (
                Handshake.objects
                .select_for_update()
                .select_related('service', 'requester', 'service__user')
                .get(pk=handshake.pk)
            )

            if locked.status == 'accepted' and locked.service.type != 'Event':
                raise HandshakeServiceError(
                    'Accepted handshakes require a cancellation request and approval',
                    code=ErrorCodes.INVALID_STATE,
                )
            if locked.status != 'pending':
                raise HandshakeServiceError(
                    'Can only directly cancel pending handshakes', code=ErrorCodes.INVALID_STATE,
                )

            locked.status = 'cancelled'
            locked.save(update_fields=['status', 'updated_at'])

            if user == locked.requester:
                create_notification(
                    user=locked.service.user,
                    notification_type='handshake_cancelled',
                    title='Handshake Cancelled',
                    message=(
                        f"{user.first_name} {user.last_name} cancelled their request "
                        f"for '{locked.service.title}'."
                    ),
                    handshake=locked,
                    service=locked.service,
                )

        return locked

    @staticmethod
    def request_cancellation(handshake: Handshake, user: User, reason: str = '') -> Handshake:
        """
        Request cancellation of an accepted handshake (requires counterpart approval).

        Raises:
            HandshakeServiceError: On permission or state violations.
        """
        from .exceptions import ErrorCodes

        if handshake.service.user != user and handshake.requester != user:
            raise HandshakeServiceError(
                'Only the service owner or the requester can request cancellation',
                code=ErrorCodes.PERMISSION_DENIED, status_code=403,
            )

        with transaction.atomic():
            locked = (
                Handshake.objects
                .select_for_update()
                .select_related('service', 'requester', 'service__user')
                .get(pk=handshake.pk)
            )

            if locked.service.type == 'Event':
                raise HandshakeServiceError(
                    'Cancellation requests are only available for Offer and Need handshakes',
                    code=ErrorCodes.INVALID_STATE,
                )
            if locked.status != 'accepted':
                raise HandshakeServiceError(
                    'Can only request cancellation for accepted handshakes', code=ErrorCodes.INVALID_STATE,
                )
            if locked.cancellation_requested_by_id is not None:
                raise HandshakeServiceError(
                    'A cancellation request is already pending for this handshake',
                    code=ErrorCodes.ALREADY_EXISTS,
                )

            locked.cancellation_requested_by = user
            locked.cancellation_requested_at = timezone.now()
            locked.cancellation_reason = reason
            locked.save(update_fields=[
                'cancellation_requested_by', 'cancellation_requested_at',
                'cancellation_reason', 'updated_at',
            ])

            other_user = (
                locked.requester if locked.service.user == user else locked.service.user
            )
            display_name = f"{user.first_name} {user.last_name}".strip() or user.email
            msg = f"{display_name} requested to cancel '{locked.service.title}'."
            if reason:
                msg = f"{msg} Reason: {reason}"

            create_notification(
                user=other_user,
                notification_type='handshake_cancellation_requested',
                title='Cancellation Requested',
                message=msg,
                handshake=locked,
                service=locked.service,
            )
            invalidate_conversations(str(locked.requester_id))
            invalidate_conversations(str(locked.service.user_id))

        return locked

    @staticmethod
    def approve_cancellation(handshake: Handshake, user: User) -> Handshake:
        """
        Approve a pending cancellation request, refunding escrowed hours.

        Raises:
            HandshakeServiceError: On permission or state violations.
        """
        from .exceptions import ErrorCodes

        if handshake.service.user != user and handshake.requester != user:
            raise HandshakeServiceError(
                'Only the service owner or the requester can approve cancellation',
                code=ErrorCodes.PERMISSION_DENIED, status_code=403,
            )

        with transaction.atomic():
            locked = (
                Handshake.objects
                .select_for_update()
                .select_related('service', 'requester', 'service__user')
                .get(pk=handshake.pk)
            )

            if locked.service.type == 'Event':
                raise HandshakeServiceError(
                    'Cancellation requests are only available for Offer and Need handshakes',
                    code=ErrorCodes.INVALID_STATE,
                )
            if locked.status != 'accepted':
                raise HandshakeServiceError(
                    'Can only approve cancellation for accepted handshakes', code=ErrorCodes.INVALID_STATE,
                )
            if locked.cancellation_requested_by_id is None:
                raise HandshakeServiceError(
                    'There is no pending cancellation request for this handshake',
                    code=ErrorCodes.INVALID_STATE,
                )
            if locked.cancellation_requested_by_id == user.id:
                raise HandshakeServiceError(
                    'The user who requested cancellation cannot approve it',
                    code=ErrorCodes.PERMISSION_DENIED, status_code=403,
                )

            svc = locked.service
            # Access nullable FK separately to avoid outer-join locking issue
            cancel_requester = User.objects.get(pk=locked.cancellation_requested_by_id)
            requester_name = (
                f"{cancel_requester.first_name} "
                f"{cancel_requester.last_name}"
            ).strip() or cancel_requester.email

            cancel_timebank_transfer(locked)

            if svc.status == 'Agreed':
                Service.objects.filter(pk=svc.pk).update(status='Active')

            create_notification(
                user=svc.user,
                notification_type='handshake_cancelled',
                title='Cancellation Approved',
                message=(
                    f"The cancellation request for '{svc.title}' was approved by mutual agreement. "
                    f"Requested by {requester_name}."
                ),
                handshake=locked,
                service=svc,
            )

        return locked

    @staticmethod
    def reject_cancellation(handshake: Handshake, user: User) -> Handshake:
        """
        Reject a pending cancellation request.

        Raises:
            HandshakeServiceError: On permission or state violations.
        """
        from .exceptions import ErrorCodes

        if handshake.service.user != user and handshake.requester != user:
            raise HandshakeServiceError(
                'Only the service owner or the requester can reject cancellation',
                code=ErrorCodes.PERMISSION_DENIED, status_code=403,
            )

        with transaction.atomic():
            locked = (
                Handshake.objects
                .select_for_update()
                .select_related('service', 'requester', 'service__user')
                .get(pk=handshake.pk)
            )

            if locked.service.type == 'Event':
                raise HandshakeServiceError(
                    'Cancellation requests are only available for Offer and Need handshakes',
                    code=ErrorCodes.INVALID_STATE,
                )
            if locked.status != 'accepted':
                raise HandshakeServiceError(
                    'Can only reject cancellation for accepted handshakes', code=ErrorCodes.INVALID_STATE,
                )
            if locked.cancellation_requested_by_id is None:
                raise HandshakeServiceError(
                    'There is no pending cancellation request for this handshake',
                    code=ErrorCodes.INVALID_STATE,
                )
            if locked.cancellation_requested_by_id == user.id:
                raise HandshakeServiceError(
                    'The user who requested cancellation cannot reject it',
                    code=ErrorCodes.PERMISSION_DENIED, status_code=403,
                )

            # Access nullable FK separately to avoid outer-join locking issue
            request_user = User.objects.get(pk=locked.cancellation_requested_by_id)
            locked.cancellation_requested_by = None
            locked.cancellation_requested_at = None
            locked.cancellation_reason = ''
            locked.save(update_fields=[
                'cancellation_requested_by', 'cancellation_requested_at',
                'cancellation_reason', 'updated_at',
            ])

            responder_name = f"{user.first_name} {user.last_name}".strip() or user.email
            create_notification(
                user=request_user,
                notification_type='handshake_cancellation_rejected',
                title='Cancellation Request Declined',
                message=(
                    f"{responder_name} declined your cancellation request for "
                    f"'{locked.service.title}'."
                ),
                handshake=locked,
                service=locked.service,
            )
            invalidate_conversations(str(locked.requester_id))
            invalidate_conversations(str(locked.service.user_id))

        return locked

    # ------------------------------------------------------------------
    # Report issue
    # ------------------------------------------------------------------

    @staticmethod
    def report_issue(handshake, user, data):
        """File an issue report against another party in a handshake.

        Returns:
            Report instance on success.

        Raises:
            HandshakeServiceError on any business-rule violation.
        """
        from .exceptions import ErrorCodes

        issue_type = (data.get('issue_type') or 'no_show').strip().lower()
        description = (data.get('description') or '').strip()
        is_event_handshake = handshake.service.type == 'Event'

        allowed_types = {'no_show', 'service_issue', 'harassment', 'spam', 'scam', 'other'}
        if issue_type not in allowed_types:
            raise HandshakeServiceError(
                'Invalid issue_type.',
                code=ErrorCodes.VALIDATION_ERROR,
                status_code=400,
            )

        provider, receiver = get_provider_and_receiver(handshake)
        is_provider = provider == user
        is_receiver = receiver == user

        if not (is_provider or is_receiver):
            raise HandshakeServiceError(
                'Not authorized',
                code=ErrorCodes.PERMISSION_DENIED,
                status_code=403,
            )

        # Event no-show time window enforcement
        if is_event_handshake and issue_type == 'no_show':
            event_start = handshake.service.scheduled_time or handshake.scheduled_time
            if not event_start:
                raise HandshakeServiceError(
                    'Event start time is required to submit reports.',
                    code=ErrorCodes.VALIDATION_ERROR,
                    status_code=400,
                )
            now = timezone.now()
            report_window_ends_at = event_start + timedelta(hours=24)
            if now < event_start or now > report_window_ends_at:
                raise HandshakeServiceError(
                    'Event no-show reports are allowed from event start time up to 24 hours after start.',
                    code=ErrorCodes.VALIDATION_ERROR,
                    status_code=400,
                )

        # Determine reported user (with optional override for events)
        reported_user = receiver if is_provider else provider
        reported_user_id = data.get('reported_user_id')
        if reported_user_id is not None:
            if not is_event_handshake:
                raise HandshakeServiceError(
                    'reported_user_id can only be used for event reports.',
                    code=ErrorCodes.VALIDATION_ERROR,
                    status_code=400,
                )

            event_member_ids = set(
                handshake.service.handshakes.filter(
                    status__in=['accepted', 'reported', 'paused', 'checked_in', 'attended', 'no_show', 'completed']
                ).values_list('requester_id', flat=True)
            )
            event_member_ids.add(handshake.service.user_id)

            try:
                target_user = User.objects.get(id=reported_user_id)
            except (ValueError, TypeError, User.DoesNotExist):
                raise HandshakeServiceError(
                    'Invalid reported_user_id.',
                    code=ErrorCodes.VALIDATION_ERROR,
                    status_code=400,
                )

            if target_user.id not in event_member_ids:
                raise HandshakeServiceError(
                    'reported_user_id must belong to the event organizer or an active participant.',
                    code=ErrorCodes.VALIDATION_ERROR,
                    status_code=400,
                )

            if str(target_user.id) == str(user.id):
                raise HandshakeServiceError(
                    'You cannot report yourself.',
                    code=ErrorCodes.VALIDATION_ERROR,
                    status_code=400,
                )

            reported_user = target_user

        # Duplicate detection
        has_open_duplicate = Report.objects.filter(
            reporter=user,
            reported_user=reported_user,
            related_handshake=handshake,
            type=issue_type,
            status='pending',
        ).exists()
        if has_open_duplicate:
            raise HandshakeServiceError(
                'You already have an open report for this issue and user in this event.',
                code=ErrorCodes.VALIDATION_ERROR,
                status_code=400,
            )

        # Default descriptions
        if not description:
            default_descriptions = {
                'no_show': 'No-show dispute reported',
                'service_issue': 'Service issue reported',
                'harassment': 'Harassment or abusive behavior reported',
                'spam': 'Spam or disruptive behavior reported',
                'scam': 'Scam or fraud concern reported',
                'other': 'Other issue reported',
            }
            description = default_descriptions.get(issue_type, 'Issue reported')

        report = Report.objects.create(
            reporter=user,
            reported_user=reported_user,
            related_handshake=handshake,
            reported_service=handshake.service,
            type=issue_type,
            description=description,
        )

        # Only mark handshake as 'reported' when reporting the event organizer
        reported_is_organizer = (
            reported_user is not None
            and str(reported_user.id) == str(handshake.service.user_id)
        )
        if is_event_handshake and reported_is_organizer and handshake.status != 'reported':
            handshake.status = 'reported'
            handshake.save(update_fields=['status', 'updated_at'])

        # Notify admins
        admins = User.objects.filter(role='admin')
        for admin in admins:
            create_notification(
                user=admin,
                notification_type='admin_warning',
                title='New Report Requires Review',
                message=f"New {report.get_type_display()} report for service '{handshake.service.title}'",
                handshake=handshake,
            )

        return report


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
    EVENT_CAPACITY_STATUSES = ['accepted', 'checked_in', 'attended', 'no_show']

    # Statuses that block a user from joining the same Event again.
    EVENT_BLOCK_STATUSES = ['accepted', 'checked_in', 'attended', 'no_show']

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
        with transaction.atomic():
            # Reload and lock the handshake row to avoid TOCTOU issues.
            locked_handshake = (
                Handshake.objects
                .select_for_update()
                .select_related('service')
                .get(pk=handshake.pk)
            )

            if locked_handshake.requester_id != requester.pk:
                raise PermissionError('Only the participant can cancel their own RSVP.')

            if locked_handshake.service.type != 'Event':
                raise ValueError('This action is only valid for Event handshakes.')

            if locked_handshake.status not in ('accepted',):
                raise ValueError(
                    f'Cannot leave: handshake is already "{locked_handshake.status}".'
                )

            if locked_handshake.service.is_in_lockdown_window:
                raise ValueError(
                    'Cannot cancel your RSVP within 24 hours of the event start.'
                )

            locked_handshake.status = 'cancelled'
            locked_handshake.save(update_fields=['status', 'updated_at'])

            create_notification(
                user=locked_handshake.service.user,
                notification_type='handshake_cancelled',
                title='RSVP Cancelled',
                message=f"{requester.first_name} {requester.last_name} cancelled their RSVP "
                        f"for '{locked_handshake.service.title}'.",
                handshake=locked_handshake,
                service=locked_handshake.service,
            )

        invalidate_conversations(str(requester.id))
        invalidate_conversations(str(locked_handshake.service.user_id))
        return locked_handshake

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

        if handshake.service.scheduled_time and handshake.service.scheduled_time <= timezone.now():
            raise ValueError(
                'Check-in is no longer available after the event has started.'
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
    def mark_attended(handshake: Handshake, organizer: User) -> Handshake:
        """
        Organizer confirms a checked-in participant as attended.

        Transition:
            checked_in -> attended

        Raises:
            PermissionError: caller is not the event organizer.
            ValueError: wrong type/status.
        """
        with transaction.atomic():
            locked_handshake = (
                Handshake.objects
                .select_for_update()
                .select_related('service', 'requester')
                .get(pk=handshake.pk)
            )

            if locked_handshake.service.type != 'Event':
                raise ValueError('This action is only valid for Event handshakes.')

            if locked_handshake.service.user_id != organizer.pk:
                raise PermissionError('Only the event organizer can mark attendance.')

            if locked_handshake.status != 'checked_in':
                raise ValueError(
                    f'Cannot mark attended: handshake is "{locked_handshake.status}".'
                )

            locked_handshake.status = 'attended'
            locked_handshake.save(update_fields=['status', 'updated_at'])

            create_notification(
                user=locked_handshake.requester,
                notification_type='handshake_accepted',
                title='Attendance Confirmed',
                message=f"Your attendance was confirmed for '{locked_handshake.service.title}'.",
                handshake=locked_handshake,
                service=locked_handshake.service,
            )

        invalidate_conversations(str(organizer.id))
        invalidate_conversations(str(locked_handshake.requester_id))
        return locked_handshake

    @staticmethod
    def complete_event(service: Service, organizer: User) -> None:
        """
        Organizer marks an Event as Completed.

        All handshakes still in 'accepted' or 'checked_in' become 'no_show'.
        Handshakes in 'attended' remain attended.
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

            # Bulk-mark non-attended participants as no-shows (single SQL UPDATE)
            no_show_qs = Handshake.objects.filter(
                service=service,
                status__in=['accepted', 'checked_in'],
            )
            no_show_requester_ids = list(no_show_qs.values_list('requester_id', flat=True).distinct())
            no_show_qs.update(status='no_show', updated_at=timezone.now())

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
                    service=service,
                    requester_id=user_id,
                    status='no_show',
                ).order_by('-id').first()
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
            service.event_completed_at = timezone.now()
            service.save(update_fields=['status', 'event_completed_at', 'updated_at'])

            window_start = service.event_completed_at
            window_end = window_start + timedelta(hours=settings.FEEDBACK_WINDOW_HOURS)
            attended_handshakes = list(
                Handshake.objects.filter(service=service, status='attended').select_related('requester')
            )
            Handshake.objects.filter(
                id__in=[handshake.id for handshake in attended_handshakes]
            ).update(
                evaluation_window_starts_at=window_start,
                evaluation_window_ends_at=window_end,
                evaluation_window_closed_at=None,
            )

            for attended_handshake in attended_handshakes:
                create_notification(
                    user=attended_handshake.requester,
                    notification_type='positive_rep',
                    title='Leave Feedback',
                    message=(
                        f"Event '{service.title}' has ended. "
                        f"You can now leave feedback for {organizer.first_name}."
                    ),
                    handshake=attended_handshake,
                    service=service,
                )

    @staticmethod
    def cancel_event(service: Service, organizer: User, reason: str = '') -> None:
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
            active_participants_qs.update(status='cancelled', cancellation_reason=reason, updated_at=timezone.now())

            for user_id in participant_ids:
                participant = User.objects.get(pk=user_id)
                handshake = Handshake.objects.filter(
                    service=service,
                    requester_id=user_id,
                    status='cancelled',
                ).order_by('-id').first()
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


class EventNoShowAppealService:
    """Service logic for event no-show appeal submission and resolution."""

    BAN_THRESHOLD = 3

    @staticmethod
    def submit_appeal(handshake: Handshake, attendee: User, description: str | None = None) -> Report:
        """Submit a no-show appeal for an event handshake."""
        if handshake.service.type != 'Event':
            raise ValueError('No-show appeal is only available for events.')
        if handshake.requester_id != attendee.pk:
            raise PermissionError('Only the participant can appeal a no-show status.')

        with transaction.atomic():
            locked_handshake = Handshake.objects.select_related('service', 'service__user').select_for_update().get(pk=handshake.pk)

            if locked_handshake.status != 'no_show':
                raise ValueError('Appeal is only available for handshakes marked as no-show.')

            duplicate_exists = Report.objects.filter(
                reporter=attendee,
                related_handshake=locked_handshake,
                type='no_show',
                status='pending',
            ).exists()
            if duplicate_exists:
                raise ValueError('You already have a pending no-show appeal for this event.')

            cleaned_description = (description or '').strip() or 'Appeal submitted for no-show classification.'
            report = Report.objects.create(
                reporter=attendee,
                reported_user=locked_handshake.service.user,
                related_handshake=locked_handshake,
                reported_service=locked_handshake.service,
                type='no_show',
                description=cleaned_description,
            )

            organizer = locked_handshake.service.user
            create_notification(
                user=organizer,
                notification_type='admin_warning',
                title='No-Show Appeal Submitted',
                message=(
                    f"{attendee.first_name} {attendee.last_name} appealed no-show status "
                    f"for '{locked_handshake.service.title}'."
                ),
                handshake=locked_handshake,
                service=locked_handshake.service,
            )

            for admin in User.objects.filter(role='admin').only('id'):
                create_notification(
                    user=admin,
                    notification_type='admin_warning',
                    title='No-Show Appeal Requires Review',
                    message=(
                        f"New no-show appeal for event '{locked_handshake.service.title}' "
                        f"from {attendee.first_name} {attendee.last_name}."
                    ),
                    handshake=locked_handshake,
                    service=locked_handshake.service,
                )

            return report

    @staticmethod
    def resolve_appeal(
        report: Report,
        admin_user: User,
        action_type: str,
        admin_notes: str | None = None,
    ) -> Report:
        """Resolve a pending no-show appeal with uphold or overturn outcome."""
        if admin_user.role not in ('admin', 'super_admin', 'moderator'):
            raise PermissionError('Admin access required')

        with transaction.atomic():
            locked_report = Report.objects.select_for_update().get(pk=report.pk)

            handshake = locked_report.related_handshake
            if locked_report.type != 'no_show' or not handshake:
                raise ValueError('This report is not an event no-show appeal.')
            if handshake.service.type != 'Event':
                raise ValueError('No-show appeal resolution is only available for events.')
            if locked_report.status != 'pending':
                raise ValueError('Only pending appeals can be resolved.')

            locked_handshake = Handshake.objects.select_related('service', 'service__user').select_for_update().get(pk=handshake.pk)
            participant = User.objects.select_for_update().get(pk=locked_handshake.requester_id)
            organizer = User.objects.select_for_update().get(pk=locked_handshake.service.user_id)

            if action_type == 'overturn_no_show':
                if locked_handshake.status != 'no_show':
                    raise ValueError('Only no-show handshakes can be overturned.')

                locked_handshake.status = 'attended'
                locked_handshake.save(update_fields=['status', 'updated_at'])

                if participant.no_show_count > 0:
                    participant.no_show_count = participant.no_show_count - 1

                if participant.no_show_count < EventNoShowAppealService.BAN_THRESHOLD:
                    participant.is_event_banned_until = None
                participant.save(update_fields=['no_show_count', 'is_event_banned_until'])

                locked_report.status = 'resolved'
                locked_report.resolved_by = admin_user
                locked_report.resolved_at = timezone.now()
                locked_report.admin_notes = admin_notes or 'No-show appeal approved; handshake updated to attended.'
                locked_report.save(update_fields=['status', 'resolved_by', 'resolved_at', 'admin_notes'])

                create_notification(
                    user=participant,
                    notification_type='dispute_resolved',
                    title='No-Show Appeal Approved',
                    message=f"Your no-show appeal for '{locked_handshake.service.title}' has been approved.",
                    handshake=locked_handshake,
                    service=locked_handshake.service,
                )
                create_notification(
                    user=organizer,
                    notification_type='dispute_resolved',
                    title='No-Show Appeal Approved',
                    message=f"A no-show appeal for '{locked_handshake.service.title}' was approved by an admin.",
                    handshake=locked_handshake,
                    service=locked_handshake.service,
                )

                EventEvaluationService.refresh_summary(locked_handshake.service)

            elif action_type == 'uphold_no_show':
                if locked_handshake.status != 'no_show':
                    raise ValueError('Only no-show handshakes can be upheld.')

                locked_report.status = 'dismissed'
                locked_report.resolved_by = admin_user
                locked_report.resolved_at = timezone.now()
                locked_report.admin_notes = admin_notes or 'No-show appeal rejected; no-show status upheld.'
                locked_report.save(update_fields=['status', 'resolved_by', 'resolved_at', 'admin_notes'])

                create_notification(
                    user=participant,
                    notification_type='dispute_resolved',
                    title='No-Show Appeal Rejected',
                    message=f"Your no-show appeal for '{locked_handshake.service.title}' was rejected.",
                    handshake=locked_handshake,
                    service=locked_handshake.service,
                )
                create_notification(
                    user=organizer,
                    notification_type='dispute_resolved',
                    title='No-Show Appeal Rejected',
                    message=f"A no-show appeal for '{locked_handshake.service.title}' was rejected by an admin.",
                    handshake=locked_handshake,
                    service=locked_handshake.service,
                )

            else:
                raise ValueError('Invalid action. Use "uphold_no_show" or "overturn_no_show".')

            return locked_report


class EventEvaluationService:
    """Aggregation utilities for Event evaluation metrics."""

    @staticmethod
    def refresh_summary(service: Service) -> EventEvaluationSummary | None:
        if service.type != 'Event':
            return None

        attended_qs = Handshake.objects.filter(service=service, status='attended')
        total_attended = attended_qs.count()

        positive_qs = ReputationRep.objects.filter(
            handshake__service=service,
            handshake__status='attended',
            receiver=service.user,
            giver_id=django_models.F('handshake__requester_id'),
        )
        negative_qs = NegativeRep.objects.filter(
            handshake__service=service,
            handshake__status='attended',
            receiver=service.user,
            giver_id=django_models.F('handshake__requester_id'),
        )

        positive_feedback_count = positive_qs.count()
        negative_feedback_count = negative_qs.count()

        unique_evaluator_count = User.objects.filter(
            Q(
                given_reps__handshake__service=service,
                given_reps__handshake__status='attended',
                given_reps__receiver=service.user,
                given_reps__giver_id=django_models.F('given_reps__handshake__requester_id'),
            )
            |
            Q(
                given_negative_reps__handshake__service=service,
                given_negative_reps__handshake__status='attended',
                given_negative_reps__receiver=service.user,
                given_negative_reps__giver_id=django_models.F('given_negative_reps__handshake__requester_id'),
            )
        ).distinct().count()

        punctual_count = positive_qs.filter(is_punctual=True).count()
        helpful_count = positive_qs.filter(is_helpful=True).count()
        kind_count = positive_qs.filter(is_kind=True).count()
        late_count = negative_qs.filter(is_late=True).count()
        unhelpful_count = negative_qs.filter(is_unhelpful=True).count()
        rude_count = negative_qs.filter(is_rude=True).count()

        total_feedback = positive_feedback_count + negative_feedback_count
        if total_feedback > 0:
            avg_well_organized = punctual_count / total_feedback
            avg_engaging = helpful_count / total_feedback
            avg_welcoming = kind_count / total_feedback
            avg_disorganized = late_count / total_feedback
            avg_boring = unhelpful_count / total_feedback
            avg_unwelcoming = rude_count / total_feedback
            organizer_event_hot_score = (
                avg_well_organized + avg_engaging + avg_welcoming
                - avg_disorganized - avg_boring - avg_unwelcoming
            )
        else:
            organizer_event_hot_score = 0.0

        summary_defaults = {
            'total_attended': total_attended,
            'positive_feedback_count': positive_feedback_count,
            'negative_feedback_count': negative_feedback_count,
            'unique_evaluator_count': unique_evaluator_count,
            'punctual_count': punctual_count,
            'helpful_count': helpful_count,
            'kind_count': kind_count,
            'late_count': late_count,
            'unhelpful_count': unhelpful_count,
            'rude_count': rude_count,
            'positive_score_total': (
                punctual_count
                + helpful_count
                + kind_count
            ),
            'negative_score_total': (
                late_count
                + unhelpful_count
                + rude_count
            ),
        }

        summary, _ = EventEvaluationSummary.objects.update_or_create(
            service=service,
            defaults=summary_defaults,
        )

        User.objects.filter(pk=service.user_id).update(
            event_hot_score=round(float(organizer_event_hot_score), 6)
        )
        return summary


# ---------------------------------------------------------------------------
# Reputation service layer
# ---------------------------------------------------------------------------

class ReputationServiceError(Exception):
    """Raised by ReputationService to signal a business rule violation."""

    def __init__(self, message: str, code: str = "INVALID_INPUT", status_code: int = 400) -> None:
        super().__init__(message)
        self.code = code
        self.status_code = status_code


class ReputationService:
    """Business logic for submitting positive reputation (ReputationRep)."""

    @staticmethod
    def _validate_feedback_window(handshake: Handshake) -> tuple[bool, str | None]:
        """Return (is_open, error_message). Inline copy so service is self-contained."""
        starts_at = getattr(handshake, 'evaluation_window_starts_at', None)
        ends_at = getattr(handshake, 'evaluation_window_ends_at', None)
        closed_at = getattr(handshake, 'evaluation_window_closed_at', None)

        if starts_at and ends_at:
            if closed_at is not None or timezone.now() > ends_at:
                return False, 'The 48-hour evaluation window has closed.'
            return True, None

        if handshake.service.type == 'Event':
            svc = handshake.service
            if svc.status != 'Completed':
                return False, 'Event evaluations are available only after the organizer marks the event as completed.'
            completed_at = svc.event_completed_at or svc.updated_at
            if completed_at is None:
                return False, 'Event completion time is unavailable; evaluations are currently closed.'
            deadline = completed_at + timedelta(hours=settings.EVENT_FEEDBACK_WINDOW_HOURS)
            if timezone.now() > deadline:
                return False, 'The event evaluation window has closed.'
            return True, None

        fallback_start = handshake.updated_at
        if fallback_start is None:
            return False, 'Evaluation window is unavailable for this handshake.'
        window_hours = getattr(settings, 'FEEDBACK_WINDOW_HOURS', settings.EVENT_FEEDBACK_WINDOW_HOURS)
        if timezone.now() > fallback_start + timedelta(hours=window_hours):
            return False, 'The 48-hour evaluation window has closed.'
        return True, None

    @staticmethod
    def submit(
        handshake: Handshake,
        giver: User,
        data: dict,
        raw_comment: str = '',
    ) -> ReputationRep:
        """
        Submit a positive reputation for a completed/attended handshake.

        Args:
            handshake: The completed/attended Handshake instance.
            giver:     The authenticated user submitting the rep.
            data:      The request payload (punctual, helpful, kindness etc.).
            raw_comment: Unsanitized optional review text.

        Returns:
            The newly created ReputationRep.

        Raises:
            ReputationServiceError: On permission or business rule violations.
        """
        import bleach
        from .badge_utils import check_and_assign_badges
        from .exceptions import ErrorCodes
        from .utils import get_provider_and_receiver
        from django.db import IntegrityError

        required_status = 'attended' if handshake.service.type == 'Event' else 'completed'
        if handshake.status != required_status:
            raise ReputationServiceError(
                'Handshake not found or not eligible for evaluation',
                code=ErrorCodes.NOT_FOUND, status_code=404,
            )

        in_window, window_error = ReputationService._validate_feedback_window(handshake)
        if not in_window:
            raise ReputationServiceError(window_error, code=ErrorCodes.INVALID_STATE, status_code=410)

        provider, receiver = get_provider_and_receiver(handshake)

        if giver not in (provider, receiver):
            raise ReputationServiceError(
                'Not authorized - you are not a participant in this handshake',
                code=ErrorCodes.PERMISSION_DENIED, status_code=403,
            )

        is_event_evaluation = handshake.service.type == 'Event'
        if is_event_evaluation:
            if handshake.requester_id != giver.id:
                raise ReputationServiceError(
                    'Only verified attendees can evaluate the organizer for events',
                    code=ErrorCodes.PERMISSION_DENIED, status_code=403,
                )
            target_user = handshake.service.user
            is_punctual = _to_bool(data.get('well_organized', data.get('punctual', False)))
            is_helpful = _to_bool(data.get('engaging', data.get('helpful', False)))
            is_kind = _to_bool(data.get('welcoming', data.get('kindness', False)))
        else:
            target_user = receiver if giver == provider else provider
            is_punctual = _to_bool(data.get('punctual', False))
            is_helpful = _to_bool(data.get('helpful', False))
            is_kind = _to_bool(data.get('kindness', False))

        if ReputationRep.objects.filter(handshake=handshake, giver=giver).exists():
            raise ReputationServiceError(
                'Reputation already submitted', code=ErrorCodes.ALREADY_EXISTS,
            )

        cleaned_comment = None
        if raw_comment:
            cleaned_comment = bleach.clean(raw_comment, tags=[], strip=True).strip()[:2000] or None

        try:
            rep = ReputationRep.objects.create(
                handshake=handshake,
                giver=giver,
                receiver=target_user,
                is_punctual=is_punctual,
                is_helpful=is_helpful,
                is_kind=is_kind,
                comment=cleaned_comment,
            )
        except IntegrityError:
            raise ReputationServiceError(
                'Reputation already submitted', code=ErrorCodes.ALREADY_EXISTS,
            )

        # Create a verified review Comment from the reputation comment.
        if rep.comment:
            review_exists = Comment.objects.filter(
                related_handshake=handshake,
                user=giver,
                is_verified_review=True,
                is_deleted=False,
            ).exists()
            if not review_exists:
                Comment.objects.create(
                    service=handshake.service,
                    user=giver,
                    body=rep.comment,
                    is_verified_review=True,
                    related_handshake=handshake,
                )

        # Assign badges to the reviewed user
        new_badge_ids = check_and_assign_badges(target_user)
        if new_badge_ids:
            badges_dict = {b.id: b.name for b in Badge.objects.filter(id__in=new_badge_ids)}
            badge_names = [badges_dict.get(bid, f"Badge {bid}") for bid in new_badge_ids]
            create_notification(
                user=target_user,
                notification_type='positive_rep',
                title='New Badge Earned!',
                message=f"Congratulations! You earned: {', '.join(badge_names)}",
                handshake=handshake,
                service=handshake.service,
            )

        # Notify on positive feedback (Offer/Need only)
        if not is_event_evaluation and (
            rep.is_punctual or rep.is_helpful or rep.is_kind or bool(rep.comment)
        ):
            create_notification(
                user=target_user,
                notification_type='positive_rep',
                title='Feedback Received',
                message=f"{giver.first_name} left feedback for '{handshake.service.title}'.",
                handshake=handshake,
                service=handshake.service,
            )

        # Update karma (REQ-REP-006)
        karma_gain = sum([rep.is_punctual, rep.is_helpful, rep.is_kind])
        if karma_gain:
            target_user.karma_score += karma_gain
            target_user.save()

        invalidate_conversations(str(provider.id))
        invalidate_conversations(str(receiver.id))

        if is_event_evaluation:
            EventEvaluationService.refresh_summary(handshake.service)

        return rep


def get_social_proximity_boosts(viewer_id) -> dict:
    """
    Return a dict mapping user_id (UUID) -> social_boost for every user reachable
    within 2 hops of the viewer.

    Boost values:
      1.0  — viewer directly follows the user OR has a completed handshake with them
      0.5  — reachable in exactly 2 hops through a 1st-degree connection

    Implemented as a single raw SQL CTE query. No Python-side graph traversal.

    Index requirements (already created in migration 0051):
      api_userfollow(follower_id), api_userfollow(following_id)
      api_handshake(status), api_service(user_id)
    """
    if viewer_id is None:
        return {}

    from django.db import connection
    import uuid as _uuid

    sql = """
        WITH first_degree AS (
            SELECT following_id AS uid
            FROM   api_userfollow
            WHERE  follower_id = %s
            UNION
            SELECT h.requester_id AS uid
            FROM   api_handshake h
            JOIN   api_service   s ON h.service_id = s.id
            WHERE  s.user_id = %s AND h.status = 'completed'
            UNION
            SELECT s.user_id AS uid
            FROM   api_handshake h
            JOIN   api_service   s ON h.service_id = s.id
            WHERE  h.requester_id = %s AND h.status = 'completed'
        ),
        first_excl AS (
            SELECT uid FROM first_degree WHERE uid != %s
        ),
        second_degree AS (
            SELECT uf.following_id AS uid
            FROM   api_userfollow uf
            JOIN   first_excl fd ON uf.follower_id = fd.uid
            WHERE  uf.following_id != %s
            UNION
            SELECT h.requester_id AS uid
            FROM   api_handshake h
            JOIN   api_service   s ON h.service_id = s.id
            JOIN   first_excl    fd ON s.user_id   = fd.uid
            WHERE  h.status = 'completed' AND h.requester_id != %s
            UNION
            SELECT s.user_id AS uid
            FROM   api_handshake h
            JOIN   api_service   s ON h.service_id = s.id
            JOIN   first_excl    fd ON h.requester_id = fd.uid
            WHERE  h.status = 'completed' AND s.user_id != %s
        )
        SELECT uid, 1.0 AS boost FROM first_excl
        UNION ALL
        SELECT uid, 0.5 AS boost
        FROM   second_degree
        WHERE  uid NOT IN (SELECT uid FROM first_excl) AND uid != %s
    """

    viewer_id_str = str(viewer_id)
    params = [viewer_id_str] * 8

    with connection.cursor() as cursor:
        cursor.execute(sql, params)
        rows = cursor.fetchall()

    # Use max boost when a user appears in both result sets (shouldn't happen
    # due to the WHERE clause, but guards against edge cases).
    boosts: dict = {}
    for uid, boost in rows:
        uid_key = _uuid.UUID(str(uid)) if not isinstance(uid, _uuid.UUID) else uid
        if uid_key not in boosts or boost > boosts[uid_key]:
            boosts[uid_key] = boost
    return boosts
