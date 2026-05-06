"""
Unit tests for serializers
"""
import pytest
from datetime import timedelta
from decimal import Decimal
from unittest.mock import patch
from django.contrib.auth import get_user_model
from django.utils import timezone
from django.utils.datastructures import MultiValueDict
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.exceptions import ValidationError

from rest_framework.test import APIRequestFactory

from api.models import Service, Tag, Handshake, Comment, ReputationRep, ServiceMedia
from api.serializers import (
    ServiceSerializer, UserProfileSerializer, PublicUserProfileSerializer,
    CommentSerializer, HandshakeSerializer, TransactionHistorySerializer
)
from api.tests.helpers.factories import (
    UserFactory, ServiceFactory, TagFactory, HandshakeFactory, CommentFactory,
    ReputationRepFactory, TransactionHistoryFactory,
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

    def test_service_partial_update_keeps_offer_duration_rules(self):
        """PATCH without type should still enforce Offer/Need whole-hour limits."""
        service = ServiceFactory(type='Offer', duration=2)
        serializer = ServiceSerializer(service, data={'duration': 1.5}, partial=True)

        assert serializer.is_valid() is False
        assert serializer.errors['duration'][0] == 'Time credit must be a whole number.'
    
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
            'max_participants': 1,
            'schedule_type': 'One-Time',
            'scheduled_time': (timezone.now() + timedelta(days=3)).isoformat(),
            'status': 'Active',
            'tag_ids': [tag.id]
        })
        assert serializer.is_valid()
        service = serializer.save(user=user)
        assert service.title == 'New Service'
        assert service.user == user

    def test_fixed_group_offer_requires_exact_coords(self):
        """Fixed in-person group offers must include exact-address coordinates."""
        serializer = ServiceSerializer(data={
            'title': 'Fixed Group Offer',
            'description': 'A fixed-location group offer for multiple people.',
            'type': 'Offer',
            'duration': 2.0,
            'location_type': 'In-Person',
            'location_area': 'Kadıköy',
            'location_lat': 40.987654,
            'location_lng': 29.123456,
            'max_participants': 3,
            'schedule_type': 'One-Time',
            'scheduled_time': (timezone.now() + timedelta(days=3)).isoformat(),
            'session_exact_location': 'Caferağa Mahallesi, Moda Caddesi No: 185, Kadıköy, İstanbul, Türkiye',
        })

        assert serializer.is_valid() is False
        assert 'session_exact_location' in serializer.errors

    def test_non_owner_does_not_see_fixed_group_private_location_fields(self):
        """Private fixed-group session fields should stay hidden from non-owners."""
        owner = UserFactory()
        stranger = UserFactory()
        service = ServiceFactory(
            user=owner,
            type='Offer',
            location_type='In-Person',
            schedule_type='One-Time',
            max_participants=3,
            session_exact_location='Caferağa Mahallesi, Moda Caddesi No: 185, Kadıköy, İstanbul, Türkiye',
            session_exact_location_lat=Decimal('40.987654'),
            session_exact_location_lng=Decimal('29.123456'),
            session_location_guide='Veterinerin olduğu bina',
        )
        request = APIRequestFactory().get('/')
        request.user = stranger

        serializer = ServiceSerializer(service, context={'request': request})
        data = serializer.data

        assert 'session_exact_location' not in data
        assert 'session_exact_location_lat' not in data
        assert 'session_exact_location_lng' not in data
        assert 'session_location_guide' not in data

    def test_owner_sees_fixed_group_private_location_fields(self):
        """Service owner should receive private fixed-group session fields for editing."""
        owner = UserFactory()
        service = ServiceFactory(
            user=owner,
            type='Offer',
            location_type='In-Person',
            schedule_type='One-Time',
            max_participants=3,
            session_exact_location='Caferağa Mahallesi, Moda Caddesi No: 185, Kadıköy, İstanbul, Türkiye',
            session_exact_location_lat=Decimal('40.987654'),
            session_exact_location_lng=Decimal('29.123456'),
            session_location_guide='Veterinerin olduğu bina',
        )
        request = APIRequestFactory().get('/')
        request.user = owner

        serializer = ServiceSerializer(service, context={'request': request})
        data = serializer.data

        assert data['session_exact_location'] == service.session_exact_location
        assert data['session_exact_location_lat'] == '40.987654'
        assert data['session_exact_location_lng'] == '29.123456'
        assert data['session_location_guide'] == 'Veterinerin olduğu bina'

    def test_service_creation_accepts_single_tag_id_string(self):
        """Test service creation accepts scalar tag_ids payload."""
        user = UserFactory()
        tag = TagFactory()
        serializer = ServiceSerializer(data={
            'title': 'Single Tag Service',
            'description': 'A service with one scalar tag id',
            'type': 'Offer',
            'duration': 1.0,
            'location_type': 'In-Person',
            'location_area': 'Kadıköy',
            'location_lat': 41.0082,
            'location_lng': 28.9784,
            'max_participants': 1,
            'schedule_type': 'One-Time',
            'status': 'Active',
            'tag_ids': tag.id,
        })
        assert serializer.is_valid(), serializer.errors
        service = serializer.save(user=user)
        assert service.tags.filter(id=tag.id).exists()

    @patch('api.wikidata.fetch_wikidata_item', return_value=None)
    def test_service_creation_uses_wikidata_labels_json(self, _mock_fetch):
        """Test QID tags use provided label map when external lookup is unavailable."""
        user = UserFactory()
        serializer = ServiceSerializer(data={
            'title': 'Yoga Session',
            'description': 'Community yoga practice in the park',
            'type': 'Event',
            'duration': 1.0,
            'location_type': 'In-Person',
            'location_area': 'Kadıköy',
            'location_lat': 41.0082,
            'location_lng': 28.9784,
            'max_participants': 10,
            'schedule_type': 'One-Time',
            'status': 'Active',
            'tag_ids': ['Q17195715'],
            'wikidata_labels_json': '{"Q17195715": "Yoga"}',
        })

        assert serializer.is_valid(), serializer.errors
        service = serializer.save(user=user)
        tag = service.tags.get(id='Q17195715')
        assert tag.name == 'Yoga'

    def test_service_update_replaces_and_reorders_media(self):
        """Test edit flow can keep one media item, remove one, and append a new upload."""
        user = UserFactory()
        service = ServiceFactory(user=user)
        media_keep = ServiceMedia.objects.create(
            service=service,
            media_type='image',
            file_url='https://upload.wikimedia.org/wikipedia/commons/3/3f/Fronalpstock_big.jpg',
            display_order=0,
        )
        ServiceMedia.objects.create(
            service=service,
            media_type='image',
            file_url='https://upload.wikimedia.org/wikipedia/commons/a/a9/Example.jpg',
            display_order=1,
        )

        upload = SimpleUploadedFile('fresh.jpg', b'fresh-image-bytes', content_type='image/jpeg')
        factory = APIRequestFactory()
        request = factory.patch(
            f'/api/services/{service.id}/',
            {
                'title': service.title,
                'description': service.description,
                'duration': str(service.duration),
                'location_type': service.location_type,
                'max_participants': str(service.max_participants),
                'schedule_type': service.schedule_type,
                'replace_media': 'true',
                'media_order': [f'existing:{media_keep.id}', 'new:0'],
                'media': [upload],
            },
            format='multipart',
        )
        request.user = user
        request._files = MultiValueDict({'media': [upload]})

        serializer = ServiceSerializer(
            service,
            data={
                'title': service.title,
                'description': service.description,
                'duration': service.duration,
                'location_type': service.location_type,
                'max_participants': service.max_participants,
                'schedule_type': service.schedule_type,
                'replace_media': True,
                'media_order': [f'existing:{media_keep.id}', 'new:0'],
            },
            partial=True,
            context={'request': request},
        )

        assert serializer.is_valid(), serializer.errors
        serializer.save()

        media = list(service.media.order_by('display_order', 'created_at'))
        assert len(media) == 2
        assert str(media[0].id) == str(media_keep.id)
        assert media[0].display_order == 0
        assert media[1].display_order == 1
        assert media[1].file


@pytest.mark.django_db
@pytest.mark.unit
class TestUserProfileSerializer:
    """Test UserProfileSerializer"""
    
    def test_user_profile_serialization(self):
        """Test user profile serialization"""
        user = UserFactory(
            first_name='Elif',
            last_name='Yilmaz',
            bio='Community-focused learner',
            avatar_url='https://example.com/avatars/elif.jpg',
        )
        serializer = UserProfileSerializer(user)
        data = serializer.data
        assert data['email'] == user.email
        assert data['first_name'] == user.first_name
        assert data['last_name'] == user.last_name
        assert data['bio'] == user.bio
        assert data['avatar_url'] == user.avatar_url
        assert data['date_joined'].startswith(user.date_joined.date().isoformat())
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

    def test_user_profile_partial_update_fields_and_read_only_email(self):
        """Editable fields update; email remains read-only."""
        user = UserFactory(
            first_name='Before',
            last_name='User',
            bio='Before bio',
            avatar_url='https://example.com/avatars/before.jpg',
            show_history=True,
        )
        serializer = UserProfileSerializer(user, data={
            'first_name': 'After',
            'last_name': 'Profile',
            'bio': 'After bio',
            'avatar_url': 'https://example.com/avatars/after.jpg',
            'show_history': False,
            'email': 'should-not-change@example.com',
        }, partial=True)
        assert serializer.is_valid(), serializer.errors
        serializer.save()

        user.refresh_from_db()
        assert user.first_name == 'After'
        assert user.last_name == 'Profile'
        assert user.bio == 'After bio'
        assert user.avatar_url == 'https://example.com/avatars/after.jpg'
        assert user.show_history is False
        assert user.email != 'should-not-change@example.com'

    @pytest.mark.parametrize(
        'payload,expected_field',
        [
            ({'first_name': 'x' * 151}, 'first_name'),
            ({'last_name': 'x' * 151}, 'last_name'),
            ({'avatar_url': 'javascript:alert(1)'}, 'avatar_url'),
        ],
    )
    def test_user_profile_rejects_invalid_profile_inputs(self, payload, expected_field):
        """Invalid profile inputs should fail validation before update/save."""
        user = UserFactory(
            first_name='Elif',
            last_name='Yilmaz',
            avatar_url='https://example.com/avatars/original.jpg',
        )
        serializer = UserProfileSerializer(user, data=payload, partial=True)

        assert serializer.is_valid() is False
        assert expected_field in serializer.errors


@pytest.mark.django_db
@pytest.mark.unit
class TestPublicUserProfileSerializer:
    """Test PublicUserProfileSerializer"""

    def test_public_profile_serializer_hides_sensitive_fields(self):
        """Public serializer should not expose email, role internals, or security metadata."""
        user = UserFactory()
        serializer = PublicUserProfileSerializer(user)
        data = serializer.data

        assert data['id'] == str(user.id)
        assert 'email' not in data
        assert 'role' not in data
        assert 'timebank_balance' not in data
        assert 'is_verified' not in data
        assert 'is_onboarded' not in data


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

    def test_user_has_reviewed_false_when_no_rep(self):
        """user_has_reviewed is False when current user has not submitted a review"""
        provider = UserFactory()
        requester = UserFactory()
        service = ServiceFactory(user=provider, type='Offer')
        handshake = HandshakeFactory(service=service, requester=requester, status='completed')
        request = APIRequestFactory().get('/')
        request.user = requester
        serializer = HandshakeSerializer(handshake, context={'request': request})
        assert serializer.data['user_has_reviewed'] is False

    def test_user_has_reviewed_true_when_rep_exists(self):
        """user_has_reviewed is True when current user has submitted a review for this handshake"""
        provider = UserFactory()
        requester = UserFactory()
        service = ServiceFactory(user=provider, type='Offer')
        handshake = HandshakeFactory(service=service, requester=requester, status='completed')
        ReputationRepFactory(handshake=handshake, giver=requester, receiver=provider)
        request = APIRequestFactory().get('/')
        request.user = requester
        serializer = HandshakeSerializer(handshake, context={'request': request})
        assert serializer.data['user_has_reviewed'] is True

    def test_offer_handshake_exposes_counterpart_and_provider_role(self):
        """Offer handshakes should expose requester as counterpart for the provider."""
        provider = UserFactory(first_name='Elif', last_name='Yılmaz')
        requester = UserFactory(first_name='Cem', last_name='Demir')
        service = ServiceFactory(user=provider, type='Offer', title='Mantı Workshop')
        handshake = HandshakeFactory(service=service, requester=requester, status='accepted')
        request = APIRequestFactory().get('/')
        request.user = provider

        serializer = HandshakeSerializer(handshake, context={'request': request})
        data = serializer.data

        assert data['service_type'] == 'Offer'
        assert data['provider_name'] == 'Elif Yılmaz'
        assert data['is_current_user_provider'] is True
        assert data['counterpart']['id'] == str(requester.id)
        assert data['counterpart']['email'] == requester.email

    def test_need_handshake_exposes_requester_as_provider(self):
        """Need handshakes should mark requester as provider and owner as counterpart."""
        service_owner = UserFactory(first_name='Elif', last_name='Yılmaz')
        requester = UserFactory(first_name='Can', last_name='Şahin')
        service = ServiceFactory(user=service_owner, type='Need', title='Cooking Help')
        handshake = HandshakeFactory(service=service, requester=requester, status='accepted')
        request = APIRequestFactory().get('/')
        request.user = service_owner

        serializer = HandshakeSerializer(handshake, context={'request': request})
        data = serializer.data

        assert data['service_type'] == 'Need'
        assert data['provider_name'] == 'Can Şahin'
        assert data['is_current_user_provider'] is False
        assert data['counterpart']['id'] == str(requester.id)
        assert data['counterpart']['email'] == requester.email

    def test_handshake_serializes_exact_location_guide(self):
        """Handshake serializer should expose optional location guide when present."""
        handshake = HandshakeFactory(exact_location_guide='Veterinerin olduğu bina')

        serializer = HandshakeSerializer(handshake)
        data = serializer.data

        assert data['exact_location_guide'] == 'Veterinerin olduğu bina'


@pytest.mark.django_db
@pytest.mark.unit
class TestTransactionHistorySerializer:
    """Test TransactionHistorySerializer"""

    def test_offer_transaction_marks_requester_as_receiver(self):
        """Offer transaction for requester should expose provider counterpart and false role flag."""
        provider = UserFactory(first_name='Mehmet', last_name='Özkan')
        requester = UserFactory(first_name='Elif', last_name='Yılmaz')
        service = ServiceFactory(user=provider, type='Offer', title='Genealogy Help')
        handshake = HandshakeFactory(service=service, requester=requester, status='completed')
        transaction = TransactionHistoryFactory(
            user=requester,
            handshake=handshake,
            transaction_type='provision',
        )

        serializer = TransactionHistorySerializer(transaction)
        data = serializer.data

        assert data['service_title'] == 'Genealogy Help'
        assert data['service_type'] == 'Offer'
        assert data['is_current_user_provider'] is False
        assert data['counterpart']['id'] == str(provider.id)
        assert data['counterpart']['email'] == provider.email

    def test_need_transaction_marks_requester_as_provider(self):
        """Need transaction for requester should expose provider role and owner counterpart."""
        service_owner = UserFactory(first_name='Zeynep', last_name='Arslan')
        requester = UserFactory(first_name='Elif', last_name='Yılmaz')
        service = ServiceFactory(user=service_owner, type='Need', title='Coffee Lesson')
        handshake = HandshakeFactory(service=service, requester=requester, status='accepted')
        transaction = TransactionHistoryFactory(
            user=requester,
            handshake=handshake,
            transaction_type='transfer',
        )

        serializer = TransactionHistorySerializer(transaction)
        data = serializer.data

        assert data['service_title'] == 'Coffee Lesson'
        assert data['service_type'] == 'Need'
        assert data['is_current_user_provider'] is True
        assert data['counterpart']['id'] == str(service_owner.id)
        assert data['counterpart']['email'] == service_owner.email

    def test_adjustment_transaction_allows_null_handshake(self):
        """Adjustment transactions without a handshake should serialize nullable fields as None."""
        user = UserFactory()
        transaction = TransactionHistoryFactory(
            user=user,
            handshake=None,
            transaction_type='adjustment',
            description='Manual admin adjustment',
        )

        serializer = TransactionHistorySerializer(transaction)
        data = serializer.data

        assert data['handshake_id'] is None
        assert data['service_id'] is None
        assert data['service_title'] is None
        assert data['service_type'] is None
        assert data['schedule_type'] is None
        assert data['max_participants'] is None
        assert data['counterpart'] is None
        assert data['is_current_user_provider'] is False

    def test_need_service_level_reservation_uses_service_fallback(self):
        """Service-level Need reservations should still serialize service metadata."""
        owner = UserFactory(first_name='Ayşe', last_name='Demir')
        service = ServiceFactory(user=owner, type='Need', title='Need Reservation')
        transaction = TransactionHistoryFactory(
            user=owner,
            service=service,
            handshake=None,
            transaction_type='provision',
            description='Hours reserved for request',
        )

        serializer = TransactionHistorySerializer(transaction)
        data = serializer.data

        assert data['handshake_id'] is None
        assert data['service_id'] == str(service.id)
        assert data['service_title'] == 'Need Reservation'
        assert data['service_type'] == 'Need'
        assert data['schedule_type'] == service.schedule_type
        assert data['max_participants'] == service.max_participants
        assert data['counterpart']['id'] == str(owner.id)
        assert data['counterpart']['email'] == owner.email
        assert data['is_current_user_provider'] is False

    def test_completed_need_service_level_reservation_uses_helper_counterpart(self):
        """Completed Need reservation rows should show the helper instead of the owner."""
        owner = UserFactory(first_name='Ayşe', last_name='Demir')
        helper = UserFactory(first_name='Can', last_name='Şahin')
        service = ServiceFactory(user=owner, type='Need', title='Completed Need', status='Completed')
        HandshakeFactory(service=service, requester=helper, status='completed')
        transaction = TransactionHistoryFactory(
            user=owner,
            service=service,
            handshake=None,
            transaction_type='provision',
            description='Hours reserved for request',
        )

        serializer = TransactionHistorySerializer(transaction)
        data = serializer.data

        assert data['handshake_id'] is None
        assert data['service_status'] == 'Completed'
        assert data['counterpart']['id'] == str(helper.id)
        assert data['counterpart']['email'] == helper.email


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
