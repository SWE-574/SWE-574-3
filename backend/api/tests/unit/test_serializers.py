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
