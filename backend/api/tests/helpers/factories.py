"""
Factory classes for creating test data using factory_boy
"""
import factory
from decimal import Decimal
from django.contrib.auth import get_user_model
from django.utils import timezone
from datetime import timedelta

from api.models import (
    Service, Tag, Handshake, ChatMessage, ReputationRep,
    Comment, NegativeRep, TransactionHistory, Badge, UserBadge,
    ForumCategory, ForumTopic, ForumPost, ServiceMedia
)

User = get_user_model()


class UserFactory(factory.django.DjangoModelFactory):
    """Factory for creating User instances"""
    class Meta:
        model = User
    
    email = factory.Sequence(lambda n: f'user{n}@test.com')
    first_name = factory.Faker('first_name')
    last_name = factory.Faker('last_name')
    password = factory.PostGenerationMethodCall('set_password', 'testpass123')
    timebank_balance = Decimal('3.00')
    karma_score = 0
    role = 'member'
    is_active = True

    @classmethod
    def _create(cls, model_class, *args, **kwargs):
        # User.date_joined uses auto_now_add=True, which overwrites provided values
        # on initial creation. Allow tests to override by updating after creation.
        date_joined = kwargs.pop('date_joined', None)
        user = super()._create(model_class, *args, **kwargs)
        if date_joined is not None:
            model_class.objects.filter(pk=user.pk).update(date_joined=date_joined)
            user.refresh_from_db(fields=['date_joined'])
        return user


class AdminUserFactory(UserFactory):
    """Factory for creating admin users"""
    role = 'admin'
    is_staff = True
    is_superuser = True
    karma_score = 100


class TagFactory(factory.django.DjangoModelFactory):
    """Factory for creating Tag instances"""
    class Meta:
        model = Tag
        django_get_or_create = ('id',)
    
    id = factory.Sequence(lambda n: f'Q{n}')
    name = factory.Faker('word')


class ServiceFactory(factory.django.DjangoModelFactory):
    """Factory for creating Service instances"""
    class Meta:
        model = Service
    
    user = factory.SubFactory(UserFactory)
    title = factory.Faker('sentence', nb_words=4)
    description = factory.Faker('text', max_nb_chars=500)
    type = factory.Iterator(['Offer', 'Need'])
    duration = Decimal('2.00')
    location_type = factory.Iterator(['In-Person', 'Online'])
    location_area = factory.Faker('city')
    location_lat = factory.Faker('latitude')
    location_lng = factory.Faker('longitude')
    max_participants = 1
    schedule_type = factory.Iterator(['One-Time', 'Recurrent'])
    schedule_details = factory.Faker('sentence')
    status = 'Active'
    is_visible = True


class HandshakeFactory(factory.django.DjangoModelFactory):
    """Factory for creating Handshake instances"""
    class Meta:
        model = Handshake
    
    service = factory.SubFactory(ServiceFactory)
    requester = factory.SubFactory(UserFactory)
    status = 'pending'
    provisioned_hours = factory.LazyAttribute(lambda obj: obj.service.duration)
    provider_initiated = False
    requester_initiated = False
    provider_confirmed_complete = False
    receiver_confirmed_complete = False


class ChatMessageFactory(factory.django.DjangoModelFactory):
    """Factory for creating ChatMessage instances"""
    class Meta:
        model = ChatMessage
    
    handshake = factory.SubFactory(HandshakeFactory)
    sender = factory.SubFactory(UserFactory)
    body = factory.Faker('sentence')


class ReputationRepFactory(factory.django.DjangoModelFactory):
    """Factory for creating ReputationRep instances"""
    class Meta:
        model = ReputationRep
    
    handshake = factory.SubFactory(HandshakeFactory)
    giver = factory.SubFactory(UserFactory)
    receiver = factory.SubFactory(UserFactory)
    is_punctual = True
    is_helpful = True
    is_kind = True
    comment = factory.Faker('sentence')


class CommentFactory(factory.django.DjangoModelFactory):
    """Factory for creating Comment instances"""
    class Meta:
        model = Comment
    
    service = factory.SubFactory(ServiceFactory)
    user = factory.SubFactory(UserFactory)
    body = factory.Faker('text', max_nb_chars=500)
    is_deleted = False
    is_verified_review = False


class TransactionHistoryFactory(factory.django.DjangoModelFactory):
    """Factory for creating TransactionHistory instances"""
    class Meta:
        model = TransactionHistory
    
    user = factory.SubFactory(UserFactory)
    transaction_type = factory.Iterator(['transfer', 'provision', 'refund'])
    amount = Decimal('2.00')
    balance_after = Decimal('5.00')
    handshake = factory.SubFactory(HandshakeFactory)
    description = factory.Faker('sentence')


class BadgeFactory(factory.django.DjangoModelFactory):
    """Factory for creating Badge instances"""
    class Meta:
        model = Badge
        django_get_or_create = ('id',)
    
    id = factory.Sequence(lambda n: f'badge-{n}')
    name = factory.Faker('word')
    description = factory.Faker('sentence')
    icon_url = factory.Faker('url')


class UserBadgeFactory(factory.django.DjangoModelFactory):
    """Factory for creating UserBadge instances"""
    class Meta:
        model = UserBadge
    
    user = factory.SubFactory(UserFactory)
    badge = factory.SubFactory(BadgeFactory)


class ForumCategoryFactory(factory.django.DjangoModelFactory):
    """Factory for creating ForumCategory instances"""
    class Meta:
        model = ForumCategory
    
    name = factory.Faker('word')
    description = factory.Faker('sentence')
    slug = factory.Sequence(lambda n: f'category-{n}')
    icon = 'message-square'
    color = 'blue'
    display_order = 0
    is_active = True


class ForumTopicFactory(factory.django.DjangoModelFactory):
    """Factory for creating ForumTopic instances"""
    class Meta:
        model = ForumTopic
    
    category = factory.SubFactory(ForumCategoryFactory)
    author = factory.SubFactory(UserFactory)
    title = factory.Faker('sentence', nb_words=6)
    body = factory.Faker('text', max_nb_chars=1000)
    is_pinned = False
    is_locked = False
    view_count = 0


class ForumPostFactory(factory.django.DjangoModelFactory):
    """Factory for creating ForumPost instances"""
    class Meta:
        model = ForumPost
    
    topic = factory.SubFactory(ForumTopicFactory)
    author = factory.SubFactory(UserFactory)
    body = factory.Faker('text', max_nb_chars=1000)
    is_deleted = False
