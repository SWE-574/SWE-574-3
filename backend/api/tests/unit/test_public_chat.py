"""
Unit tests for Public Chat feature.

Tests the ChatRoom model, signal-based auto-creation, and PublicChatMessage functionality.
"""
from decimal import Decimal
from types import SimpleNamespace

import pytest
from rest_framework.test import APIClient

from api.models import ChatRoom, PublicChatMessage, Service, User


@pytest.fixture
def user(db):
    return User.objects.create_user(
        email='test@test.com', password='testpass123',
        first_name='Test', last_name='User',
        timebank_balance=Decimal('10.00'),
    )


@pytest.mark.django_db
def test_chat_room_created_on_service_creation(user):
    service = Service.objects.create(
        user=user, title='Test Service', description='A test service',
        type='Offer', duration=Decimal('2.00'), location_type='Online',
        max_participants=1, schedule_type='One-Time',
    )

    assert ChatRoom.objects.filter(related_service=service).exists()
    room = ChatRoom.objects.get(related_service=service)
    assert room.type == 'public'
    assert service.title in room.name


@pytest.mark.django_db
def test_chat_room_type_is_public(user):
    service = Service.objects.create(
        user=user, title='Test Service', description='A test service',
        type='Need', duration=Decimal('1.00'), location_type='In-Person',
        location_area='Test Area', max_participants=5, schedule_type='Recurrent',
    )
    assert service.chat_room.type == 'public'


@pytest.mark.django_db
def test_chat_room_one_to_one_relationship(user):
    service = Service.objects.create(
        user=user, title='Test Service', description='A test service',
        type='Offer', duration=Decimal('2.00'), location_type='Online',
        max_participants=1, schedule_type='One-Time',
    )
    room = service.chat_room
    assert room is not None
    assert room.related_service == service


@pytest.fixture
def message_env(db):
    user1 = User.objects.create_user(
        email='user1@test.com', password='testpass123',
        first_name='User', last_name='One',
        timebank_balance=Decimal('10.00'),
    )
    user2 = User.objects.create_user(
        email='user2@test.com', password='testpass123',
        first_name='User', last_name='Two',
        timebank_balance=Decimal('5.00'),
    )
    service = Service.objects.create(
        user=user1, title='Test Service', description='A test service',
        type='Offer', duration=Decimal('2.00'), location_type='Online',
        max_participants=1, schedule_type='One-Time',
    )
    return SimpleNamespace(user1=user1, user2=user2, service=service, room=service.chat_room)


@pytest.mark.django_db
def test_create_public_chat_message(message_env):
    message = PublicChatMessage.objects.create(
        room=message_env.room,
        sender=message_env.user2,
        body='Hello, this is a public message!',
    )

    assert message.id is not None
    assert message.room == message_env.room
    assert message.sender == message_env.user2
    assert message.body == 'Hello, this is a public message!'


@pytest.mark.django_db
def test_multiple_users_can_post_messages(message_env):
    PublicChatMessage.objects.create(
        room=message_env.room, sender=message_env.user1, body='Message from user 1',
    )
    PublicChatMessage.objects.create(
        room=message_env.room, sender=message_env.user2, body='Message from user 2',
    )

    messages = PublicChatMessage.objects.filter(room=message_env.room)
    assert messages.count() == 2


@pytest.mark.django_db
def test_messages_ordered_by_created_at(message_env):
    PublicChatMessage.objects.create(
        room=message_env.room, sender=message_env.user1, body='First message',
    )
    PublicChatMessage.objects.create(
        room=message_env.room, sender=message_env.user2, body='Second message',
    )

    messages = list(PublicChatMessage.objects.filter(room=message_env.room))
    assert messages[0].body == 'First message'
    assert messages[1].body == 'Second message'


@pytest.fixture
def api_env(db):
    user = User.objects.create_user(
        email='test@test.com', password='testpass123',
        first_name='Test', last_name='User',
        timebank_balance=Decimal('10.00'),
    )
    other_user = User.objects.create_user(
        email='other@test.com', password='testpass123',
        first_name='Other', last_name='User',
        timebank_balance=Decimal('5.00'),
    )
    service = Service.objects.create(
        user=user, title='Test Service', description='A test service',
        type='Offer', duration=Decimal('2.00'), location_type='Online',
        max_participants=1, schedule_type='One-Time',
    )
    return SimpleNamespace(user=user, other_user=other_user, service=service, client=APIClient())


@pytest.mark.django_db
def test_get_public_chat_authenticated(api_env):
    api_env.client.force_authenticate(user=api_env.other_user)
    response = api_env.client.get(f'/api/public-chat/{api_env.service.id}/')
    assert response.status_code == 200
    assert 'room' in response.data
    assert 'messages' in response.data


@pytest.mark.django_db
def test_get_public_chat_unauthenticated(api_env):
    response = api_env.client.get(f'/api/public-chat/{api_env.service.id}/')
    assert response.status_code == 401


@pytest.mark.django_db
def test_send_message_authenticated(api_env):
    api_env.client.force_authenticate(user=api_env.other_user)
    response = api_env.client.post(
        f'/api/public-chat/{api_env.service.id}/', {'body': 'Hello from the lobby!'},
    )
    assert response.status_code == 201
    assert response.data['body'] == 'Hello from the lobby!'
    assert response.data['sender_name'] == 'Other User'


@pytest.mark.django_db
def test_send_message_unauthenticated(api_env):
    response = api_env.client.post(
        f'/api/public-chat/{api_env.service.id}/', {'body': 'Hello!'},
    )
    assert response.status_code == 401


@pytest.mark.django_db
def test_send_empty_message_fails(api_env):
    api_env.client.force_authenticate(user=api_env.user)
    response = api_env.client.post(f'/api/public-chat/{api_env.service.id}/', {'body': ''})
    assert response.status_code == 400


@pytest.mark.django_db
def test_send_message_whitespace_only_fails(api_env):
    api_env.client.force_authenticate(user=api_env.user)
    response = api_env.client.post(f'/api/public-chat/{api_env.service.id}/', {'body': '   '})
    assert response.status_code == 400


@pytest.mark.django_db
def test_get_nonexistent_service(api_env):
    api_env.client.force_authenticate(user=api_env.user)
    response = api_env.client.get('/api/public-chat/00000000-0000-0000-0000-000000000000/')
    assert response.status_code == 404


@pytest.mark.django_db
def test_message_sanitization(api_env):
    api_env.client.force_authenticate(user=api_env.user)
    response = api_env.client.post(
        f'/api/public-chat/{api_env.service.id}/',
        {'body': '<script>alert("xss")</script>Hello'},
    )
    assert response.status_code == 201
    assert '<script>' not in response.data['body']
    assert 'Hello' in response.data['body']


@pytest.mark.django_db
def test_chat_room_auto_created_on_first_access(api_env):
    room = api_env.service.chat_room
    room.delete()

    api_env.client.force_authenticate(user=api_env.user)
    response = api_env.client.get(f'/api/public-chat/{api_env.service.id}/')

    assert response.status_code == 200
    assert ChatRoom.objects.filter(related_service=api_env.service).exists()
