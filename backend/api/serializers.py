# api/serializers.py

from rest_framework import serializers
from .models import (
    User, Service, Tag, Handshake, ChatMessage, 
    Notification, ReputationRep, Badge, UserBadge, Report, TransactionHistory,
    ChatRoom, PublicChatMessage, Comment, NegativeRep, AdminAuditLog,
    ForumCategory, ForumTopic, ForumPost, ServiceMedia
)
from django.contrib.auth.hashers import make_password
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from decimal import Decimal
import bleach
import re
import logging
import math
import json
from drf_spectacular.utils import extend_schema_field, extend_schema_serializer, OpenApiExample
from drf_spectacular.types import OpenApiTypes

logger = logging.getLogger(__name__)


@extend_schema_serializer(
    examples=[
        OpenApiExample(
            'User Summary Example',
            value={
                'id': '123e4567-e89b-12d3-a456-426614174000',
                'email': 'john.doe@example.com',
                'first_name': 'John',
                'last_name': 'Doe',
                'bio': 'Experienced web developer passionate about helping others',
                'avatar_url': 'https://example.com/avatars/john.jpg',
                'banner_url': 'https://example.com/banners/john.jpg',
                'timebank_balance': 8.5,
                'karma_score': 42,
                'date_joined': '2024-01-01T12:00:00Z',
                'badges': ['punctual_pro', 'helpful_hero'],
                'featured_badge': 'punctual_pro'
            },
            response_only=True
        )
    ]
)
class UserSummarySerializer(serializers.ModelSerializer):
    """
    Reusable serializer for user summary information
    Used in nested serializations to avoid circular references
    """
    badges = serializers.SerializerMethodField()
    featured_badge = serializers.SerializerMethodField()
    
    class Meta:
        model = User
        fields = [
            'id', 'email', 'first_name', 'last_name', 'bio',
            'avatar_url', 'banner_url', 'timebank_balance', 'karma_score',
            'role', 'date_joined', 'badges', 'featured_badge', 'featured_achievement_id'
        ]
        read_only_fields = fields
    
    @extend_schema_field(OpenApiTypes.OBJECT)
    def get_badges(self, obj):
        """Return list of badge IDs - uses prefetched data when available"""
        try:
            if hasattr(obj, '_prefetched_objects_cache') and 'badges' in obj._prefetched_objects_cache:
                user_badges = [ub for ub in obj._prefetched_objects_cache['badges'] if getattr(ub, 'badge', None)]
                user_badges.sort(key=lambda ub: ub.earned_at.timestamp() if getattr(ub, 'earned_at', None) else 0, reverse=True)
                return [ub.badge.id for ub in user_badges]
        except (AttributeError, KeyError):
            pass
        try:
            user_badges = obj.badges.select_related('badge').order_by('-earned_at')
            return [ub.badge.id for ub in user_badges if getattr(ub, 'badge', None)]
        except (AttributeError, Exception):
            return []

    @extend_schema_field(OpenApiTypes.STR)
    def get_featured_badge(self, obj):
        """Return the latest earned badge ID (legacy featured selection removed)."""
        badges = self.get_badges(obj)
        return badges[0] if badges else None

class AdminUserListSerializer(serializers.ModelSerializer):
    """Simplified serializer for admin user list view"""
    class Meta:
        model = User
        fields = [
            'id', 'email', 'first_name', 'last_name', 
            'timebank_balance', 'karma_score', 'role', 
            'is_active', 'date_joined'
        ]
        read_only_fields = fields


class AdminCommentSerializer(serializers.ModelSerializer):
    """Serializer used by admin comment moderation endpoints."""
    user_id = serializers.UUIDField(source='user.id', read_only=True)
    user_name = serializers.SerializerMethodField()
    service_title = serializers.CharField(source='service.title', read_only=True)
    parent_id = serializers.UUIDField(source='parent.id', read_only=True, allow_null=True)
    status = serializers.SerializerMethodField()

    class Meta:
        model = Comment
        fields = [
            'id',
            'service',
            'service_title',
            'user_id',
            'user_name',
            'parent_id',
            'body',
            'is_deleted',
            'status',
            'is_verified_review',
            'related_handshake',
            'created_at',
            'updated_at',
        ]
        read_only_fields = fields

    @extend_schema_field(OpenApiTypes.STR)
    def get_user_name(self, obj):
        return f"{obj.user.first_name} {obj.user.last_name}".strip() or obj.user.email

    @extend_schema_field(OpenApiTypes.STR)
    def get_status(self, obj):
        return 'removed' if obj.is_deleted else 'active'
    
@extend_schema_serializer(
    examples=[
        OpenApiExample(
            'Tag Example',
            value={
                'id': 'programming',
                'name': 'Programming',
                'wikidata_info': {
                    'label': 'Programming',
                    'description': 'Process of writing computer programs'
                }
            },
            response_only=True
        )
    ]
)
class TagSerializer(serializers.ModelSerializer):
    wikidata_info = serializers.SerializerMethodField()
    
    class Meta:
        model = Tag
        fields = ['id', 'name', 'wikidata_info']
    
    @extend_schema_field(OpenApiTypes.OBJECT)
    def get_wikidata_info(self, obj):
        """Fetch Wikidata information for the tag if it has a Wikidata ID"""
        if obj.id and obj.id.startswith('Q'):
            try:
                from .wikidata import fetch_wikidata_item
                return fetch_wikidata_item(obj.id)
            except Exception:
                return None
        return None

    def to_representation(self, instance):
        data = super().to_representation(instance)
        wikidata_info = data.get('wikidata_info')
        if (
            data.get('name') == data.get('id')
            and isinstance(wikidata_info, dict)
            and wikidata_info.get('label')
        ):
            data['name'] = wikidata_info['label']
        return data

class ServiceMediaSerializer(serializers.ModelSerializer):
    file_url = serializers.SerializerMethodField()
    image = serializers.SerializerMethodField()
    
    class Meta:
        model = ServiceMedia
        fields = ['id', 'media_type', 'file_url', 'file', 'image', 'display_order', 'created_at']
        read_only_fields = ['id', 'created_at']
    
    @extend_schema_field(OpenApiTypes.STR)
    def get_file_url(self, obj):
        """Return file URL - prefer file_url field, fallback to file field URL"""
        if obj.file_url:
            return obj.file_url
        if obj.file:
            request = self.context.get('request')
            if request:
                return request.build_absolute_uri(obj.file.url)
            return obj.file.url
        return None
    
    @extend_schema_field(OpenApiTypes.STR)
    def get_image(self, obj):
        """Return image URL for convenience (same as file_url for images)"""
        if obj.media_type == 'image':
            return self.get_file_url(obj)
        return None
    
    def validate_file(self, value):
        """Validate uploaded file type and size"""
        if value:
            # Check file size (50MB limit)
            max_size = 50 * 1024 * 1024  # 50MB
            if value.size > max_size:
                raise serializers.ValidationError('File size cannot exceed 50MB')
            
            # Get file extension
            import os
            ext = os.path.splitext(value.name)[1].lower()
            
            # Allowed extensions based on media_type
            # This will be validated in the view when media_type is provided
            allowed_image_exts = ['.jpg', '.jpeg', '.png', '.gif', '.webp']
            allowed_video_exts = ['.mp4', '.webm', '.ogg']
            
            if ext not in allowed_image_exts + allowed_video_exts:
                raise serializers.ValidationError(
                    f'Invalid file type. Allowed: {", ".join(allowed_image_exts + allowed_video_exts)}'
                )
        return value
    
    def validate_file_url(self, value):
        """Validate file URL format"""
        if value:
            # Must be a valid URL (http/https) or data URL
            if not (value.startswith(('http://', 'https://', 'data:'))):
                raise serializers.ValidationError(
                    'File URL must be a valid HTTP/HTTPS URL or data URL'
                )
        return value

@extend_schema_serializer(
    examples=[
        OpenApiExample(
            'Service Offer Example',
            value={
                'id': '123e4567-e89b-12d3-a456-426614174001',
                'title': 'Web Development Help',
                'description': 'I can help with React, Django, and database design',
                'type': 'Offer',
                'duration': 2.5,
                'location_type': 'remote',
                'location_area': 'San Francisco Bay Area',
                'location_lat': None,
                'location_lng': None,
                'status': 'Active',
                'max_participants': 1,
                'schedule_type': 'flexible',
                'schedule_details': 'Weekday evenings preferred',
                'created_at': '2024-01-01T12:00:00Z',
                'user': {
                    'id': '123e4567-e89b-12d3-a456-426614174000',
                    'first_name': 'John',
                    'last_name': 'Doe',
                    'avatar_url': 'https://example.com/avatars/john.jpg',
                    'badges': ['punctual_pro']
                },
                'tags': [
                    {'id': 'programming', 'name': 'Programming'},
                    {'id': 'web_development', 'name': 'Web Development'}
                ]
            },
            response_only=True
        ),
        OpenApiExample(
            'Create Service Request',
            value={
                'title': 'Web Development Help',
                'description': 'I can help with React, Django, and database design',
                'type': 'Offer',
                'duration': 2.5,
                'location_type': 'remote',
                'location_area': 'San Francisco Bay Area',
                'max_participants': 1,
                'schedule_type': 'flexible',
                'schedule_details': 'Weekday evenings preferred',
                'tag_names': ['Programming', 'Web Development']
            },
            request_only=True
        )
    ]
)
def _fuzzy_coords(service_id: str, lat: float, lng: float):
    """
    Apply a deterministic ~1 km privacy offset to a service's real coordinates.

    Uses FNV-1a hash of the service ID — same algorithm as the frontend's
    idFuzzyOffset() in MapView.tsx — so the position is consistent across
    renders without exposing the exact location in the API response.

    1 km ≈ 0.009° latitude at Istanbul's latitude (~41°N).
    """
    h = 2166136261
    for ch in service_id:
        h ^= ord(ch)
        h = (h * 16777619) & 0xFFFFFFFF   # unsigned 32-bit, matches JS Math.imul + >>> 0

    angle = (h / 0xFFFFFFFF) * 2 * math.pi
    R = 0.0045   # ~0.5 km privacy offset radius
    return lat + R * math.sin(angle), lng + R * math.cos(angle)


class ServiceSerializer(serializers.ModelSerializer):
    class ListOrSingleValueField(serializers.ListField):
        """Accept either a list value or a single scalar value."""

        def to_internal_value(self, data):
            if data is None:
                return super().to_internal_value(data)

            if not isinstance(data, list):
                data = [data]

            return super().to_internal_value(data)

    tags = TagSerializer(many=True, required=False, read_only=True)
    tag_ids = ListOrSingleValueField(
        child=serializers.CharField(),
        write_only=True,
        required=False
    )
    tag_names = ListOrSingleValueField(
        child=serializers.CharField(),
        write_only=True,
        required=False
    )
    wikidata_labels_json = serializers.CharField(write_only=True, required=False, allow_blank=True)
    media = ServiceMediaSerializer(many=True, required=False, read_only=True)
    
    user = serializers.SerializerMethodField()
    description = serializers.CharField(max_length=5000)
    title = serializers.CharField(max_length=200)
    comment_count = serializers.SerializerMethodField()
    hot_score = serializers.FloatField(read_only=True)
    participant_count = serializers.SerializerMethodField()
    event_evaluation_summary = serializers.SerializerMethodField()
    circle_lat = serializers.SerializerMethodField()
    circle_lng = serializers.SerializerMethodField()

    class Meta:
        model = Service
        fields = [
            'id', 'user', 'title', 'description', 'type', 'duration',
            'location_type', 'location_area', 'location_lat', 'location_lng',
            'circle_lat', 'circle_lng',
            'status', 'max_participants', 'schedule_type',
            'schedule_details', 'scheduled_time', 'created_at', 'tags', 'tag_ids', 'tag_names', 'wikidata_labels_json', 'comment_count', 'hot_score',
            'is_visible', 'media', 'participant_count', 'event_evaluation_summary',
        ]
        read_only_fields = ['user', 'hot_score', 'is_visible']
    
    @extend_schema_field(OpenApiTypes.INT)
    def get_comment_count(self, obj):
        """Return the count of non-deleted comments on this service"""
        # Use annotated value from list queryset to avoid N+1
        if hasattr(obj, 'comment_count'):
            return obj.comment_count
        if hasattr(obj, '_prefetched_objects_cache') and 'comments' in obj._prefetched_objects_cache:
            return len([c for c in obj.comments.all() if not c.is_deleted])
        return obj.comments.filter(is_deleted=False).count()

    @extend_schema_field(OpenApiTypes.INT)
    def get_participant_count(self, obj):
        """Count handshakes consuming a capacity slot, using prefetched data when available.

        Mirrors HandshakeService._capacity_statuses — pending never counts:
          One-Time  → accepted, completed, reported, paused
          Recurrent → accepted, reported, paused  (completed frees the slot)
          Event     → accepted, checked_in, attended, no_show  (credit-free lifecycle)
        """
        event_statuses = {'accepted', 'checked_in', 'attended', 'no_show'}
        one_time_statuses = {'accepted', 'completed', 'reported', 'paused'}
        recurrent_statuses = {'accepted', 'reported', 'paused'}

        if obj.type == 'Event':
            capacity_statuses = event_statuses
        elif obj.schedule_type == 'One-Time':
            capacity_statuses = one_time_statuses
        else:
            capacity_statuses = recurrent_statuses

        # Use prefetched handshakes to avoid N+1 on list endpoints
        if hasattr(obj, 'capacity_handshakes'):
            return sum(1 for h in obj.capacity_handshakes if h.status in capacity_statuses)

        return Handshake.objects.filter(service=obj, status__in=capacity_statuses).count()

    def validate_title(self, value):
        """Sanitize and validate title"""
        if not value or not value.strip():
            raise serializers.ValidationError('Title cannot be empty')
        cleaned = bleach.clean(value, tags=[], strip=True).strip()
        if len(cleaned) < 3:
            raise serializers.ValidationError('Title must be at least 3 characters')
        if len(cleaned) > 200:
            raise serializers.ValidationError('Title cannot exceed 200 characters')
        return cleaned
    
    def validate_description(self, value):
        """Sanitize and validate description"""
        if not value or not value.strip():
            raise serializers.ValidationError('Description cannot be empty')
        cleaned = bleach.clean(value, tags=[], strip=True).strip()
        if len(cleaned) < 10:
            raise serializers.ValidationError('Description must be at least 10 characters')
        if len(cleaned) > 5000:
            raise serializers.ValidationError('Description cannot exceed 5000 characters')
        return cleaned
    
    def validate_location_lat(self, value):
        """Validate latitude is within valid range (-90 to 90)"""
        if value is not None:
            if value < -90 or value > 90:
                raise serializers.ValidationError('Latitude must be between -90 and 90')
        return value
    
    def validate_location_lng(self, value):
        """Validate longitude is within valid range (-180 to 180)"""
        if value is not None:
            if value < -180 or value > 180:
                raise serializers.ValidationError('Longitude must be between -180 and 180')
        return value
    
    def validate_duration(self, value):
        """Validate that duration is positive"""
        if value <= 0:
            raise serializers.ValidationError('Duration must be greater than 0')
        if value > 1000:  # Reasonable upper limit
            raise serializers.ValidationError('Duration cannot exceed 1000 hours')
        return value
    
    def validate_max_participants(self, value):
        """Validate that max_participants is positive"""
        if value <= 0:
            raise serializers.ValidationError('Max participants must be greater than 0')
        if value > 100:  # Reasonable upper limit
            raise serializers.ValidationError('Max participants cannot exceed 100')
        return value

    @extend_schema_field(UserSummarySerializer)
    def get_user(self, obj):
        """Return user details without nested services to avoid circular reference"""
        return UserSummarySerializer(obj.user).data

    @extend_schema_field(OpenApiTypes.OBJECT)
    def get_event_evaluation_summary(self, obj):
        if obj.type != 'Event':
            return None
        summary = getattr(obj, 'event_evaluation_summary', None)
        if summary is None:
            return None
        total_feedback = summary.positive_feedback_count + summary.negative_feedback_count
        if total_feedback > 0:
            avg_well_organized = summary.punctual_count / total_feedback
            avg_engaging = summary.helpful_count / total_feedback
            avg_welcoming = summary.kind_count / total_feedback
            avg_disorganized = summary.late_count / total_feedback
            avg_boring = summary.unhelpful_count / total_feedback
            avg_unwelcoming = summary.rude_count / total_feedback
        else:
            avg_well_organized = 0.0
            avg_engaging = 0.0
            avg_welcoming = 0.0
            avg_disorganized = 0.0
            avg_boring = 0.0
            avg_unwelcoming = 0.0

        return {
            'total_attended': summary.total_attended,
            'positive_feedback_count': summary.positive_feedback_count,
            'negative_feedback_count': summary.negative_feedback_count,
            'unique_evaluator_count': summary.unique_evaluator_count,
            'positive_score_total': summary.positive_score_total,
            'negative_score_total': summary.negative_score_total,
            'well_organized_count': summary.punctual_count,
            'engaging_count': summary.helpful_count,
            'welcoming_count': summary.kind_count,
            'disorganized_count': summary.late_count,
            'boring_count': summary.unhelpful_count,
            'unwelcoming_count': summary.rude_count,
            'well_organized_average': round(avg_well_organized, 6),
            'engaging_average': round(avg_engaging, 6),
            'welcoming_average': round(avg_welcoming, 6),
            'disorganized_average': round(avg_disorganized, 6),
            'boring_average': round(avg_boring, 6),
            'unwelcoming_average': round(avg_unwelcoming, 6),
            'organizer_event_hot_score': round(float(getattr(obj.user, 'event_hot_score', 0.0) or 0.0), 6),
            'feedback_submission_count': total_feedback,
            'updated_at': summary.updated_at,
        }

    def _real_coords(self, obj):
        """Return (lat, lng) from the stored model instance, or (None, None)."""
        try:
            if obj.location_lat is None or obj.location_lng is None:
                return None, None
            return float(obj.location_lat), float(obj.location_lng)
        except (TypeError, ValueError):
            return None, None

    @extend_schema_field(OpenApiTypes.FLOAT)
    def get_circle_lat(self, obj):
        """Visual circle centre latitude — independent ~1 km offset, seed '_c'."""
        if obj.location_type != 'In-Person':
            return None
        lat, lng = self._real_coords(obj)
        if lat is None:
            return None
        c_lat, _ = _fuzzy_coords(str(obj.id) + '_c', lat, lng)
        return round(c_lat, 6)

    @extend_schema_field(OpenApiTypes.FLOAT)
    def get_circle_lng(self, obj):
        """Visual circle centre longitude — independent ~1 km offset, seed '_c'."""
        if obj.location_type != 'In-Person':
            return None
        lat, lng = self._real_coords(obj)
        if lat is None:
            return None
        _, c_lng = _fuzzy_coords(str(obj.id) + '_c', lat, lng)
        return round(c_lng, 6)

    def to_representation(self, instance):
        """Replace exact coordinates with a ~1 km privacy-fuzzed version before sending."""
        data = super().to_representation(instance)
        if instance.location_type == 'In-Person':
            lat, lng = self._real_coords(instance)
            if lat is not None:
                fuzzy_lat, fuzzy_lng = _fuzzy_coords(str(instance.id), lat, lng)
                data['location_lat'] = round(fuzzy_lat, 6)
                data['location_lng'] = round(fuzzy_lng, 6)
        return data

    def create(self, validated_data):
        # Description is already sanitized in validate_description
        # No need to sanitize again here
        
        # Extract tag_ids and tag_names if provided
        tag_ids = validated_data.pop('tag_ids', [])
        tag_names = validated_data.pop('tag_names', [])
        wikidata_labels_json = validated_data.pop('wikidata_labels_json', '')

        wikidata_labels = {}
        if wikidata_labels_json:
            try:
                decoded = json.loads(wikidata_labels_json)
                if isinstance(decoded, dict):
                    for raw_qid, raw_label in decoded.items():
                        qid = str(raw_qid).strip().upper()
                        label = str(raw_label).strip()[:100]
                        if re.match(r'^Q\d+$', qid, re.IGNORECASE) and label:
                            wikidata_labels[qid] = label
            except (TypeError, ValueError, json.JSONDecodeError):
                wikidata_labels = {}
        
        # Extract media payload if provided.
        # Backward-compatible:
        # - legacy: media: ["data:image/...", ...]
        # - new: media: [{"media_type":"video","file_url":"https://..."}, ...]
        request = self.context.get('request')
        media_payload = []
        if request is not None and hasattr(request, 'data'):
            media_payload = request.data.get('media', [])
        if not isinstance(media_payload, list):
            media_payload = []
        
        # Handle location coordinates if provided (convert from string/float to Decimal, round to 6 decimal places)
        if 'location_lat' in validated_data and validated_data['location_lat']:
            from decimal import Decimal, ROUND_HALF_UP
            try:
                lat_value = validated_data['location_lat']
                if isinstance(lat_value, str):
                    lat_decimal = Decimal(lat_value)
                elif isinstance(lat_value, (int, float)):
                    lat_decimal = Decimal(str(lat_value))
                else:
                    lat_decimal = lat_value
                
                # Round to 6 decimal places to match max_digits=9, decimal_places=6
                # This ensures no more than 9 total digits (3 before + 6 after decimal = 9 max)
                validated_data['location_lat'] = lat_decimal.quantize(Decimal('0.000001'), rounding=ROUND_HALF_UP)
            except (ValueError, TypeError, Exception):
                validated_data.pop('location_lat', None)
        
        if 'location_lng' in validated_data and validated_data['location_lng']:
            from decimal import Decimal, ROUND_HALF_UP
            try:
                lng_value = validated_data['location_lng']
                if isinstance(lng_value, str):
                    lng_decimal = Decimal(lng_value)
                elif isinstance(lng_value, (int, float)):
                    lng_decimal = Decimal(str(lng_value))
                else:
                    lng_decimal = lng_value
                
                # Round to 6 decimal places to match max_digits=9, decimal_places=6
                validated_data['location_lng'] = lng_decimal.quantize(Decimal('0.000001'), rounding=ROUND_HALF_UP)
            except (ValueError, TypeError, Exception):
                validated_data.pop('location_lng', None)
        
        # Prefer explicit user passed via serializer.save(user=...)
        if 'user' not in validated_data:
            if request is None or not hasattr(request, 'user'):
                raise serializers.ValidationError({'user': 'User is required'})
            validated_data['user'] = request.user
        service = super().create(validated_data)
        
        # Collect all tags to add
        tags_to_add = []
        
        # Add tags by ID (including auto-creation for Wikidata QIDs)
        if tag_ids:
            # First, get all existing tags
            existing_tags = {tag.id: tag for tag in Tag.objects.filter(id__in=tag_ids)}
            tags_to_add.extend(existing_tags.values())

            # If a previously auto-created Wikidata tag still has fallback name=QID,
            # try to backfill a human-readable label.
            wikidata_qid_pattern = re.compile(r'^Q\d+$', re.IGNORECASE)
            stale_qid_tags = [
                tag for tid, tag in existing_tags.items()
                if wikidata_qid_pattern.match(tid)
                and (tag.name or '').strip().upper() == tid.upper()
            ]
            if stale_qid_tags:
                from .wikidata import fetch_wikidata_item

                for stale_tag in stale_qid_tags:
                    label = wikidata_labels.get(stale_tag.id.upper())
                    if not label:
                        wikidata_info = fetch_wikidata_item(stale_tag.id.upper())
                        label = (wikidata_info or {}).get('label')
                    if not label:
                        continue
                    label = label.strip()[:100]
                    if not label:
                        continue
                    duplicate_name_exists = Tag.objects.filter(name__iexact=label).exclude(id=stale_tag.id).exists()
                    if duplicate_name_exists:
                        continue
                    stale_tag.name = label
                    stale_tag.save(update_fields=['name'])
            
            # Find Wikidata QIDs that don't exist in database
            missing_qids = [
                tid for tid in tag_ids 
                if tid not in existing_tags and wikidata_qid_pattern.match(tid)
            ]
            
            # Auto-create tags for missing Wikidata QIDs
            if missing_qids:
                from .wikidata import fetch_wikidata_item
                
                for qid in missing_qids:
                    # Normalize QID to uppercase (e.g., q28865 -> Q28865)
                    normalized_qid = qid.upper()
                    
                    # Check if normalized version exists (in case of case mismatch)
                    if normalized_qid in existing_tags:
                        continue

                    # Prefer frontend-provided label, then fetch from Wikidata
                    label_from_form = wikidata_labels.get(normalized_qid)
                    if label_from_form:
                        tag_name = label_from_form
                    else:
                        wikidata_info = fetch_wikidata_item(normalized_qid)
                        if wikidata_info and wikidata_info.get('label'):
                            tag_name = wikidata_info['label']
                        else:
                        # Fallback: use the QID as name if Wikidata fetch fails
                            tag_name = normalized_qid
                            logger.warning(f"Could not fetch Wikidata info for {normalized_qid}, using QID as name")
                    
                    # Create the tag (use get_or_create to handle race conditions)
                    tag, created = Tag.objects.get_or_create(
                        id=normalized_qid,
                        defaults={'name': tag_name}
                    )
                    if tag not in tags_to_add:
                        tags_to_add.append(tag)
                    
                    if created:
                        logger.info(f"Auto-created Wikidata tag: {normalized_qid} ({tag_name})")
        
        # Create or get tags by name
        if tag_names:
            for tag_name in tag_names:
                if tag_name and tag_name.strip():
                    tag_name_clean = tag_name.strip()
                    # Try to get existing tag (case-insensitive search)
                    try:
                        tag = Tag.objects.get(name__iexact=tag_name_clean)
                    except Tag.DoesNotExist:
                        # Create new tag - generate a unique ID from the name
                        import uuid
                        tag_id = tag_name_clean.lower().replace(' ', '_').replace('-', '_')[:200]
                        if Tag.objects.filter(id=tag_id).exists():
                            tag_id = f"{tag_id}_{str(uuid.uuid4())[:8]}"
                        tag = Tag.objects.create(
                            id=tag_id,
                            name=tag_name_clean
                        )
                    if tag not in tags_to_add:
                        tags_to_add.append(tag)
        
        # Set all tags
        if tags_to_add:
            service.tags.set(tags_to_add)
        
        # Create ServiceMedia objects
        if media_payload:
            from .models import ServiceMedia
            import base64
            from django.core.files.base import ContentFile

            allowed_media_types = {'image', 'video'}
            max_media_items = 5

            def _create_image_from_data_url(data_url: str, display_order: int) -> None:
                # Parse data URL (format: data:image/png;base64,...)
                if not data_url.startswith('data:'):
                    return
                header, encoded = data_url.split(',', 1)
                mime_type = header.split(';')[0].split(':')[1]
                if not mime_type.startswith('image/'):
                    return

                image_data = base64.b64decode(encoded)
                ext_map = {
                    'image/jpeg': 'jpg',
                    'image/jpg': 'jpg',
                    'image/png': 'png',
                    'image/gif': 'gif',
                    'image/webp': 'webp'
                }
                ext = ext_map.get(mime_type, 'jpg')
                file_name = f"service_{service.id}_{display_order}.{ext}"
                ServiceMedia.objects.create(
                    service=service,
                    media_type='image',
                    file=ContentFile(image_data, name=file_name),
                    display_order=display_order
                )

            for idx, item in enumerate(media_payload[:max_media_items]):
                if not item:
                    continue

                # Legacy: list of image data URLs
                if isinstance(item, str):
                    try:
                        _create_image_from_data_url(item, idx)
                    except Exception as e:
                        # Log error but don't fail service creation
                        logger.warning(f"Failed to create service image from data URL: {e}")
                    continue

                # New format: dict objects
                if isinstance(item, dict):
                    media_type = (item.get('media_type') or 'image').strip().lower()
                    if media_type not in allowed_media_types:
                        raise serializers.ValidationError({'media': f"Invalid media_type '{media_type}'"})

                    file_url = item.get('file_url')
                    if not isinstance(file_url, str) or not file_url.strip():
                        raise serializers.ValidationError({'media': 'Each media item must include a non-empty file_url'})
                    file_url = file_url.strip()

                    if media_type == 'video':
                        if not file_url.startswith(('http://', 'https://')):
                            raise serializers.ValidationError({'media': 'Video file_url must be an HTTP/HTTPS URL'})

                        # Limit service videos to YouTube/Vimeo for consistent embedding support.
                        youtube_pattern = r'(youtube\.com|youtu\.be)'
                        vimeo_pattern = r'vimeo\.com'
                        if not (re.search(youtube_pattern, file_url, re.IGNORECASE) or re.search(vimeo_pattern, file_url, re.IGNORECASE)):
                            raise serializers.ValidationError({'media': 'Only YouTube or Vimeo URLs are supported for service videos'})
                        ServiceMedia.objects.create(
                            service=service,
                            media_type='video',
                            file_url=file_url,
                            display_order=idx
                        )
                    else:
                        # For images, accept either a data URL (decode) or an external URL.
                        try:
                            if file_url.startswith('data:'):
                                _create_image_from_data_url(file_url, idx)
                            else:
                                ServiceMedia.objects.create(
                                    service=service,
                                    media_type='image',
                                    file_url=file_url,
                                    display_order=idx
                                )
                        except Exception as e:
                            logger.warning(f"Failed to create service image media: {e}")
                    continue

                # Unknown item shape
                raise serializers.ValidationError({'media': 'Media must be a list of strings (data URLs) or objects'})
        
        return service
    
    def update(self, instance, validated_data):
        # Description is already sanitized in validate_description
        # No need to sanitize again here
        return super().update(instance, validated_data)

@extend_schema_serializer(
    examples=[
        OpenApiExample(
            'Registration Request',
            value={
                'email': 'john.doe@example.com',
                'password': 'SecurePassword123!',
                'first_name': 'John',
                'last_name': 'Doe'
            },
            request_only=True
        ),
        OpenApiExample(
            'Registration Response',
            value={
                'user_id': '123e4567-e89b-12d3-a456-426614174000',
                'name': 'John Doe',
                'balance': 1.0,
                'token': 'eyJ0eXAiOiJKV1QiLCJhbGc...',
                'access': 'eyJ0eXAiOiJKV1QiLCJhbGc...',
                'refresh': 'eyJ0eXAiOiJKV1QiLCJhbGc...',
                'user': {
                    'id': '123e4567-e89b-12d3-a456-426614174000',
                    'email': 'john.doe@example.com',
                    'first_name': 'John',
                    'last_name': 'Doe',
                    'timebank_balance': 1.0,
                    'karma_score': 0
                }
            },
            response_only=True
        )
    ]
)
class UserRegistrationSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ['email', 'password', 'first_name', 'last_name']
        extra_kwargs = {'password': {'write_only': True}}

    def validate_password(self, value):
        try:
            validate_password(value)
        except DjangoValidationError as exc:
            raise serializers.ValidationError(list(exc.messages))
        return value

    def create(self, validated_data):
        validated_data['password'] = make_password(validated_data['password'])
        validated_data.setdefault('timebank_balance', Decimal('3.00'))
        return super().create(validated_data)

class UserProfileSerializer(serializers.ModelSerializer):
    services = ServiceSerializer(many=True, read_only=True)
    
    punctual_count = serializers.IntegerField(read_only=True)
    helpful_count = serializers.IntegerField(read_only=True)
    kind_count = serializers.IntegerField(read_only=True)
    achievements = serializers.SerializerMethodField()
    badges = serializers.SerializerMethodField()  # Deprecated: use achievements instead
    bio = serializers.CharField(max_length=1000, allow_blank=True, required=False)
    first_name = serializers.CharField(max_length=150, required=False, allow_blank=True)
    last_name = serializers.CharField(max_length=150, required=False, allow_blank=True)
    location = serializers.CharField(max_length=200, allow_blank=True, required=False, allow_null=True)
    avatar_url = serializers.CharField(allow_blank=True, required=False)
    banner_url = serializers.CharField(allow_blank=True, required=False)
    video_intro_url = serializers.CharField(allow_blank=True, required=False, allow_null=True)
    portfolio_images = serializers.JSONField(required=False, default=list)
    show_history = serializers.BooleanField(required=False, default=True)
    video_intro_file_url = serializers.SerializerMethodField()

    # Skills: read as tag objects, write as list of tag IDs or new tag names
    skills = serializers.SerializerMethodField()
    skill_ids = serializers.ListField(
        child=serializers.CharField(allow_blank=True), write_only=True, required=False
    )

    class Meta:
        model = User
        fields = [
            'id', 'email', 'first_name', 'last_name', 'bio', 'location',
            'avatar_url', 'banner_url', 'timebank_balance', 'karma_score', 'role', 'services',
            'punctual_count', 'helpful_count', 'kind_count', 'achievements', 'badges', 'date_joined',
            'video_intro_url', 'video_intro_file', 'video_intro_file_url',
            'portfolio_images', 'show_history', 'featured_achievement_id',
            'is_onboarded', 'is_verified',
            'skills', 'skill_ids',
        ]
        read_only_fields = [
            'id', 'email', 'timebank_balance', 'karma_score', 'role', 'services',
            'punctual_count', 'helpful_count', 'kind_count', 'achievements', 'badges', 'date_joined',
            'video_intro_file_url', 'featured_achievement_id', 'is_verified',
            'skills',
        ]
        extra_kwargs = {
            'video_intro_file': {'write_only': True, 'required': False}
        }

    def get_skills(self, obj):
        return [{'id': str(t.id), 'name': t.name} for t in obj.skills.all()]
    
    @extend_schema_field(OpenApiTypes.STR)
    def get_video_intro_file_url(self, obj):
        """Return full URL for uploaded video intro file"""
        if obj.video_intro_file:
            request = self.context.get('request')
            if request:
                return request.build_absolute_uri(obj.video_intro_file.url)
            return obj.video_intro_file.url
        return None
    
    def validate_avatar_url(self, value):
        """Validate avatar URL format - allow data URLs for file uploads and regular URLs"""
        if value and not (value.startswith(('http://', 'https://', 'data:', '/'))):
            raise serializers.ValidationError('Avatar must be a valid URL or data URL (for uploaded images)')
        return value
    
    def validate_banner_url(self, value):
        """Validate banner URL format - allow data URLs for file uploads and regular URLs"""
        if value and not (value.startswith(('http://', 'https://', 'data:', '/'))):
            raise serializers.ValidationError('Banner must be a valid URL or data URL (for uploaded images)')
        return value
    
    def validate_bio(self, value):
        """Sanitize and validate bio"""
        if value:
            cleaned = bleach.clean(value, tags=[], strip=True).strip()
            if len(cleaned) > 1000:
                raise serializers.ValidationError('Bio must be 1000 characters or less')
            return cleaned
        return value
    
    def validate_first_name(self, value):
        """Sanitize and validate first name"""
        if value:
            cleaned = bleach.clean(value, tags=[], strip=True).strip()
            if len(cleaned) < 1:
                raise serializers.ValidationError('First name cannot be empty')
            if len(cleaned) > 150:
                raise serializers.ValidationError('First name cannot exceed 150 characters')
            return cleaned
        return value
    
    def validate_last_name(self, value):
        """Sanitize and validate last name"""
        if value:
            cleaned = bleach.clean(value, tags=[], strip=True).strip()
            if len(cleaned) < 1:
                raise serializers.ValidationError('Last name cannot be empty')
            if len(cleaned) > 150:
                raise serializers.ValidationError('Last name cannot exceed 150 characters')
            return cleaned
        return value
    
    def validate_video_intro_url(self, value):
        """Validate video intro URL - must be YouTube, Vimeo, or valid URL with safe scheme"""
        if value:
            # First, ensure URL starts with safe scheme to prevent XSS (e.g., javascript:)
            if not value.startswith(('http://', 'https://')):
                raise serializers.ValidationError(
                    'Video URL must start with http:// or https://'
                )
            # Then check if it's a recognized video platform or direct URL
            youtube_pattern = r'(youtube\.com|youtu\.be)'
            vimeo_pattern = r'vimeo\.com'
            if not (re.search(youtube_pattern, value) or re.search(vimeo_pattern, value)):
                # Allow any https URL as a direct video link
                pass  # URL scheme already validated above
        return value
    
    def validate_portfolio_images(self, value):
        """Validate portfolio images array - max 5 items with safe URL schemes"""
        if value:
            if len(value) > 5:
                raise serializers.ValidationError('Maximum 5 portfolio images allowed')
            # Validate each URL has a safe scheme (http/https/data only - no relative paths)
            for idx, url in enumerate(value):
                if url and not url.startswith(('http://', 'https://', 'data:')):
                    raise serializers.ValidationError(
                        f'Portfolio image {idx + 1} must be a valid URL (http://, https://, or data:)'
                    )
        return value

    @extend_schema_field(OpenApiTypes.OBJECT)
    def get_achievements(self, obj):
        """Return list of achievement IDs - uses prefetched data when available"""
        try:
            if hasattr(obj, '_prefetched_objects_cache') and 'badges' in obj._prefetched_objects_cache:
                user_badges = [ub for ub in obj._prefetched_objects_cache['badges'] if getattr(ub, 'badge', None)]
                user_badges.sort(key=lambda ub: ub.earned_at.timestamp() if getattr(ub, 'earned_at', None) else 0, reverse=True)
                return [ub.badge.id for ub in user_badges]
        except (AttributeError, KeyError):
            pass
        try:
            user_badges = obj.badges.select_related('badge').order_by('-earned_at')
            return [ub.badge.id for ub in user_badges if getattr(ub, 'badge', None)]
        except (AttributeError, Exception):
            return []
    
    @extend_schema_field(OpenApiTypes.OBJECT)
    def get_badges(self, obj):
        """Deprecated: use achievements instead. Return list of achievement IDs for backward compatibility."""
        return self.get_achievements(obj)

    def update(self, instance, validated_data):
        skill_ids = validated_data.pop('skill_ids', None)
        instance = super().update(instance, validated_data)
        if skill_ids is not None:
            import uuid as _uuid
            from .models import Tag as TagModel
            tags_to_set = []
            for raw_id in skill_ids:
                raw_id = str(raw_id).strip()
                if not raw_id:
                    continue
                # Tag.id is a CharField — works for UUID strings AND Wikidata QIDs (e.g. "Q5140297")
                tag = TagModel.objects.filter(id=raw_id).first()
                if tag is None:
                    # Not found by id → custom tag: strip "custom:" prefix, use name lookup
                    name = raw_id.replace('custom:', '').strip()
                    if name:
                        tag = TagModel.objects.filter(name__iexact=name).first()
                        if tag is None:
                            # Create with a proper UUID id so the pk is never empty
                            tag = TagModel.objects.create(id=str(_uuid.uuid4()), name=name)
                if tag:
                    tags_to_set.append(tag)
            instance.skills.set(tags_to_set)
        return instance

class PublicUserProfileSerializer(serializers.ModelSerializer):
    services = ServiceSerializer(many=True, read_only=True)
    punctual_count = serializers.IntegerField(read_only=True)
    helpful_count = serializers.IntegerField(read_only=True)
    kind_count = serializers.IntegerField(read_only=True)
    achievements = serializers.SerializerMethodField()
    badges = serializers.SerializerMethodField()  # Deprecated: use achievements instead
    video_intro_file_url = serializers.SerializerMethodField()
    skills = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            'id', 'first_name', 'last_name', 'bio', 'location', 'avatar_url',
            'banner_url', 'karma_score', 'services',
            'punctual_count', 'helpful_count', 'kind_count', 'achievements', 'badges', 'date_joined',
            'video_intro_url', 'video_intro_file_url', 'portfolio_images', 'show_history', 'skills',
        ]
        read_only_fields = [
            'id', 'first_name', 'last_name', 'bio', 'location', 'avatar_url',
            'banner_url', 'karma_score', 'services',
            'punctual_count', 'helpful_count', 'kind_count', 'achievements', 'badges', 'date_joined',
            'video_intro_url', 'video_intro_file_url', 'portfolio_images', 'show_history', 'skills',
        ]

    def get_skills(self, obj):
        return [{'id': str(t.id), 'name': t.name} for t in obj.skills.all()]

    @extend_schema_field(OpenApiTypes.STR)
    def get_video_intro_file_url(self, obj):
        """Return full URL for uploaded video intro file"""
        if obj.video_intro_file:
            request = self.context.get('request')
            if request:
                return request.build_absolute_uri(obj.video_intro_file.url)
            return obj.video_intro_file.url
        return None

    @extend_schema_field(OpenApiTypes.OBJECT)
    def get_achievements(self, obj):
        """Return list of achievement IDs - uses prefetched data when available"""
        try:
            if hasattr(obj, '_prefetched_objects_cache') and 'badges' in obj._prefetched_objects_cache:
                user_badges = [ub for ub in obj._prefetched_objects_cache['badges'] if getattr(ub, 'badge', None)]
                user_badges.sort(key=lambda ub: ub.earned_at.timestamp() if getattr(ub, 'earned_at', None) else 0, reverse=True)
                return [ub.badge.id for ub in user_badges]
        except (AttributeError, KeyError):
            pass
        try:
            user_badges = obj.badges.select_related('badge').order_by('-earned_at')
            return [ub.badge.id for ub in user_badges if getattr(ub, 'badge', None)]
        except (AttributeError, Exception):
            return []
    
    @extend_schema_field(OpenApiTypes.OBJECT)
    def get_badges(self, obj):
        """Deprecated: use achievements instead. Return list of achievement IDs for backward compatibility."""
        return self.get_achievements(obj)

# Handshake Serializers
@extend_schema_serializer(
    examples=[
        OpenApiExample(
            'Handshake Example',
            value={
                'id': '123e4567-e89b-12d3-a456-426614174002',
                'service': '123e4567-e89b-12d3-a456-426614174001',
                'service_title': 'Web Development Help',
                'requester': '123e4567-e89b-12d3-a456-426614174003',
                'requester_name': 'Jane Smith',
                'provider_name': 'John',
                'status': 'accepted',
                'provisioned_hours': 2.5,
                'provider_confirmed_complete': False,
                'receiver_confirmed_complete': False,
                'exact_location': '123 Main St, San Francisco, CA',
                'exact_duration': 2.5,
                'scheduled_time': '2024-12-25T14:00:00Z',
                'provider_initiated': True,
                'requester_initiated': True,
                'created_at': '2024-01-01T12:00:00Z',
                'updated_at': '2024-01-01T13:00:00Z'
            },
            response_only=True
        )
    ]
)
class HandshakeSerializer(serializers.ModelSerializer):
    service_title = serializers.CharField(source='service.title', read_only=True)
    requester_name = serializers.SerializerMethodField()
    provider_name = serializers.SerializerMethodField()
    user_has_reviewed = serializers.SerializerMethodField()

    class Meta:
        model = Handshake
        fields = [
            'id', 'service', 'service_title', 'requester', 'requester_name',
            'provider_name', 'status', 'provisioned_hours',
            'provider_confirmed_complete', 'receiver_confirmed_complete',
            'exact_location', 'exact_duration', 'scheduled_time',
            'provider_initiated', 'requester_initiated',
            'evaluation_window_starts_at', 'evaluation_window_ends_at', 'evaluation_window_closed_at',
            'user_has_reviewed',
            'created_at', 'updated_at'
        ]

    @extend_schema_field(OpenApiTypes.STR)
    def get_requester_name(self, obj):
        return f"{obj.requester.first_name} {obj.requester.last_name}".strip()
    
    @extend_schema_field(OpenApiTypes.STR)
    def get_provider_name(self, obj):
        from .utils import get_provider_and_receiver
        provider, _ = get_provider_and_receiver(obj)
        return f"{provider.first_name} {provider.last_name}".strip()

    @extend_schema_field(serializers.BooleanField())
    def get_user_has_reviewed(self, obj):
        request = self.context.get('request')
        if not request or not request.user.is_authenticated:
            return False
        if hasattr(obj, 'user_reps'):
            return len(obj.user_reps) > 0
        return ReputationRep.objects.filter(handshake=obj, giver=request.user).exists()

# Chat Message Serializers
@extend_schema_serializer(
    examples=[
        OpenApiExample(
            'Chat Message Example',
            value={
                'id': '123e4567-e89b-12d3-a456-426614174004',
                'handshake': '123e4567-e89b-12d3-a456-426614174002',
                'sender': '123e4567-e89b-12d3-a456-426614174000',
                'sender_id': '123e4567-e89b-12d3-a456-426614174000',
                'sender_name': 'John Doe',
                'sender_avatar_url': 'https://example.com/avatars/john.jpg',
                'body': 'Hello! When would be a good time to meet?',
                'created_at': '2024-01-01T12:00:00Z'
            },
            response_only=True
        ),
        OpenApiExample(
            'Send Message Request',
            value={
                'handshake_id': '123e4567-e89b-12d3-a456-426614174002',
                'body': 'Hello! When would be a good time to meet?'
            },
            request_only=True
        )
    ]
)
class ChatMessageSerializer(serializers.ModelSerializer):
    sender_name = serializers.SerializerMethodField()
    sender_avatar_url = serializers.SerializerMethodField()
    sender_id = serializers.UUIDField(source='sender.id', read_only=True)
    handshake_id = serializers.UUIDField(source='handshake.id', read_only=True)
    body = serializers.CharField(max_length=5000)
    handshake = serializers.UUIDField(read_only=True)
    sender = serializers.UUIDField(read_only=True)

    class Meta:
        model = ChatMessage
        fields = ['id', 'handshake', 'handshake_id', 'sender', 'sender_id', 'sender_name', 'sender_avatar_url', 'body', 'created_at']

    @extend_schema_field(OpenApiTypes.STR)
    def get_sender_name(self, obj):
        return f"{obj.sender.first_name} {obj.sender.last_name}".strip()
    
    @extend_schema_field(OpenApiTypes.STR)
    def get_sender_avatar_url(self, obj):
        return obj.sender.avatar_url

# Notification Serializer
@extend_schema_serializer(
    examples=[
        OpenApiExample(
            'Notification Example',
            value={
                'id': '123e4567-e89b-12d3-a456-426614174005',
                'type': 'handshake_accepted',
                'title': 'Handshake Accepted',
                'message': "Your interest in 'Web Development Help' has been accepted!",
                'is_read': False,
                'related_handshake': '123e4567-e89b-12d3-a456-426614174002',
                'related_service': '123e4567-e89b-12d3-a456-426614174001',
                'created_at': '2024-01-01T12:00:00Z'
            },
            response_only=True
        )
    ]
)
class NotificationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Notification
        fields = [
            'id', 'type', 'title', 'message', 'is_read',
            'related_handshake', 'related_service', 'created_at'
        ]

# Reputation Serializer
@extend_schema_serializer(
    examples=[
        OpenApiExample(
            'Reputation Example',
            value={
                'id': '123e4567-e89b-12d3-a456-426614174006',
                'handshake': '123e4567-e89b-12d3-a456-426614174002',
                'giver': '123e4567-e89b-12d3-a456-426614174000',
                'giver_name': 'John Doe',
                'receiver': '123e4567-e89b-12d3-a456-426614174003',
                'receiver_name': 'Jane Smith',
                'is_punctual': True,
                'is_helpful': True,
                'is_kind': False,
                'comment': 'Great experience. Very professional and helpful.',
                'created_at': '2024-01-01T12:00:00Z'
            },
            response_only=True
        ),
        OpenApiExample(
            'Submit Reputation Request',
            value={
                'handshake_id': '123e4567-e89b-12d3-a456-426614174002',
                'punctual': True,
                'helpful': True,
                'kindness': False,
                'comment': 'Optional verified review text'
            },
            request_only=True
        )
    ]
)
class ReputationRepSerializer(serializers.ModelSerializer):
    giver_name = serializers.SerializerMethodField()
    receiver_name = serializers.SerializerMethodField()

    class Meta:
        model = ReputationRep
        fields = [
            'id', 'handshake', 'giver', 'giver_name', 'receiver', 'receiver_name',
            'is_punctual', 'is_helpful', 'is_kind', 'comment', 'created_at'
        ]

    @extend_schema_field(OpenApiTypes.STR)
    def get_giver_name(self, obj):
        return f"{obj.giver.first_name} {obj.giver.last_name}".strip()

    @extend_schema_field(OpenApiTypes.STR)
    def get_receiver_name(self, obj):
        return f"{obj.receiver.first_name} {obj.receiver.last_name}".strip()

# Badge Serializers
@extend_schema_serializer(
    examples=[
        OpenApiExample(
            'Badge Example',
            value={
                'id': 'punctual_pro',
                'name': 'Punctual Pro',
                'description': 'Earned 10+ punctual reputation points',
                'icon_url': 'https://example.com/badges/punctual_pro.png'
            },
            response_only=True
        )
    ]
)
class BadgeSerializer(serializers.ModelSerializer):
    class Meta:
        model = Badge
        fields = ['id', 'name', 'description', 'icon_url']

# Report Serializer
@extend_schema_serializer(
    examples=[
        OpenApiExample(
            'Report Example',
            value={
                'id': '123e4567-e89b-12d3-a456-426614174007',
                'reporter': '123e4567-e89b-12d3-a456-426614174000',
                'reporter_name': 'John Doe',
                'reported_user': '123e4567-e89b-12d3-a456-426614174003',
                'reported_user_name': 'Jane Smith',
                'reported_service': '123e4567-e89b-12d3-a456-426614174001',
                'related_handshake': '123e4567-e89b-12d3-a456-426614174002',
                'type': 'no_show',
                'status': 'pending',
                'description': 'Provider did not show up at scheduled time',
                'admin_notes': None,
                'created_at': '2024-01-01T12:00:00Z',
                'resolved_at': None,
                'resolved_by': None
            },
            response_only=True
        )
    ]
)
class ReportSerializer(serializers.ModelSerializer):
    reporter_name = serializers.SerializerMethodField()
    reporter_email = serializers.SerializerMethodField()
    reporter_karma_score = serializers.SerializerMethodField()
    reporter_warning_count = serializers.SerializerMethodField()
    reported_user_name = serializers.SerializerMethodField()
    reported_user_email = serializers.SerializerMethodField()
    reported_user_karma_score = serializers.SerializerMethodField()
    reported_service_title = serializers.SerializerMethodField()
    reported_service_status = serializers.SerializerMethodField()
    reported_service_type = serializers.SerializerMethodField()
    reported_service_description = serializers.SerializerMethodField()
    reported_service_location = serializers.SerializerMethodField()
    reported_service_hours = serializers.SerializerMethodField()
    reported_service_owner = serializers.SerializerMethodField()
    reported_service_owner_name = serializers.SerializerMethodField()
    reported_service_owner_email = serializers.SerializerMethodField()
    reported_service_owner_karma_score = serializers.SerializerMethodField()
    reported_forum_topic = serializers.PrimaryKeyRelatedField(read_only=True)
    reported_forum_post = serializers.PrimaryKeyRelatedField(read_only=True)
    reported_forum_topic_title = serializers.SerializerMethodField()
    reported_forum_post_excerpt = serializers.SerializerMethodField()
    handshake_hours = serializers.SerializerMethodField()
    handshake_scheduled_time = serializers.SerializerMethodField()
    handshake_status = serializers.SerializerMethodField()
    reported_user_is_receiver = serializers.SerializerMethodField()

    class Meta:
        model = Report
        fields = [
            'id', 'reporter', 'reporter_name', 'reporter_email', 'reporter_karma_score', 'reporter_warning_count',
            'reported_user', 'reported_user_name', 'reported_user_email', 'reported_user_karma_score',
            'reported_service', 'reported_service_title', 'reported_service_status', 'reported_service_type',
            'reported_service_description', 'reported_service_location', 'reported_service_hours',
            'reported_service_owner', 'reported_service_owner_name', 'reported_service_owner_email',
            'reported_service_owner_karma_score', 'related_handshake',
            'reported_forum_topic', 'reported_forum_topic_title',
            'reported_forum_post', 'reported_forum_post_excerpt',
            'handshake_hours', 'handshake_scheduled_time', 'handshake_status',
            'reported_user_is_receiver',
            'type', 'status', 'description', 'admin_notes', 
            'created_at', 'resolved_at', 'resolved_by'
        ]

    def _get_context_service(self, obj):
        """Resolve service context from report first, then handshake fallback."""
        if obj.reported_service:
            return obj.reported_service
        handshake = getattr(obj, 'related_handshake', None)
        if handshake and getattr(handshake, 'service', None):
            return handshake.service
        return None

    def _get_context_handshake(self, obj):
        return getattr(obj, 'related_handshake', None)

    @extend_schema_field(OpenApiTypes.STR)
    def get_reporter_name(self, obj):
        return f"{obj.reporter.first_name} {obj.reporter.last_name}".strip()

    @extend_schema_field(OpenApiTypes.STR)
    def get_reporter_email(self, obj):
        return obj.reporter.email

    @extend_schema_field(OpenApiTypes.INT)
    def get_reporter_karma_score(self, obj):
        return obj.reporter.karma_score

    @extend_schema_field(OpenApiTypes.INT)
    def get_reporter_warning_count(self, obj):
        return getattr(obj.reporter, 'warning_count', 0)

    @extend_schema_field(OpenApiTypes.STR)
    def get_reported_user_name(self, obj):
        if obj.reported_user:
            return f"{obj.reported_user.first_name} {obj.reported_user.last_name}".strip()
        return None

    @extend_schema_field(OpenApiTypes.STR)
    def get_reported_user_email(self, obj):
        if obj.reported_user:
            return obj.reported_user.email
        return None

    @extend_schema_field(OpenApiTypes.INT)
    def get_reported_user_karma_score(self, obj):
        if obj.reported_user:
            return obj.reported_user.karma_score
        return None

    @extend_schema_field(OpenApiTypes.STR)
    def get_reported_service_title(self, obj):
        service = self._get_context_service(obj)
        if service:
            return service.title
        return None

    @extend_schema_field(OpenApiTypes.STR)
    def get_reported_service_status(self, obj):
        service = self._get_context_service(obj)
        if service:
            return service.status
        return None

    @extend_schema_field(OpenApiTypes.STR)
    def get_reported_service_type(self, obj):
        service = self._get_context_service(obj)
        if service:
            return service.type
        return None

    @extend_schema_field(OpenApiTypes.STR)
    def get_reported_service_description(self, obj):
        service = self._get_context_service(obj)
        if not service:
            return None

        description = (getattr(service, 'description', '') or '').strip()
        if description:
            return description

        # Some older records may have sparse descriptions; schedule_details is
        # the closest service-context fallback we can safely expose.
        schedule_details = (getattr(service, 'schedule_details', '') or '').strip()
        if schedule_details:
            return schedule_details
        return None

    @extend_schema_field(OpenApiTypes.STR)
    def get_reported_service_location(self, obj):
        service = self._get_context_service(obj)
        if not service:
            return None

        location_type = getattr(service, 'location_type', None)
        location_area = getattr(service, 'location_area', None)
        if location_type == 'online':
            return 'Online'
        if location_area:
            return location_area
        if location_type:
            return location_type.replace('_', ' ').title()

        handshake = self._get_context_handshake(obj)
        exact_location = (getattr(handshake, 'exact_location', '') or '').strip() if handshake else ''
        if exact_location:
            return exact_location
        return None

    @extend_schema_field(OpenApiTypes.NUMBER)
    def get_reported_service_hours(self, obj):
        service = self._get_context_service(obj)
        if service and service.duration is not None:
            return float(service.duration)

        handshake = self._get_context_handshake(obj)
        if handshake and getattr(handshake, 'exact_duration', None) is not None:
            return float(handshake.exact_duration)

        if handshake and getattr(handshake, 'provisioned_hours', None) is not None:
            return float(handshake.provisioned_hours)
        return None

    @extend_schema_field(OpenApiTypes.UUID)
    def get_reported_service_owner(self, obj):
        service = self._get_context_service(obj)
        if service and service.user_id:
            return str(service.user_id)
        return None

    @extend_schema_field(OpenApiTypes.STR)
    def get_reported_service_owner_name(self, obj):
        service = self._get_context_service(obj)
        if service and service.user:
            return f"{service.user.first_name} {service.user.last_name}".strip()
        return None

    @extend_schema_field(OpenApiTypes.STR)
    def get_reported_service_owner_email(self, obj):
        service = self._get_context_service(obj)
        if service and service.user:
            return service.user.email
        return None

    @extend_schema_field(OpenApiTypes.INT)
    def get_reported_service_owner_karma_score(self, obj):
        service = self._get_context_service(obj)
        if service and service.user:
            return service.user.karma_score
        return None

    @extend_schema_field(OpenApiTypes.STR)
    def get_reported_forum_topic_title(self, obj):
        if obj.reported_forum_topic:
            return obj.reported_forum_topic.title
        if obj.reported_forum_post:
            return obj.reported_forum_post.topic.title
        return None

    @extend_schema_field(OpenApiTypes.STR)
    def get_reported_forum_post_excerpt(self, obj):
        if obj.reported_forum_post:
            body = obj.reported_forum_post.body or ''
            return body[:140]
        return None

    @extend_schema_field(OpenApiTypes.DECIMAL)
    def get_handshake_hours(self, obj):
        if obj.related_handshake:
            return float(obj.related_handshake.provisioned_hours)
        return None

    @extend_schema_field(OpenApiTypes.DATETIME)
    def get_handshake_scheduled_time(self, obj):
        if obj.related_handshake and obj.related_handshake.scheduled_time:
            return obj.related_handshake.scheduled_time
        return None

    @extend_schema_field(OpenApiTypes.STR)
    def get_handshake_status(self, obj):
        if obj.related_handshake:
            return obj.related_handshake.status
        return None

    @extend_schema_field(OpenApiTypes.BOOL)
    def get_reported_user_is_receiver(self, obj):
        """
        Determine if the reported user is the receiver in the handshake.
        This affects the financial action: if receiver no-showed, hours go to provider.
        """
        if not obj.related_handshake or not obj.reported_user:
            return None
        
        from .utils import get_provider_and_receiver
        _, receiver = get_provider_and_receiver(obj.related_handshake)
        return obj.reported_user.id == receiver.id

# Transaction History Serializer
@extend_schema_serializer(
    examples=[
        OpenApiExample(
            'Transaction Example',
            value={
                'id': '123e4567-e89b-12d3-a456-426614174008',
                'transaction_type': 'provision',
                'transaction_type_display': 'Provision',
                'amount': -2.5,
                'balance_after': 7.5,
                'description': "Hours escrowed for 'Web Development Help'",
                'service_title': 'Web Development Help',
                'created_at': '2024-01-01T12:00:00Z'
            },
            response_only=True
        )
    ]
)
class TransactionHistorySerializer(serializers.ModelSerializer):
    transaction_type_display = serializers.CharField(source='get_transaction_type_display', read_only=True)
    service_title = serializers.SerializerMethodField()

    class Meta:
        model = TransactionHistory
        fields = [
            'id', 'transaction_type', 'transaction_type_display', 'amount',
            'balance_after', 'description', 'service_title', 'created_at'
        ]
        read_only_fields = ['id', 'created_at']

    @extend_schema_field(OpenApiTypes.STR)
    def get_service_title(self, obj):
        if obj.handshake and obj.handshake.service:
            return obj.handshake.service.title
        return None


class AdminAuditLogSerializer(serializers.ModelSerializer):
    admin_name = serializers.SerializerMethodField()

    class Meta:
        model = AdminAuditLog
        fields = [
            'id',
            'admin',
            'admin_name',
            'action_type',
            'target_entity',
            'target_id',
            'reason',
            'created_at',
        ]

    @extend_schema_field(OpenApiTypes.STR)
    def get_admin_name(self, obj):
        full = f"{obj.admin.first_name} {obj.admin.last_name}".strip()
        return full or obj.admin.email


# Public Chat Serializers
@extend_schema_serializer(
    examples=[
        OpenApiExample(
            'Chat Room Example',
            value={
                'id': '123e4567-e89b-12d3-a456-426614174009',
                'name': 'Discussion: Web Development Help',
                'type': 'public',
                'related_service': '123e4567-e89b-12d3-a456-426614174001',
                'created_at': '2024-01-01T12:00:00Z'
            },
            response_only=True
        )
    ]
)
class ChatRoomSerializer(serializers.ModelSerializer):
    class Meta:
        model = ChatRoom
        fields = ['id', 'name', 'type', 'related_service', 'created_at']
        read_only_fields = ['id', 'created_at']


@extend_schema_serializer(
    examples=[
        OpenApiExample(
            'Public Chat Message Example',
            value={
                'id': '123e4567-e89b-12d3-a456-426614174010',
                'room': '123e4567-e89b-12d3-a456-426614174009',
                'sender_id': '123e4567-e89b-12d3-a456-426614174000',
                'sender_name': 'John Doe',
                'sender_avatar_url': 'https://example.com/avatars/john.jpg',
                'body': 'Has anyone tried this service before?',
                'created_at': '2024-01-01T12:00:00Z'
            },
            response_only=True
        ),
        OpenApiExample(
            'Send Public Chat Message Request',
            value={
                'body': 'Has anyone tried this service before?'
            },
            request_only=True
        )
    ]
)
class PublicChatMessageSerializer(serializers.ModelSerializer):
    sender_id = serializers.UUIDField(source='sender.id', read_only=True)
    sender_name = serializers.SerializerMethodField()
    sender_avatar_url = serializers.SerializerMethodField()
    body = serializers.CharField(max_length=5000)

    class Meta:
        model = PublicChatMessage
        fields = ['id', 'room', 'sender_id', 'sender_name', 'sender_avatar_url', 'body', 'created_at']
        read_only_fields = ['id', 'room', 'sender_id', 'created_at']

    @extend_schema_field(OpenApiTypes.STR)
    def get_sender_name(self, obj):
        return f"{obj.sender.first_name} {obj.sender.last_name}".strip()

    @extend_schema_field(OpenApiTypes.STR)
    def get_sender_avatar_url(self, obj):
        return obj.sender.avatar_url


class ServiceGroupChatMessageSerializer(serializers.ModelSerializer):
    """Serializer for private group chat messages (accepted participants only)."""
    sender_id = serializers.UUIDField(source='sender.id', read_only=True)
    sender_name = serializers.SerializerMethodField()
    sender_avatar_url = serializers.SerializerMethodField()
    body = serializers.CharField(max_length=5000)

    class Meta:
        from .models import ServiceGroupChatMessage
        model = ServiceGroupChatMessage
        fields = ['id', 'service', 'sender_id', 'sender_name', 'sender_avatar_url', 'body', 'created_at']
        read_only_fields = ['id', 'service', 'sender_id', 'created_at']

    def get_sender_name(self, obj):
        return f"{obj.sender.first_name} {obj.sender.last_name}".strip()

    def get_sender_avatar_url(self, obj):
        return obj.sender.avatar_url


# Comment Serializers
@extend_schema_serializer(
    examples=[
        OpenApiExample(
            'Comment Example',
            value={
                'id': '123e4567-e89b-12d3-a456-426614174011',
                'service': '123e4567-e89b-12d3-a456-426614174001',
                'user_id': '123e4567-e89b-12d3-a456-426614174000',
                'user_name': 'John Doe',
                'user_avatar_url': 'https://example.com/avatars/john.jpg',
                'parent': None,
                'body': 'Great service! Would recommend.',
                'is_deleted': False,
                'is_verified_review': True,
                'handshake_hours': 2.0,
                'handshake_completed_at': '2024-01-01T14:00:00Z',
                'reply_count': 2,
                'created_at': '2024-01-01T12:00:00Z',
                'updated_at': '2024-01-01T12:00:00Z'
            },
            response_only=True
        ),
        OpenApiExample(
            'Create Comment Request',
            value={
                'body': 'Great service! Would recommend.',
                'parent_id': None
            },
            request_only=True
        ),
        OpenApiExample(
            'Create Verified Review Request',
            value={
                'body': 'Excellent service! Very professional.',
                'handshake_id': '123e4567-e89b-12d3-a456-426614174002'
            },
            request_only=True
        )
    ]
)
class CommentSerializer(serializers.ModelSerializer):
    user_id = serializers.UUIDField(source='user.id', read_only=True)
    user_name = serializers.SerializerMethodField()
    user_avatar_url = serializers.SerializerMethodField()
    user_karma_score = serializers.IntegerField(source='user.karma_score', read_only=True)
    user_badges = serializers.SerializerMethodField()
    user_featured_achievement_id = serializers.SerializerMethodField()
    service_title = serializers.SerializerMethodField()
    reply_count = serializers.SerializerMethodField()
    parent_id = serializers.UUIDField(write_only=True, required=False, allow_null=True)
    handshake_id = serializers.UUIDField(write_only=True, required=False, allow_null=True)
    body = serializers.CharField(max_length=2000)
    replies = serializers.SerializerMethodField()
    handshake_hours = serializers.SerializerMethodField()
    handshake_completed_at = serializers.SerializerMethodField()

    class Meta:
        model = Comment
        fields = [
            'id', 'service', 'service_title', 'user_id', 'user_name', 'user_avatar_url',
            'user_karma_score', 'user_badges', 'user_featured_achievement_id',
            'parent', 'parent_id', 'body', 'is_deleted', 'is_verified_review',
            'handshake_id', 'handshake_hours', 'handshake_completed_at',
            'reply_count', 'replies', 'created_at', 'updated_at'
        ]
        read_only_fields = [
            'id', 'service', 'user_id', 'parent', 'is_deleted',
            'is_verified_review', 'created_at', 'updated_at'
        ]

    @extend_schema_field(OpenApiTypes.STR)
    def get_user_name(self, obj):
        return f"{obj.user.first_name} {obj.user.last_name}".strip()

    @extend_schema_field(OpenApiTypes.STR)
    def get_user_avatar_url(self, obj):
        return obj.user.avatar_url
    
    @extend_schema_field(OpenApiTypes.OBJECT)
    def get_user_badges(self, obj):
        """Return list of badge IDs for the comment author"""
        try:
            if hasattr(obj.user, '_prefetched_objects_cache') and 'badges' in obj.user._prefetched_objects_cache:
                user_badges = [ub for ub in obj.user._prefetched_objects_cache['badges'] if getattr(ub, 'badge', None)]
                user_badges.sort(key=lambda ub: ub.earned_at.timestamp() if getattr(ub, 'earned_at', None) else 0, reverse=True)
                return [ub.badge.id for ub in user_badges]
        except (AttributeError, KeyError):
            pass
        try:
            user_badges = obj.user.badges.select_related('badge').order_by('-earned_at')
            return [ub.badge.id for ub in user_badges if getattr(ub, 'badge', None)]
        except (AttributeError, Exception):
            return []

    @extend_schema_field(OpenApiTypes.STR)
    def get_user_featured_achievement_id(self, obj):
        """Backward-compatible field: now returns the author's latest earned achievement ID."""
        badges = self.get_user_badges(obj)
        return badges[0] if badges else None
    
    @extend_schema_field(OpenApiTypes.STR)
    def get_service_title(self, obj):
        """Return service title for verified reviews"""
        if obj.service:
            return obj.service.title
        return None

    @extend_schema_field(OpenApiTypes.FLOAT)
    def get_handshake_hours(self, obj):
        """Return hours from the linked handshake for verified reviews"""
        if obj.is_verified_review and obj.related_handshake:
            return float(obj.related_handshake.provisioned_hours)
        return None

    @extend_schema_field(OpenApiTypes.DATETIME)
    def get_handshake_completed_at(self, obj):
        """Return completion timestamp from the linked handshake"""
        if obj.is_verified_review and obj.related_handshake:
            return obj.related_handshake.updated_at
        return None

    @extend_schema_field(OpenApiTypes.INT)
    def get_reply_count(self, obj):
        """Return count of non-deleted replies"""
        # Check for prefetched active_replies (already filtered for is_deleted=False)
        if hasattr(obj, 'active_replies'):
            return len(obj.active_replies)
        return obj.replies.filter(is_deleted=False).count()

    @extend_schema_field(OpenApiTypes.OBJECT)
    def get_replies(self, obj):
        """Return replies for top-level comments only"""
        # Only include replies for top-level comments (no nesting beyond 1 level)
        if obj.parent is not None:
            return []
        
        # Use prefetched active_replies if available (already filtered for is_deleted=False)
        if hasattr(obj, 'active_replies'):
            replies = obj.active_replies
        else:
            replies = obj.replies.filter(is_deleted=False).select_related('user')
        
        # Serialize replies without nested replies (prevent recursion)
        return CommentReplySerializer(replies, many=True).data

    def validate_parent_id(self, value):
        """Validate that parent exists and enforce single-level threading"""
        if value is None:
            return value
        
        try:
            parent = Comment.objects.get(id=value)
        except Comment.DoesNotExist:
            raise serializers.ValidationError('Parent comment not found')
        
        # Enforce single-level threading: replies cannot have replies
        if parent.parent is not None:
            raise serializers.ValidationError('Cannot reply to a reply. Only top-level comments can have replies.')
        
        return value

    def create(self, validated_data):
        parent_id = validated_data.pop('parent_id', None)
        validated_data.pop('handshake_id', None)

        if parent_id is not None:
            validated_data['parent_id'] = parent_id

        return super().create(validated_data)


class CommentReplySerializer(serializers.ModelSerializer):
    """Simplified serializer for comment replies (no nested replies)"""
    user_id = serializers.UUIDField(source='user.id', read_only=True)
    user_name = serializers.SerializerMethodField()
    user_avatar_url = serializers.SerializerMethodField()
    handshake_hours = serializers.SerializerMethodField()
    handshake_completed_at = serializers.SerializerMethodField()

    class Meta:
        model = Comment
        fields = [
            'id', 'user_id', 'user_name', 'user_avatar_url',
            'body', 'is_deleted', 'is_verified_review',
            'handshake_hours', 'handshake_completed_at',
            'created_at', 'updated_at'
        ]
        read_only_fields = fields

    @extend_schema_field(OpenApiTypes.STR)
    def get_user_name(self, obj):
        return f"{obj.user.first_name} {obj.user.last_name}".strip()

    @extend_schema_field(OpenApiTypes.STR)
    def get_user_avatar_url(self, obj):
        return obj.user.avatar_url

    @extend_schema_field(OpenApiTypes.FLOAT)
    def get_handshake_hours(self, obj):
        """Return hours from the linked handshake for verified reviews"""
        if obj.is_verified_review and obj.related_handshake:
            return float(obj.related_handshake.provisioned_hours)
        return None

    @extend_schema_field(OpenApiTypes.DATETIME)
    def get_handshake_completed_at(self, obj):
        """Return completion timestamp from the linked handshake"""
        if obj.is_verified_review and obj.related_handshake:
            return obj.related_handshake.updated_at
        return None


# Negative Reputation Serializers
@extend_schema_serializer(
    examples=[
        OpenApiExample(
            'Negative Reputation Example',
            value={
                'id': '123e4567-e89b-12d3-a456-426614174012',
                'handshake': '123e4567-e89b-12d3-a456-426614174002',
                'giver': '123e4567-e89b-12d3-a456-426614174000',
                'giver_name': 'John Doe',
                'receiver': '123e4567-e89b-12d3-a456-426614174003',
                'receiver_name': 'Jane Smith',
                'is_late': True,
                'is_unhelpful': False,
                'is_rude': False,
                'comment': 'Was 30 minutes late',
                'created_at': '2024-01-01T12:00:00Z'
            },
            response_only=True
        ),
        OpenApiExample(
            'Submit Negative Reputation Request',
            value={
                'handshake_id': '123e4567-e89b-12d3-a456-426614174002',
                'is_late': True,
                'is_unhelpful': False,
                'is_rude': False,
                'comment': 'Was 30 minutes late'
            },
            request_only=True
        )
    ]
)
class NegativeRepSerializer(serializers.ModelSerializer):
    giver_name = serializers.SerializerMethodField()
    receiver_name = serializers.SerializerMethodField()
    handshake_id = serializers.UUIDField(write_only=True, required=False)

    class Meta:
        model = NegativeRep
        fields = [
            'id', 'handshake', 'handshake_id', 'giver', 'giver_name',
            'receiver', 'receiver_name', 'is_late', 'is_unhelpful',
            'is_rude', 'comment', 'created_at'
        ]
        read_only_fields = ['id', 'handshake', 'giver', 'receiver', 'created_at']

    @extend_schema_field(OpenApiTypes.STR)
    def get_giver_name(self, obj):
        return f"{obj.giver.first_name} {obj.giver.last_name}".strip()

    @extend_schema_field(OpenApiTypes.STR)
    def get_receiver_name(self, obj):
        return f"{obj.receiver.first_name} {obj.receiver.last_name}".strip()

    def validate(self, data):
        """Validate that at least one negative trait is selected"""
        is_late = data.get('is_late', False)
        is_unhelpful = data.get('is_unhelpful', False)
        is_rude = data.get('is_rude', False)
        
        if not any([is_late, is_unhelpful, is_rude]):
            raise serializers.ValidationError(
                'At least one negative trait must be selected (is_late, is_unhelpful, or is_rude)'
            )
        
        return data


# User History Serializer
@extend_schema_serializer(
    examples=[
        OpenApiExample(
            'User History Item Example',
            value={
                'service_title': 'Web Development Help',
                'service_type': 'Offer',
                'duration': 2.5,
                'partner_name': 'Jane Smith',
                'partner_id': '123e4567-e89b-12d3-a456-426614174003',
                'partner_avatar_url': 'https://example.com/avatars/jane.jpg',
                'completed_date': '2024-01-01T12:00:00Z',
                'was_provider': True
            },
            response_only=True
        )
    ]
)
class UserHistorySerializer(serializers.Serializer):
    """Serializer for user's completed transaction history"""
    service_title = serializers.CharField()
    service_type = serializers.CharField()
    duration = serializers.DecimalField(max_digits=5, decimal_places=2)
    partner_name = serializers.CharField()
    partner_id = serializers.UUIDField()
    partner_avatar_url = serializers.CharField(allow_null=True)
    completed_date = serializers.DateTimeField()
    was_provider = serializers.BooleanField()


# Forum Serializers
@extend_schema_serializer(
    examples=[
        OpenApiExample(
            'Forum Category Example',
            value={
                'id': '123e4567-e89b-12d3-a456-426614174020',
                'name': 'General Discussion',
                'description': 'General community chat and announcements',
                'slug': 'general-discussion',
                'icon': 'message-square',
                'color': 'blue',
                'display_order': 1,
                'is_active': True,
                'topic_count': 127,
                'post_count': 1453,
                'last_activity': '2024-01-01T12:00:00Z',
                'created_at': '2024-01-01T00:00:00Z'
            },
            response_only=True
        ),
        OpenApiExample(
            'Create Forum Category Request',
            value={
                'name': 'General Discussion',
                'description': 'General community chat and announcements',
                'slug': 'general-discussion',
                'icon': 'message-square',
                'color': 'blue',
                'display_order': 1
            },
            request_only=True
        )
    ]
)
class ForumCategorySerializer(serializers.ModelSerializer):
    topic_count = serializers.SerializerMethodField()
    post_count = serializers.SerializerMethodField()
    last_activity = serializers.SerializerMethodField()

    class Meta:
        model = ForumCategory
        fields = [
            'id', 'name', 'description', 'slug', 'icon', 'color',
            'display_order', 'is_active', 'topic_count', 'post_count',
            'last_activity', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']

    @extend_schema_field(OpenApiTypes.INT)
    def get_topic_count(self, obj):
        """Return count of topics in this category"""
        if hasattr(obj, 'topic_count_annotated'):
            return obj.topic_count_annotated
        return obj.topics.count()

    @extend_schema_field(OpenApiTypes.INT)
    def get_post_count(self, obj):
        """Return count of all posts across topics in this category"""
        if hasattr(obj, 'post_count_annotated'):
            return obj.post_count_annotated
        return ForumPost.objects.filter(topic__category=obj, is_deleted=False).count()

    @extend_schema_field(OpenApiTypes.DATETIME)
    def get_last_activity(self, obj):
        """Return timestamp of most recent activity in this category"""
        if hasattr(obj, 'last_activity_annotated'):
            return obj.last_activity_annotated
        
        # Check most recent post
        latest_post = ForumPost.objects.filter(
            topic__category=obj, is_deleted=False
        ).order_by('-created_at').first()
        
        # Check most recent topic
        latest_topic = obj.topics.order_by('-created_at').first()
        
        if latest_post and latest_topic:
            return max(latest_post.created_at, latest_topic.created_at)
        elif latest_post:
            return latest_post.created_at
        elif latest_topic:
            return latest_topic.created_at
        return obj.created_at


@extend_schema_serializer(
    examples=[
        OpenApiExample(
            'Forum Topic Example',
            value={
                'id': '123e4567-e89b-12d3-a456-426614174021',
                'category': '123e4567-e89b-12d3-a456-426614174020',
                'category_name': 'General Discussion',
                'category_slug': 'general-discussion',
                'author_id': '123e4567-e89b-12d3-a456-426614174000',
                'author_name': 'John Doe',
                'author_avatar_url': 'https://example.com/avatars/john.jpg',
                'title': 'Welcome to the community!',
                'body': 'Hello everyone, excited to be here...',
                'is_pinned': True,
                'is_locked': False,
                'view_count': 523,
                'reply_count': 42,
                'last_activity': '2024-01-01T14:30:00Z',
                'created_at': '2024-01-01T12:00:00Z'
            },
            response_only=True
        ),
        OpenApiExample(
            'Create Forum Topic Request',
            value={
                'category': '123e4567-e89b-12d3-a456-426614174020',
                'title': 'Welcome to the community!',
                'body': 'Hello everyone, excited to be here...'
            },
            request_only=True
        )
    ]
)
class ForumTopicSerializer(serializers.ModelSerializer):
    author_id = serializers.UUIDField(source='author.id', read_only=True)
    author_name = serializers.SerializerMethodField()
    author_avatar_url = serializers.SerializerMethodField()
    category_name = serializers.CharField(source='category.name', read_only=True)
    category_slug = serializers.CharField(source='category.slug', read_only=True)
    reply_count = serializers.SerializerMethodField()
    last_activity = serializers.SerializerMethodField()

    class Meta:
        model = ForumTopic
        fields = [
            'id', 'category', 'category_name', 'category_slug',
            'author_id', 'author_name', 'author_avatar_url',
            'title', 'body', 'is_pinned', 'is_locked', 'view_count',
            'reply_count', 'last_activity', 'created_at', 'updated_at'
        ]
        read_only_fields = [
            'id', 'author_id', 'is_pinned', 'is_locked', 
            'view_count', 'created_at', 'updated_at'
        ]

    @extend_schema_field(OpenApiTypes.STR)
    def get_author_name(self, obj):
        return f"{obj.author.first_name} {obj.author.last_name}".strip()

    @extend_schema_field(OpenApiTypes.STR)
    def get_author_avatar_url(self, obj):
        return obj.author.avatar_url

    @extend_schema_field(OpenApiTypes.INT)
    def get_reply_count(self, obj):
        """Return count of non-deleted posts in this topic"""
        if hasattr(obj, 'reply_count_annotated'):
            return obj.reply_count_annotated
        return obj.posts.filter(is_deleted=False).count()

    @extend_schema_field(OpenApiTypes.DATETIME)
    def get_last_activity(self, obj):
        """Return timestamp of most recent post or topic creation"""
        if hasattr(obj, 'last_activity_annotated'):
            return obj.last_activity_annotated
        
        latest_post = obj.posts.filter(is_deleted=False).order_by('-created_at').first()
        if latest_post:
            return latest_post.created_at
        return obj.created_at

    def validate_title(self, value):
        """Sanitize and validate title"""
        cleaned = bleach.clean(value, tags=[], strip=True).strip()
        if len(cleaned) < 5:
            raise serializers.ValidationError('Title must be at least 5 characters long')
        return cleaned

    def validate_body(self, value):
        """Sanitize body text"""
        return bleach.clean(value, tags=[], strip=True)


@extend_schema_serializer(
    examples=[
        OpenApiExample(
            'Forum Post Example',
            value={
                'id': '123e4567-e89b-12d3-a456-426614174022',
                'topic': '123e4567-e89b-12d3-a456-426614174021',
                'author_id': '123e4567-e89b-12d3-a456-426614174000',
                'author_name': 'John Doe',
                'author_avatar_url': 'https://example.com/avatars/john.jpg',
                'body': 'Thanks for the welcome! Happy to be here.',
                'is_deleted': False,
                'created_at': '2024-01-01T12:30:00Z',
                'updated_at': '2024-01-01T12:30:00Z'
            },
            response_only=True
        ),
        OpenApiExample(
            'Create Forum Post Request',
            value={
                'body': 'Thanks for the welcome! Happy to be here.'
            },
            request_only=True
        )
    ]
)
class ForumPostSerializer(serializers.ModelSerializer):
    author_id = serializers.UUIDField(source='author.id', read_only=True)
    author_name = serializers.SerializerMethodField()
    author_avatar_url = serializers.SerializerMethodField()

    class Meta:
        model = ForumPost
        fields = [
            'id', 'topic', 'author_id', 'author_name', 'author_avatar_url',
            'body', 'is_deleted', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'topic', 'author_id', 'is_deleted', 'created_at', 'updated_at']

    @extend_schema_field(OpenApiTypes.STR)
    def get_author_name(self, obj):
        return f"{obj.author.first_name} {obj.author.last_name}".strip()

    @extend_schema_field(OpenApiTypes.STR)
    def get_author_avatar_url(self, obj):
        return obj.author.avatar_url

    def validate_body(self, value):
        """Sanitize and validate body text"""
        cleaned = bleach.clean(value, tags=[], strip=True).strip()
        if len(cleaned) < 1:
            raise serializers.ValidationError('Post body cannot be empty')
        return cleaned


class ForumRecentPostSerializer(ForumPostSerializer):
    """Forum post serializer with topic/category context for 'recent posts' feeds."""

    topic_title = serializers.CharField(source='topic.title', read_only=True)
    category_slug = serializers.CharField(source='topic.category.slug', read_only=True)
    category_name = serializers.CharField(source='topic.category.name', read_only=True)

    class Meta(ForumPostSerializer.Meta):
        fields = ForumPostSerializer.Meta.fields + ['topic_title', 'category_slug', 'category_name']


class ForumTopicDetailSerializer(ForumTopicSerializer):
    """Extended serializer for topic detail view with posts"""
    posts = serializers.SerializerMethodField()

    class Meta(ForumTopicSerializer.Meta):
        fields = ForumTopicSerializer.Meta.fields + ['posts']

    @extend_schema_field(OpenApiTypes.OBJECT)
    def get_posts(self, obj):
        """Return paginated posts for this topic"""
        # Posts will be handled by the view with pagination
        # This is just for the initial load
        posts = obj.posts.filter(is_deleted=False).select_related('author')[:20]
        return ForumPostSerializer(posts, many=True).data
