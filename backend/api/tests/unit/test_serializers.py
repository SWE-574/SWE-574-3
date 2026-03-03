"""
Unit tests for serializers
"""
import pytest
from decimal import Decimal
from django.contrib.auth import get_user_model
from rest_framework.exceptions import ValidationError

from api.models import Service, Tag, Handshake, Comment
from api.serializers import (
    ServiceSerializer, UserProfileSerializer, PublicUserProfileSerializer,
    CommentSerializer, HandshakeSerializer
)
from api.tests.helpers.factories import (
    UserFactory, ServiceFactory, TagFactory, HandshakeFactory, CommentFactory
)

User = get_user_model()


@pytest.mark.django_db
@pytest.mark.unit
class TestServiceSerializer:
    """Test ServiceSerializer"""
    
    def test_service_serialization(self):
        """Test service serialization"""
        service = ServiceFactory()
        serializer = ServiceSerializer(service)
        data = serializer.data
        assert data['title'] == service.title
        assert data['type'] == service.type
        assert float(data['duration']) == float(service.duration)
    
    def test_service_validation_title_required(self):
        """Test title is required"""
        serializer = ServiceSerializer(data={})
        assert serializer.is_valid() is False
        assert 'title' in serializer.errors
    
    def test_service_validation_title_min_length(self):
        """Test title minimum length"""
        serializer = ServiceSerializer(data={'title': 'ab'})
        assert serializer.is_valid() is False
        assert 'title' in serializer.errors
    
    def test_service_validation_description_required(self):
        """Test description is required"""
        serializer = ServiceSerializer(data={'title': 'Test Service'})
        assert serializer.is_valid() is False
        assert 'description' in serializer.errors
    
    def test_service_validation_duration_positive(self):
        """Test duration must be positive"""
        serializer = ServiceSerializer(data={
            'title': 'Test Service',
            'description': 'Test description',
            'duration': -1
        })
        assert serializer.is_valid() is False
        assert 'duration' in serializer.errors
    
    def test_service_validation_max_participants_positive(self):
        """Test max_participants must be positive"""
        serializer = ServiceSerializer(data={
            'title': 'Test Service',
            'description': 'Test description',
            'duration': 2,
            'max_participants': 0
        })
        assert serializer.is_valid() is False
        assert 'max_participants' in serializer.errors
    
    def test_service_validation_location_coordinates(self):
        """Test location coordinates validation"""
        serializer = ServiceSerializer(data={
            'title': 'Test Service',
            'description': 'Test description',
            'duration': 2,
            'location_type': 'In-Person',
            'location_lat': 91,  # Invalid latitude
            'location_lng': 0
        })
        assert serializer.is_valid() is False
        assert 'location_lat' in serializer.errors
    
    def test_service_creation(self):
        """Test service creation via serializer"""
        user = UserFactory()
        tag = TagFactory()
        serializer = ServiceSerializer(data={
            'title': 'New Service',
            'description': 'A new service description',
            'type': 'Offer',
            'duration': 2.0,
            'location_type': 'In-Person',
            'location_area': 'Beşiktaş',
            'location_lat': 41.0422,
            'location_lng': 29.0089,
            'max_participants': 2,
            'schedule_type': 'One-Time',
            'status': 'Active',
            'tag_ids': [tag.id]
        })
        assert serializer.is_valid()
        service = serializer.save(user=user)
        assert service.title == 'New Service'
        assert service.user == user


@pytest.mark.django_db
@pytest.mark.unit
class TestUserProfileSerializer:
    """Test UserProfileSerializer"""
    
    def test_user_profile_serialization(self):
        """Test user profile serialization"""
        user = UserFactory()
        serializer = UserProfileSerializer(user)
        data = serializer.data
        assert data['email'] == user.email
        assert data['first_name'] == user.first_name
        assert float(data['timebank_balance']) == float(user.timebank_balance)
    
    def test_user_profile_bio_validation(self):
        """Test bio length validation"""
        serializer = UserProfileSerializer(data={
            'bio': 'x' * 1001  # Exceeds 1000 character limit
        })
        assert serializer.is_valid() is False
        assert 'bio' in serializer.errors
    
    def test_user_profile_bio_sanitization(self):
        """Test bio HTML sanitization"""
        user = UserFactory()
        serializer = UserProfileSerializer(user, data={
            'bio': '<script>alert("xss")</script>Safe text'
        }, partial=True)
        assert serializer.is_valid()
        serializer.save()
        assert '<script>' not in user.bio
        assert 'Safe text' in user.bio
    
    def test_user_profile_achievements_field(self):
        """Test achievements field returns achievement IDs"""
        user = UserFactory()
        from api.models import Badge, UserBadge
        badge = Badge.objects.create(id='test-achievement', name='Test')
        UserBadge.objects.create(user=user, badge=badge)
        
        serializer = UserProfileSerializer(user)
        data = serializer.data
        assert 'achievements' in data
        assert 'test-achievement' in data['achievements']


@pytest.mark.django_db
@pytest.mark.unit
class TestCommentSerializer:
    """Test CommentSerializer"""
    
    def test_comment_serialization(self):
        """Test comment serialization"""
        comment = CommentFactory()
        serializer = CommentSerializer(comment)
        data = serializer.data
        assert data['body'] == comment.body
        assert data['user_id'] == str(comment.user.id)
    
    def test_comment_creation(self):
        """Test comment creation via serializer"""
        service = ServiceFactory()
        user = UserFactory()
        serializer = CommentSerializer(data={
            'body': 'This is a test comment',
            'service': str(service.id)
        })
        assert serializer.is_valid()
        comment = serializer.save(user=user, service=service)
        assert comment.body == 'This is a test comment'
        assert comment.user == user
        assert comment.service == service
    
    def test_comment_reply_creation(self):
        """Test comment reply creation"""
        parent = CommentFactory()
        user = UserFactory()
        serializer = CommentSerializer(data={
            'body': 'This is a reply',
            'parent_id': str(parent.id)
        })
        assert serializer.is_valid()
        reply = serializer.save(user=user, service=parent.service)
        assert reply.parent == parent


@pytest.mark.django_db
@pytest.mark.unit
class TestHandshakeSerializer:
    """Test HandshakeSerializer"""
    
    def test_handshake_serialization(self):
        """Test handshake serialization"""
        handshake = HandshakeFactory()
        serializer = HandshakeSerializer(handshake)
        data = serializer.data
        assert data['status'] == handshake.status
        assert 'service_title' in data
        assert 'requester_name' in data


@pytest.mark.django_db
@pytest.mark.unit
class TestParticipantCountField:
    """Tests for the participant_count SerializerMethodField on ServiceSerializer.

    participant_count must mirror HandshakeService._capacity_statuses:
      One-Time  → accepted, completed, reported, paused  (pending never counts)
      Recurrent → accepted, reported, paused             (completed frees slot)
    """

    def _serialize(self, service):
        serializer = ServiceSerializer(service)
        return serializer.data['participant_count']

    def test_field_present_in_output(self):
        svc = ServiceFactory(schedule_type='One-Time')
        data = ServiceSerializer(svc).data
        assert 'participant_count' in data

    def test_zero_with_no_handshakes(self):
        svc = ServiceFactory(schedule_type='One-Time', max_participants=5)
        assert self._serialize(svc) == 0

    # ── One-Time ──────────────────────────────────────────────────────────────

    def test_one_time_pending_not_counted(self):
        svc = ServiceFactory(schedule_type='One-Time', max_participants=5)
        HandshakeFactory(service=svc, requester=UserFactory(), status='pending',
                         provisioned_hours=svc.duration)
        assert self._serialize(svc) == 0

    def test_one_time_accepted_counted(self):
        svc = ServiceFactory(schedule_type='One-Time', max_participants=5)
        HandshakeFactory(service=svc, requester=UserFactory(), status='accepted',
                         provisioned_hours=svc.duration)
        assert self._serialize(svc) == 1

    def test_one_time_completed_counted(self):
        svc = ServiceFactory(schedule_type='One-Time', max_participants=5)
        HandshakeFactory(service=svc, requester=UserFactory(), status='completed',
                         provisioned_hours=svc.duration)
        assert self._serialize(svc) == 1

    def test_one_time_denied_and_cancelled_not_counted(self):
        svc = ServiceFactory(schedule_type='One-Time', max_participants=5)
        for st in ('denied', 'cancelled'):
            HandshakeFactory(service=svc, requester=UserFactory(), status=st,
                             provisioned_hours=svc.duration)
        assert self._serialize(svc) == 0

    def test_one_time_mixed_statuses(self):
        """accepted=2, completed=1, pending=1 → count should be 3."""
        svc = ServiceFactory(schedule_type='One-Time', max_participants=5)
        for st in ('accepted', 'accepted', 'completed', 'pending'):
            HandshakeFactory(service=svc, requester=UserFactory(), status=st,
                             provisioned_hours=svc.duration)
        assert self._serialize(svc) == 3

    # ── Recurrent ─────────────────────────────────────────────────────────────

    def test_recurrent_pending_not_counted(self):
        svc = ServiceFactory(schedule_type='Recurrent', max_participants=5)
        HandshakeFactory(service=svc, requester=UserFactory(), status='pending',
                         provisioned_hours=svc.duration)
        assert self._serialize(svc) == 0

    def test_recurrent_completed_not_counted(self):
        """Completed sessions free the slot for Recurrent services."""
        svc = ServiceFactory(schedule_type='Recurrent', max_participants=5)
        HandshakeFactory(service=svc, requester=UserFactory(), status='completed',
                         provisioned_hours=svc.duration)
        assert self._serialize(svc) == 0

    def test_recurrent_accepted_counted(self):
        svc = ServiceFactory(schedule_type='Recurrent', max_participants=5)
        HandshakeFactory(service=svc, requester=UserFactory(), status='accepted',
                         provisioned_hours=svc.duration)
        assert self._serialize(svc) == 1

    def test_recurrent_mixed_statuses(self):
        """accepted=2, completed=2, pending=1 → count should be 2."""
        svc = ServiceFactory(schedule_type='Recurrent', max_participants=5)
        for st in ('accepted', 'accepted', 'completed', 'completed', 'pending'):
            HandshakeFactory(service=svc, requester=UserFactory(), status=st,
                             provisioned_hours=svc.duration)
        assert self._serialize(svc) == 2

    # ── Prefetch path ─────────────────────────────────────────────────────────

    def test_uses_prefetched_capacity_handshakes_without_extra_query(self):
        """When capacity_handshakes is prefetched, get_participant_count must
        read from cache — no extra Handshake query should fire."""
        from django.db.models import Prefetch

        svc = ServiceFactory(schedule_type='One-Time', max_participants=3)
        HandshakeFactory(service=svc, requester=UserFactory(), status='accepted',
                         provisioned_hours=svc.duration)
        HandshakeFactory(service=svc, requester=UserFactory(), status='completed',
                         provisioned_hours=svc.duration)

        svc_prefetched = Service.objects.prefetch_related(
            Prefetch(
                'handshakes',
                queryset=Handshake.objects.filter(
                    status__in=['accepted', 'completed', 'reported', 'paused', 'pending']
                ).only('id', 'service_id', 'status'),
                to_attr='capacity_handshakes',
            )
        ).get(pk=svc.pk)

        assert hasattr(svc_prefetched, 'capacity_handshakes'), (
            "Prefetch should attach capacity_handshakes"
        )

        # Call get_participant_count in isolation — must NOT issue a Handshake query
        from api.serializers import ServiceSerializer
        from django.test.utils import CaptureQueriesContext
        from django.db import connection

        serializer = ServiceSerializer()
        with CaptureQueriesContext(connection) as ctx:
            count = serializer.get_participant_count(svc_prefetched)

        assert count == 2
        handshake_queries = [
            q for q in ctx.captured_queries
            if 'handshake' in q['sql'].lower()
        ]
        assert len(handshake_queries) == 0, (
            f"Expected no Handshake queries when prefetched, got {len(handshake_queries)}"
        )
