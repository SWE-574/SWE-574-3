"""
Unit tests for models
"""
import pytest
from decimal import Decimal
from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.utils import timezone
from datetime import timedelta

from api.models import (
    User, Service, Handshake, Comment, ReputationRep,
    TransactionHistory, Tag, Badge, UserBadge, ChatMessage,
    ForumCategory, ForumTopic, ForumPost
)
from api.tests.helpers.factories import (
    UserFactory, ServiceFactory, HandshakeFactory,
    TagFactory, CommentFactory, ReputationRepFactory
)


@pytest.mark.django_db
@pytest.mark.unit
class TestUserModel:
    """Test User model"""
    
    def test_user_creation(self):
        """Test basic user creation"""
        user = UserFactory()
        assert user.email is not None
        assert user.timebank_balance == Decimal('3.00')
        assert user.karma_score == 0
        assert user.role == 'member'
        assert user.is_active is True
    
    def test_user_default_balance(self):
        """Test default timebank balance"""
        user = UserFactory(timebank_balance=None)
        user.save()
        assert user.timebank_balance == Decimal('3.00')
    
    def test_user_balance_constraint(self):
        """Test timebank balance minimum constraint"""
        user = UserFactory()
        user.timebank_balance = Decimal('-11.00')
        with pytest.raises(IntegrityError):
            user.save()
    
    def test_user_email_unique(self):
        """Test email uniqueness"""
        UserFactory(email='test@example.com')
        with pytest.raises(IntegrityError):
            UserFactory(email='test@example.com')
    
    def test_user_str_representation(self):
        """Test user string representation"""
        user = UserFactory(email='test@example.com')
        assert str(user) == 'test@example.com'
    
    def test_user_portfolio_images_limit(self):
        """Test portfolio images field accepts list"""
        user = UserFactory()
        user.portfolio_images = ['url1', 'url2', 'url3']
        user.save()
        assert len(user.portfolio_images) == 3


@pytest.mark.django_db
@pytest.mark.unit
class TestServiceModel:
    """Test Service model"""
    
    def test_service_creation(self):
        """Test basic service creation"""
        service = ServiceFactory()
        assert service.title is not None
        assert service.duration > 0
        assert service.max_participants > 0
        assert service.status == 'Active'
    
    def test_service_duration_constraint(self):
        """Test duration must be positive"""
        service = ServiceFactory()
        service.duration = Decimal('0.00')
        with pytest.raises(IntegrityError):
            service.save()
    
    def test_service_max_participants_constraint(self):
        """Test max_participants must be positive"""
        service = ServiceFactory()
        service.max_participants = 0
        with pytest.raises(IntegrityError):
            service.save()
    
    def test_service_location_creation(self):
        """Test service location Point field creation"""
        service = ServiceFactory(
            location_type='In-Person',
            location_lat=Decimal('41.0082'),
            location_lng=Decimal('28.9784')
        )
        assert service.location is not None
        assert service.location.x == float(Decimal('28.9784'))
        assert service.location.y == float(Decimal('41.0082'))
    
    def test_service_hot_score_calculation(self):
        """Test hot_score is calculated on save"""
        service = ServiceFactory(status='Active')
        assert service.hot_score is not None
        assert service.hot_score >= 0
    
    def test_service_str_representation(self):
        """Test service string representation"""
        service = ServiceFactory(title='Test Service')
        assert str(service) == 'Test Service'


@pytest.mark.django_db
@pytest.mark.unit
class TestHandshakeModel:
    """Test Handshake model"""
    
    def test_handshake_creation(self):
        """Test basic handshake creation"""
        handshake = HandshakeFactory()
        assert handshake.status == 'pending'
        assert handshake.provisioned_hours >= 0
        assert handshake.service is not None
        assert handshake.requester is not None
    
    def test_handshake_provisioned_hours_constraint(self):
        """Test provisioned_hours must be positive"""
        handshake = HandshakeFactory()
        handshake.provisioned_hours = Decimal('0.00')
        with pytest.raises(IntegrityError):
            handshake.save()
    
    def test_handshake_status_choices(self):
        """Test handshake status choices"""
        handshake = HandshakeFactory()
        valid_statuses = ['pending', 'accepted', 'denied', 'cancelled', 'completed', 'reported', 'paused']
        for status in valid_statuses:
            handshake.status = status
            handshake.save()
            assert handshake.status == status
    
    def test_handshake_str_representation(self):
        """Test handshake string representation"""
        user = UserFactory(email='requester@test.com')
        service = ServiceFactory(title='Test Service')
        handshake = HandshakeFactory(requester=user, service=service)
        assert 'requester@test.com' in str(handshake)
        assert 'Test Service' in str(handshake)


@pytest.mark.django_db
@pytest.mark.unit
class TestCommentModel:
    """Test Comment model"""
    
    def test_comment_creation(self):
        """Test basic comment creation"""
        comment = CommentFactory()
        assert comment.body is not None
        assert comment.is_deleted is False
        assert comment.service is not None
        assert comment.user is not None
    
    def test_comment_reply(self):
        """Test comment reply relationship"""
        parent = CommentFactory()
        reply = CommentFactory(parent=parent, service=parent.service)
        assert reply.parent == parent
        assert parent.replies.filter(id=reply.id).exists()
    
    def test_verified_review_constraint(self):
        """Test verified review requires related_handshake"""
        service = ServiceFactory()
        user = UserFactory()
        handshake = HandshakeFactory(service=service, requester=user)
        
        comment = Comment.objects.create(
            service=service,
            user=user,
            body='Great service!',
            is_verified_review=True,
            related_handshake=handshake
        )
        assert comment.related_handshake == handshake


@pytest.mark.django_db
@pytest.mark.unit
class TestReputationRepModel:
    """Test ReputationRep model"""
    
    def test_reputation_creation(self):
        """Test basic reputation creation"""
        rep = ReputationRepFactory()
        assert rep.giver is not None
        assert rep.receiver is not None
        assert rep.handshake is not None
        assert rep.is_punctual is True
    
    def test_reputation_unique_constraint(self):
        """Test one reputation per handshake per giver"""
        handshake = HandshakeFactory()
        giver = UserFactory()
        receiver = UserFactory()
        
        ReputationRep.objects.create(
            handshake=handshake,
            giver=giver,
            receiver=receiver,
            is_punctual=True,
            is_helpful=True,
            is_kind=True
        )
        
        with pytest.raises(IntegrityError):
            ReputationRep.objects.create(
                handshake=handshake,
                giver=giver,
                receiver=receiver,
                is_punctual=True,
                is_helpful=True,
                is_kind=True
            )


@pytest.mark.django_db
@pytest.mark.unit
class TestTransactionHistoryModel:
    """Test TransactionHistory model"""
    
    def test_transaction_creation(self):
        """Test basic transaction creation"""
        user = UserFactory()
        handshake = HandshakeFactory()
        
        transaction = TransactionHistory.objects.create(
            user=user,
            transaction_type='transfer',
            amount=Decimal('2.00'),
            balance_after=Decimal('5.00'),
            handshake=handshake,
            description='Test transaction'
        )
        assert transaction.amount == Decimal('2.00')
        assert transaction.balance_after == Decimal('5.00')
        assert transaction.handshake == handshake


@pytest.mark.django_db
@pytest.mark.unit
class TestTagModel:
    """Test Tag model"""
    
    def test_tag_creation(self):
        """Test basic tag creation"""
        tag = TagFactory()
        assert tag.id is not None
        assert tag.name is not None
    
    def test_tag_name_unique(self):
        """Test tag name uniqueness"""
        TagFactory(name='Cooking')
        with pytest.raises(IntegrityError):
            TagFactory(name='Cooking')


@pytest.mark.django_db
@pytest.mark.unit
class TestBadgeModel:
    """Test Badge model"""
    
    def test_badge_creation(self):
        """Test basic badge creation"""
        badge = Badge.objects.create(
            id='test-badge',
            name='Test Badge',
            description='A test badge'
        )
        assert badge.id == 'test-badge'
        assert badge.name == 'Test Badge'


@pytest.mark.django_db
@pytest.mark.unit
class TestUserBadgeModel:
    """Test UserBadge model"""
    
    def test_user_badge_creation(self):
        """Test basic user badge creation"""
        user = UserFactory()
        badge = Badge.objects.create(id='test-badge', name='Test Badge')
        user_badge = UserBadge.objects.create(user=user, badge=badge)
        assert user_badge.user == user
        assert user_badge.badge == badge
    
    def test_user_badge_unique_constraint(self):
        """Test user can only have one of each badge"""
        user = UserFactory()
        badge = Badge.objects.create(id='test-badge', name='Test Badge')
        UserBadge.objects.create(user=user, badge=badge)
        
        with pytest.raises(IntegrityError):
            UserBadge.objects.create(user=user, badge=badge)


@pytest.mark.django_db
@pytest.mark.unit
class TestForumModels:
    """Test Forum models"""
    
    def test_forum_category_creation(self):
        """Test forum category creation"""
        category = ForumCategory.objects.create(
            name='General',
            description='General discussions',
            slug='general',
            icon='message-square',
            color='blue'
        )
        assert category.name == 'General'
        assert category.slug == 'general'
    
    def test_forum_topic_creation(self):
        """Test forum topic creation"""
        category = ForumCategory.objects.create(
            name='General',
            slug='general'
        )
        author = UserFactory()
        
        topic = ForumTopic.objects.create(
            category=category,
            author=author,
            title='Test Topic',
            body='Test body content'
        )
        assert topic.category == category
        assert topic.author == author
        assert topic.view_count == 0
    
    def test_forum_post_creation(self):
        """Test forum post creation"""
        category = ForumCategory.objects.create(name='General', slug='general')
        author = UserFactory()
        topic = ForumTopic.objects.create(
            category=category,
            author=author,
            title='Test Topic',
            body='Test body'
        )
        
        post = ForumPost.objects.create(
            topic=topic,
            author=author,
            body='Test post content'
        )
        assert post.topic == topic
        assert post.author == author
        assert post.is_deleted is False
