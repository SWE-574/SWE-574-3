from rest_framework import generics, viewsets, permissions, status
from rest_framework.response import Response
from rest_framework.decorators import action
from rest_framework.views import APIView
from rest_framework.exceptions import PermissionDenied
from rest_framework.parsers import JSONParser, FormParser, MultiPartParser
from rest_framework.pagination import PageNumberPagination
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.exceptions import InvalidToken, TokenError
from drf_spectacular.utils import extend_schema, OpenApiExample, OpenApiResponse, inline_serializer
from rest_framework import serializers as drf_serializers
from django.db import transaction, IntegrityError
from django.shortcuts import get_object_or_404
from django.db.utils import OperationalError
from django.db.models import F
from django.conf import settings
from django.utils import timezone
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from decimal import Decimal
from datetime import timedelta
import logging
import bleach

logger = logging.getLogger(__name__)

from .throttles import (
    ConfirmationThrottle,
    E2EAwareAnonRateThrottle as AnonRateThrottle,
    E2EAwareScopedRateThrottle as ScopedRateThrottle,
    E2EAwareUserRateThrottle as UserRateThrottle,
    HandshakeThrottle,
    ReputationThrottle,
    SensitiveOperationThrottle,
)
from .exceptions import create_error_response, ErrorCodes

from .models import (
    User, Service, Tag, Handshake, ChatMessage,
    Notification, ReputationRep, Badge, Report, UserBadge, TransactionHistory,
    ChatRoom, PublicChatMessage, ServiceGroupChatMessage, Comment, NegativeRep,
    AdminAuditLog,
    ForumCategory, ForumTopic, ForumPost, ServiceMedia,
    EmailVerificationToken, PasswordResetToken,
)
from .serializers import (
    UserRegistrationSerializer, 
    UserProfileSerializer,
    AdminUserListSerializer,
    AdminCommentSerializer,
    AdminAuditLogSerializer,
    ServiceSerializer,
    TagSerializer,
    HandshakeSerializer,
    ChatMessageSerializer,
    NotificationSerializer,
    ReputationRepSerializer,
    ReportSerializer,
    TransactionHistorySerializer,
    ChatRoomSerializer,
    PublicChatMessageSerializer,
    ServiceGroupChatMessageSerializer,
    CommentSerializer,
    NegativeRepSerializer,
    ForumCategorySerializer,
    ForumTopicSerializer,
    ForumTopicDetailSerializer,
    ForumPostSerializer
)
from .achievement_utils import get_achievement_progress
from .utils import (
    can_user_post_offer, provision_timebank, complete_timebank_transfer,
    cancel_timebank_transfer, create_notification
)
from .services import HandshakeService, EventHandshakeService, EventEvaluationService, EventNoShowAppealService
from .event_permissions import IsNotEventBanned, IsNotOrganizerBanned
from .achievement_utils import check_and_assign_badges
from .search_filters import SearchEngine
from .performance import track_performance
from django.db.models import Count, Q, Prefetch, Exists, OuterRef, Case, When, UUIDField
from .cache_utils import (
    get_cached_tag_list, cache_tag_list, invalidate_tag_list,
    get_cached_user_profile, cache_user_profile, invalidate_user_profile,
    get_cached_service_list, cache_service_list, invalidate_service_lists,
    get_cached_conversations, cache_conversations, invalidate_conversations,
    get_cached_transactions, cache_transactions, invalidate_transactions,
    invalidate_user_services, CACHE_TTL_SHORT
)

from django.contrib.auth import authenticate
import secrets
import threading
import resend as resend_sdk

# ─── Cookie helpers ───────────────────────────────────────────────────────────

def get_cookie_settings(httponly: bool = True) -> dict:
    """Returns cookie settings that match the environment (dev vs prod)."""
    is_prod = getattr(settings, 'IS_PRODUCTION', False)
    return {
        'httponly': httponly,
        'secure': is_prod,
        'samesite': 'Strict' if is_prod else 'Lax',
        'path': '/',
        'max_age': 60 * 60 * 24 * 7,  # 7 days
    }


def _set_auth_cookies(response, access_token: str, refresh_token: str) -> None:
    """Attach JWT tokens as cookies to the response. Both HttpOnly to mitigate XSS."""
    response.set_cookie('access_token', access_token, **get_cookie_settings(httponly=True))
    response.set_cookie('refresh_token', refresh_token, **get_cookie_settings(httponly=True))


def log_admin_action(admin_user, action_type: str, target_entity: str, target_obj, reason: str = '') -> None:
    """Best-effort admin audit logging for moderation actions."""
    try:
        AdminAuditLog.objects.create(
            admin=admin_user,
            action_type=action_type,
            target_entity=target_entity,
            target_id=target_obj.id,
            reason=reason or None,
        )
    except Exception as exc:
        logger.warning('Admin audit log failed for %s (%s): %s', action_type, target_entity, exc)


def _send_email_async(to_email: str, subject: str, html: str) -> None:
    """Fire-and-forget email via Resend in a background thread."""
    def _send():
        api_key = getattr(settings, 'RESEND_API_KEY', '')
        if not api_key:
            logger.warning('RESEND_API_KEY not set — skipping email to %s', to_email)
            return
        resend_sdk.api_key = api_key
        from_email = getattr(settings, 'RESEND_FROM_EMAIL', 'onboarding@resend.dev')
        try:
            resend_sdk.Emails.send({'from': from_email, 'to': to_email, 'subject': subject, 'html': html})
        except Exception as exc:
            logger.error('Resend email failed to %s: %s', to_email, exc)

    t = threading.Thread(target=_send, daemon=True)
    t.start()


def _send_verification_email(user) -> None:
    from .models import EmailVerificationToken
    EmailVerificationToken.objects.filter(user=user, is_used=False).update(is_used=True)
    token = secrets.token_urlsafe(32)
    EmailVerificationToken.objects.create(
        user=user,
        token=token,
        expires_at=timezone.now() + timedelta(hours=24),
    )
    frontend_url = getattr(settings, 'FRONTEND_URL', 'http://localhost:5173')
    verify_url = f'{frontend_url}/verify-email?token={token}'
    html = f"""<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F9FAFB;font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F9FAFB;padding:40px 16px;">
    <tr><td align="center">
      <table width="100%" style="max-width:560px;background:#FFFFFF;border-radius:16px;border:1px solid #E5E7EB;box-shadow:0 4px 24px rgba(0,0,0,0.08);overflow:hidden;">

        <!-- Header -->
        <tr>
          <td style="background:#2D5C4E;padding:28px 40px;text-align:center;">
            <table cellpadding="0" cellspacing="0" style="display:inline-table;">
              <tr>
                <td style="padding-right:10px;vertical-align:middle;">
                  <svg width="36" height="36" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M20 2L35.5885 11V29L20 38L4.41154 29V11L20 2Z" fill="#FFFFFF" stroke="#2D5C4E" stroke-width="2.5" stroke-linejoin="round"/>
                    <path d="M20 9L29.5263 14.5V25.5L20 31L10.4737 25.5V14.5L20 9Z" fill="#2D5C4E"/>
                    <path d="M20 15L24.3301 17.5V22.5L20 25L15.6699 22.5V17.5L20 15Z" fill="#F8C84A"/>
                  </svg>
                </td>
                <td style="vertical-align:middle;">
                  <span style="font-size:20px;font-weight:700;color:#FFFFFF;letter-spacing:-0.3px;">The Hive</span>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:36px 40px 28px;">
            <p style="margin:0 0 6px;font-size:22px;font-weight:700;color:#1F2937;">Verify your email address</p>
            <p style="margin:0 0 24px;font-size:14px;color:#6B7280;line-height:1.6;">
              Hi {user.first_name}, welcome to The Hive! Please confirm your email to activate your account and start exchanging skills with your community.
            </p>

            <!-- CTA Button -->
            <table cellpadding="0" cellspacing="0" style="margin:0 auto 28px;">
              <tr>
                <td style="border-radius:8px;background:#2D5C4E;">
                  <a href="{verify_url}"
                     style="display:inline-block;padding:14px 36px;font-size:15px;font-weight:600;color:#FFFFFF;text-decoration:none;border-radius:8px;letter-spacing:0.1px;">
                    Verify Email
                  </a>
                </td>
              </tr>
            </table>

            <!-- Info box -->
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="background:#F0FDF4;border:1px solid #D1FAE5;border-radius:8px;padding:14px 16px;">
                  <p style="margin:0;font-size:13px;color:#374151;line-height:1.5;">
                    ⏱&nbsp; You start with <strong style="color:#2D5C4E;">3 hours</strong> in your time bank — ready to use once your email is confirmed.
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Fallback link -->
        <tr>
          <td style="padding:0 40px 16px;">
            <p style="margin:0;font-size:12px;color:#9CA3AF;line-height:1.6;">
              Button not working? Copy and paste this link into your browser:<br>
              <a href="{verify_url}" style="color:#2D5C4E;word-break:break-all;">{verify_url}</a>
            </p>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#F9FAFB;border-top:1px solid #E5E7EB;padding:20px 40px;text-align:center;">
            <p style="margin:0;font-size:12px;color:#9CA3AF;">
              This link expires in <strong>24 hours</strong>. If you didn't create a Hive account, you can safely ignore this email.
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>"""
    _send_email_async(user.email, 'Verify your email — The Hive', html)


def _send_password_reset_email(user) -> None:
    from .models import PasswordResetToken
    PasswordResetToken.objects.filter(user=user, is_used=False).update(is_used=True)
    token = secrets.token_urlsafe(32)
    PasswordResetToken.objects.create(
        user=user,
        token=token,
        expires_at=timezone.now() + timedelta(hours=1),
    )
    frontend_url = getattr(settings, 'FRONTEND_URL', 'http://localhost:5173')
    reset_url = f'{frontend_url}/reset-password?token={token}'
    html = f"""<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F9FAFB;font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F9FAFB;padding:40px 16px;">
    <tr><td align="center">
      <table width="100%" style="max-width:560px;background:#FFFFFF;border-radius:16px;border:1px solid #E5E7EB;box-shadow:0 4px 24px rgba(0,0,0,0.08);overflow:hidden;">

        <!-- Header -->
        <tr>
          <td style="background:#2D5C4E;padding:28px 40px;text-align:center;">
            <table cellpadding="0" cellspacing="0" style="display:inline-table;">
              <tr>
                <td style="padding-right:10px;vertical-align:middle;">
                  <svg width="36" height="36" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M20 2L35.5885 11V29L20 38L4.41154 29V11L20 2Z" fill="#FFFFFF" stroke="#2D5C4E" stroke-width="2.5" stroke-linejoin="round"/>
                    <path d="M20 9L29.5263 14.5V25.5L20 31L10.4737 25.5V14.5L20 9Z" fill="#2D5C4E"/>
                    <path d="M20 15L24.3301 17.5V22.5L20 25L15.6699 22.5V17.5L20 15Z" fill="#F8C84A"/>
                  </svg>
                </td>
                <td style="vertical-align:middle;">
                  <span style="font-size:20px;font-weight:700;color:#FFFFFF;letter-spacing:-0.3px;">The Hive</span>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:36px 40px 28px;">
            <p style="margin:0 0 6px;font-size:22px;font-weight:700;color:#1F2937;">Reset your password</p>
            <p style="margin:0 0 24px;font-size:14px;color:#6B7280;line-height:1.6;">
              Hi {user.first_name}, we received a request to reset the password for your Hive account. Click the button below to choose a new password.
            </p>

            <!-- CTA Button -->
            <table cellpadding="0" cellspacing="0" style="margin:0 auto 28px;">
              <tr>
                <td style="border-radius:8px;background:#2D5C4E;">
                  <a href="{reset_url}"
                     style="display:inline-block;padding:14px 36px;font-size:15px;font-weight:600;color:#FFFFFF;text-decoration:none;border-radius:8px;letter-spacing:0.1px;">
                    Reset Password
                  </a>
                </td>
              </tr>
            </table>

            <!-- Warning box -->
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="background:#FEF2F2;border:1px solid #FECACA;border-radius:8px;padding:14px 16px;">
                  <p style="margin:0;font-size:13px;color:#374151;line-height:1.5;">
                    🔒&nbsp; If you didn't request a password reset, <strong>ignore this email</strong> — your account remains secure.
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Fallback link -->
        <tr>
          <td style="padding:0 40px 16px;">
            <p style="margin:0;font-size:12px;color:#9CA3AF;line-height:1.6;">
              Button not working? Copy and paste this link into your browser:<br>
              <a href="{reset_url}" style="color:#2D5C4E;word-break:break-all;">{reset_url}</a>
            </p>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#F9FAFB;border-top:1px solid #E5E7EB;padding:20px 40px;text-align:center;">
            <p style="margin:0;font-size:12px;color:#9CA3AF;">
              This link expires in <strong>1 hour</strong>. Never share this link with anyone.
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>"""
    _send_email_async(user.email, 'Reset your password — The Hive', html)


class StandardResultsSetPagination(PageNumberPagination):
    page_size = 20
    page_size_query_param = 'page_size'
    max_page_size = 100

class RegistrationThrottle(AnonRateThrottle):
    """Lenient throttle for registration - 20 requests per hour per IP"""
    rate = '20/hour'


def _validate_event_feedback_window(service: Service) -> tuple[bool, str | None]:
    """Validate fixed feedback window after event completion."""
    if service.type != 'Event':
        return True, None

    if service.status != 'Completed':
        return False, 'Event evaluations are available only after the organizer marks the event as completed.'

    completed_at = service.event_completed_at or service.updated_at
    if completed_at is None:
        return False, 'Event completion time is unavailable; evaluations are currently closed.'

    deadline = completed_at + timedelta(hours=settings.EVENT_FEEDBACK_WINDOW_HOURS)
    if timezone.now() > deadline:
        return False, 'The event evaluation window has closed.'

    return True, None


def _validate_feedback_window(handshake: Handshake) -> tuple[bool, str | None]:
    """Validate whether a handshake is still inside the feedback window."""
    starts_at = getattr(handshake, 'evaluation_window_starts_at', None)
    ends_at = getattr(handshake, 'evaluation_window_ends_at', None)
    closed_at = getattr(handshake, 'evaluation_window_closed_at', None)

    # Prefer explicit handshake-level window fields when available.
    if starts_at and ends_at:
        if closed_at is not None or timezone.now() > ends_at:
            return False, 'The 48-hour evaluation window has closed.'
        return True, None

    # Backward-compatible fallback for records created before handshake window fields.
    if handshake.service.type == 'Event':
        return _validate_event_feedback_window(handshake.service)

    # Standard service fallback: use handshake completion/update time as the start.
    fallback_start = handshake.updated_at
    if fallback_start is None:
        return False, 'Evaluation window is unavailable for this handshake.'

    window_hours = getattr(settings, 'FEEDBACK_WINDOW_HOURS', settings.EVENT_FEEDBACK_WINDOW_HOURS)
    fallback_end = fallback_start + timedelta(hours=window_hours)
    if timezone.now() > fallback_end:
        return False, 'The 48-hour evaluation window has closed.'
    return True, None


def _apply_blind_review_visibility(queryset):
    """Hide one-sided 1-to-1 verified reviews until reciprocal eval or window expiry."""
    now = timezone.now()

    target_user_id_expr = Case(
        When(
            user_id=F('related_handshake__service__user_id'),
            then=F('related_handshake__requester_id'),
        ),
        default=F('related_handshake__service__user_id'),
        output_field=UUIDField(),
    )

    return queryset.annotate(
        blind_target_user_id=target_user_id_expr,
        blind_target_positive_eval=Exists(
            ReputationRep.objects.filter(
                handshake_id=OuterRef('related_handshake_id'),
                giver_id=OuterRef('blind_target_user_id'),
            )
        ),
        blind_target_negative_eval=Exists(
            NegativeRep.objects.filter(
                handshake_id=OuterRef('related_handshake_id'),
                giver_id=OuterRef('blind_target_user_id'),
            )
        ),
    ).exclude(
        related_handshake__evaluation_window_ends_at__gt=now,
        blind_target_positive_eval=False,
        blind_target_negative_eval=False,
    )


def _build_event_comments_history(organizer: User, request=None) -> list[dict]:
    """Return organizer Event comments grouped by event with newest-first ordering."""
    comments = Comment.objects.filter(
        service__type='Event',
        service__user=organizer,
        is_verified_review=True,
        is_deleted=False,
        related_handshake__isnull=False,
        related_handshake__requester=F('user'),
    ).select_related('user', 'service', 'related_handshake').order_by('-created_at')
    comments = _apply_blind_review_visibility(comments)

    grouped = {}
    for comment in comments:
        event = comment.service
        event_id = str(event.id)
        if event_id not in grouped:
            grouped[event_id] = {
                'event_id': event_id,
                'event_title': event.title,
                'event_status': event.status,
                'event_scheduled_time': event.scheduled_time.isoformat() if event.scheduled_time else None,
                'event_completed_at': event.event_completed_at.isoformat() if event.event_completed_at else None,
                'comments': [],
            }

        grouped[event_id]['comments'].append(CommentSerializer(comment, context={'request': request}).data)

    return list(grouped.values())

class CustomTokenRefreshView(TokenRefreshView):
    """Custom token refresh: reads refresh token from cookie (or body), sets new cookies."""

    def post(self, request, *args, **kwargs):
        # Prefer cookie over body for cookie-based auth flow
        refresh_token_val = request.COOKIES.get('refresh_token') or request.data.get('refresh')
        if not refresh_token_val:
            return Response(
                {'detail': 'Refresh token not provided.', 'code': 'token_not_valid'},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        # Mutate request.data so the parent serializer sees the value
        data = request.data.copy() if hasattr(request.data, 'copy') else dict(request.data)
        data['refresh'] = refresh_token_val

        from rest_framework_simplejwt.serializers import TokenRefreshSerializer
        serializer = TokenRefreshSerializer(data=data)
        try:
            serializer.is_valid(raise_exception=True)
        except (TokenError, InvalidToken):
            return Response(
                {'detail': 'Invalid refresh token.', 'code': 'token_not_valid'},
                status=status.HTTP_401_UNAUTHORIZED,
            )
        except Exception as e:
            error_str = str(e)
            error_type = type(e).__name__
            if ('DoesNotExist' in error_type or
                    'matching query does not exist' in error_str or
                    'User matching query does not exist' in error_str):
                return Response(
                    {'detail': 'User account no longer exists.', 'code': 'user_not_found'},
                    status=status.HTTP_401_UNAUTHORIZED,
                )
            logger.error('Unexpected error in token refresh: %s: %s', error_type, error_str, exc_info=True)
            raise

        validated = serializer.validated_data
        new_access = validated.get('access', '')
        new_refresh = validated.get('refresh', refresh_token_val)

        response = Response({'access': new_access, 'refresh': new_refresh}, status=status.HTTP_200_OK)
        _set_auth_cookies(response, new_access, new_refresh)
        return response

class CustomTokenObtainPairView(TokenObtainPairView):
    MAX_FAILED_ATTEMPTS = 5
    LOCKOUT_DURATION_MINUTES = 30
    
    def post(self, request, *args, **kwargs):
        email = request.data.get('email')
        
        # Check for account lockout before attempting authentication
        if email:
            try:
                user = User.objects.get(email=email)
                from django.utils import timezone
                if user.locked_until and user.locked_until > timezone.now():
                    remaining_minutes = int((user.locked_until - timezone.now()).total_seconds() / 60)
                    return Response(
                        {
                            'detail': f'Account is temporarily locked due to too many failed login attempts. Please try again in {remaining_minutes} minutes.',
                            'locked_until': user.locked_until.isoformat()
                        },
                        status=status.HTTP_423_LOCKED
                    )
                elif user.locked_until and user.locked_until <= timezone.now():
                    # Lockout expired, reset
                    user.locked_until = None
                    user.failed_login_attempts = 0
                    user.save(update_fields=['locked_until', 'failed_login_attempts'])
            except User.DoesNotExist:
                pass  # Don't reveal if user exists
        
        serializer = self.get_serializer(data=request.data)
        try:
            serializer.is_valid(raise_exception=True)
        except Exception as e:
            # Increment failed login attempts
            if email:
                try:
                    user = User.objects.get(email=email)
                    from django.utils import timezone
                    from datetime import timedelta
                    user.failed_login_attempts += 1
                    
                    if user.failed_login_attempts >= self.MAX_FAILED_ATTEMPTS:
                        # Lock the account
                        user.locked_until = timezone.now() + timedelta(minutes=self.LOCKOUT_DURATION_MINUTES)
                        user.save(update_fields=['failed_login_attempts', 'locked_until'])
                        return Response(
                            {
                                'detail': f'Account has been temporarily locked due to too many failed login attempts. Please try again in {self.LOCKOUT_DURATION_MINUTES} minutes.',
                                'locked_until': user.locked_until.isoformat()
                            },
                            status=status.HTTP_423_LOCKED
                        )
                    else:
                        user.save(update_fields=['failed_login_attempts'])
                except User.DoesNotExist:
                    pass  # Don't reveal if user exists
            
            return Response(
                {'detail': 'No active account found with the given credentials'},
                status=status.HTTP_401_UNAUTHORIZED
            )
        
        user = serializer.user
        
        # Reset failed login attempts on successful login
        if user.failed_login_attempts > 0 or user.locked_until:
            user.failed_login_attempts = 0
            user.locked_until = None
            user.save(update_fields=['failed_login_attempts', 'locked_until'])
        
        response_data = serializer.validated_data
        
        user_data = {
            'id': str(user.id),
            'email': user.email,
            'first_name': user.first_name,
            'last_name': user.last_name,
            'timebank_balance': float(user.timebank_balance),
            'karma_score': user.karma_score,
            'role': user.role,
            'bio': user.bio or '',
            'avatar_url': user.avatar_url or '',
            'banner_url': user.banner_url or '',
            'punctual_count': 0,
            'helpful_count': 0,
            'kind_count': 0,
            'badges': [],
            'services': [],
            'date_joined': user.date_joined.isoformat() if user.date_joined else None,
        }
        
        response_data['user'] = user_data

        response = Response(response_data, status=status.HTTP_200_OK)
        _set_auth_cookies(
            response,
            str(response_data.get('access', '')),
            str(response_data.get('refresh', '')),
        )
        return response


class LogoutView(APIView):
    """Clear auth cookies and blacklist the refresh token."""
    permission_classes = [permissions.AllowAny]

    @extend_schema(
        summary='Logout',
        description=(
            'Clears the `access_token` and `refresh_token` cookies and blacklists '
            'the refresh token so it cannot be used again.'
        ),
        request=None,
        responses={
            200: inline_serializer('LogoutResponse', {'detail': drf_serializers.CharField()}),
        },
        tags=['Auth'],
    )
    def post(self, request, *args, **kwargs):
        refresh_token_val = request.COOKIES.get('refresh_token')
        if refresh_token_val:
            try:
                token = RefreshToken(refresh_token_val)
                token.blacklist()
            except Exception:
                pass

        response = Response({'detail': 'Logged out successfully.'}, status=status.HTTP_200_OK)
        is_prod = getattr(settings, 'IS_PRODUCTION', False)
        samesite = 'Strict' if is_prod else 'Lax'
        response.delete_cookie('access_token', path='/', samesite=samesite)
        response.delete_cookie('refresh_token', path='/', samesite=samesite)
        return response


class WsTokenView(APIView):
    """Return a short-lived access token for WebSocket auth (query string). Use when cookie is not forwarded by proxy (e.g. Vite dev)."""
    permission_classes = [permissions.IsAuthenticated]

    @extend_schema(
        summary='Get WebSocket token',
        description='Returns the current access token for use in WebSocket URL (e.g. ?token=). Cookie is preferred; use this when the proxy does not forward cookies.',
        responses={200: inline_serializer('WsTokenResponse', {'token': drf_serializers.CharField()})},
        tags=['Auth'],
    )
    def get(self, request, *args, **kwargs):
        refresh = RefreshToken.for_user(request.user)
        return Response({'token': str(refresh.access_token)}, status=status.HTTP_200_OK)


class ForgotPasswordView(APIView):
    """Send a password-reset email via Resend."""
    permission_classes = [permissions.AllowAny]
    throttle_classes = [SensitiveOperationThrottle]

    @extend_schema(
        summary='Forgot password — request reset link',
        description=(
            'Sends a password-reset email to the given address if an account exists. '
            'Always returns 200 to avoid user-enumeration attacks.'
        ),
        request=inline_serializer('ForgotPasswordRequest', {'email': drf_serializers.EmailField()}),
        responses={
            200: inline_serializer('ForgotPasswordResponse', {'detail': drf_serializers.CharField()}),
        },
        examples=[
            OpenApiExample('Request', value={'email': 'user@example.com'}, request_only=True),
            OpenApiExample('Response', value={'detail': 'If that email exists, a password reset link has been sent.'}, response_only=True),
        ],
        tags=['Auth'],
    )
    def post(self, request, *args, **kwargs):
        email = request.data.get('email', '').strip().lower()
        if not email:
            return Response({'detail': 'Email is required.'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            user = User.objects.get(email=email)
            _send_password_reset_email(user)
        except User.DoesNotExist:
            pass  # Don't reveal if user exists
        return Response(
            {'detail': 'If that email exists, a password reset link has been sent.'},
            status=status.HTTP_200_OK,
        )


class ChangePasswordView(APIView):
    """Change password for an authenticated user (requires current password)."""
    permission_classes = [permissions.IsAuthenticated]
    throttle_classes = [SensitiveOperationThrottle]

    @extend_schema(
        summary='Change password',
        description='Validates the current password then sets a new one. Requires authentication.',
        request=inline_serializer('ChangePasswordRequest', {
            'current_password': drf_serializers.CharField(),
            'new_password': drf_serializers.CharField(min_length=8),
        }),
        responses={
            200: inline_serializer('ChangePasswordResponse', {'detail': drf_serializers.CharField()}),
            400: OpenApiResponse(description='Wrong current password or new password too short'),
        },
        tags=['Auth'],
    )
    def post(self, request, *args, **kwargs):
        current_password = request.data.get('current_password', '')
        new_password = request.data.get('new_password', '')
        if not current_password or not new_password:
            return Response(
                {'detail': 'Both current_password and new_password are required.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if len(new_password) < 8:
            return Response(
                {'detail': 'New password must be at least 8 characters.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        user = request.user
        if not user.check_password(current_password):
            return Response(
                {'detail': 'Current password is incorrect.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        user.set_password(new_password)
        user.save(update_fields=['password'])
        return Response({'detail': 'Password changed successfully.'})


class ResetPasswordView(APIView):
    """Verify the reset token and set a new password."""
    permission_classes = [permissions.AllowAny]
    throttle_classes = [SensitiveOperationThrottle]

    @extend_schema(
        summary='Reset password',
        description=(
            'Validates the one-time reset `token` (from the email link) and sets a new password. '
            'The token is invalidated after first use and expires after 1 hour.'
        ),
        request=inline_serializer('ResetPasswordRequest', {
            'token': drf_serializers.CharField(),
            'password': drf_serializers.CharField(min_length=8),
        }),
        responses={
            200: inline_serializer('ResetPasswordResponse', {'detail': drf_serializers.CharField()}),
            400: OpenApiResponse(description='Invalid/expired token or password too short'),
        },
        examples=[
            OpenApiExample('Request', value={'token': '<uuid-token>', 'password': 'NewPass123'}, request_only=True),
            OpenApiExample('Success', value={'detail': 'Password reset successfully.'}, response_only=True),
        ],
        tags=['Auth'],
    )
    def post(self, request, *args, **kwargs):
        token_str = request.data.get('token', '').strip()
        new_password = request.data.get('password', '')
        if not token_str or not new_password:
            return Response(
                {'detail': 'Token and password are required.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if len(new_password) < 8:
            return Response(
                {'detail': 'Password must be at least 8 characters.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            reset_token = PasswordResetToken.objects.select_related('user').get(
                token=token_str, is_used=False
            )
        except PasswordResetToken.DoesNotExist:
            return Response(
                {'detail': 'Invalid or expired reset link.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if reset_token.is_expired:
            return Response(
                {'detail': 'This reset link has expired.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        user = reset_token.user
        try:
            validate_password(new_password, user)
        except DjangoValidationError as e:
            return Response(
                {'detail': ' '.join(e.messages)},
                status=status.HTTP_400_BAD_REQUEST,
            )
        user.set_password(new_password)
        user.save(update_fields=['password'])
        reset_token.is_used = True
        reset_token.save(update_fields=['is_used'])
        return Response({'detail': 'Password reset successfully.'}, status=status.HTTP_200_OK)


class VerifyEmailView(APIView):
    """Verify email with the token sent via Resend."""
    permission_classes = [permissions.AllowAny]

    @extend_schema(
        summary='Verify email address',
        description=(
            'Validates the email verification `token` from the link sent on registration. '
            'Marks the user\'s `is_verified` flag as `true`. Token is single-use and expires in 24 hours.'
        ),
        request=inline_serializer('VerifyEmailRequest', {'token': drf_serializers.CharField()}),
        responses={
            200: inline_serializer('VerifyEmailResponse', {
                'detail': drf_serializers.CharField(),
                'access': drf_serializers.CharField(),
                'user': drf_serializers.DictField(),
            }),
            400: OpenApiResponse(description='Invalid/expired token'),
        },
        examples=[
            OpenApiExample('Request', value={'token': '<uuid-token>'}, request_only=True),
            OpenApiExample('Success', value={
                'detail': 'Email verified successfully.',
                'access': '<jwt-access-token>',
                'user': {'id': '...', 'email': '...', 'is_verified': True},
            }, response_only=True),
        ],
        tags=['Auth'],
    )
    def post(self, request, *args, **kwargs):
        token_str = request.data.get('token', '').strip()
        if not token_str:
            return Response({'detail': 'Token is required.'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            ev_token = EmailVerificationToken.objects.select_related('user').get(
                token=token_str, is_used=False
            )
        except EmailVerificationToken.DoesNotExist:
            return Response(
                {'detail': 'Invalid or expired verification link.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if ev_token.is_expired:
            return Response(
                {'detail': 'This verification link has expired.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        user = ev_token.user
        user.is_verified = True
        user.save(update_fields=['is_verified'])
        ev_token.is_used = True
        ev_token.save(update_fields=['is_used'])

        # Auto-login: generate fresh tokens so the user is authenticated after
        # clicking the link, even from a different browser / device.
        refresh = RefreshToken.for_user(user)
        access_token = str(refresh.access_token)
        refresh_token = str(refresh)

        response = Response({
            'detail': 'Email verified successfully.',
            'access': access_token,
            'user': UserProfileSerializer(user).data,
        }, status=status.HTTP_200_OK)
        _set_auth_cookies(response, access_token, refresh_token)
        return response


class SendVerificationEmailView(APIView):
    """(Re-)send verification email to the authenticated user."""
    permission_classes = [permissions.IsAuthenticated]

    @extend_schema(
        summary='Resend verification email (authenticated)',
        description=(
            'Sends a fresh verification email to the currently authenticated user. '
            'Returns 400 if the email is already verified.'
        ),
        request=None,
        responses={
            200: inline_serializer('SendVerificationResponse', {'detail': drf_serializers.CharField()}),
            400: OpenApiResponse(description='Email already verified'),
        },
        tags=['Auth'],
    )
    def post(self, request, *args, **kwargs):
        user = request.user
        if user.is_verified:
            return Response({'detail': 'Email is already verified.'}, status=status.HTTP_400_BAD_REQUEST)
        _send_verification_email(user)
        return Response({'detail': 'Verification email sent.'}, status=status.HTTP_200_OK)


class ResendVerificationView(APIView):
    """Public endpoint: resend verification email given an email address."""
    permission_classes = [permissions.AllowAny]
    throttle_classes = [SensitiveOperationThrottle]

    @extend_schema(
        summary='Resend verification email (public)',
        description=(
            'Sends a fresh verification email to the given address if the account exists '
            'and is not yet verified. Always returns 200 to prevent user enumeration.'
        ),
        request=inline_serializer('ResendVerificationRequest', {'email': drf_serializers.EmailField()}),
        responses={
            200: inline_serializer('ResendVerificationResponse', {'detail': drf_serializers.CharField()}),
        },
        examples=[
            OpenApiExample('Request', value={'email': 'user@example.com'}, request_only=True),
            OpenApiExample('Response', value={'detail': 'If that email exists and is unverified, a new link has been sent.'}, response_only=True),
        ],
        tags=['Auth'],
    )
    def post(self, request, *args, **kwargs):
        email = request.data.get('email', '').strip().lower()
        if not email:
            return Response({'detail': 'Email is required.'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            user = User.objects.get(email=email)
            if not user.is_verified:
                _send_verification_email(user)
        except User.DoesNotExist:
            pass  # Don't reveal if user exists
        return Response(
            {'detail': 'If that email exists and is unverified, a new link has been sent.'},
            status=status.HTTP_200_OK,
        )


class UserRegistrationView(generics.CreateAPIView):
    """
    User Registration Endpoint
    
    Allows new users to register for The Hive platform.
    
    **Request Format:**
    ```json
    {
        "email": "user@example.com",
        "password": "securepassword123",
        "first_name": "John",
        "last_name": "Doe"
    }
    ```
    
    **Response Format (201 Created):**
    ```json
    {
        "user_id": "uuid",
        "name": "John Doe",
        "balance": 10.0,
        "token": "jwt_access_token",
        "access": "jwt_access_token",
        "refresh": "jwt_refresh_token",
        "user": {
            "id": "uuid",
            "email": "user@example.com",
            "first_name": "John",
            "last_name": "Doe",
            "timebank_balance": 10.0,
            "karma_score": 0
        }
    }
    ```
    
    **Error Scenarios:**
    - 400 Bad Request: Invalid email format, password too weak, missing required fields
    - 429 Too Many Requests: Registration rate limit exceeded (20/hour per IP)
    
    **Rate Limiting:** 20 requests per hour per IP address
    """
    queryset = User.objects.all()
    serializer_class = UserRegistrationSerializer
    permission_classes = [permissions.AllowAny]
    throttle_classes = [RegistrationThrottle]  # Use custom throttle instead of default

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()

        refresh = RefreshToken.for_user(user)
        access_token = str(refresh.access_token)
        refresh_token = str(refresh)

        # Send email verification (non-blocking)
        _send_verification_email(user)

        response = Response({
            'user_id': str(user.id),
            'name': f"{user.first_name} {user.last_name}".strip() or user.email,
            'balance': float(user.timebank_balance),
            'token': access_token,
            'access': access_token,
            'refresh': refresh_token,
            'user': UserProfileSerializer(user).data,
        }, status=201)
        _set_auth_cookies(response, access_token, refresh_token)
        return response

class UserProfileView(generics.RetrieveUpdateAPIView):
    """
    User Profile Management
    
    Retrieve and update user profile information.
    
    **GET /api/users/me/** - Get current user's profile
    **GET /api/users/{id}/** - Get another user's public profile
    **PATCH /api/users/me/** - Update current user's profile
    
    **Response Format:**
    ```json
    {
        "id": "uuid",
        "email": "user@example.com",
        "first_name": "John",
        "last_name": "Doe",
        "bio": "User bio text",
        "avatar_url": "https://example.com/avatar.jpg",
        "timebank_balance": 10.0,
        "karma_score": 15,
        "badges": [
            {
                "id": "uuid",
                "name": "Punctual Pro",
                "description": "Always on time",
                "icon_url": "https://example.com/badge.png"
            }
        ],
        "services": [...],
        "punctual_count": 5,
        "helpful_count": 3,
        "kind_count": 7
    }
    ```
    
    **Update Request Format:**
    ```json
    {
        "first_name": "John",
        "last_name": "Doe",
        "bio": "Updated bio",
        "avatar_url": "https://example.com/new-avatar.jpg"
    }
    ```
    
    **Error Scenarios:**
    - 401 Unauthorized: Missing or invalid authentication token
    - 403 Forbidden: Attempting to update another user's profile
    - 404 Not Found: User ID does not exist
    
    **Authentication:** Required (JWT Bearer token)
    """
    serializer_class = UserProfileSerializer
    permission_classes = [permissions.IsAuthenticated]
    parser_classes = [JSONParser, FormParser, MultiPartParser]
    throttle_classes = [SensitiveOperationThrottle]  # Profile updates are sensitive operations

    def get_throttles(self):
        # Profile reads (`GET /users/me/`) are frequent in the SPA auth flow.
        # Keep strict throttling for writes, but allow normal authenticated read rate.
        if self.request.method in permissions.SAFE_METHODS:
            return [UserRateThrottle()]
        return [SensitiveOperationThrottle()]

    def get_queryset(self):
        badge_prefetch = Prefetch(
            'badges',
            queryset=UserBadge.objects.select_related('badge')
        )
        
        # Filter services by visibility - admins can see all, others only visible
        is_admin = self.request.user.is_authenticated and self.request.user.role == 'admin'
        if is_admin:
            services_prefetch = Prefetch('services', queryset=Service.objects.prefetch_related('tags'))
        else:
            services_prefetch = Prefetch(
                'services',
                queryset=Service.objects.filter(is_visible=True).exclude(status='Cancelled').prefetch_related('tags')
            )

        return (
            User.objects
            .prefetch_related(services_prefetch, badge_prefetch)
            .annotate(
                punctual_count=Count('received_reps', filter=Q(received_reps__is_punctual=True)),
                helpful_count=Count('received_reps', filter=Q(received_reps__is_helpful=True)),
                kind_count=Count('received_reps', filter=Q(received_reps__is_kind=True)),
            )
        )
    
    def get_object(self):
        user_id = self.kwargs.get('id')
        if user_id:
            return self.get_queryset().get(id=user_id)
        
        cached_user = get_cached_user_profile(str(self.request.user.id))
        if cached_user:
            user = User.objects.get(id=self.request.user.id)
            user._cached_data = cached_user
            return user
            
        return self.get_queryset().get(id=self.request.user.id)
    
    def retrieve(self, request, *args, **kwargs):
        instance = self.get_object()
        serializer = self.get_serializer(instance)
        
        if hasattr(instance, '_cached_data'):
            return Response(instance._cached_data)
            
        response_data = serializer.data
        response_data['event_comments_history'] = _build_event_comments_history(instance, request)
        
        if not kwargs.get('id'):
            cache_user_profile(str(request.user.id), response_data)
        
        return Response(response_data)
    
    def update(self, request, *args, **kwargs):
        partial = kwargs.pop('partial', False)
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        self.perform_update(serializer)
        
        invalidate_user_profile(str(request.user.id))
        invalidate_user_services(str(request.user.id))
        
        return Response(serializer.data)
    
    def perform_update(self, serializer):
        serializer.save()
    
    def get_serializer_class(self):
        user_id = self.kwargs.get('id')
        if user_id and user_id != str(self.request.user.id):
            from .serializers import PublicUserProfileSerializer
            return PublicUserProfileSerializer
        return UserProfileSerializer


class UserHistoryView(APIView):
    """
    User Transaction History
    
    Get a user's completed transaction history (successful exchanges).
    
    **GET /api/users/{id}/history/** - Get user's transaction history
    
    **Privacy:**
    - If the user has `show_history=False`, returns empty list for other users
    - Users can always see their own history
    
    **Response Format:**
    ```json
    [
        {
            "service_title": "Web Development Help",
            "service_type": "Offer",
            "duration": 2.5,
            "partner_name": "Jane Smith",
            "partner_id": "uuid",
            "partner_avatar_url": "https://example.com/avatar.jpg",
            "completed_date": "2024-01-01T12:00:00Z",
            "was_provider": true
        }
    ]
    ```
    
    **Authentication:** Optional (required to view private histories or own history)
    """
    permission_classes = [permissions.AllowAny]
    
    def get(self, request, id):
        from .serializers import UserHistorySerializer
        from .utils import get_provider_and_receiver
        
        try:
            target_user = User.objects.get(id=id)
        except User.DoesNotExist:
            return Response(
                {'detail': 'User not found'},
                status=status.HTTP_404_NOT_FOUND
            )
        
        # Check privacy - if not showing history and not the owner, return empty
        is_owner = request.user.is_authenticated and str(request.user.id) == str(id)
        if not target_user.show_history and not is_owner:
            return Response([])
        
        # Get completed handshakes where this user participated
        # User could be service owner OR requester
        completed_handshakes = Handshake.objects.filter(
            status='completed'
        ).filter(
            Q(service__user=target_user) | Q(requester=target_user)
        ).select_related(
            'service', 'service__user', 'requester'
        ).order_by('-updated_at')[:50]  # Limit to last 50
        
        history = []
        for handshake in completed_handshakes:
            provider, receiver = get_provider_and_receiver(handshake)
            was_provider = provider.id == target_user.id
            
            # Determine partner (the other party)
            if was_provider:
                partner = receiver
            else:
                partner = provider
            
            history.append({
                'service_title': handshake.service.title,
                'service_type': handshake.service.type,
                'duration': handshake.provisioned_hours,
                'partner_name': f"{partner.first_name} {partner.last_name}".strip(),
                'partner_id': partner.id,
                'partner_avatar_url': partner.avatar_url,
                'completed_date': handshake.updated_at,
                'was_provider': was_provider
            })
        
        serializer = UserHistorySerializer(history, many=True)
        return Response(serializer.data)


class UserBadgeProgressView(APIView):
    """
    User Badge/Achievement Progress
    
    Get progress towards all achievements for a user.
    
    **GET /api/users/{id}/badge-progress/** - Get user's achievement progress
    
    **Response Format:**
    ```json
    {
        "first-service": {
            "badge": {
                "name": "First Service",
                "description": "Completed the first timebank exchange.",
                "karma_points": 5,
                "is_hidden": false
            },
            "earned": true,
            "current": 1,
            "threshold": 1,
            "progress_percent": 100
        },
        ...
    }
    ```
    
    **Authentication:** Required (JWT Bearer token)
    """
    permission_classes = [permissions.IsAuthenticated]
    
    def get(self, request, id):
        try:
            target_user = User.objects.get(id=id)
        except User.DoesNotExist:
            return Response(
                {'detail': 'User not found'},
                status=status.HTTP_404_NOT_FOUND
            )
        
        # Users can only view their own badge progress
        if str(request.user.id) != str(id):
            return Response(
                {'detail': 'You can only view your own achievement progress'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        progress = get_achievement_progress(target_user)
        return Response(progress)


class UserVerifiedReviewsView(APIView):
    """
    User Verified Reviews
    
    Get all verified reviews received by a user (from completed exchanges).
    
    **GET /api/users/{id}/verified-reviews/** - Get user's verified reviews
    
    **Response Format:**
    ```json
    {
        "count": 5,
        "results": [
            {
                "id": "uuid",
                "service_title": "Manti Cooking Lesson",
                "user_name": "Sarah Chen",
                "user_id": "uuid",
                "body": "Great service!",
                "handshake_hours": 3.0,
                "created_at": "2024-01-01T12:00:00Z"
            }
        ]
    }
    ```
    
    **Authentication:** Optional (public endpoint)
    """
    permission_classes = [permissions.AllowAny]
    pagination_class = StandardResultsSetPagination
    
    def get(self, request, id):
        try:
            target_user = User.objects.get(id=id)
        except User.DoesNotExist:
            return Response(
                {'detail': 'User not found'},
                status=status.HTTP_404_NOT_FOUND
            )
        
        # Verified reviews are stored as Comment rows created from reputation submissions.
        # A review's *target user* is the other party in the linked handshake.
        # We derive “reviews received by target_user” without schema changes:
        # - Reviews about the service owner: service__user == target_user AND comment.user == handshake.requester
        # - Reviews about the requester: handshake.requester == target_user AND comment.user == service.owner
        from django.db.models import F, Q
        from .models import Comment
        comments = Comment.objects.filter(
            is_verified_review=True,
            is_deleted=False,
            related_handshake__isnull=False,
        ).filter(
            Q(service__user=target_user, related_handshake__requester=F('user'))
            | Q(related_handshake__requester=target_user, service__user=F('user'))
        ).select_related('user', 'service', 'related_handshake').prefetch_related(
            Prefetch(
                'user__badges',
                queryset=UserBadge.objects.select_related('badge')
            )
        ).order_by('-created_at')
        comments = _apply_blind_review_visibility(comments)
        
        # Paginate
        paginator = self.pagination_class()
        page = paginator.paginate_queryset(comments, request)
        
        if page is not None:
            serializer = CommentSerializer(page, many=True)
            return paginator.get_paginated_response(serializer.data)
        
        serializer = CommentSerializer(comments, many=True)
        return Response({'results': serializer.data, 'count': len(serializer.data)})


class ServiceViewSet(viewsets.ModelViewSet):
    """
    Service Management
    
    CRUD operations for services (offers and needs).
    
    **List Services:** GET /api/services/
    **Create Service:** POST /api/services/
    **Retrieve Service:** GET /api/services/{id}/
    **Update Service:** PUT/PATCH /api/services/{id}/
    **Delete Service:** DELETE /api/services/{id}/
    
    **Service Types:**
    - "Offer": User offering a service to others
    - "Need": User requesting a service from others
    
    **Request Format (Create):**
    ```json
    {
        "title": "Web Development Help",
        "description": "I can help with React and Django",
        "type": "Offer",
        "duration": 2.5,
        "max_participants": 1,
        "tags": ["uuid1", "uuid2"],
        "location_type": "remote",
        "location_area": "San Francisco Bay Area"
    }
    ```
    
    **Response Format:**
    ```json
    {
        "id": "uuid",
        "title": "Web Development Help",
        "description": "I can help with React and Django",
        "type": "Offer",
        "duration": 2.5,
        "max_participants": 1,
        "status": "Active",
        "user": {
            "id": "uuid",
            "name": "John Doe",
            "avatar_url": "https://example.com/avatar.jpg",
            "badges": [...]
        },
        "tags": [...],
        "created_at": "2024-01-01T12:00:00Z",
        "location_type": "remote",
        "location_area": "San Francisco Bay Area"
    }
    ```
    
    **Error Scenarios:**
    - 400 Bad Request: Invalid duration, missing required fields, balance > 10 hours for offers
    - 401 Unauthorized: Authentication required for create/update/delete
    - 403 Forbidden: Attempting to modify another user's service
    - 404 Not Found: Service ID does not exist
    
    **Pagination:** 20 items per page (configurable with ?page_size=)
    **Authentication:** Optional for list/retrieve, required for create/update/delete
    """
    queryset = Service.objects.filter(status='Active')
    serializer_class = ServiceSerializer
    permission_classes = [permissions.IsAuthenticatedOrReadOnly]
    pagination_class = StandardResultsSetPagination

    @track_performance
    def list(self, request, *args, **kwargs):
        # Include all search parameters in cache key
        # Include admin status since admins see hidden services (is_visible=False)
        is_admin = request.user.is_authenticated and request.user.role == 'admin'
        cache_key_params = {
            'type': request.query_params.get('type'),
            'tag': request.query_params.get('tag'),
            'tags': ','.join(request.query_params.getlist('tags')),
            'search': request.query_params.get('search'),
            'lat': request.query_params.get('lat'),
            'lng': request.query_params.get('lng'),
            'distance': request.query_params.get('distance'),
            'sort': request.query_params.get('sort', 'latest'),
            'page': request.query_params.get('page', '1'),
            'page_size': request.query_params.get('page_size'),
            'user': request.query_params.get('user'),
            'is_admin': str(is_admin),  # Different cache for admin vs non-admin
        }
        
        # Don't cache location-based queries (results vary by user location)
        use_cache = not (request.query_params.get('lat') and request.query_params.get('lng'))
        
        if use_cache:
            cached_result = get_cached_service_list(cache_key_params)
            if cached_result is not None:
                return Response(cached_result)
        
        queryset = self.filter_queryset(self.get_queryset())
        paginator = self.pagination_class()
        
        page = paginator.paginate_queryset(queryset, request)
        
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            response = paginator.get_paginated_response(serializer.data)
            if use_cache:
                cache_service_list(cache_key_params, response.data, ttl=CACHE_TTL_SHORT)
            return response
        
        serializer = self.get_serializer(queryset[:100], many=True)
        response_data = serializer.data
        if use_cache:
            cache_service_list(cache_key_params, response_data, ttl=CACHE_TTL_SHORT)
        return Response(response_data)

    @track_performance
    def get_queryset(self):
        # Use Prefetch object to optimize nested user badges query
        user_badges_prefetch = Prefetch(
            'user__badges',
            queryset=UserBadge.objects.select_related('badge')
        )
        
        # Prefetch capacity-relevant handshakes to compute participant_count without N+1
        capacity_handshakes_prefetch = Prefetch(
            'handshakes',
            queryset=Handshake.objects.filter(
                status__in=['pending', 'accepted', 'completed', 'reported', 'paused', 'checked_in', 'attended', 'no_show']
            ).only('id', 'service_id', 'status'),
            to_attr='capacity_handshakes',
        )

        # Base queryset with optimizations (annotate comment_count to avoid N+1 in list)
        queryset = (
            Service.objects.filter(status='Active')
            .annotate(comment_count=Count('comments', filter=Q(comments__is_deleted=False)))
            .select_related('user', 'event_evaluation_summary')
            .prefetch_related(
                'tags',
                user_badges_prefetch,
                Prefetch('media', queryset=ServiceMedia.objects.order_by('display_order', 'created_at')),
                capacity_handshakes_prefetch,
            )
        )
        
        # Filter by visibility - admins can see all, others only visible
        if not (self.request.user.is_authenticated and self.request.user.role == 'admin'):
            queryset = queryset.filter(is_visible=True)
        
        # Apply search engine filters (Strategy Pattern)
        search_engine = SearchEngine()
        search_params = {
            'type': self.request.query_params.get('type'),
            'tag': self.request.query_params.get('tag'),
            'tags': self.request.query_params.getlist('tags'),
            'search': self.request.query_params.get('search'),
            'lat': self.request.query_params.get('lat'),
            'lng': self.request.query_params.get('lng'),
            'distance': self.request.query_params.get('distance', 10),
        }
        
        queryset = search_engine.search(queryset, search_params)

        # Filter by owner user (for profile pages)
        user_param = self.request.query_params.get('user')
        if user_param:
            queryset = queryset.filter(user_id=user_param)
        
        # Apply ordering based on sort parameter
        # Must validate that lat/lng are valid numbers, not just truthy strings
        def is_valid_coordinate(value: str | None) -> bool:
            if value is None:
                return False
            try:
                float(value)
                return True
            except (ValueError, TypeError):
                return False
        
        lat_param = self.request.query_params.get('lat')
        lng_param = self.request.query_params.get('lng')
        sort_param = self.request.query_params.get('sort', 'latest')
        
        # If location-based search, distance ordering takes priority
        if is_valid_coordinate(lat_param) and is_valid_coordinate(lng_param):
            pass  # Already ordered by distance from search_engine
        elif sort_param == 'hot':
            # Sort by hot score (descending - highest score first)
            queryset = queryset.order_by('-hot_score', '-created_at')
        else:
            # Default: sort by latest (created_at descending)
            queryset = queryset.order_by('-created_at')
        
        return queryset

    def get_serializer_context(self):
        return {'request': self.request}

    def retrieve(self, request, *args, **kwargs):
        """Return a single service regardless of status so owners and participants
        can view Agreed/Completed/Cancelled services from their history."""
        user_badges_prefetch = Prefetch(
            'user__badges',
            queryset=UserBadge.objects.select_related('badge')
        )
        capacity_handshakes_prefetch = Prefetch(
            'handshakes',
            queryset=Handshake.objects.filter(
                status__in=['pending', 'accepted', 'completed', 'reported', 'paused', 'checked_in', 'attended', 'no_show']
            ).only('id', 'service_id', 'status'),
            to_attr='capacity_handshakes',
        )
        queryset = (
            Service.objects
            .select_related('user', 'event_evaluation_summary')
            .prefetch_related(
                'tags',
                user_badges_prefetch,
                Prefetch('media', queryset=ServiceMedia.objects.order_by('display_order', 'created_at')),
                capacity_handshakes_prefetch,
            )
        )
        instance = get_object_or_404(queryset, pk=kwargs['pk'])
        serializer = self.get_serializer(instance)
        return Response(serializer.data)

    def create(self, request, *args, **kwargs):
        # REQ-TB-003: Check if user can post offer (balance > 10 hours blocks new offers)
        from .utils import can_user_post_offer

        service_type = request.data.get('type')

        # --- Event-specific pre-creation checks ---
        if service_type == 'Event':
            # Block organizer-banned users
            perm = IsNotOrganizerBanned()
            if not perm.has_permission(request, self):
                return create_error_response(
                    perm.message,
                    code=ErrorCodes.PERMISSION_DENIED,
                    status_code=status.HTTP_403_FORBIDDEN,
                )
            # Require a future scheduled_time
            raw_time = request.data.get('scheduled_time')
            if not raw_time:
                return create_error_response(
                    'Events require a scheduled_time.',
                    code=ErrorCodes.VALIDATION_ERROR,
                    status_code=status.HTTP_400_BAD_REQUEST,
                )
            from .timezone_utils import validate_and_normalize_datetime, validate_future_datetime
            parsed_time, parse_error = validate_and_normalize_datetime(raw_time)
            if parse_error:
                return create_error_response(
                    parse_error,
                    code=ErrorCodes.VALIDATION_ERROR,
                    status_code=status.HTTP_400_BAD_REQUEST,
                )
            future_error = validate_future_datetime(parsed_time)
            if future_error:
                return create_error_response(
                    future_error,
                    code=ErrorCodes.VALIDATION_ERROR,
                    status_code=status.HTTP_400_BAD_REQUEST,
                )

        if service_type == 'Offer':
            if not can_user_post_offer(request.user):
                return create_error_response(
                    'Cannot post new offers: TimeBank balance exceeds 10 hours. Please receive services to reduce your balance.',
                    code=ErrorCodes.INSUFFICIENT_BALANCE,
                    status_code=status.HTTP_400_BAD_REQUEST
                )

        response = super().create(request, *args, **kwargs)
        invalidate_service_lists()
        
        # Award karma for posting a service (+2)
        request.user.karma_score = F("karma_score") + 2
        request.user.save(update_fields=['karma_score'])
        request.user.refresh_from_db(fields=['karma_score'])
        
        # Check and assign badges for the user
        check_and_assign_badges(request.user)
        
        return response
    
    def perform_update(self, serializer):
        service = serializer.instance
        if service.user != self.request.user and getattr(self.request.user, 'role', None) != 'admin':
            raise PermissionDenied('Attempting to modify another user\'s service')

        # Block edits to Event details once inside the 24-hour lockdown window.
        # Non-Event services are completely unaffected by this guard.
        # Admins are exempt so they can still toggle visibility or moderate.
        is_admin = getattr(self.request.user, 'role', None) == 'admin'
        if service.type == 'Event' and service.is_in_lockdown_window and not is_admin:
            raise PermissionDenied(
                'Cannot edit event details within 24 hours of the scheduled start time.'
            )

        super().perform_update(serializer)
        invalidate_service_lists()
        invalidate_user_services(str(service.user.id))

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()

        # Authorization must run before state checks to avoid leaking service state.
        if instance.user != request.user and getattr(request.user, 'role', None) != 'admin':
            raise PermissionDenied('Attempting to delete another user\'s service')

        active_handshakes = instance.handshakes.filter(
            status__in=['pending', 'accepted', 'checked_in', 'attended']
        )
        if active_handshakes.exists():
            return create_error_response(
                'Cannot remove this service because it has active handshakes. Cancel or complete those first.',
                code=ErrorCodes.INVALID_STATE,
                status_code=status.HTTP_400_BAD_REQUEST,
            )

        # Soft-delete: mark as Cancelled instead of removing the row.
        instance.status = 'Cancelled'
        instance.save(update_fields=['status', 'updated_at'])
        invalidate_service_lists()
        invalidate_user_services(str(instance.user.id))
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=['post'], url_path='toggle-visibility')
    def toggle_visibility(self, request, pk=None):
        """
        Toggle Service Visibility (Admin Only)
        
        Flip the is_visible flag to hide/show a service [REQ-ADM-004].
        Hidden services won't appear in public listings.
        
        **Endpoint:** POST /api/services/{id}/toggle-visibility/
        
        **Response:**
        ```json
        {
            "id": "uuid",
            "is_visible": false,
            "message": "Service has been hidden"
        }
        ```
        
        **Error Scenarios:**
        - 403 Forbidden: Admin role required
        - 404 Not Found: Service does not exist
        """
        if request.user.role != 'admin':
            raise PermissionDenied('Admin access required')
        
        service = self.get_object()
        service.is_visible = not service.is_visible
        service.save(update_fields=['is_visible'])
        
        # Notify service owner
        action_text = 'hidden' if not service.is_visible else 'restored'
        create_notification(
            user=service.user,
            notification_type='admin_warning',
            title=f'Service {action_text.capitalize()}',
            message=f'Your service "{service.title}" has been {action_text} by a moderator.',
            service=service
        )
        
        invalidate_service_lists()
        
        return Response({
            'id': str(service.id),
            'is_visible': service.is_visible,
            'message': f'Service has been {action_text}'
        })

    # ------------------------------------------------------------------
    # Event lifecycle actions (additive — do not touch Offer/Need paths)
    # ------------------------------------------------------------------

    @action(detail=True, methods=['post'], url_path='complete-event',
            permission_classes=[permissions.IsAuthenticated])
    def complete_event(self, request, pk=None):
        """Mark an Event as Completed (organizer only).

        Transitions all 'accepted' and 'checked_in' handshakes to 'no_show' and applies
        no-show bans where applicable.

        POST /api/services/{id}/complete-event/
        """
        service = self.get_object()
        try:
            EventHandshakeService.complete_event(service, request.user)
        except PermissionError as e:
            return create_error_response(
                str(e), code=ErrorCodes.PERMISSION_DENIED,
                status_code=status.HTTP_403_FORBIDDEN
            )
        except ValueError as e:
            return create_error_response(
                str(e), code=ErrorCodes.INVALID_STATE,
                status_code=status.HTTP_400_BAD_REQUEST
            )
        serializer = self.get_serializer(service)
        return Response(serializer.data)

    @action(detail=True, methods=['patch'], url_path='set-primary-media',
            permission_classes=[permissions.IsAuthenticated])
    def set_primary_media(self, request, pk=None):
        """Set a media item as the primary (cover) photo for a service.

        PATCH /api/services/{id}/set-primary-media/
        Body: { "media_id": "<ServiceMedia UUID>" }

        Moves the specified media to display_order=0 and re-numbers the rest.
        Only the service owner can call this endpoint.
        """
        service = self.get_object()
        if service.user != request.user:
            return create_error_response(
                'Only the owner can change the cover photo.',
                code=ErrorCodes.PERMISSION_DENIED,
                status_code=status.HTTP_403_FORBIDDEN,
            )
        media_id = request.data.get('media_id')
        if not media_id:
            return create_error_response(
                'media_id is required.',
                code=ErrorCodes.INVALID_INPUT,
                status_code=status.HTTP_400_BAD_REQUEST,
            )
        from .models import ServiceMedia as ServiceMediaModel
        try:
            primary = ServiceMediaModel.objects.get(id=media_id, service=service)
        except ServiceMediaModel.DoesNotExist:
            return create_error_response(
                'Media not found for this service.',
                code=ErrorCodes.NOT_FOUND,
                status_code=status.HTTP_404_NOT_FOUND,
            )
        # Re-order: primary → 0, others → 1, 2, 3 …
        others = ServiceMediaModel.objects.filter(service=service).exclude(id=media_id).order_by('display_order', 'created_at')
        primary.display_order = 0
        primary.save(update_fields=['display_order'])
        for idx, m in enumerate(others, start=1):
            m.display_order = idx
            m.save(update_fields=['display_order'])
        serializer = self.get_serializer(service)
        return Response(serializer.data)

    @action(detail=True, methods=['post'], url_path='cancel-event',
            permission_classes=[permissions.IsAuthenticated])
    def cancel_event(self, request, pk=None):
        """Cancel an Event (organizer only).

        If cancelled inside the 24-hour lockdown window with active
        participants, the organizer receives a 30-day creation ban.

        POST /api/services/{id}/cancel-event/
        """
        service = self.get_object()
        try:
            EventHandshakeService.cancel_event(service, request.user)
        except PermissionError as e:
            return create_error_response(
                str(e), code=ErrorCodes.PERMISSION_DENIED,
                status_code=status.HTTP_403_FORBIDDEN
            )
        except ValueError as e:
            return create_error_response(
                str(e), code=ErrorCodes.INVALID_STATE,
                status_code=status.HTTP_400_BAD_REQUEST
            )
        serializer = self.get_serializer(service)
        return Response(serializer.data)

    @action(
        detail=True,
        methods=['post'],
        url_path='report',
        permission_classes=[permissions.IsAuthenticated],
        throttle_classes=[SensitiveOperationThrottle],
    )
    def report_service(self, request, pk=None):
        """Report a service listing for moderation.

        Endpoint: POST /api/services/{id}/report/
        Body: { "issue_type": "inappropriate_content"|"spam"|"service_issue", "description": "..." }
        """
        # Use an unfiltered lookup so users can report listings visible on detail
        # pages even after status transitions (e.g., Active -> Agreed).
        service = get_object_or_404(Service.objects.select_related('user'), pk=pk)
        issue_type = request.data.get('issue_type', 'inappropriate_content')
        description = (request.data.get('description') or '').strip()

        allowed_types = {'inappropriate_content', 'spam', 'service_issue', 'scam', 'harassment', 'other'}
        if issue_type not in allowed_types:
            return create_error_response(
                'Invalid issue_type.',
                code=ErrorCodes.VALIDATION_ERROR,
                status_code=status.HTTP_400_BAD_REQUEST,
            )

        # Prevent duplicate listing reports (do not block handshake-related reports)
        already_reported = Report.objects.filter(
            reporter=request.user,
            reported_service=service,
            related_handshake__isnull=True,
        ).exists()
        if already_reported:
            return create_error_response(
                'You have already reported this listing. Moderators are reviewing your report.',
                code=ErrorCodes.VALIDATION_ERROR,
                status_code=status.HTTP_400_BAD_REQUEST,
            )

        # Auto-generate description from type if not provided
        if not description:
            type_labels = {
                'inappropriate_content': 'Inappropriate content',
                'spam': 'Spam or misleading listing',
                'service_issue': 'Service quality issue',
                'scam': 'Suspected scam or fraud',
                'harassment': 'Harassment or abusive behavior',
                'other': 'Other issue reported by user',
            }
            description = type_labels.get(issue_type, 'Reported by user')

        report = Report.objects.create(
            reporter=request.user,
            reported_user=service.user,
            reported_service=service,
            type=issue_type,
            description=description,
        )

        admins = User.objects.filter(role='admin')
        for admin in admins:
            create_notification(
                user=admin,
                notification_type='admin_warning',
                title='New Listing Report',
                message=f"New {report.get_type_display()} report for service '{service.title}'",
                service=service,
            )

        return Response({'status': 'success', 'report_id': str(report.id)}, status=201)

class TagViewSet(viewsets.ModelViewSet):
    """
    Tag Management
    
    Manage service tags for categorization.
    
    **List Tags:** GET /api/tags/
    **Search Tags:** GET /api/tags/?search=programming
    **Create Tag:** POST /api/tags/
    **Update Tag:** PUT/PATCH /api/tags/{id}/
    **Delete Tag:** DELETE /api/tags/{id}/
    
    **Request Format (Create):**
    ```json
    {
        "name": "Programming"
    }
    ```
    
    **Response Format:**
    ```json
    {
        "id": "uuid",
        "name": "Programming"
    }
    ```
    
    **Query Parameters:**
    - `search`: Filter tags by name (case-insensitive partial match)
    
    **Error Scenarios:**
    - 400 Bad Request: Tag name already exists, invalid format
    - 401 Unauthorized: Authentication required for create/update/delete
    
    **Caching:** Tag list is cached for improved performance
    **Authentication:** Optional for list, required for create/update/delete
    """
    queryset = Tag.objects.all()
    serializer_class = TagSerializer
    permission_classes = [permissions.IsAuthenticatedOrReadOnly]

    def get_serializer_context(self):
        context = super().get_serializer_context()
        # Only direct tag endpoints need Wikidata enrichment. Nested serializers
        # should stay lightweight to keep service list/detail responses fast.
        context['include_wikidata_info'] = True
        return context
    
    def get_queryset(self):
        queryset = Tag.objects.all()
        search = self.request.query_params.get('search', None)
        if search:
            queryset = queryset.filter(name__icontains=search)
        return queryset
    
    def list(self, request, *args, **kwargs):
        """List tags with caching"""
        search = request.query_params.get('search', None)
        
        # Only cache if no search filter
        if not search:
            cached_data = get_cached_tag_list()
            if cached_data is not None:
                return Response(cached_data)
        
        # Get data from database
        queryset = self.filter_queryset(self.get_queryset())
        serializer = self.get_serializer(queryset, many=True)
        
        # Cache if no search filter
        if not search:
            cache_tag_list(serializer.data)
        
        return Response(serializer.data)
    
    def perform_create(self, serializer):
        """Invalidate cache when creating tag"""
        super().perform_create(serializer)
        invalidate_tag_list()
    
    def perform_update(self, serializer):
        """Invalidate cache when updating tag"""
        super().perform_update(serializer)
        invalidate_tag_list()
    
    def perform_destroy(self, instance):
        """Invalidate cache when deleting tag"""
        super().perform_destroy(instance)
        invalidate_tag_list()

class ExpressInterestView(APIView):
    """
    Express Interest in a Service
    
    Create a handshake by expressing interest in a service.
    
    **Endpoint:** POST /api/services/{service_id}/interest/
    
    **Request Format:**
    ```json
    {}
    ```
    (No body required - service_id is in URL)
    
    **Response Format (201 Created):**
    ```json
    {
        "id": "uuid",
        "service": {...},
        "requester": {...},
        "status": "pending",
        "provisioned_hours": 2.5,
        "created_at": "2024-01-01T12:00:00Z"
    }
    ```
    
    **Business Rules:**
    - Cannot express interest in your own service
    - Cannot express interest if already have pending/accepted handshake for this service
    - Service receiver must have sufficient TimeBank balance (>= service duration)
      - For "Offer" posts: Person expressing interest pays (they are the receiver)
      - For "Need" posts: Service owner pays (they are the receiver)
    - Creates initial chat message automatically
    - Notifies service provider
    
    **Error Scenarios:**
    - 400 Bad Request: Already expressed interest, insufficient balance, own service
    - 401 Unauthorized: Authentication required
    - 404 Not Found: Service does not exist or is not active
    - 429 Too Many Requests: Rate limit exceeded (1000/hour per user)
    
    **Authentication:** Required (JWT Bearer token)
    **Rate Limiting:** 1000 requests per hour per user
    """
    permission_classes = [permissions.IsAuthenticated]
    throttle_classes = [UserRateThrottle]
    parser_classes = [JSONParser, FormParser, MultiPartParser]

    @track_performance
    def post(self, request, service_id):
        try:
            service = Service.objects.select_related('user').get(id=service_id, status='Active')
        except Service.DoesNotExist:
            return create_error_response(
                'Service not found',
                code=ErrorCodes.NOT_FOUND,
                status_code=status.HTTP_404_NOT_FOUND
            )

        try:
            handshake = HandshakeService.express_interest(service, request.user)
        except OperationalError as e:
            # Handle database deadlocks - these can occur when multiple users
            # simultaneously express interest. The lock ordering fix should prevent
            # most cases, but we handle it gracefully if it still occurs.
            logger.warning(f"Database deadlock in express_interest: {e}", exc_info=True)
            return create_error_response(
                'A temporary database conflict occurred. Please try again.',
                code=ErrorCodes.SERVER_ERROR,
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE
            )
        except ValueError as e:
            # Map ValueError to appropriate error codes
            error_message = str(e)
            
            if 'own service' in error_message:
                return create_error_response(
                    error_message,
                    code=ErrorCodes.INVALID_STATE,
                    status_code=status.HTTP_400_BAD_REQUEST
                )
            elif 'already expressed interest' in error_message:
                return create_error_response(
                    error_message,
                    code=ErrorCodes.ALREADY_EXISTS,
                    status_code=status.HTTP_400_BAD_REQUEST
                )
            elif 'maximum capacity' in error_message:
                return create_error_response(
                    error_message,
                    code=ErrorCodes.INVALID_STATE,
                    status_code=status.HTTP_400_BAD_REQUEST
                )
            elif 'Insufficient TimeBank balance' in error_message:
                return create_error_response(
                    error_message,
                    code=ErrorCodes.INSUFFICIENT_BALANCE,
                    status_code=status.HTTP_400_BAD_REQUEST
                )
            elif 'not active' in error_message:
                return create_error_response(
                    error_message,
                    code=ErrorCodes.INVALID_STATE,
                    status_code=status.HTTP_400_BAD_REQUEST
                )
            else:
                return create_error_response(
                    error_message,
                    code=ErrorCodes.VALIDATION_ERROR,
                    status_code=status.HTTP_400_BAD_REQUEST
                )

        serializer = HandshakeSerializer(handshake)
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class HandshakeViewSet(viewsets.ModelViewSet):
    """
    Handshake Management
    
    Manage service agreements between providers and requesters.
    
    **List Handshakes:** GET /api/handshakes/
    **Retrieve Handshake:** GET /api/handshakes/{id}/
    **Initiate Handshake:** POST /api/handshakes/{id}/initiate/
    **Approve Handshake:** POST /api/handshakes/{id}/approve/
    **Accept Handshake:** POST /api/handshakes/{id}/accept/
    **Deny Handshake:** POST /api/handshakes/{id}/deny/
    **Cancel Handshake:** POST /api/handshakes/{id}/cancel/
    **Confirm Completion:** POST /api/handshakes/{id}/confirm/
    **Report Issue:** POST /api/handshakes/{id}/report/
    
    **Handshake Lifecycle:**
    1. Requester expresses interest → status: "pending"
    2. Provider initiates with details (location, time, duration)
    3. Requester approves → status: "accepted", TimeBank provisioned
    4. Service occurs
    5. Both parties confirm completion → status: "completed", TimeBank transferred
    6. Both parties can leave reputation
    
    **Initiate Request Format:**
    ```json
    {
        "exact_location": "123 Main St, San Francisco",
        "exact_duration": 2.5,
        "scheduled_time": "2024-12-25T14:00:00Z"
    }
    ```
    
    **Confirm Completion Request Format:**
    ```json
    {
        "hours": 2.5
    }
    ```
    (Optional: adjust hours if different from provisioned amount)
    
    **Report Issue Request Format:**
    ```json
    {
        "issue_type": "no_show",
        "description": "Provider did not show up"
    }
    ```
    
    **Response Format:**
    ```json
    {
        "id": "uuid",
        "service": {...},
        "requester": {...},
        "status": "accepted",
        "provisioned_hours": 2.5,
        "exact_location": "123 Main St",
        "exact_duration": 2.5,
        "scheduled_time": "2024-12-25T14:00:00Z",
        "provider_confirmed_complete": false,
        "receiver_confirmed_complete": false,
        "provider_initiated": true,
        "requester_initiated": true,
        "created_at": "2024-01-01T12:00:00Z"
    }
    ```
    
    **Error Scenarios:**
    - 400 Bad Request: Invalid state transition, insufficient balance, invalid hours
    - 401 Unauthorized: Authentication required
    - 403 Forbidden: Not authorized to perform action on this handshake
    - 404 Not Found: Handshake does not exist
    - 429 Too Many Requests: Rate limit exceeded
    
    **Rate Limiting:**
    - Standard actions: 1000/hour per user
    - Confirm completion: 10/hour per user
    - Report issue: 10/hour per user
    
    **Authentication:** Required (JWT Bearer token)
    **Pagination:** 20 items per page
    """
    serializer_class = HandshakeSerializer
    permission_classes = [permissions.IsAuthenticated]
    throttle_classes = [UserRateThrottle]
    pagination_class = StandardResultsSetPagination

    def list(self, request, *args, **kwargs):
        queryset = self.filter_queryset(self.get_queryset())
        paginator = self.pagination_class()
        if request.query_params.get(paginator.page_query_param) or request.query_params.get(paginator.page_size_query_param):
            page = paginator.paginate_queryset(queryset, request)
            if page is not None:
                serializer = self.get_serializer(page, many=True)
                return paginator.get_paginated_response(serializer.data)
        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data)

    def get_queryset(self):
        user = self.request.user
        return Handshake.objects.filter(
            Q(requester=user) | Q(service__user=user)
        ).select_related('service', 'requester', 'service__user').prefetch_related(
            Prefetch('reps', queryset=ReputationRep.objects.filter(giver=user), to_attr='user_reps')
        )

    @action(detail=False, methods=['post'], url_path=r'services/(?P<service_id>[^/.]+)/interest', permission_classes=[permissions.IsAuthenticated])
    @track_performance
    def express_interest(self, request, service_id=None):
        try:
            service = Service.objects.select_related('user').get(id=service_id, status='Active')
        except Service.DoesNotExist:
            return create_error_response(
                'Service not found',
                code=ErrorCodes.NOT_FOUND,
                status_code=status.HTTP_404_NOT_FOUND
            )

        try:
            handshake = HandshakeService.express_interest(service, request.user)
        except OperationalError as e:
            # Handle database deadlocks - these can occur when multiple users
            # simultaneously express interest. The lock ordering fix should prevent
            # most cases, but we handle it gracefully if it still occurs.
            logger.warning(f"Database deadlock in express_interest: {e}", exc_info=True)
            return create_error_response(
                'A temporary database conflict occurred. Please try again.',
                code=ErrorCodes.SERVER_ERROR,
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE
            )
        except ValueError as e:
            # Map ValueError to appropriate error codes
            error_message = str(e)
            
            if 'own service' in error_message:
                return create_error_response(
                    error_message,
                    code=ErrorCodes.INVALID_STATE,
                    status_code=status.HTTP_400_BAD_REQUEST
                )
            elif 'already expressed interest' in error_message:
                return create_error_response(
                    error_message,
                    code=ErrorCodes.ALREADY_EXISTS,
                    status_code=status.HTTP_400_BAD_REQUEST
                )
            elif 'maximum capacity' in error_message:
                return create_error_response(
                    error_message,
                    code=ErrorCodes.INVALID_STATE,
                    status_code=status.HTTP_400_BAD_REQUEST
                )
            elif 'Insufficient TimeBank balance' in error_message:
                return create_error_response(
                    error_message,
                    code=ErrorCodes.INSUFFICIENT_BALANCE,
                    status_code=status.HTTP_400_BAD_REQUEST
                )
            elif 'not active' in error_message:
                return create_error_response(
                    error_message,
                    code=ErrorCodes.INVALID_STATE,
                    status_code=status.HTTP_400_BAD_REQUEST
                )
            else:
                return create_error_response(
                    error_message,
                    code=ErrorCodes.VALIDATION_ERROR,
                    status_code=status.HTTP_400_BAD_REQUEST
                )

        serializer = self.get_serializer(handshake)
        return Response(serializer.data, status=201)

    @action(detail=True, methods=['post'], url_path='initiate')
    def initiate_handshake(self, request, pk=None):
        """
        Service owner initiates handshake with session details (location, duration, scheduled_time).
        The service owner always initiates, regardless of Offer/Need type.
        The other party (the one who expressed interest) then approves.
        """
        handshake = self.get_object()
        user = request.user
        
        # Service owner always initiates — works for both Offer and Need
        if handshake.service.user != user:
            return create_error_response(
                'Only the service owner can initiate the handshake',
                code=ErrorCodes.PERMISSION_DENIED,
                status_code=status.HTTP_403_FORBIDDEN
            )

        if handshake.status != 'pending':
            return create_error_response(
                'Handshake is not pending',
                code=ErrorCodes.INVALID_STATE,
                status_code=status.HTTP_400_BAD_REQUEST
            )

        # Provider has already initiated
        if handshake.provider_initiated:
            return create_error_response(
                'You have already initiated this handshake',
                code=ErrorCodes.ALREADY_EXISTS,
                status_code=status.HTTP_400_BAD_REQUEST
            )

        # Require all details from provider
        exact_location = request.data.get('exact_location', '').strip()
        exact_duration = request.data.get('exact_duration')
        scheduled_time = request.data.get('scheduled_time')

        if not exact_location:
            return create_error_response(
                'Exact location is required',
                code=ErrorCodes.VALIDATION_ERROR,
                status_code=status.HTTP_400_BAD_REQUEST
            )
        
        if not exact_duration:
            return create_error_response(
                'Exact duration is required',
                code=ErrorCodes.VALIDATION_ERROR,
                status_code=status.HTTP_400_BAD_REQUEST
            )
        
        if not scheduled_time:
            return create_error_response(
                'Scheduled time is required',
                code=ErrorCodes.VALIDATION_ERROR,
                status_code=status.HTTP_400_BAD_REQUEST
            )

        # Parse and validate scheduled time using timezone utilities
        from .timezone_utils import validate_and_normalize_datetime, validate_future_datetime
        
        parsed_time, parse_error = validate_and_normalize_datetime(scheduled_time)
        
        if parse_error:
            return create_error_response(
                parse_error,
                code=ErrorCodes.VALIDATION_ERROR,
                status_code=status.HTTP_400_BAD_REQUEST
            )
        
        # Validate that the time is in the future
        future_error = validate_future_datetime(parsed_time)
        if future_error:
            return create_error_response(
                future_error,
                code=ErrorCodes.VALIDATION_ERROR,
                status_code=status.HTTP_400_BAD_REQUEST
            )

        # Validate duration
        try:
            exact_duration_decimal = Decimal(str(exact_duration))
            if exact_duration_decimal <= 0:
                return create_error_response(
                    'Duration must be greater than 0',
                    code=ErrorCodes.VALIDATION_ERROR,
                    status_code=status.HTTP_400_BAD_REQUEST
                )
        except (ValueError, TypeError):
            return create_error_response(
                'Invalid duration format',
                code=ErrorCodes.VALIDATION_ERROR,
                status_code=status.HTTP_400_BAD_REQUEST
            )

        # Check for schedule conflicts
        from .schedule_utils import check_schedule_conflict
        duration_hours = float(exact_duration_decimal)
        conflicts = check_schedule_conflict(user, parsed_time, duration_hours, exclude_handshake=handshake)
        
        if conflicts:
            conflict_info = conflicts[0]
            other_user_name = f"{conflict_info['other_user'].first_name} {conflict_info['other_user'].last_name}".strip()
            conflict_time = conflict_info['scheduled_time'].strftime('%Y-%m-%d %H:%M')
            return create_error_response(
                'Schedule conflict detected',
                code=ErrorCodes.CONFLICT,
                status_code=status.HTTP_400_BAD_REQUEST,
                conflict=True,
                conflict_details={
                    'service_title': conflict_info['service_title'],
                    'scheduled_time': conflict_time,
                    'other_user': other_user_name
                }
            )

        # Set handshake details
        handshake.provider_initiated = True
        handshake.exact_location = exact_location
        handshake.exact_duration = exact_duration_decimal
        handshake.scheduled_time = parsed_time
        handshake.save()
        
        # Invalidate conversations cache for both users
        # service_owner = initiator (user), other party = handshake.requester
        service_owner = handshake.service.user
        other_party   = handshake.requester
        invalidate_conversations(str(service_owner.id))
        invalidate_conversations(str(other_party.id))

        # Notify the other party (requester) that session details are ready
        create_notification(
            user=other_party,
            notification_type='handshake_request',
            title='Service Details Provided',
            message=f"{user.first_name} has provided session details for '{handshake.service.title}'. Please review and approve.",
            handshake=handshake,
            service=handshake.service
        )

        serializer = self.get_serializer(handshake)
        return Response(serializer.data, status=200)

    @action(detail=True, methods=['post'], url_path='approve')
    def approve_handshake(self, request, pk=None):
        """
        The requester (the one who expressed interest) approves the session details
        that were set by the service owner via /initiate/.
        Works for both Offer and Need service types.
        """
        handshake = self.get_object()
        user = request.user
        
        # Only the requester (the one who expressed interest) can approve
        if handshake.requester != user:
            return create_error_response(
                'Only the requester can approve the handshake',
                code=ErrorCodes.PERMISSION_DENIED,
                status_code=status.HTTP_403_FORBIDDEN
            )

        if handshake.status != 'pending':
            return create_error_response(
                'Handshake is not pending',
                code=ErrorCodes.INVALID_STATE,
                status_code=status.HTTP_400_BAD_REQUEST
            )

        # Provider must have initiated first
        if not handshake.provider_initiated:
            return create_error_response(
                'Provider must initiate the handshake first',
                code=ErrorCodes.INVALID_STATE,
                status_code=status.HTTP_400_BAD_REQUEST
            )

        # Require all details to be set
        if not handshake.exact_location or not handshake.exact_duration or not handshake.scheduled_time:
            return create_error_response(
                'Provider must provide exact location, duration, and scheduled time before approval',
                code=ErrorCodes.INVALID_STATE,
                status_code=status.HTTP_400_BAD_REQUEST,
                requires_details=True
            )

        # Provision TimeBank and accept handshake
        try:
            provision_timebank(handshake)
        except ValueError as e:
            return create_error_response(
                str(e),
                code=ErrorCodes.INSUFFICIENT_BALANCE,
                status_code=status.HTTP_400_BAD_REQUEST
            )
        
        handshake.status = 'accepted'
        handshake.requester_initiated = True  # Mark requester as having approved
        handshake.save()

        # Notify provider that handshake was approved
        create_notification(
            user=handshake.service.user,
            notification_type='handshake_accepted',
            title='Handshake Approved',
            message=f"{user.first_name} has approved the handshake for '{handshake.service.title}'. The handshake is now accepted.",
            handshake=handshake,
            service=handshake.service
        )
        
        # Schedule reminders
        from django.utils import timezone
        from datetime import timedelta
        
        service_time = handshake.scheduled_time
        duration_hours = float(handshake.exact_duration)
        completion_time = service_time + timedelta(hours=duration_hours)
        
        if service_time > timezone.now():
            create_notification(
                user=handshake.service.user,
                notification_type='service_reminder',
                title='Service Reminder',
                message=f"Your service '{handshake.service.title}' is scheduled for {service_time.strftime('%Y-%m-%d %H:%M')}",
                handshake=handshake,
                service=handshake.service
            )
            create_notification(
                user=handshake.requester,
                notification_type='service_reminder',
                title='Service Reminder',
                message=f"Your service '{handshake.service.title}' is scheduled for {service_time.strftime('%Y-%m-%d %H:%M')}",
                handshake=handshake,
                service=handshake.service
            )
        
        if completion_time > timezone.now():
            create_notification(
                user=handshake.service.user,
                notification_type='service_confirmation',
                title='Service Completion Reminder',
                message=f"Please confirm completion of '{handshake.service.title}' after {completion_time.strftime('%Y-%m-%d %H:%M')}",
                handshake=handshake,
                service=handshake.service
            )
            create_notification(
                user=handshake.requester,
                notification_type='service_confirmation',
                title='Service Completion Reminder',
                message=f"Please confirm completion of '{handshake.service.title}' after {completion_time.strftime('%Y-%m-%d %H:%M')}",
                handshake=handshake,
                service=handshake.service
            )
        
        serializer = self.get_serializer(handshake)
        return Response(serializer.data, status=200)
    
    @action(detail=True, methods=['post'], url_path='request-changes')
    def request_changes(self, request, pk=None):
        """
        Receiver requests changes to the handshake details.
        This resets provider_initiated so provider can re-submit with updated details.
        """
        handshake = self.get_object()
        user = request.user
        
        from .utils import get_provider_and_receiver
        provider, receiver = get_provider_and_receiver(handshake)
        
        # Only receiver can request changes
        if receiver != user:
            return create_error_response(
                'Only the service receiver can request changes',
                code=ErrorCodes.PERMISSION_DENIED,
                status_code=status.HTTP_403_FORBIDDEN
            )
        
        if handshake.status != 'pending':
            return create_error_response(
                'Can only request changes for pending handshakes',
                code=ErrorCodes.INVALID_STATE,
                status_code=status.HTTP_400_BAD_REQUEST
            )
        
        if not handshake.provider_initiated:
            return create_error_response(
                'No details have been provided yet',
                code=ErrorCodes.INVALID_STATE,
                status_code=status.HTTP_400_BAD_REQUEST
            )
        
        # Reset provider_initiated to allow re-submission
        handshake.provider_initiated = False
        handshake.save(update_fields=['provider_initiated', 'updated_at'])
        
        # Send notification to provider
        Notification.objects.create(
            user=provider,
            type='handshake_update',
            title='Changes Requested',
            message=f'{receiver.first_name} {receiver.last_name} has requested changes to the handshake details for "{handshake.service.title}"',
            related_handshake=handshake
        )
        
        # Invalidate conversations cache
        invalidate_conversations(str(provider.id))
        invalidate_conversations(str(receiver.id))
        
        serializer = self.get_serializer(handshake)
        return Response(serializer.data, status=200)
    
    @action(detail=True, methods=['post'], url_path='decline')
    def decline_handshake(self, request, pk=None):
        """
        Receiver declines the handshake, cancelling it entirely.
        """
        handshake = self.get_object()
        user = request.user
        
        from .utils import get_provider_and_receiver
        provider, receiver = get_provider_and_receiver(handshake)
        
        # Only receiver can decline
        if receiver != user:
            return create_error_response(
                'Only the service receiver can decline the handshake',
                code=ErrorCodes.PERMISSION_DENIED,
                status_code=status.HTTP_403_FORBIDDEN
            )
        
        if handshake.status != 'pending':
            return create_error_response(
                'Can only decline pending handshakes',
                code=ErrorCodes.INVALID_STATE,
                status_code=status.HTTP_400_BAD_REQUEST
            )
        
        # Cancel the handshake
        handshake.status = 'denied'
        handshake.save(update_fields=['status', 'updated_at'])
        
        # Send notification to provider
        Notification.objects.create(
            user=provider,
            type='handshake_update',
            title='Handshake Declined',
            message=f'{receiver.first_name} {receiver.last_name} has declined the handshake for "{handshake.service.title}"',
            related_handshake=handshake
        )
        
        # Invalidate conversations cache
        invalidate_conversations(str(provider.id))
        invalidate_conversations(str(receiver.id))
        
        serializer = self.get_serializer(handshake)
        return Response(serializer.data, status=200)

    @action(detail=True, methods=['post'], url_path='accept')
    @track_performance
    def accept_handshake(self, request, pk=None):
        handshake = self.get_object()
        
        if handshake.service.user != request.user:
            return create_error_response(
                'Only the service provider can accept',
                code=ErrorCodes.PERMISSION_DENIED,
                status_code=status.HTTP_403_FORBIDDEN
            )

        if handshake.status != 'pending':
            return create_error_response(
                'Handshake is not pending',
                code=ErrorCodes.INVALID_STATE,
                status_code=status.HTTP_400_BAD_REQUEST
            )

        try:
            provision_timebank(handshake)
        except ValueError as e:
            return create_error_response(
                str(e),
                code=ErrorCodes.INSUFFICIENT_BALANCE,
                status_code=status.HTTP_400_BAD_REQUEST
            )

        service = handshake.service
        with transaction.atomic():
            handshake.status = 'accepted'
            handshake.save()

            # For One-Time services: check whether all slots are now filled.
            # Only when capacity is reached do we deny remaining pending handshakes
            # and transition the service to Agreed.
            # Recurrent services stay Active so new participants can always join.
            if service.schedule_type == 'One-Time':
                accepted_count = Handshake.objects.filter(
                    service=service,
                    status__in=['accepted', 'completed', 'reported', 'paused'],
                ).count()

                if accepted_count >= service.max_participants:
                    # Capacity is now full — deny all remaining pending handshakes.
                    other_pending = Handshake.objects.filter(
                        service=service,
                        status='pending',
                    ).exclude(pk=handshake.pk)

                    denied_requesters = list(other_pending.values_list('requester_id', flat=True))
                    other_pending.update(status='denied')

                    # Bulk-load all requester users to avoid N+1 queries.
                    users_by_id = User.objects.in_bulk(denied_requesters)

                    for requester_id in denied_requesters:
                        user = users_by_id.get(requester_id)
                        if user is None:
                            continue
                        create_notification(
                            user=user,
                            notification_type='handshake_denied',
                            title='Request Not Accepted',
                            message=f"All slots for '{service.title}' are now filled.",
                            service=service
                        )
                        invalidate_conversations(str(requester_id))

                    # Mark service as Agreed so it is hidden from the public listing.
                    if service.status == 'Active':
                        Service.objects.filter(pk=service.pk).update(status='Agreed')

        invalidate_conversations(str(handshake.requester.id))
        invalidate_conversations(str(handshake.service.user.id))

        create_notification(
            user=handshake.requester,
            notification_type='handshake_accepted',
            title='Handshake Accepted',
            message=f"Your interest in '{service.title}' has been accepted!",
            handshake=handshake,
            service=service
        )

        serializer = self.get_serializer(handshake)
        return Response(serializer.data)

    @action(detail=True, methods=['post'], url_path='deny')
    def deny_handshake(self, request, pk=None):
        handshake = self.get_object()
        
        if handshake.service.user != request.user:
            return create_error_response(
                'Only the service provider can deny',
                code=ErrorCodes.PERMISSION_DENIED,
                status_code=status.HTTP_403_FORBIDDEN
            )

        if handshake.status != 'pending':
            return create_error_response(
                'Handshake is not pending',
                code=ErrorCodes.INVALID_STATE,
                status_code=status.HTTP_400_BAD_REQUEST
            )

        handshake.status = 'denied'
        handshake.save()

        serializer = self.get_serializer(handshake)
        return Response(serializer.data)

    @action(detail=True, methods=['post'], url_path='cancel')
    def cancel_handshake(self, request, pk=None):
        handshake = self.get_object()
        
        if handshake.service.user != request.user:
            return create_error_response(
                'Only the service provider can cancel',
                code=ErrorCodes.PERMISSION_DENIED,
                status_code=status.HTTP_403_FORBIDDEN
            )

        if handshake.status != 'accepted':
            return create_error_response(
                'Can only cancel accepted handshakes',
                code=ErrorCodes.INVALID_STATE,
                status_code=status.HTTP_400_BAD_REQUEST
            )

        svc = handshake.service
        with transaction.atomic():
            cancel_timebank_transfer(handshake)

            # If the service was Agreed, reopen it now that the accepted slot is freed.
            if svc.status == 'Agreed':
                Service.objects.filter(pk=svc.pk).update(status='Active')

        serializer = self.get_serializer(handshake)
        return Response(serializer.data)

    @action(detail=True, methods=['post'], url_path='confirm', throttle_classes=[ConfirmationThrottle])
    @track_performance
    def confirm_completion(self, request, pk=None):
        handshake = self.get_object()
        user = request.user
        
        from .utils import get_provider_and_receiver
        provider, receiver = get_provider_and_receiver(handshake)

        is_provider = provider == user
        is_receiver = receiver == user

        if not (is_provider or is_receiver):
            return create_error_response(
                'Not authorized',
                code=ErrorCodes.PERMISSION_DENIED,
                status_code=status.HTTP_403_FORBIDDEN
            )

        if handshake.status != 'accepted':
            return create_error_response(
                'Handshake must be accepted',
                code=ErrorCodes.INVALID_STATE,
                status_code=status.HTTP_400_BAD_REQUEST
            )

        hours = request.data.get('hours')
        if hours is not None:
            try:
                hours_decimal = Decimal(str(hours))
                if hours_decimal <= 0:
                    return create_error_response(
                        'Hours must be greater than 0',
                        code=ErrorCodes.VALIDATION_ERROR,
                        status_code=status.HTTP_400_BAD_REQUEST
                    )
                if hours_decimal > 24:
                    return create_error_response(
                        'Hours cannot exceed 24',
                        code=ErrorCodes.VALIDATION_ERROR,
                        status_code=status.HTTP_400_BAD_REQUEST
                    )
                
                # If hours changed and handshake was already accepted (provisioned), 
                # we need to adjust the provisioned amount
                old_hours = handshake.provisioned_hours
                if handshake.status == 'accepted' and hours_decimal != old_hours:
                    # Adjust the escrowed amount
                    difference = hours_decimal - old_hours
                    receiver = handshake.requester
                    with transaction.atomic():
                        receiver_locked = User.objects.select_for_update().get(id=receiver.id)
                        if difference > 0:
                            # Need more hours - check balance and deduct
                            if receiver_locked.timebank_balance < difference:
                                return create_error_response(
                                    f'Insufficient balance. Need {difference} more hours',
                                    code=ErrorCodes.INSUFFICIENT_BALANCE,
                                    status_code=status.HTTP_400_BAD_REQUEST
                                )
                            
                            # Use F() expression for atomic balance update
                            receiver_locked.timebank_balance = F("timebank_balance") - difference
                            receiver_locked.save(update_fields=["timebank_balance"])
                            receiver_locked.refresh_from_db(fields=["timebank_balance"])
                            
                            # Record adjustment transaction
                            TransactionHistory.objects.create(
                                user=receiver_locked,
                                transaction_type='provision',
                                amount=-difference,
                                balance_after=receiver_locked.timebank_balance,
                                handshake=handshake,
                                description=f"Additional hours escrowed for '{handshake.service.title}' (adjusted from {old_hours} to {hours_decimal} hours)"
                            )
                            invalidate_transactions(str(receiver_locked.id))
                        else:
                            # Refund excess hours - use F() expression for atomic balance update
                            receiver_locked.timebank_balance = F("timebank_balance") + abs(difference)
                            receiver_locked.save(update_fields=["timebank_balance"])
                            receiver_locked.refresh_from_db(fields=["timebank_balance"])
                            
                            # Record refund transaction
                            TransactionHistory.objects.create(
                                user=receiver_locked,
                                transaction_type='refund',
                                amount=abs(difference),
                                balance_after=receiver_locked.timebank_balance,
                                handshake=handshake,
                                description=f"Hours adjusted for '{handshake.service.title}' (refunded {abs(difference)} hours, changed from {old_hours} to {hours_decimal} hours)"
                            )
                            invalidate_transactions(str(receiver_locked.id))
                
                handshake.provisioned_hours = hours_decimal
            except (ValueError, TypeError):
                return create_error_response(
                    'Invalid hours value',
                    code=ErrorCodes.VALIDATION_ERROR,
                    status_code=status.HTTP_400_BAD_REQUEST
                )

        if is_provider:
            handshake.provider_confirmed_complete = True
        else:
            handshake.receiver_confirmed_complete = True

        handshake.save()
        
        # Invalidate conversations cache for both users so UI updates immediately
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
                handshake.refresh_from_db(fields=['status', 'evaluation_window_starts_at', 'evaluation_window_ends_at', 'evaluation_window_closed_at'])
                create_notification(
                    user=handshake.service.user,
                    notification_type='positive_rep',
                    title='Leave Feedback',
                    message=f"Service completed! Would you like to leave positive feedback for {handshake.requester.first_name}?",
                    handshake=handshake
                )
                create_notification(
                    user=handshake.requester,
                    notification_type='positive_rep',
                    title='Leave Feedback',
                    message=f"Service completed! Would you like to leave positive feedback for {handshake.service.user.first_name}?",
                    handshake=handshake
                )

        serializer = self.get_serializer(handshake)
        return Response(serializer.data)

    @action(detail=True, methods=['post'], url_path='report', throttle_classes=[ConfirmationThrottle])
    def report_issue(self, request, pk=None):
        handshake = self.get_object()
        user = request.user
        issue_type = (request.data.get('issue_type') or 'no_show').strip().lower()
        description = (request.data.get('description') or '').strip()
        is_event_handshake = handshake.service.type == 'Event'

        # Event handshakes support broader behavior report types; non-event
        # handshakes only support no-show/service-issue disputes.
        if is_event_handshake:
            allowed_types = {'no_show', 'service_issue', 'harassment', 'spam', 'scam', 'other'}
        else:
            allowed_types = {'no_show', 'service_issue'}

        if issue_type not in allowed_types:
            return create_error_response(
                'Invalid issue_type.',
                code=ErrorCodes.VALIDATION_ERROR,
                status_code=status.HTTP_400_BAD_REQUEST,
            )
        
        from .utils import get_provider_and_receiver
        provider, receiver = get_provider_and_receiver(handshake)

        is_provider = provider == user
        is_receiver = receiver == user

        if not (is_provider or is_receiver):
            return create_error_response(
                'Not authorized',
                code=ErrorCodes.PERMISSION_DENIED,
                status_code=status.HTTP_403_FORBIDDEN
            )

        if is_event_handshake:
            event_start = handshake.service.scheduled_time or handshake.scheduled_time
            if not event_start:
                return create_error_response(
                    'Event start time is required to submit reports.',
                    code=ErrorCodes.VALIDATION_ERROR,
                    status_code=status.HTTP_400_BAD_REQUEST,
                )

            now = timezone.now()
            report_window_ends_at = event_start + timedelta(hours=24)
            if now < event_start or now > report_window_ends_at:
                return create_error_response(
                    'Event reports are allowed from event start time up to 24 hours after start.',
                    code=ErrorCodes.VALIDATION_ERROR,
                    status_code=status.HTTP_400_BAD_REQUEST,
                )

        reported_user = receiver if is_provider else provider
        reported_user_id = request.data.get('reported_user_id')
        if reported_user_id is not None:
            if not is_event_handshake:
                return create_error_response(
                    'reported_user_id can only be used for event reports.',
                    code=ErrorCodes.VALIDATION_ERROR,
                    status_code=status.HTTP_400_BAD_REQUEST,
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
                return create_error_response(
                    'Invalid reported_user_id.',
                    code=ErrorCodes.VALIDATION_ERROR,
                    status_code=status.HTTP_400_BAD_REQUEST,
                )

            if target_user.id not in event_member_ids:
                return create_error_response(
                    'reported_user_id must belong to the event organizer or an active participant.',
                    code=ErrorCodes.VALIDATION_ERROR,
                    status_code=status.HTTP_400_BAD_REQUEST,
                )

            if str(target_user.id) == str(user.id):
                return create_error_response(
                    'You cannot report yourself.',
                    code=ErrorCodes.VALIDATION_ERROR,
                    status_code=status.HTTP_400_BAD_REQUEST,
                )

            reported_user = target_user

        has_open_duplicate = Report.objects.filter(
            reporter=user,
            reported_user=reported_user,
            related_handshake=handshake,
            type=issue_type,
            status='pending',
        ).exists()
        if has_open_duplicate:
            return create_error_response(
                'You already have an open report for this issue and user in this event.',
                code=ErrorCodes.VALIDATION_ERROR,
                status_code=status.HTTP_400_BAD_REQUEST,
            )

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

        handshake.status = 'reported'
        handshake.save()

        admins = User.objects.filter(role='admin')
        for admin in admins:
            create_notification(
                user=admin,
                notification_type='admin_warning',
                title='New Report Requires Review',
                message=f"New {report.get_type_display()} report for service '{handshake.service.title}'",
                handshake=handshake
            )

        return Response({'status': 'success', 'report_id': str(report.id)}, status=201)

    # ------------------------------------------------------------------
    # Event-specific handshake actions (additive — Offer/Need untouched)
    # ------------------------------------------------------------------

    @action(
        detail=False,
        methods=['post'],
        url_path=r'services/(?P<service_id>[^/.]+)/join-event',
        permission_classes=[permissions.IsAuthenticated, IsNotEventBanned],
    )
    def join_event(self, request, service_id=None):
        """RSVP to an Event immediately (no initiate→approve flow, no credits).

        POST /api/handshakes/services/{service_id}/join-event/
        """
        try:
            service = Service.objects.select_related('user').get(
                id=service_id, type='Event', status='Active'
            )
        except Service.DoesNotExist:
            return create_error_response(
                'Event not found or not active.',
                code=ErrorCodes.NOT_FOUND,
                status_code=status.HTTP_404_NOT_FOUND,
            )
        try:
            handshake = EventHandshakeService.join_event(service, request.user)
        except PermissionError as e:
            return create_error_response(
                str(e), code=ErrorCodes.PERMISSION_DENIED,
                status_code=status.HTTP_403_FORBIDDEN
            )
        except ValueError as e:
            msg = str(e)
            if 'full' in msg:
                code = ErrorCodes.INVALID_STATE
            elif 'already joined' in msg:
                code = ErrorCodes.ALREADY_EXISTS
            else:
                code = ErrorCodes.VALIDATION_ERROR
            return create_error_response(msg, code=code,
                                         status_code=status.HTTP_400_BAD_REQUEST)
        serializer = self.get_serializer(handshake)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @action(
        detail=True,
        methods=['post'],
        url_path='leave-event',
        permission_classes=[permissions.IsAuthenticated],
    )
    def leave_event(self, request, pk=None):
        """Participant cancels their own Event RSVP (before lockdown window).

        POST /api/handshakes/{id}/leave-event/
        """
        handshake = self.get_object()
        try:
            EventHandshakeService.leave_event(handshake, request.user)
        except PermissionError as e:
            return create_error_response(
                str(e), code=ErrorCodes.PERMISSION_DENIED,
                status_code=status.HTTP_403_FORBIDDEN
            )
        except ValueError as e:
            return create_error_response(
                str(e), code=ErrorCodes.INVALID_STATE,
                status_code=status.HTTP_400_BAD_REQUEST
            )
        serializer = self.get_serializer(handshake)
        return Response(serializer.data)

    @action(
        detail=True,
        methods=['post'],
        url_path='checkin',
        permission_classes=[permissions.IsAuthenticated],
    )
    def checkin(self, request, pk=None):
        """Participant checks in to an Event during the lockdown window.

        POST /api/handshakes/{id}/checkin/
        """
        handshake = self.get_object()
        try:
            EventHandshakeService.checkin(handshake, request.user)
        except PermissionError as e:
            return create_error_response(
                str(e), code=ErrorCodes.PERMISSION_DENIED,
                status_code=status.HTTP_403_FORBIDDEN
            )
        except ValueError as e:
            return create_error_response(
                str(e), code=ErrorCodes.INVALID_STATE,
                status_code=status.HTTP_400_BAD_REQUEST
            )
        serializer = self.get_serializer(handshake)
        return Response(serializer.data)

    @action(
        detail=True,
        methods=['post'],
        url_path='mark-attended',
        permission_classes=[permissions.IsAuthenticated],
    )
    def mark_attended(self, request, pk=None):
        """Organizer marks a checked-in participant as attended.

        POST /api/handshakes/{id}/mark-attended/
        """
        handshake = self.get_object()
        try:
            EventHandshakeService.mark_attended(handshake, request.user)
        except PermissionError as e:
            return create_error_response(
                str(e), code=ErrorCodes.PERMISSION_DENIED,
                status_code=status.HTTP_403_FORBIDDEN
            )
        except ValueError as e:
            return create_error_response(
                str(e), code=ErrorCodes.INVALID_STATE,
                status_code=status.HTTP_400_BAD_REQUEST
            )
        serializer = self.get_serializer(handshake)
        return Response(serializer.data)

    @action(
        detail=True,
        methods=['post'],
        url_path='appeal-no-show',
        permission_classes=[permissions.IsAuthenticated],
        throttle_classes=[ConfirmationThrottle],
    )
    def appeal_no_show(self, request, pk=None):
        """Participant appeals an event no-show status.

        POST /api/handshakes/{id}/appeal-no-show/
        """
        handshake = self.get_object()
        raw_description = (request.data.get('description') or '').strip()
        cleaned_description = bleach.clean(raw_description, tags=[], strip=True)[:2000]

        try:
            report = EventNoShowAppealService.submit_appeal(
                handshake=handshake,
                attendee=request.user,
                description=cleaned_description,
            )
        except PermissionError as e:
            return create_error_response(
                str(e), code=ErrorCodes.PERMISSION_DENIED,
                status_code=status.HTTP_403_FORBIDDEN
            )
        except ValueError as e:
            message = str(e)
            error_code = (
                ErrorCodes.ALREADY_EXISTS
                if 'pending no-show appeal' in message.lower()
                else ErrorCodes.INVALID_STATE
            )
            return create_error_response(
                message,
                code=error_code,
                status_code=status.HTTP_400_BAD_REQUEST
            )

        return Response({'status': 'success', 'report_id': str(report.id)}, status=status.HTTP_201_CREATED)


class ChatViewSet(viewsets.ViewSet):
    """
    Chat and Messaging
    
    Manage conversations and messages between users in handshakes.
    
    **List Conversations:** GET /api/chats/
    **Get Messages:** GET /api/chats/{handshake_id}/
    **Send Message:** POST /api/chats/
    
    **List Conversations Response:**
    ```json
    [
        {
            "handshake_id": "uuid",
            "service_title": "Web Development Help",
            "other_user": {
                "id": "uuid",
                "name": "John Doe",
                "avatar_url": "https://example.com/avatar.jpg"
            },
            "last_message": {
                "id": "uuid",
                "body": "Thanks for your help!",
                "sender": {...},
                "created_at": "2024-01-01T12:00:00Z"
            },
            "status": "accepted",
            "is_provider": true,
            "provider_confirmed_complete": false,
            "receiver_confirmed_complete": false
        }
    ]
    ```
    
    **Get Messages Response (Paginated):**
    ```json
    {
        "count": 50,
        "next": "http://api/chats/{id}/?page=2",
        "previous": null,
        "results": [
            {
                "id": "uuid",
                "body": "Hello! When can we meet?",
                "sender": {
                    "id": "uuid",
                    "name": "John Doe"
                },
                "created_at": "2024-01-01T12:00:00Z"
            }
        ]
    }
    ```
    
    **Send Message Request:**
    ```json
    {
        "handshake_id": "uuid",
        "body": "Hello! When can we meet?"
    }
    ```
    
    **Business Rules:**
    - Only handshake participants can view/send messages
    - Messages are sanitized (HTML stripped)
    - Maximum message length: 5000 characters
    - Real-time delivery via WebSocket
    - Notifications sent to recipient
    
    **Error Scenarios:**
    - 400 Bad Request: Missing handshake_id or body, message too long
    - 401 Unauthorized: Authentication required
    - 403 Forbidden: Not a participant in this handshake
    - 404 Not Found: Handshake does not exist
    - 429 Too Many Requests: Rate limit exceeded (1000/hour per user)
    
    **Authentication:** Required (JWT Bearer token)
    **Pagination:** 20 messages per page (newest first)
    **Rate Limiting:** 1000 requests per hour per user
    """
    permission_classes = [permissions.IsAuthenticated]
    throttle_classes = [UserRateThrottle]
    pagination_class = StandardResultsSetPagination

    @track_performance
    def list(self, request):
        """Get all conversations for the user"""
        from django.db.models import Q, Prefetch, Subquery, OuterRef
        from .cache_utils import get_cached_conversations, cache_conversations
        user = request.user
        
        paginator = self.pagination_class()
        has_pagination_params = request.query_params.get(paginator.page_query_param) or request.query_params.get(paginator.page_size_query_param)
        force_refresh = str(request.query_params.get('force', '')).lower() in {'1', 'true', 'yes'}
        
        if not has_pagination_params and not force_refresh:
            cached_result = get_cached_conversations(str(user.id))
            if cached_result is not None:
                if isinstance(cached_result, dict) and 'results' in cached_result:
                    return Response(cached_result['results'])
                return Response(cached_result)
        
        # Optimize last_message retrieval using Prefetch with a subquery
        # Get the latest message for each handshake
        latest_messages = ChatMessage.objects.filter(
            handshake=OuterRef('pk')
        ).order_by('-created_at')
        
        last_message_prefetch = Prefetch(
            'messages',
            queryset=ChatMessage.objects.select_related('sender').order_by('-created_at')[:1],
            to_attr='last_message_list'
        )
        
        # Prefetch reputation data to avoid N+1 queries
        reputation_prefetch = Prefetch(
            'reps',
            queryset=ReputationRep.objects.filter(giver=user),
            to_attr='user_reps'
        )
        
        handshakes = Handshake.objects.filter(
            Q(requester=user) | Q(service__user=user)
        ).exclude(
            service__type='Event'
        ).select_related(
            'service', 
            'requester', 
            'service__user'
        ).prefetch_related(
            last_message_prefetch,
            reputation_prefetch
        ).order_by('-updated_at')

        conversations = []
        for handshake in handshakes:
            # Get last message from prefetched data
            last_message = handshake.last_message_list[0] if handshake.last_message_list else None

            window_start = handshake.evaluation_window_starts_at
            window_end = handshake.evaluation_window_ends_at
            if window_start is None or window_end is None:
                if handshake.service.type == 'Event':
                    window_start = handshake.service.event_completed_at or handshake.service.updated_at
                else:
                    window_start = handshake.updated_at

                if window_start is not None:
                    window_hours = getattr(settings, 'FEEDBACK_WINDOW_HOURS', settings.EVENT_FEEDBACK_WINDOW_HOURS)
                    window_end = window_start + timedelta(hours=window_hours)
            
            from .utils import get_provider_and_receiver
            provider, receiver = get_provider_and_receiver(handshake)
            
            is_provider = provider == user
            other_user = receiver if is_provider else provider
            
            # Check if user has already left reputation for this handshake (using prefetched data)
            user_has_reviewed = len(handshake.user_reps) > 0
            
            conversations.append({
                'handshake_id': str(handshake.id),
                'service_id': str(handshake.service.id),
                'service_title': handshake.service.title,
                'service_type': handshake.service.type,
                'other_user': {
                    'id': str(other_user.id),
                    'name': f"{other_user.first_name} {other_user.last_name}".strip(),
                    'avatar_url': other_user.avatar_url
                },
                'last_message': ChatMessageSerializer(last_message).data if last_message else None,
                'status': handshake.status,
                'provider_confirmed_complete': handshake.provider_confirmed_complete,
                'receiver_confirmed_complete': handshake.receiver_confirmed_complete,
                'is_provider': is_provider,
                'provider_initiated': handshake.provider_initiated,
                'requester_initiated': handshake.requester_initiated,
                'updated_at': handshake.updated_at.isoformat() if handshake.updated_at else None,
                'evaluation_window_starts_at': window_start.isoformat() if window_start else None,
                'evaluation_window_ends_at': window_end.isoformat() if window_end else None,
                'evaluation_window_closed_at': handshake.evaluation_window_closed_at.isoformat() if handshake.evaluation_window_closed_at else None,
                'exact_location': handshake.exact_location,
                'exact_duration': float(handshake.exact_duration) if handshake.exact_duration else None,
                'scheduled_time': handshake.scheduled_time.isoformat() if handshake.scheduled_time else None,
                'provisioned_hours': float(handshake.provisioned_hours) if handshake.provisioned_hours else None,
                'user_has_reviewed': user_has_reviewed,
                'max_participants': handshake.service.max_participants,
                'schedule_type': handshake.service.schedule_type,
            })

        page = paginator.paginate_queryset(conversations, request)
        if page is not None:
            response = paginator.get_paginated_response(page)
            if not has_pagination_params:
                cache_conversations(str(user.id), conversations, ttl=CACHE_TTL_SHORT)
            return response
        
        cache_conversations(str(user.id), conversations, ttl=CACHE_TTL_SHORT)
        return Response(conversations)

    @track_performance
    def retrieve(self, request, pk=None):
        """Get messages for a specific handshake"""
        try:
            handshake = Handshake.objects.select_related(
                'service', 'service__user', 'requester'
            ).get(id=pk)
        except Handshake.DoesNotExist:
            return create_error_response(
                'Handshake not found',
                code=ErrorCodes.NOT_FOUND,
                status_code=status.HTTP_404_NOT_FOUND
            )

        user = request.user
        if handshake.requester != user and handshake.service.user != user:
            return create_error_response(
                'Not authorized',
                code=ErrorCodes.PERMISSION_DENIED,
                status_code=status.HTTP_403_FORBIDDEN
            )

        # Order messages by created_at descending (newest first) for pagination
        messages = ChatMessage.objects.filter(handshake=handshake).select_related(
            'sender'
        ).order_by('-created_at')
        
        # Always apply pagination
        paginator = self.pagination_class()
        page = paginator.paginate_queryset(messages, request)
        if page is not None:
            serializer = ChatMessageSerializer(page, many=True)
            return paginator.get_paginated_response(serializer.data)
        
        # Fallback if pagination fails (shouldn't happen)
        serializer = ChatMessageSerializer(messages, many=True)
        return Response(serializer.data)

    @track_performance
    def create(self, request):
        """Send a message"""
        handshake_id = request.data.get('handshake_id')
        body = request.data.get('body')

        if not handshake_id or not body:
            return create_error_response(
                'handshake_id and body required',
                code=ErrorCodes.VALIDATION_ERROR,
                status_code=status.HTTP_400_BAD_REQUEST
            )

        # Sanitize HTML - strip all tags
        body = bleach.clean(body, tags=[], strip=True)
        
        # Validate and truncate body length (max 5000 chars)
        if len(body) > 5000:
            return create_error_response(
                'Message body cannot exceed 5000 characters',
                code=ErrorCodes.VALIDATION_ERROR,
                status_code=status.HTTP_400_BAD_REQUEST
            )
        body = body[:5000] if body else ''

        try:
            handshake = Handshake.objects.select_related(
                'service', 'service__user', 'requester'
            ).get(id=handshake_id)
        except Handshake.DoesNotExist:
            return create_error_response(
                'Handshake not found',
                code=ErrorCodes.NOT_FOUND,
                status_code=status.HTTP_404_NOT_FOUND
            )

        user = request.user
        if handshake.requester != user and handshake.service.user != user:
            return create_error_response(
                'Not authorized',
                code=ErrorCodes.PERMISSION_DENIED,
                status_code=status.HTTP_403_FORBIDDEN
            )

        message = ChatMessage.objects.create(
            handshake=handshake,
            sender=user,
            body=body
        )
        
        invalidate_conversations(str(handshake.requester.id))
        invalidate_conversations(str(handshake.service.user.id))

        # Send message via WebSocket
        from channels.layers import get_channel_layer
        from asgiref.sync import async_to_sync
        channel_layer = get_channel_layer()
        if channel_layer:
            serializer = ChatMessageSerializer(message)
            async_to_sync(channel_layer.group_send)(
                f'chat_{handshake.id}',
                {
                    'type': 'chat_message',
                    'message': serializer.data
                }
            )

        serializer = ChatMessageSerializer(message)
        return Response(serializer.data, status=201)

class NotificationViewSet(viewsets.ReadOnlyModelViewSet):
    """
    Notification Management
    
    View and manage user notifications.
    
    **List Notifications:** GET /api/notifications/
    **Retrieve Notification:** GET /api/notifications/{id}/
    **Mark All Read:** POST /api/notifications/read/
    
    **Response Format:**
    ```json
    {
        "id": "uuid",
        "notification_type": "handshake_accepted",
        "title": "Handshake Accepted",
        "message": "Your interest in 'Web Development Help' has been accepted!",
        "is_read": false,
        "created_at": "2024-01-01T12:00:00Z",
        "handshake": {...},
        "service": {...}
    }
    ```
    
    **Notification Types:**
    - `handshake_request`: New interest in your service
    - `handshake_accepted`: Your interest was accepted
    - `handshake_denied`: Your interest was denied
    - `handshake_cancelled`: Service was cancelled
    - `chat_message`: New chat message
    - `service_reminder`: Upcoming service reminder
    - `service_confirmation`: Service completion reminder
    - `positive_rep`: Reputation received or badge earned
    - `admin_warning`: Administrative warning
    
    **Error Scenarios:**
    - 401 Unauthorized: Authentication required
    - 404 Not Found: Notification does not exist
    
    **Authentication:** Required (JWT Bearer token)
    **Pagination:** 20 items per page
    """
    serializer_class = NotificationSerializer
    permission_classes = [permissions.IsAuthenticated]
    pagination_class = StandardResultsSetPagination

    def get_queryset(self):
        return Notification.objects.filter(user=self.request.user).order_by('-created_at')

    def list(self, request, *args, **kwargs):
        queryset = self.filter_queryset(self.get_queryset())
        paginator = self.pagination_class()
        if request.query_params.get(paginator.page_query_param) or request.query_params.get(paginator.page_size_query_param):
            page = paginator.paginate_queryset(queryset, request)
            if page is not None:
                serializer = self.get_serializer(page, many=True)
                return paginator.get_paginated_response(serializer.data)
        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['post'], url_path='read')
    def mark_all_read(self, request):
        Notification.objects.filter(user=request.user, is_read=False).update(is_read=True)
        return Response({'status': 'success'})

    @action(detail=True, methods=['patch'], url_path='read')
    def mark_read(self, request, pk=None):
        notification = self.get_object()
        notification.is_read = True
        notification.save(update_fields=['is_read'])
        serializer = self.get_serializer(notification)
        return Response(serializer.data)

    @action(detail=False, methods=['get'], url_path='unread-count')
    def unread_count(self, request):
        count = Notification.objects.filter(user=request.user, is_read=False).count()
        return Response({'count': count})

class ReputationViewSet(viewsets.ModelViewSet):
    """
    Reputation Management
    
    Submit and view positive reputation for completed services.
    
    **List My Reputation:** GET /api/reputation/
    **Submit Reputation:** POST /api/reputation/
    
    **Request Format:**
    ```json
    {
        "handshake_id": "uuid",
        "punctual": true,
        "helpful": true,
        "kindness": false
    }
    ```
    
    **Response Format:**
    ```json
    {
        "id": "uuid",
        "handshake": {...},
        "giver": {...},
        "receiver": {...},
        "is_punctual": true,
        "is_helpful": true,
        "is_kind": false,
        "created_at": "2024-01-01T12:00:00Z"
    }
    ```
    
    **Business Rules:**
    - Can only submit reputation for completed handshakes
    - Either handshake participant can submit reputation for the other party
    - Can only submit reputation once per handshake (per giver)
    - Each positive attribute increases the reviewed user's karma by 1
    - May trigger badge assignment for the reviewed user
    
    **Error Scenarios:**
    - 400 Bad Request: Handshake not completed, reputation already submitted
    - 401 Unauthorized: Authentication required
    - 403 Forbidden: Not a participant in this handshake
    - 404 Not Found: Handshake does not exist
    
    **Authentication:** Required (JWT Bearer token)
    """
    serializer_class = ReputationRepSerializer
    permission_classes = [permissions.IsAuthenticated]
    throttle_classes = [ReputationThrottle]

    def get_queryset(self):
        return ReputationRep.objects.filter(giver=self.request.user)

    def create(self, request):
        """Submit positive reputation"""
        handshake_id = request.data.get('handshake_id')
        raw_comment = (request.data.get('comment') or '').strip()
        
        try:
            handshake = Handshake.objects.select_related(
                'service', 'service__user', 'requester'
            ).get(id=handshake_id)
        except Handshake.DoesNotExist:
            return create_error_response(
                'Handshake not found',
                code=ErrorCodes.NOT_FOUND,
                status_code=status.HTTP_404_NOT_FOUND
            )

        required_status = 'attended' if handshake.service.type == 'Event' else 'completed'
        if handshake.status != required_status:
            return create_error_response(
                'Handshake not found or not eligible for evaluation',
                code=ErrorCodes.NOT_FOUND,
                status_code=status.HTTP_404_NOT_FOUND
            )

        in_window, window_error = _validate_feedback_window(handshake)
        if not in_window:
            return create_error_response(
                window_error,
                code=ErrorCodes.INVALID_STATE,
                status_code=status.HTTP_410_GONE
            )

        user = request.user
        
        # Determine provider/receiver, then target the *other* party.
        from .utils import get_provider_and_receiver
        provider, receiver = get_provider_and_receiver(handshake)

        # Check if user is not a participant
        if user not in [provider, receiver]:
            return create_error_response(
                'Not authorized - you are not a participant in this handshake',
                code=ErrorCodes.PERMISSION_DENIED,
                status_code=status.HTTP_403_FORBIDDEN
            )

        is_event_evaluation = handshake.service.type == 'Event'
        if is_event_evaluation:
            if handshake.requester_id != user.id:
                return create_error_response(
                    'Only verified attendees can evaluate the organizer for events',
                    code=ErrorCodes.PERMISSION_DENIED,
                    status_code=status.HTTP_403_FORBIDDEN
                )
            target_user = handshake.service.user
            is_punctual = request.data.get('well_organized', request.data.get('punctual', False))
            is_helpful = request.data.get('engaging', request.data.get('helpful', False))
            is_kind = request.data.get('welcoming', request.data.get('kindness', False))
        else:
            target_user = receiver if user == provider else provider
            is_punctual = request.data.get('punctual', False)
            is_helpful = request.data.get('helpful', False)
            is_kind = request.data.get('kindness', False)

        # Check if rep already given
        existing = ReputationRep.objects.filter(handshake=handshake, giver=user).first()
        if existing:
            return create_error_response(
                'Reputation already submitted',
                code=ErrorCodes.ALREADY_EXISTS,
                status_code=status.HTTP_400_BAD_REQUEST
            )

        try:
            cleaned_comment = None
            if raw_comment:
                cleaned_comment = bleach.clean(raw_comment, tags=[], strip=True).strip()[:2000]
                if not cleaned_comment:
                    cleaned_comment = None

            rep = ReputationRep.objects.create(
                handshake=handshake,
                giver=user,
                receiver=target_user,  # Reputation goes to the other party
                is_punctual=is_punctual,
                is_helpful=is_helpful,
                is_kind=is_kind,
                comment=cleaned_comment
            )
        except IntegrityError:
            # Handle race condition where duplicate rep was created between check and create
            return create_error_response(
                'Reputation already submitted',
                code=ErrorCodes.ALREADY_EXISTS,
                status_code=status.HTTP_400_BAD_REQUEST
            )

        # Create a verified review entry for Service Detail from the reputation comment.
        # This is intentionally the only write-path for service verified reviews.
        if rep.comment:
            existing_review = Comment.objects.filter(
                related_handshake=handshake,
                user=user,
                is_verified_review=True,
                is_deleted=False
            ).exists()
            if not existing_review:
                Comment.objects.create(
                    service=handshake.service,
                    user=user,
                    body=rep.comment,
                    is_verified_review=True,
                    related_handshake=handshake
                )

        # Check and assign badges for receiver
        target_badges = check_and_assign_badges(target_user)
        if target_badges:
            # Fetch all badges at once to avoid N+1 queries
            badges_dict = {badge.id: badge.name for badge in Badge.objects.filter(id__in=target_badges)}
            badge_names = [badges_dict.get(bid, f"Badge {bid}") for bid in target_badges]
            create_notification(
                user=target_user,
                notification_type='positive_rep',
                title='New Badge Earned!',
                message=f"Congratulations! You earned: {', '.join(badge_names)}",
                handshake=handshake,
                service=handshake.service
            )

        # For Offer/Need services, notify the reviewed user only when there is
        # at least one positive trait or a review comment.
        if not is_event_evaluation and (
            rep.is_punctual or rep.is_helpful or rep.is_kind or bool(rep.comment)
        ):
            create_notification(
                user=target_user,
                notification_type='positive_rep',
                title='Feedback Received',
                message=f"{user.first_name} left feedback for '{handshake.service.title}'.",
                handshake=handshake,
                service=handshake.service,
            )
        
        # Update karma (REQ-REP-006)
        karma_gain = 0
        if rep.is_punctual:
            karma_gain += 1
        if rep.is_helpful:
            karma_gain += 1
        if rep.is_kind:
            karma_gain += 1
        
        target_user.karma_score += karma_gain
        target_user.save()
        
        # Invalidate conversations cache so UI updates to show reputation was submitted
        invalidate_conversations(str(provider.id))
        invalidate_conversations(str(receiver.id))

        if handshake.service.type == 'Event':
            EventEvaluationService.refresh_summary(handshake.service)

        serializer = self.get_serializer(rep)
        return Response(serializer.data, status=201)

    @action(detail=False, methods=['post'], url_path='add-review')
    @track_performance
    def add_review(self, request):
        """
        Add a verified review comment for an already-evaluated handshake.

        This allows users who submitted evaluation traits first to add the
        review text later, as long as the handshake's evaluation window is
        still open.
        """
        handshake_id = request.data.get('handshake_id')
        raw_comment = (request.data.get('comment') or '').strip()

        if not handshake_id:
            return create_error_response(
                'handshake_id is required',
                code=ErrorCodes.VALIDATION_ERROR,
                status_code=status.HTTP_400_BAD_REQUEST,
            )

        try:
            handshake = Handshake.objects.select_related(
                'service', 'service__user', 'requester'
            ).get(id=handshake_id)
        except Handshake.DoesNotExist:
            return create_error_response(
                'Handshake not found',
                code=ErrorCodes.NOT_FOUND,
                status_code=status.HTTP_404_NOT_FOUND,
            )

        required_status = 'attended' if handshake.service.type == 'Event' else 'completed'
        if handshake.status != required_status:
            return create_error_response(
                'Handshake not found or not eligible for evaluation',
                code=ErrorCodes.NOT_FOUND,
                status_code=status.HTTP_404_NOT_FOUND,
            )

        in_window, window_error = _validate_feedback_window(handshake)
        if not in_window:
            return create_error_response(
                window_error,
                code=ErrorCodes.INVALID_STATE,
                status_code=status.HTTP_410_GONE,
            )

        user = request.user
        from .utils import get_provider_and_receiver
        provider, receiver = get_provider_and_receiver(handshake)
        if user not in [provider, receiver]:
            return create_error_response(
                'Not authorized - you are not a participant in this handshake',
                code=ErrorCodes.PERMISSION_DENIED,
                status_code=status.HTTP_403_FORBIDDEN,
            )

        has_evaluation = ReputationRep.objects.filter(handshake=handshake, giver=user).exists() or NegativeRep.objects.filter(
            handshake=handshake, giver=user
        ).exists()
        if not has_evaluation:
            return create_error_response(
                'You must submit evaluation before adding a review',
                code=ErrorCodes.INVALID_STATE,
                status_code=status.HTTP_400_BAD_REQUEST,
            )

        existing_review = Comment.objects.filter(
            related_handshake=handshake,
            user=user,
            is_verified_review=True,
            is_deleted=False,
        ).exists()
        if existing_review:
            return create_error_response(
                'Review already submitted',
                code=ErrorCodes.ALREADY_EXISTS,
                status_code=status.HTTP_400_BAD_REQUEST,
            )

        cleaned_comment = bleach.clean(raw_comment, tags=[], strip=True).strip()[:2000]
        if not cleaned_comment:
            return Response(
                {'status': 'success', 'message': 'Evaluation already recorded. No review text provided.'},
                status=status.HTTP_200_OK,
            )

        comment = Comment.objects.create(
            service=handshake.service,
            user=user,
            body=cleaned_comment,
            is_verified_review=True,
            related_handshake=handshake,
        )

        return Response(CommentSerializer(comment).data, status=status.HTTP_201_CREATED)

class AdminReportViewSet(viewsets.ReadOnlyModelViewSet):
    """
    Admin Report Management
    
    View and resolve user reports (admin only).
    
    **List Reports:** GET /api/admin/reports/
    **Retrieve Report:** GET /api/admin/reports/{id}/
    **Resolve Report:** POST /api/admin/reports/{id}/resolve/
    
    **Response Format:**
    ```json
    {
        "id": "uuid",
        "reporter": {...},
        "reported_user": {...},
        "related_handshake": {...},
        "reported_service": {...},
        "type": "no_show",
        "description": "Provider did not show up",
        "status": "pending",
        "resolved_by": null,
        "admin_notes": null,
        "created_at": "2024-01-01T12:00:00Z"
    }
    ```
    
    **Resolve Request Format:**
    ```json
    {
        "action": "confirm_no_show",
        "admin_notes": "Confirmed no-show after investigation"
    }
    ```
    
    **Action Types:**
    - `confirm_no_show`: Apply karma penalty (-20), cancel TimeBank transfer
    - `dismiss`: Complete TimeBank transfer normally, dismiss report
    
    **Business Rules:**
    - Only users with admin role can access
    - Confirming no-show applies -20 karma penalty to reported user
    - Dismissing report completes the service normally
    - All actions notify relevant parties
    
    **Error Scenarios:**
    - 401 Unauthorized: Authentication required
    - 403 Forbidden: Admin role required
    - 404 Not Found: Report does not exist
    - 429 Too Many Requests: Rate limit exceeded (10/hour for resolve action)
    
    **Authentication:** Required (JWT Bearer token with admin role)
    **Rate Limiting:** 10 requests per hour for resolve action
    """
    serializer_class = ReportSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        # Only admins can access
        if self.request.user.role != 'admin':
            return Report.objects.none()

        queryset = Report.objects.all()

        # For retrieve (single object by PK), skip the status filter so resolved/dismissed
        # reports can still be fetched for the detail panel.
        if self.action == 'retrieve':
            return queryset.order_by('-created_at')

        # For list, filter by status (default: pending)
        status_filter = self.request.query_params.get('status', 'pending')
        if status_filter:
            queryset = queryset.filter(status=status_filter)
        else:
            queryset = queryset.filter(status='pending')

        return queryset.order_by('-created_at')

    @action(detail=True, methods=['post'], url_path='resolve', throttle_classes=[ConfirmationThrottle])
    def resolve_report(self, request, pk=None):
        """
        REQ-ADM-007: Resolve a report with TimeBank dispute logic
        
        Actions:
        - confirm_no_show: Refund receiver, apply karma penalty, notify both parties
        - dismiss: Complete transfer to provider, notify both parties
        """
        if request.user.role != 'admin':
            return create_error_response(
                'Admin access required',
                code=ErrorCodes.PERMISSION_DENIED,
                status_code=status.HTTP_403_FORBIDDEN
            )

        report = self.get_object()
        action_type = request.data.get('action')  # 'confirm_no_show', 'dismiss'
        admin_notes = request.data.get('admin_notes', '')

        if action_type in {'uphold_no_show', 'overturn_no_show'}:
            try:
                resolved_report = EventNoShowAppealService.resolve_appeal(
                    report=report,
                    admin_user=request.user,
                    action_type=action_type,
                    admin_notes=admin_notes,
                )
            except PermissionError as e:
                return create_error_response(
                    str(e),
                    code=ErrorCodes.PERMISSION_DENIED,
                    status_code=status.HTTP_403_FORBIDDEN,
                )
            except ValueError as e:
                return create_error_response(
                    str(e),
                    code=ErrorCodes.INVALID_STATE,
                    status_code=status.HTTP_400_BAD_REQUEST,
                )

            serializer = self.get_serializer(resolved_report)
            log_admin_action(
                request.user,
                'resolve_report',
                'report',
                resolved_report,
                admin_notes or action_type,
            )
            return Response(serializer.data)
        
        from .utils import get_provider_and_receiver
        from django.utils import timezone

        if action_type == 'confirm_no_show':
            # REQ-ADM-007: Handle no-show with correct financial action
            # REQ-ADM-008: Apply karma penalty to no-show user
            
            handshake = report.related_handshake
            if not handshake:
                return create_error_response(
                    'This report has no related handshake. Cannot process TimeBank dispute.',
                    code=ErrorCodes.VALIDATION_ERROR,
                    status_code=status.HTTP_400_BAD_REQUEST
                )
            
            if handshake.status not in ['accepted', 'reported', 'paused']:
                return create_error_response(
                    f'Cannot resolve dispute for handshake with status "{handshake.status}". Expected: accepted, reported, or paused.',
                    code=ErrorCodes.VALIDATION_ERROR,
                    status_code=status.HTTP_400_BAD_REQUEST
                )
            
            with transaction.atomic():
                # Get provider and receiver for correct financial action
                provider, receiver = get_provider_and_receiver(handshake)
                hours = handshake.provisioned_hours
                
                # Determine who was the no-show (reported user)
                noshow_user = report.reported_user
                
                # Choose correct financial action based on who no-showed:
                # - Provider no-show: cancel transfer (refund receiver)
                # - Receiver no-show: complete transfer (pay provider who showed up)
                if noshow_user and noshow_user.id == receiver.id:
                    # Receiver was the no-show - pay the provider who showed up
                    handshake.provider_confirmed_complete = True
                    handshake.receiver_confirmed_complete = True
                    handshake.save(update_fields=['provider_confirmed_complete', 'receiver_confirmed_complete', 'updated_at'])
                    complete_timebank_transfer(handshake)
                    financial_action = 'completed'
                    receiver_msg = f'A no-show report against you has been confirmed. {hours} hours have been transferred to the provider.'
                    provider_msg = f'The no-show report has been confirmed. {hours} hours have been transferred to your account.'
                else:
                    # Provider was the no-show (or unknown) - refund the receiver
                    cancel_timebank_transfer(handshake)
                    financial_action = 'refunded'
                    receiver_msg = f'The no-show report has been confirmed. {hours} hours have been refunded to your account.'
                    provider_msg = f'A no-show report against you has been confirmed. {hours} hours have been refunded to the receiver.'
                
                # Apply karma penalty (-5) atomically
                if noshow_user:
                    noshow_user.karma_score = F('karma_score') - 5
                    noshow_user.save(update_fields=['karma_score'])
                    noshow_user.refresh_from_db(fields=['karma_score'])
                
                # Notify the no-show user
                if noshow_user:
                    noshow_msg = provider_msg if noshow_user.id == provider.id else receiver_msg
                    create_notification(
                        user=noshow_user,
                        notification_type='dispute_resolved',
                        title='No-Show Confirmed',
                        message=f'{noshow_msg} Your karma has been reduced.',
                        handshake=handshake
                    )
                
                # Notify the other party (who showed up)
                # When noshow_user is None, we default to provider no-show (refund receiver),
                # so receiver is the one who showed up
                if noshow_user and noshow_user.id == receiver.id:
                    showed_up_user = provider
                else:
                    showed_up_user = receiver
                showed_up_msg = receiver_msg if showed_up_user.id == receiver.id else provider_msg
                if not noshow_user or noshow_user.id != showed_up_user.id:
                    create_notification(
                        user=showed_up_user,
                        notification_type='dispute_resolved',
                        title=f'Dispute Resolved - Hours {financial_action.capitalize()}',
                        message=showed_up_msg,
                        handshake=handshake
                    )
                
                # If reporter is different from both parties, also notify them
                if report.reporter.id not in [provider.id, receiver.id]:
                    create_notification(
                        user=report.reporter,
                        notification_type='dispute_resolved',
                        title='Your Report Has Been Resolved',
                        message=f'Your no-show report has been confirmed and the dispute has been resolved.',
                        handshake=handshake
                    )

                report.status = 'resolved'
                report.resolved_by = request.user
                report.resolved_at = timezone.now()
                report.admin_notes = admin_notes or f'No-show confirmed - hours {financial_action} after investigation'
                report.save()

            log_admin_action(
                request.user,
                'resolve_report',
                'report',
                report,
                admin_notes or action_type,
            )

        elif action_type == 'dismiss':
            # Complete transfer normally - hours go to provider
            handshake = report.related_handshake
            if not handshake:
                return create_error_response(
                    'This report has no related handshake. Cannot process TimeBank dispute.',
                    code=ErrorCodes.VALIDATION_ERROR,
                    status_code=status.HTTP_400_BAD_REQUEST
                )
            
            if handshake.status not in ['accepted', 'reported', 'paused']:
                return create_error_response(
                    f'Cannot resolve dispute for handshake with status "{handshake.status}". Expected: accepted, reported, or paused.',
                    code=ErrorCodes.VALIDATION_ERROR,
                    status_code=status.HTTP_400_BAD_REQUEST
                )
            
            with transaction.atomic():
                # Complete transfer - pays provider
                handshake.provider_confirmed_complete = True
                handshake.receiver_confirmed_complete = True
                handshake.save(update_fields=['provider_confirmed_complete', 'receiver_confirmed_complete', 'updated_at'])
                complete_timebank_transfer(handshake)
                
                # Get provider and receiver for notifications
                provider, receiver = get_provider_and_receiver(handshake)
                hours = handshake.provisioned_hours
                
                # Notify the reported user (cleared)
                if report.reported_user:
                    create_notification(
                        user=report.reported_user,
                        notification_type='dispute_resolved',
                        title='Report Dismissed',
                        message=f'A report against you has been dismissed. The service has been completed normally.',
                        handshake=handshake
                    )
                
                # Notify the reporter
                create_notification(
                    user=report.reporter,
                    notification_type='dispute_resolved',
                    title='Report Dismissed',
                    message=f'Your report has been reviewed and dismissed. The service has been marked as completed.',
                    handshake=handshake
                )

                report.status = 'dismissed'
                report.resolved_by = request.user
                report.resolved_at = timezone.now()
                report.admin_notes = admin_notes or 'Report dismissed after investigation'
                report.save()

            log_admin_action(
                request.user,
                'resolve_report',
                'report',
                report,
                admin_notes or action_type,
            )
        
        else:
            return create_error_response(
                'Invalid action. Use "confirm_no_show" or "dismiss".',
                code=ErrorCodes.VALIDATION_ERROR,
                status_code=status.HTTP_400_BAD_REQUEST
            )

        serializer = self.get_serializer(report)
        return Response(serializer.data)

    @action(detail=True, methods=['post'], url_path='pause', throttle_classes=[ConfirmationThrottle])
    def pause_handshake(self, request, pk=None):
        """
        Pause a handshake during dispute investigation
        
        Sets the related handshake to 'paused' status to prevent
        either party from completing/cancelling while under review.
        
        **Endpoint:** POST /api/admin/reports/{id}/pause/
        """
        if request.user.role != 'admin':
            return create_error_response(
                'Admin access required',
                code=ErrorCodes.PERMISSION_DENIED,
                status_code=status.HTTP_403_FORBIDDEN
            )

        report = self.get_object()
        handshake = report.related_handshake
        
        if not handshake:
            return create_error_response(
                'This report has no related handshake to pause.',
                code=ErrorCodes.VALIDATION_ERROR,
                status_code=status.HTTP_400_BAD_REQUEST
            )
        
        if handshake.status not in ['accepted', 'reported']:
            return create_error_response(
                f'Cannot pause handshake with status "{handshake.status}".',
                code=ErrorCodes.VALIDATION_ERROR,
                status_code=status.HTTP_400_BAD_REQUEST
            )
        
        handshake.status = 'paused'
        handshake.save(update_fields=['status'])

        log_admin_action(request.user, 'pause_handshake', 'handshake', handshake, 'Paused from report moderation')
        
        # Notify both parties
        from .utils import get_provider_and_receiver
        provider, receiver = get_provider_and_receiver(handshake)
        
        for user in [provider, receiver]:
            create_notification(
                user=user,
                notification_type='admin_warning',
                title='Service Under Review',
                message=f'The service "{handshake.service.title}" has been paused while a dispute is being investigated.',
                handshake=handshake
            )
        
        return Response({
            'status': 'success',
            'message': 'Handshake has been paused for investigation',
            'handshake_status': handshake.status
        })

class AdminUserViewSet(viewsets.ViewSet):
    """
    Admin User Management
    
    Administrative actions for user management (admin only).
    
    **List Users:** GET /api/admin/users/
    **Warn User:** POST /api/admin/users/{id}/warn/
    **Ban User:** POST /api/admin/users/{id}/ban/
    **Adjust Karma:** POST /api/admin/users/{id}/adjust-karma/
    
    **List Users Query Parameters:**
    - `search`: Search by email, first_name, or last_name
    - `status`: Filter by status - 'active' or 'banned' (is_active=True/False)
    - `page`: Page number for pagination
    - `page_size`: Items per page (default: 20, max: 100)
    
    **Warn User Request:**
    ```json
    {
        "message": "Please follow community guidelines"
    }
    ```
    
    **Ban User Request:**
    ```json
    {}
    ```
    (No body required - sets user.is_active = False)
    
    **Adjust Karma Request:**
    ```json
    {
        "adjustment": -10
    }
    ```
    (Positive or negative integer to adjust karma score)
    
    **Response Format:**
    ```json
    {
        "status": "success",
        "message": "Warning issued"
    }
    ```
    
    **Business Rules:**
    - Only users with admin role can access
    - Warning sends notification to user
    - Ban deactivates user account (sets is_active = False)
    - Karma adjustment can be positive or negative
    
    **Error Scenarios:**
    - 401 Unauthorized: Authentication required
    - 403 Forbidden: Admin role required
    - 404 Not Found: User does not exist
    - 429 Too Many Requests: Rate limit exceeded (10/hour per action)
    
    **Authentication:** Required (JWT Bearer token with admin role)
    **Rate Limiting:** 10 requests per hour per action
    """
    permission_classes = [permissions.IsAuthenticated]
    pagination_class = StandardResultsSetPagination

    def check_admin(self, request):
        if request.user.role != 'admin':
            return create_error_response(
                'Admin access required',
                code=ErrorCodes.PERMISSION_DENIED,
                status_code=status.HTTP_403_FORBIDDEN
            )
        return None

    def list(self, request):
        """List all users with search and filter support (admin only)"""
        admin_check = self.check_admin(request)
        if admin_check:
            return admin_check

        queryset = User.objects.all().order_by('-date_joined')
        
        # Search by email, first_name, or last_name
        search = request.query_params.get('search', '').strip()
        if search:
            queryset = queryset.filter(
                Q(email__icontains=search) |
                Q(first_name__icontains=search) |
                Q(last_name__icontains=search)
            )
        
        # Filter by status
        status_filter = request.query_params.get('status', '').strip().lower()
        if status_filter == 'banned':
            queryset = queryset.filter(is_active=False)
        elif status_filter == 'active':
            queryset = queryset.filter(is_active=True)
        
        # Paginate
        paginator = self.pagination_class()
        page = paginator.paginate_queryset(queryset, request)
        if page is not None:
            serializer = AdminUserListSerializer(page, many=True)
            return paginator.get_paginated_response(serializer.data)
        
        serializer = AdminUserListSerializer(queryset[:100], many=True)
        return Response(serializer.data)

    @action(detail=True, methods=['post'], url_path='warn', throttle_classes=[ConfirmationThrottle])
    def warn_user(self, request, pk=None):
        """REQ-ADM-003: Issue warning to user"""
        admin_check = self.check_admin(request)
        if admin_check:
            return admin_check

        try:
            user = User.objects.get(id=pk)
        except User.DoesNotExist:
            return create_error_response(
                'User not found',
                code=ErrorCodes.NOT_FOUND,
                status_code=status.HTTP_404_NOT_FOUND
            )

        if user == request.user:
            return create_error_response(
                'You cannot warn your own account.',
                code=ErrorCodes.PERMISSION_DENIED,
                status_code=status.HTTP_403_FORBIDDEN
            )

        create_notification(
            user=user,
            notification_type='admin_warning',
            title='Administrative Warning',
            message=request.data.get('message', 'You have received a formal warning from an administrator.'),
        )

        log_admin_action(
            request.user,
            'warn_user',
            'user',
            user,
            request.data.get('message', ''),
        )

        return Response({'status': 'success', 'message': 'Warning issued'})

    @action(detail=True, methods=['post'], url_path='ban', throttle_classes=[ConfirmationThrottle])
    def ban_user(self, request, pk=None):
        """REQ-ADM-005: Ban user"""
        admin_check = self.check_admin(request)
        if admin_check:
            return admin_check

        try:
            user = User.objects.get(id=pk)
        except User.DoesNotExist:
            return create_error_response(
                'User not found',
                code=ErrorCodes.NOT_FOUND,
                status_code=status.HTTP_404_NOT_FOUND
            )

        if user == request.user:
            return create_error_response(
                'You cannot suspend your own account.',
                code=ErrorCodes.PERMISSION_DENIED,
                status_code=status.HTTP_403_FORBIDDEN
            )

        user.is_active = False
        user.save()

        log_admin_action(request.user, 'ban_user', 'user', user, 'Account suspended')

        return Response({'status': 'success', 'message': 'User banned'})

    @action(detail=True, methods=['post'], url_path='unban', throttle_classes=[ConfirmationThrottle])
    def unban_user(self, request, pk=None):
        """REQ-ADM-006: Unban user (reactivate account)"""
        admin_check = self.check_admin(request)
        if admin_check:
            return admin_check

        try:
            user = User.objects.get(id=pk)
        except User.DoesNotExist:
            return create_error_response(
                'User not found',
                code=ErrorCodes.NOT_FOUND,
                status_code=status.HTTP_404_NOT_FOUND
            )

        user.is_active = True
        user.save()

        log_admin_action(request.user, 'unban_user', 'user', user, 'Account reactivated')

        return Response({'status': 'success', 'message': 'User unbanned'})

    @action(detail=True, methods=['post'], url_path='adjust-karma', throttle_classes=[ConfirmationThrottle])
    def adjust_karma(self, request, pk=None):
        """REQ-ADM-008: Manually adjust karma"""
        admin_check = self.check_admin(request)
        if admin_check:
            return admin_check

        try:
            user = User.objects.get(id=pk)
        except User.DoesNotExist:
            return create_error_response(
                'User not found',
                code=ErrorCodes.NOT_FOUND,
                status_code=status.HTTP_404_NOT_FOUND
            )

        adjustment = request.data.get('adjustment', 0)
        user.karma_score += adjustment
        user.save()

        log_admin_action(
            request.user,
            'adjust_karma',
            'user',
            user,
            f'Adjustment: {adjustment}',
        )

        return Response({
            'status': 'success',
            'new_karma': user.karma_score,
            'message': f'Karma adjusted by {adjustment}'
        })


class AdminCommentViewSet(viewsets.ViewSet):
    """Admin-only moderation endpoints for service comments/reviews."""
    permission_classes = [permissions.IsAuthenticated]
    pagination_class = StandardResultsSetPagination
    serializer_class = AdminCommentSerializer

    def check_admin(self, request):
        if request.user.role != 'admin':
            return create_error_response(
                'Admin access required',
                code=ErrorCodes.PERMISSION_DENIED,
                status_code=status.HTTP_403_FORBIDDEN,
            )
        return None

    def get_queryset(self):
        return Comment.objects.select_related('user', 'service', 'parent', 'related_handshake').order_by('-created_at')

    def list(self, request):
        """List comments with moderation-friendly filters."""
        admin_check = self.check_admin(request)
        if admin_check:
            return admin_check

        queryset = self.get_queryset()

        status_filter = request.query_params.get('status', 'active').strip().lower()
        if status_filter == 'removed':
            queryset = queryset.filter(is_deleted=True)
        elif status_filter == 'all':
            pass
        else:
            queryset = queryset.filter(is_deleted=False)

        search = request.query_params.get('search', '').strip()
        if search:
            queryset = queryset.filter(
                Q(body__icontains=search)
                | Q(user__email__icontains=search)
                | Q(user__first_name__icontains=search)
                | Q(user__last_name__icontains=search)
                | Q(service__title__icontains=search)
            )

        paginator = self.pagination_class()
        page = paginator.paginate_queryset(queryset, request)
        if page is not None:
            serializer = self.serializer_class(page, many=True)
            return paginator.get_paginated_response(serializer.data)

        serializer = self.serializer_class(queryset[:100], many=True)
        return Response(serializer.data)

    def retrieve(self, request, pk=None):
        """Retrieve one comment for moderation detail view."""
        admin_check = self.check_admin(request)
        if admin_check:
            return admin_check

        comment = get_object_or_404(self.get_queryset(), id=pk)
        serializer = self.serializer_class(comment)
        return Response(serializer.data)

    @action(detail=True, methods=['post'], url_path='remove', throttle_classes=[ConfirmationThrottle])
    def remove_comment(self, request, pk=None):
        """Soft-remove a comment from admin moderation panel."""
        admin_check = self.check_admin(request)
        if admin_check:
            return admin_check

        comment = get_object_or_404(self.get_queryset(), id=pk)
        if not comment.is_deleted:
            comment.is_deleted = True
            comment.save(update_fields=['is_deleted', 'updated_at'])
            log_admin_action(request.user, 'remove_comment', 'comment', comment, 'Removed from moderation panel')

        serializer = self.serializer_class(comment)
        return Response(serializer.data)

    @action(detail=True, methods=['post'], url_path='restore', throttle_classes=[ConfirmationThrottle])
    def restore_comment(self, request, pk=None):
        """Restore a previously removed comment."""
        admin_check = self.check_admin(request)
        if admin_check:
            return admin_check

        comment = get_object_or_404(self.get_queryset(), id=pk)
        if comment.is_deleted:
            comment.is_deleted = False
            comment.save(update_fields=['is_deleted', 'updated_at'])
            log_admin_action(request.user, 'restore_comment', 'comment', comment, 'Restored from moderation panel')

        serializer = self.serializer_class(comment)
        return Response(serializer.data)


class AdminAuditLogViewSet(viewsets.ReadOnlyModelViewSet):
    """Admin-only read access to moderation audit entries."""

    serializer_class = AdminAuditLogSerializer
    permission_classes = [permissions.IsAuthenticated]
    pagination_class = StandardResultsSetPagination

    def get_queryset(self):
        if self.request.user.role != 'admin':
            return AdminAuditLog.objects.none()

        queryset = AdminAuditLog.objects.select_related('admin').all()

        action_type = self.request.query_params.get('action_type', '').strip().lower()
        if action_type:
            queryset = queryset.filter(action_type=action_type)

        target_entity = self.request.query_params.get('target_entity', '').strip().lower()
        if target_entity:
            queryset = queryset.filter(target_entity=target_entity)

        return queryset.order_by('-created_at')

class TransactionHistoryViewSet(viewsets.ReadOnlyModelViewSet):
    """
    Transaction History
    
    View TimeBank transaction history for the current user.
    
    **List Transactions:** GET /api/transactions/
    **Retrieve Transaction:** GET /api/transactions/{id}/
    
    **Response Format:**
    ```json
    {
        "id": "uuid",
        "user": {...},
        "transaction_type": "provision",
        "amount": -2.5,
        "balance_after": 7.5,
        "handshake": {...},
        "description": "Hours escrowed for 'Web Development Help'",
        "created_at": "2024-01-01T12:00:00Z"
    }
    ```
    
    **Transaction Types:**
    - `provision`: Hours escrowed when handshake is accepted
    - `transfer`: Hours transferred when service is completed
    - `refund`: Hours refunded when handshake is cancelled
    - `adjustment`: Manual adjustment by admin
    
    **Business Rules:**
    - Only shows transactions for authenticated user
    - Ordered by created_at descending (newest first)
    - Provides complete audit trail of all balance changes
    
    **Error Scenarios:**
    - 401 Unauthorized: Authentication required
    - 404 Not Found: Transaction does not exist or doesn't belong to user
    
    **Authentication:** Required (JWT Bearer token)
    **Pagination:** 20 items per page
    """
    serializer_class = TransactionHistorySerializer
    permission_classes = [permissions.IsAuthenticated]
    pagination_class = StandardResultsSetPagination

    @track_performance
    def list(self, request, *args, **kwargs):
        from .cache_utils import get_cached_transactions, cache_transactions
        user = request.user
        
        cached_result = get_cached_transactions(str(user.id))
        if cached_result is not None:
            return Response(cached_result)
        
        queryset = self.filter_queryset(self.get_queryset())
        page = self.paginate_queryset(queryset)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            response = self.get_paginated_response(serializer.data)
            cache_transactions(str(user.id), response.data, ttl=CACHE_TTL_SHORT)
            return response
        
        serializer = self.get_serializer(queryset, many=True)
        response_data = serializer.data
        cache_transactions(str(user.id), response_data, ttl=CACHE_TTL_SHORT)
        return Response(response_data)

    def get_queryset(self):
        return TransactionHistory.objects.filter(user=self.request.user).order_by('-created_at')


class WikidataSearchView(APIView):
    """
    Wikidata Search Proxy
    
    Search Wikidata for entities to use as service tags.
    
    **Endpoint:** GET /api/wikidata/search/?q=python&limit=10
    
    **Query Parameters:**
    - `q` (required): Search query string
    - `limit` (optional): Maximum number of results (default: 10, max: 20)
    
    **Response Format:**
    ```json
    [
        {
            "id": "Q28865",
            "label": "Python",
            "description": "high-level programming language"
        }
    ]
    ```
    
    **Business Rules:**
    - Proxies requests to Wikidata wbsearchentities API
    - Returns empty list on API failures (graceful degradation)
    - Results are in English language
    
    **Error Scenarios:**
    - 400 Bad Request: Missing or empty query parameter
    
    **Authentication:** Not required (public endpoint)
    **Rate Limiting:** Standard anonymous rate limit
    """
    permission_classes = [permissions.AllowAny]
    throttle_classes = [AnonRateThrottle]

    def get(self, request):
        query = request.query_params.get('q', '').strip()
        
        if not query:
            return create_error_response(
                'Query parameter "q" is required',
                code=ErrorCodes.VALIDATION_ERROR,
                status_code=status.HTTP_400_BAD_REQUEST
            )
        
        # Get limit with validation
        try:
            limit = int(request.query_params.get('limit', 10))
            limit = min(max(limit, 1), 20)  # Clamp between 1 and 20
        except (ValueError, TypeError):
            limit = 10
        
        # Use existing wikidata utility
        from .wikidata import search_wikidata_items
        results = search_wikidata_items(query, limit=limit)
        
        return Response(results)


class PublicChatViewSet(viewsets.ViewSet):
    """
    Public Chat Room API
    
    Provides access to public discussion rooms for services (service lobbies).
    Any authenticated user can read and post messages.
    
    **Endpoints:**
    - GET /api/public-chat/{service_id}/ - Get room info and messages
    - POST /api/public-chat/{service_id}/ - Send a message to the room
    """
    permission_classes = [permissions.IsAuthenticated]
    throttle_classes = [UserRateThrottle]
    pagination_class = StandardResultsSetPagination

    def _check_event_access(self, request, service):
        """For Event-type services, restrict access to organizer + active participants."""
        if service.type != 'Event':
            return None  # no restriction for non-events
        user = request.user
        if service.user == user:
            return None  # organizer always has access
        has_active_hs = Handshake.objects.filter(
            service=service,
            requester=user,
            status__in=['accepted', 'checked_in', 'attended'],
        ).exists()
        if has_active_hs:
            return None
        return create_error_response(
            'You must be a participant or organizer of this event to access chat',
            code=ErrorCodes.PERMISSION_DENIED,
            status_code=status.HTTP_403_FORBIDDEN
        )

    @track_performance
    def retrieve(self, request, pk=None):
        """
        Get public chat room info and messages for a service.
        
        Returns room details and paginated messages.
        """
        try:
            service = Service.objects.select_related('user').prefetch_related('tags', 'media').get(id=pk)
        except Service.DoesNotExist:
            return create_error_response(
                'Service not found',
                code=ErrorCodes.NOT_FOUND,
                status_code=status.HTTP_404_NOT_FOUND
            )

        # For events, restrict to organizer + active participants
        denied = self._check_event_access(request, service)
        if denied:
            return denied

        # Get or create chat room for the service (atomic to handle concurrent requests)
        room, _ = ChatRoom.objects.get_or_create(
            related_service=service,
            defaults={
                'name': f"Discussion: {service.title}",
                'type': 'public',
            }
        )

        # Get messages with pagination (select_related to avoid N+1 queries)
        messages = PublicChatMessage.objects.filter(room=room).select_related('sender').order_by('-created_at')
        
        paginator = self.pagination_class()
        page = paginator.paginate_queryset(messages, request)
        
        if page is not None:
            serializer = PublicChatMessageSerializer(page, many=True)
            # Return room info along with paginated messages
            return Response({
                'room': ChatRoomSerializer(room).data,
                'messages': paginator.get_paginated_response(serializer.data).data
            })
        
        # Fallback: return consistent structure matching paginated response
        serializer = PublicChatMessageSerializer(messages, many=True)
        return Response({
            'room': ChatRoomSerializer(room).data,
            'messages': {
                'count': len(serializer.data),
                'next': None,
                'previous': None,
                'results': serializer.data
            }
        })

    @track_performance
    def create(self, request, pk=None):
        """
        Send a message to a public chat room.
        
        Request body:
        - body (string, required): The message content (max 5000 chars)
        """
        try:
            service = Service.objects.select_related('user').prefetch_related('tags', 'media').get(id=pk)
        except Service.DoesNotExist:
            return create_error_response(
                'Service not found',
                code=ErrorCodes.NOT_FOUND,
                status_code=status.HTTP_404_NOT_FOUND
            )

        # For events, restrict to organizer + active participants
        denied = self._check_event_access(request, service)
        if denied:
            return denied

        # Get or create chat room (atomic to handle concurrent requests)
        room, _ = ChatRoom.objects.get_or_create(
            related_service=service,
            defaults={
                'name': f"Discussion: {service.title}",
                'type': 'public',
            }
        )

        body = (request.data.get('body', '') or '').strip()
        
        # Sanitize and truncate FIRST, then validate
        cleaned_body = bleach.clean(body, tags=[], strip=True).strip()[:5000]
        
        if not cleaned_body:
            return create_error_response(
                'Message body is required',
                code=ErrorCodes.VALIDATION_ERROR,
                status_code=status.HTTP_400_BAD_REQUEST
            )

        # Create message
        message = PublicChatMessage.objects.create(
            room=room,
            sender=request.user,
            body=cleaned_body
        )

        # Broadcast via WebSocket channel layer
        try:
            from channels.layers import get_channel_layer
            from asgiref.sync import async_to_sync
            channel_layer = get_channel_layer()
            if channel_layer:
                serializer = PublicChatMessageSerializer(message)
                async_to_sync(channel_layer.group_send)(
                    f'public_chat_{room.id}',
                    {
                        'type': 'chat_message',
                        'message': serializer.data
                    }
                )
        except Exception as e:
            logger.warning(f"Failed to broadcast public chat message: {e}")

        serializer = PublicChatMessageSerializer(message)
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class GroupChatViewSet(viewsets.ViewSet):
    """
    Private group chat for one-time Offer/Need services with max_participants > 1.
    Only users with an accepted handshake (or the service owner) may access.

    Endpoints:
    - GET  /api/group-chat/{service_id}/ — get last 50 messages
    - POST /api/group-chat/{service_id}/ — send a message
    """
    permission_classes = [permissions.IsAuthenticated]

    def _get_service_or_403(self, request, pk):
        """Return the service if eligible and the user has access; raise otherwise."""
        try:
            service = Service.objects.select_related('user').get(id=pk)
        except Service.DoesNotExist:
            from rest_framework.exceptions import NotFound
            raise NotFound('Service not found')

        is_event = service.type == 'Event'
        is_group_service = (
            is_event
            or (service.schedule_type == 'One-Time' and service.max_participants > 1)
        )
        if not is_group_service:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied('Group chat is only available for one-time group services')

        user = request.user
        is_owner = service.user == user
        active_statuses = ['accepted', 'checked_in', 'attended'] if is_event else ['accepted']
        has_access = Handshake.objects.filter(
            service=service, requester=user, status__in=active_statuses
        ).exists()

        if not is_owner and not has_access:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied('You must have an accepted handshake to join this group chat')

        return service

    @track_performance
    def retrieve(self, request, pk=None):
        """Get the last 50 messages for the group chat."""
        service = self._get_service_or_403(request, pk)
        msgs = (
            ServiceGroupChatMessage.objects
            .filter(service=service)
            .select_related('sender')
            .order_by('-created_at')[:50]
        )
        serializer = ServiceGroupChatMessageSerializer(list(reversed(list(msgs))), many=True)
        return Response({'service_id': str(service.id), 'messages': serializer.data})

    @track_performance
    def create(self, request, pk=None):
        """Send a message to the group chat."""
        service = self._get_service_or_403(request, pk)

        body = (request.data.get('body', '') or '').strip()
        cleaned_body = bleach.clean(body, tags=[], strip=True).strip()[:5000]

        if not cleaned_body:
            return create_error_response(
                'Message body is required',
                code=ErrorCodes.VALIDATION_ERROR,
                status_code=status.HTTP_400_BAD_REQUEST
            )

        message = ServiceGroupChatMessage.objects.create(
            service=service,
            sender=request.user,
            body=cleaned_body,
        )

        # Broadcast via WebSocket
        try:
            from channels.layers import get_channel_layer
            from asgiref.sync import async_to_sync
            channel_layer = get_channel_layer()
            if channel_layer:
                serializer = ServiceGroupChatMessageSerializer(message)
                async_to_sync(channel_layer.group_send)(
                    f'group_chat_{str(service.id)}',
                    {'type': 'chat_message', 'message': serializer.data}
                )
        except Exception as e:
            logger.warning(f"Failed to broadcast group chat message: {e}")

        serializer = ServiceGroupChatMessageSerializer(message)
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class CommentViewSet(viewsets.ViewSet):
    """
    Comment Management for Services
    
    Allows users to comment on services with single-level threading.
    
    **Endpoints:**
    - GET /api/services/{service_id}/comments/ - List comments for a service
    - POST /api/services/{service_id}/comments/ - Create a comment
    - PATCH /api/services/{service_id}/comments/{comment_id}/ - Edit own comment
    - DELETE /api/services/{service_id}/comments/{comment_id}/ - Soft delete own comment
    
    **Threading:**
    - Comments can have replies (single level only)
    - Replies cannot have replies (depth = 1)
    """
    permission_classes = [permissions.IsAuthenticatedOrReadOnly]
    throttle_classes = [UserRateThrottle]
    pagination_class = StandardResultsSetPagination

    def _get_service(self, service_id):
        """Get service or raise 404"""
        try:
            return Service.objects.select_related('user').prefetch_related('tags', 'media').get(id=service_id)
        except Service.DoesNotExist:
            return None

    @track_performance
    def list(self, request, service_id=None):
        """
        List all comments for a service (paginated).
        
        Returns top-level comments with nested replies.
        """
        service = self._get_service(service_id)
        if service is None:
            return create_error_response(
                'Service not found',
                code=ErrorCodes.NOT_FOUND,
                status_code=status.HTTP_404_NOT_FOUND
            )

        # Get top-level comments only (parent=None), prefetch replies and user badges
        user_badges_prefetch = Prefetch(
            'user__badges',
            queryset=UserBadge.objects.select_related('badge')
        )
        from django.db.models import F
        comments = Comment.objects.filter(
            service=service,
            parent__isnull=True,
            is_deleted=False
        ).filter(
            is_verified_review=True,
            related_handshake__isnull=False,
            # Only show verified reviews *about the service owner* (service.user).
            # For both Offer and Need handshakes, the review about service.user is written by handshake.requester.
            related_handshake__requester=F('user')
        ).select_related('user', 'related_handshake', 'service').prefetch_related(
            user_badges_prefetch,
            Prefetch(
                'replies',
                queryset=Comment.objects.filter(is_deleted=False).select_related(
                    'user', 'related_handshake'
                ).prefetch_related(user_badges_prefetch),
                to_attr='active_replies'
            )
        ).order_by('-created_at')
        comments = _apply_blind_review_visibility(comments)

        # Paginate
        paginator = self.pagination_class()
        page = paginator.paginate_queryset(comments, request)
        
        if page is not None:
            serializer = CommentSerializer(page, many=True)
            return paginator.get_paginated_response(serializer.data)

        serializer = CommentSerializer(comments, many=True)
        return Response(serializer.data)

    @track_performance
    def create(self, request, service_id=None):
        """
        Create a new comment on a service.
        
        Request body:
        - body (string, required): Comment text (max 2000 chars)
        - parent_id (uuid, optional): Parent comment ID for replies
        - handshake_id (uuid, optional): Handshake ID for verified reviews
        
        When handshake_id is provided:
        - Handshake must be completed
        - User must be either provider or receiver of the handshake
        - User can only post one verified review per handshake
        """
        return create_error_response(
            'Service comments are read-only. Verified reviews are created from reputation submissions for completed exchanges.',
            code=ErrorCodes.VALIDATION_ERROR,
            status_code=status.HTTP_405_METHOD_NOT_ALLOWED
        )

    @track_performance
    def partial_update(self, request, service_id=None, pk=None):
        """
        Edit own comment.
        
        Only the comment author can edit their comment.
        """
        return create_error_response(
            'Service comments are read-only.',
            code=ErrorCodes.VALIDATION_ERROR,
            status_code=status.HTTP_405_METHOD_NOT_ALLOWED
        )

    @track_performance
    def destroy(self, request, service_id=None, pk=None):
        """
        Soft delete own comment.
        
        Only the comment author or service owner can delete a comment.
        """
        return create_error_response(
            'Service comments are read-only.',
            code=ErrorCodes.VALIDATION_ERROR,
            status_code=status.HTTP_405_METHOD_NOT_ALLOWED
        )

    @track_performance
    def reviewable_handshakes(self, request, service_id=None):
        """
        Get list of completed handshakes that the user can review.
        
        Returns handshakes where:
        - User is either provider or receiver
        - Handshake is completed
        - User has not already posted a verified review
        """

        service = self._get_service(service_id)
        if service is None:
            return create_error_response(
                'Service not found',
                code=ErrorCodes.NOT_FOUND,
                status_code=status.HTTP_404_NOT_FOUND
            )

        # Get completed handshakes for this service where user is a participant
        handshakes = Handshake.objects.filter(
            service=service,
            status='completed'
        ).filter(
            Q(requester=request.user) | Q(service__user=request.user)
        ).select_related('service', 'requester', 'service__user')

        # Exclude handshakes already reviewed by this user
        # Exclude handshakes with active (non-deleted) verified reviews
        already_reviewed = Comment.objects.filter(
            user=request.user,
            is_verified_review=True,
            is_deleted=False,
            related_handshake__isnull=False
        ).values_list('related_handshake_id', flat=True)

        handshakes = handshakes.exclude(id__in=already_reviewed)

        # Return simple list of reviewable handshakes
        result = []
        for handshake in handshakes:
            result.append({
                'id': str(handshake.id),
                'provisioned_hours': float(handshake.provisioned_hours),
                'completed_at': handshake.updated_at.isoformat(),
            })

        return Response({'handshakes': result})


class NegativeRepViewSet(viewsets.ViewSet):
    """
    Negative Reputation Management
    
    Submit negative feedback for completed handshakes.
    
    **Endpoint:** POST /api/reputation/negative/
    
    **Request Format:**
    ```json
    {
        "handshake_id": "uuid",
        "is_late": true,
        "is_unhelpful": false,
        "is_rude": false,
        "comment": "Optional explanation"
    }
    ```
    
    **Business Rules:**
    - Can only submit for completed handshakes
    - Can only submit once per handshake
    - Must be a participant in the handshake
    - At least one negative trait must be selected
    - Negative traits reduce karma by 2 each
    """
    permission_classes = [permissions.IsAuthenticated]
    throttle_classes = [ConfirmationThrottle]

    @track_performance
    def create(self, request):
        """Submit negative reputation for a completed handshake"""
        handshake_id = request.data.get('handshake_id')
        
        if not handshake_id:
            return create_error_response(
                'handshake_id is required',
                code=ErrorCodes.VALIDATION_ERROR,
                status_code=status.HTTP_400_BAD_REQUEST
            )

        try:
            handshake = Handshake.objects.select_related(
                'service', 'service__user', 'requester'
            ).get(id=handshake_id)
        except Handshake.DoesNotExist:
            return create_error_response(
                'Handshake not found',
                code=ErrorCodes.NOT_FOUND,
                status_code=status.HTTP_404_NOT_FOUND
            )

        required_status = 'attended' if handshake.service.type == 'Event' else 'completed'
        if handshake.status != required_status:
            return create_error_response(
                'Handshake not found or not eligible for evaluation',
                code=ErrorCodes.NOT_FOUND,
                status_code=status.HTTP_404_NOT_FOUND
            )

        in_window, window_error = _validate_feedback_window(handshake)
        if not in_window:
            return create_error_response(
                window_error,
                code=ErrorCodes.INVALID_STATE,
                status_code=status.HTTP_410_GONE
            )

        user = request.user
        
        # Determine provider and receiver
        from .utils import get_provider_and_receiver
        provider, receiver = get_provider_and_receiver(handshake)
        
        # Check if user is a participant
        if user not in [provider, receiver]:
            return create_error_response(
                'Not authorized - you are not a participant in this handshake',
                code=ErrorCodes.PERMISSION_DENIED,
                status_code=status.HTTP_403_FORBIDDEN
            )

        is_event_evaluation = handshake.service.type == 'Event'
        if is_event_evaluation:
            if handshake.requester_id != user.id:
                return create_error_response(
                    'Only verified attendees can evaluate the organizer for events',
                    code=ErrorCodes.PERMISSION_DENIED,
                    status_code=status.HTTP_403_FORBIDDEN
                )
            target_user = handshake.service.user
            is_late = request.data.get('disorganized', request.data.get('is_late', False))
            is_unhelpful = request.data.get('boring', request.data.get('is_unhelpful', False))
            is_rude = request.data.get('unwelcoming', request.data.get('is_rude', False))
        else:
            target_user = receiver if user == provider else provider
            is_late = request.data.get('is_late', False)
            is_unhelpful = request.data.get('is_unhelpful', False)
            is_rude = request.data.get('is_rude', False)

        # Check if negative rep already given
        existing = NegativeRep.objects.filter(handshake=handshake, giver=user).first()
        if existing:
            return create_error_response(
                'Negative reputation already submitted for this handshake',
                code=ErrorCodes.ALREADY_EXISTS,
                status_code=status.HTTP_400_BAD_REQUEST
            )

        if not any([is_late, is_unhelpful, is_rude]):
            return create_error_response(
                'At least one negative trait must be selected',
                code=ErrorCodes.VALIDATION_ERROR,
                status_code=status.HTTP_400_BAD_REQUEST
            )

        # Create negative rep
        try:
            negative_rep = NegativeRep.objects.create(
                handshake=handshake,
                giver=user,
                receiver=target_user,
                is_late=is_late,
                is_unhelpful=is_unhelpful,
                is_rude=is_rude,
                comment=request.data.get('comment', '')[:500] if request.data.get('comment') else None
            )
        except IntegrityError:
            return create_error_response(
                'Negative reputation already submitted',
                code=ErrorCodes.ALREADY_EXISTS,
                status_code=status.HTTP_400_BAD_REQUEST
            )

        # Apply karma penalty (-2 per negative trait)
        karma_penalty = 0
        if is_late:
            karma_penalty += 2
        if is_unhelpful:
            karma_penalty += 2
        if is_rude:
            karma_penalty += 2

        target_user.karma_score = F("karma_score") - karma_penalty
        target_user.save(update_fields=['karma_score'])
        target_user.refresh_from_db(fields=['karma_score'])

        if handshake.service.type == 'Event':
            EventEvaluationService.refresh_summary(handshake.service)

        serializer = NegativeRepSerializer(negative_rep)
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class ForumCategoryViewSet(viewsets.ModelViewSet):
    """
    Forum Categories API
    
    Manage forum categories for community discussions.
    
    **Permissions:**
    - List/Retrieve: Public (AllowAny)
    - Create/Update/Delete: Admin only
    
    **Endpoints:**
    - GET /api/forum/categories/ - List all active categories
    - GET /api/forum/categories/{slug}/ - Get category details
    - POST /api/forum/categories/ - Create category (admin)
    - PATCH /api/forum/categories/{id}/ - Update category (admin)
    - DELETE /api/forum/categories/{id}/ - Delete category (admin)
    """
    serializer_class = ForumCategorySerializer
    pagination_class = None  # No pagination for categories
    lookup_field = 'slug'
    
    def get_permissions(self):
        if self.action in ['list', 'retrieve']:
            return [permissions.AllowAny()]
        return [permissions.IsAdminUser()]
    
    def get_queryset(self):
        queryset = ForumCategory.objects.all()
        
        # For public views, only show active categories
        if not self.request.user.is_staff:
            queryset = queryset.filter(is_active=True)
        
        # Annotate with counts for efficiency
        queryset = queryset.annotate(
            topic_count_annotated=Count('topics', distinct=True),
            post_count_annotated=Count('topics__posts', filter=Q(topics__posts__is_deleted=False), distinct=True)
        )
        
        return queryset.order_by('display_order', 'name')
    
    @track_performance
    def list(self, request):
        """List all active forum categories with topic/post counts"""
        queryset = self.get_queryset()
        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data)
    
    @track_performance
    def retrieve(self, request, slug=None):
        """Get a specific category by slug"""
        try:
            category = self.get_queryset().get(slug=slug)
        except ForumCategory.DoesNotExist:
            return create_error_response(
                'Category not found',
                code=ErrorCodes.NOT_FOUND,
                status_code=status.HTTP_404_NOT_FOUND
            )
        
        serializer = self.get_serializer(category)
        return Response(serializer.data)
    
    @track_performance
    def create(self, request):
        """Create a new forum category (admin only)"""
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data, status=status.HTTP_201_CREATED)
    
    @track_performance
    def partial_update(self, request, slug=None):
        """Update a forum category (admin only)"""
        try:
            category = ForumCategory.objects.get(slug=slug)
        except ForumCategory.DoesNotExist:
            return create_error_response(
                'Category not found',
                code=ErrorCodes.NOT_FOUND,
                status_code=status.HTTP_404_NOT_FOUND
            )
        
        serializer = self.get_serializer(category, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)
    
    @track_performance
    def destroy(self, request, slug=None):
        """Delete a forum category (admin only)"""
        try:
            category = ForumCategory.objects.get(slug=slug)
        except ForumCategory.DoesNotExist:
            return create_error_response(
                'Category not found',
                code=ErrorCodes.NOT_FOUND,
                status_code=status.HTTP_404_NOT_FOUND
            )
        
        # Soft delete by deactivating
        category.is_active = False
        category.save(update_fields=['is_active'])
        return Response(status=status.HTTP_204_NO_CONTENT)


class ForumTopicViewSet(viewsets.ModelViewSet):
    """
    Forum Topics API
    
    Manage forum topics within categories.
    
    **Permissions:**
    - List/Retrieve: Public (AllowAny)
    - Create: Authenticated users
    - Update/Delete: Author or Admin
    - Pin/Lock: Admin only
    
    **Endpoints:**
    - GET /api/forum/topics/ - List topics (filter by category)
    - GET /api/forum/topics/{id}/ - Get topic with posts
    - POST /api/forum/topics/ - Create new topic
    - PATCH /api/forum/topics/{id}/ - Update topic
    - DELETE /api/forum/topics/{id}/ - Delete topic
    - POST /api/forum/topics/{id}/pin/ - Pin/unpin topic (admin)
    - POST /api/forum/topics/{id}/lock/ - Lock/unlock topic (admin)
    """
    serializer_class = ForumTopicSerializer
    pagination_class = StandardResultsSetPagination
    
    def get_permissions(self):
        if self.action in ['list', 'retrieve']:
            return [permissions.AllowAny()]
        elif self.action in ['pin', 'lock']:
            return [permissions.IsAdminUser()]
        return [permissions.IsAuthenticated()]
    
    def get_queryset(self):
        queryset = ForumTopic.objects.select_related('author', 'category')
        
        # Filter by category if provided
        category_slug = self.request.query_params.get('category')
        if category_slug:
            queryset = queryset.filter(category__slug=category_slug, category__is_active=True)
        else:
            # Only show topics from active categories
            queryset = queryset.filter(category__is_active=True)
        
        # Annotate with reply count
        queryset = queryset.annotate(
            reply_count_annotated=Count('posts', filter=Q(posts__is_deleted=False))
        )
        
        return queryset.order_by('-is_pinned', '-created_at')
    
    def get_serializer_class(self):
        if self.action == 'retrieve':
            return ForumTopicDetailSerializer
        return ForumTopicSerializer
    
    @track_performance
    def list(self, request):
        """List forum topics with optional category filter"""
        queryset = self.get_queryset()
        
        page = self.paginate_queryset(queryset)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)
        
        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data)
    
    @track_performance
    def retrieve(self, request, pk=None):
        """Get a specific topic with its posts"""
        try:
            topic = self.get_queryset().get(pk=pk)
        except ForumTopic.DoesNotExist:
            return create_error_response(
                'Topic not found',
                code=ErrorCodes.NOT_FOUND,
                status_code=status.HTTP_404_NOT_FOUND
            )
        
        # Increment view count (use F() to avoid race conditions)
        ForumTopic.objects.filter(pk=pk).update(view_count=F('view_count') + 1)
        topic.refresh_from_db(fields=['view_count'])
        
        serializer = self.get_serializer(topic)
        return Response(serializer.data)
    
    @track_performance
    def create(self, request):
        """Create a new forum topic"""
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        # Verify category exists and is active
        category_id = request.data.get('category')
        try:
            category = ForumCategory.objects.get(id=category_id, is_active=True)
        except ForumCategory.DoesNotExist:
            return create_error_response(
                'Category not found or inactive',
                code=ErrorCodes.NOT_FOUND,
                status_code=status.HTTP_404_NOT_FOUND
            )
        
        serializer.save(author=request.user, category=category)
        return Response(serializer.data, status=status.HTTP_201_CREATED)
    
    @track_performance
    def partial_update(self, request, pk=None):
        """Update a forum topic (author or admin only)"""
        try:
            topic = ForumTopic.objects.get(pk=pk)
        except ForumTopic.DoesNotExist:
            return create_error_response(
                'Topic not found',
                code=ErrorCodes.NOT_FOUND,
                status_code=status.HTTP_404_NOT_FOUND
            )
        
        # Check permissions
        if topic.author != request.user and not request.user.is_staff:
            return create_error_response(
                'Not authorized to edit this topic',
                code=ErrorCodes.PERMISSION_DENIED,
                status_code=status.HTTP_403_FORBIDDEN
            )
        
        # Only allow editing title and body
        allowed_fields = {'title', 'body'}
        update_data = {k: v for k, v in request.data.items() if k in allowed_fields}
        
        serializer = self.get_serializer(topic, data=update_data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)
    
    @track_performance
    def destroy(self, request, pk=None):
        """Delete a forum topic (author or admin only)"""
        try:
            topic = ForumTopic.objects.get(pk=pk)
        except ForumTopic.DoesNotExist:
            return create_error_response(
                'Topic not found',
                code=ErrorCodes.NOT_FOUND,
                status_code=status.HTTP_404_NOT_FOUND
            )
        
        # Check permissions
        if topic.author != request.user and not request.user.is_staff:
            return create_error_response(
                'Not authorized to delete this topic',
                code=ErrorCodes.PERMISSION_DENIED,
                status_code=status.HTTP_403_FORBIDDEN
            )
        
        topic.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
    
    @action(detail=True, methods=['post'])
    @track_performance
    def pin(self, request, pk=None):
        """Pin or unpin a topic (admin only)"""
        try:
            topic = ForumTopic.objects.get(pk=pk)
        except ForumTopic.DoesNotExist:
            return create_error_response(
                'Topic not found',
                code=ErrorCodes.NOT_FOUND,
                status_code=status.HTTP_404_NOT_FOUND
            )
        
        topic.is_pinned = not topic.is_pinned
        topic.save(update_fields=['is_pinned'])

        if request.user.role == 'admin':
            state = 'Pinned' if topic.is_pinned else 'Unpinned'
            log_admin_action(request.user, 'pin_topic', 'forum_topic', topic, state)
        
        serializer = self.get_serializer(topic)
        return Response(serializer.data)
    
    @action(detail=True, methods=['post'])
    @track_performance
    def lock(self, request, pk=None):
        """Lock or unlock a topic (admin only)"""
        try:
            topic = ForumTopic.objects.get(pk=pk)
        except ForumTopic.DoesNotExist:
            return create_error_response(
                'Topic not found',
                code=ErrorCodes.NOT_FOUND,
                status_code=status.HTTP_404_NOT_FOUND
            )
        
        topic.is_locked = not topic.is_locked
        topic.save(update_fields=['is_locked'])

        if request.user.role == 'admin':
            state = 'Locked' if topic.is_locked else 'Unlocked'
            log_admin_action(request.user, 'lock_topic', 'forum_topic', topic, state)
        
        serializer = self.get_serializer(topic)
        return Response(serializer.data)

    @action(detail=True, methods=['post'], url_path='report', throttle_classes=[ConfirmationThrottle])
    @track_performance
    def report(self, request, pk=None):
        """Report a forum topic for moderation."""
        try:
            topic = ForumTopic.objects.get(pk=pk, category__is_active=True)
        except ForumTopic.DoesNotExist:
            return create_error_response(
                'Topic not found',
                code=ErrorCodes.NOT_FOUND,
                status_code=status.HTTP_404_NOT_FOUND,
            )

        if topic.author_id == request.user.id:
            return create_error_response(
                'You cannot report your own topic',
                code=ErrorCodes.VALIDATION_ERROR,
                status_code=status.HTTP_400_BAD_REQUEST,
            )

        report_type = request.data.get('type', 'inappropriate_content')
        if report_type not in dict(Report.TYPE_CHOICES):
            return create_error_response(
                'Invalid report type.',
                code=ErrorCodes.VALIDATION_ERROR,
                status_code=status.HTTP_400_BAD_REQUEST,
            )

        description = (request.data.get('description') or '').strip()
        if not description:
            description = f"Forum topic report: {topic.title}"

        report = Report.objects.create(
            reporter=request.user,
            reported_user=topic.author,
            reported_forum_topic=topic,
            type=report_type,
            description=description,
        )

        admins = User.objects.filter(role='admin', is_active=True)
        for admin in admins:
            create_notification(
                user=admin,
                notification_type='admin_warning',
                title='New Forum Topic Report',
                message=f"{request.user.first_name or request.user.email} reported topic '{topic.title}'.",
            )

        return Response(ReportSerializer(report).data, status=status.HTTP_201_CREATED)


class ForumPostViewSet(viewsets.ViewSet):
    """
    Forum Posts API
    
    Manage posts (replies) within forum topics.
    
    **Permissions:**
    - List: Public (AllowAny)
    - Create: Authenticated users (topic must not be locked)
    - Update/Delete: Author or Admin
    
    **Endpoints:**
    - GET /api/forum/topics/{topic_id}/posts/ - List posts in topic
    - POST /api/forum/topics/{topic_id}/posts/ - Create new post
    - PATCH /api/forum/posts/{id}/ - Update post
    - DELETE /api/forum/posts/{id}/ - Delete post
    """
    pagination_class = StandardResultsSetPagination
    
    def get_permissions(self):
        if self.action in ['list', 'recent']:
            return [permissions.AllowAny()]
        return [permissions.IsAuthenticated()]

    @track_performance
    def recent(self, request):
        """List most recent posts across all active categories/topics."""
        from .serializers import ForumRecentPostSerializer

        posts = (
            ForumPost.objects.filter(is_deleted=False, topic__category__is_active=True)
            .select_related('author', 'topic', 'topic__category')
            .order_by('-created_at')
        )

        paginator = self.pagination_class()
        page = paginator.paginate_queryset(posts, request)

        if page is not None:
            serializer = ForumRecentPostSerializer(page, many=True)
            return paginator.get_paginated_response(serializer.data)

        serializer = ForumRecentPostSerializer(posts, many=True)
        return Response(serializer.data)
    
    @track_performance
    def list(self, request, topic_id=None):
        """List posts in a forum topic"""
        try:
            topic = ForumTopic.objects.get(pk=topic_id, category__is_active=True)
        except ForumTopic.DoesNotExist:
            return create_error_response(
                'Topic not found',
                code=ErrorCodes.NOT_FOUND,
                status_code=status.HTTP_404_NOT_FOUND
            )
        
        posts = ForumPost.objects.filter(
            topic=topic, is_deleted=False
        ).select_related('author').order_by('created_at')
        
        paginator = self.pagination_class()
        page = paginator.paginate_queryset(posts, request)
        
        if page is not None:
            serializer = ForumPostSerializer(page, many=True)
            return paginator.get_paginated_response(serializer.data)
        
        serializer = ForumPostSerializer(posts, many=True)
        return Response(serializer.data)
    
    @track_performance
    def create(self, request, topic_id=None):
        """Create a new post in a forum topic"""
        try:
            topic = ForumTopic.objects.get(pk=topic_id, category__is_active=True)
        except ForumTopic.DoesNotExist:
            return create_error_response(
                'Topic not found',
                code=ErrorCodes.NOT_FOUND,
                status_code=status.HTTP_404_NOT_FOUND
            )
        
        # Check if topic is locked
        if topic.is_locked:
            return create_error_response(
                'This topic is locked and cannot receive new posts',
                code=ErrorCodes.PERMISSION_DENIED,
                status_code=status.HTTP_403_FORBIDDEN
            )
        
        serializer = ForumPostSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save(topic=topic, author=request.user)
        
        return Response(serializer.data, status=status.HTTP_201_CREATED)
    
    @track_performance
    def partial_update(self, request, pk=None):
        """Update a forum post (author or admin only)"""
        try:
            post = ForumPost.objects.get(pk=pk, is_deleted=False)
        except ForumPost.DoesNotExist:
            return create_error_response(
                'Post not found',
                code=ErrorCodes.NOT_FOUND,
                status_code=status.HTTP_404_NOT_FOUND
            )
        
        # Check permissions
        if post.author != request.user and not request.user.is_staff:
            return create_error_response(
                'Not authorized to edit this post',
                code=ErrorCodes.PERMISSION_DENIED,
                status_code=status.HTTP_403_FORBIDDEN
            )
        
        # Only allow editing body
        if 'body' in request.data:
            serializer = ForumPostSerializer(post, data={'body': request.data['body']}, partial=True)
            serializer.is_valid(raise_exception=True)
            serializer.save()
            return Response(serializer.data)
        
        return Response(ForumPostSerializer(post).data)
    
    @track_performance
    def destroy(self, request, pk=None):
        """Delete a forum post (soft delete, author or admin only)"""
        try:
            post = ForumPost.objects.get(pk=pk, is_deleted=False)
        except ForumPost.DoesNotExist:
            return create_error_response(
                'Post not found',
                code=ErrorCodes.NOT_FOUND,
                status_code=status.HTTP_404_NOT_FOUND
            )
        
        # Check permissions
        if post.author != request.user and not request.user.is_staff:
            return create_error_response(
                'Not authorized to delete this post',
                code=ErrorCodes.PERMISSION_DENIED,
                status_code=status.HTTP_403_FORBIDDEN
            )
        
        # Soft delete
        post.is_deleted = True
        post.save(update_fields=['is_deleted'])
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=['post'], url_path='report', throttle_classes=[ConfirmationThrottle])
    @track_performance
    def report(self, request, pk=None):
        """Report a forum post/reply for moderation."""
        try:
            post = ForumPost.objects.select_related('topic', 'author').get(pk=pk, topic__category__is_active=True)
        except ForumPost.DoesNotExist:
            return create_error_response(
                'Post not found',
                code=ErrorCodes.NOT_FOUND,
                status_code=status.HTTP_404_NOT_FOUND,
            )

        if post.author_id == request.user.id:
            return create_error_response(
                'You cannot report your own post',
                code=ErrorCodes.VALIDATION_ERROR,
                status_code=status.HTTP_400_BAD_REQUEST,
            )

        report_type = request.data.get('type', 'inappropriate_content')
        if report_type not in dict(Report.TYPE_CHOICES):
            return create_error_response(
                'Invalid report type.',
                code=ErrorCodes.VALIDATION_ERROR,
                status_code=status.HTTP_400_BAD_REQUEST,
            )

        description = (request.data.get('description') or '').strip()
        if not description:
            description = f"Forum post report in topic '{post.topic.title}'"

        report = Report.objects.create(
            reporter=request.user,
            reported_user=post.author,
            reported_forum_topic=post.topic,
            reported_forum_post=post,
            type=report_type,
            description=description,
        )

        admins = User.objects.filter(role='admin', is_active=True)
        for admin in admins:
            create_notification(
                user=admin,
                notification_type='admin_warning',
                title='New Forum Post Report',
                message=f"{request.user.first_name or request.user.email} reported content in '{post.topic.title}'.",
            )

        return Response(ReportSerializer(report).data, status=status.HTTP_201_CREATED)