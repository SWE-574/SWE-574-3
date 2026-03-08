"""
Unit tests for Public Chat feature.

Tests the ChatRoom model, signal-based auto-creation, and PublicChatMessage functionality.
"""
from decimal import Decimal
from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APITestCase, APIClient
from rest_framework import status

from api.models import User, Service, ChatRoom, PublicChatMessage


class ChatRoomSignalTestCase(TestCase):
    """Test cases for automatic ChatRoom creation on Service creation."""

    def setUp(self):
        """Set up test data."""
        self.user = User.objects.create_user(
            email='test@test.com',
            password='testpass123',
            first_name='Test',
            last_name='User',
            timebank_balance=Decimal('10.00')
        )

    def test_chat_room_created_on_service_creation(self):
        """Test that a ChatRoom is created when a Service is created."""
        service = Service.objects.create(
            user=self.user,
            title='Test Service',
            description='A test service',
            type='Offer',
            duration=Decimal('2.00'),
            location_type='Online',
            max_participants=1,
            schedule_type='One-Time'
        )

        # Verify ChatRoom was created
        self.assertTrue(ChatRoom.objects.filter(related_service=service).exists())
        
        room = ChatRoom.objects.get(related_service=service)
        self.assertEqual(room.type, 'public')
        self.assertIn(service.title, room.name)

    def test_chat_room_type_is_public(self):
        """Test that auto-created ChatRoom has type 'public'."""
        service = Service.objects.create(
            user=self.user,
            title='Test Service',
            description='A test service',
            type='Need',
            duration=Decimal('1.00'),
            location_type='In-Person',
            location_area='Test Area',
            max_participants=5,
            schedule_type='Recurrent'
        )

        room = service.chat_room
        self.assertEqual(room.type, 'public')

    def test_chat_room_one_to_one_relationship(self):
        """Test that Service and ChatRoom have OneToOne relationship."""
        service = Service.objects.create(
            user=self.user,
            title='Test Service',
            description='A test service',
            type='Offer',
            duration=Decimal('2.00'),
            location_type='Online',
            max_participants=1,
            schedule_type='One-Time'
        )

        # Access chat_room via related_name
        room = service.chat_room
        self.assertIsNotNone(room)
        self.assertEqual(room.related_service, service)


class PublicChatMessageTestCase(TestCase):
    """Test cases for PublicChatMessage model."""

    def setUp(self):
        """Set up test data."""
        self.user1 = User.objects.create_user(
            email='user1@test.com',
            password='testpass123',
            first_name='User',
            last_name='One',
            timebank_balance=Decimal('10.00')
        )
        self.user2 = User.objects.create_user(
            email='user2@test.com',
            password='testpass123',
            first_name='User',
            last_name='Two',
            timebank_balance=Decimal('5.00')
        )
        
        self.service = Service.objects.create(
            user=self.user1,
            title='Test Service',
            description='A test service',
            type='Offer',
            duration=Decimal('2.00'),
            location_type='Online',
            max_participants=1,
            schedule_type='One-Time'
        )
        
        self.room = self.service.chat_room

    def test_create_public_chat_message(self):
        """Test creating a public chat message."""
        message = PublicChatMessage.objects.create(
            room=self.room,
            sender=self.user2,
            body='Hello, this is a public message!'
        )

        self.assertIsNotNone(message.id)
        self.assertEqual(message.room, self.room)
        self.assertEqual(message.sender, self.user2)
        self.assertEqual(message.body, 'Hello, this is a public message!')

    def test_multiple_users_can_post_messages(self):
        """Test that multiple users can post messages to the same room."""
        message1 = PublicChatMessage.objects.create(
            room=self.room,
            sender=self.user1,
            body='Message from user 1'
        )
        message2 = PublicChatMessage.objects.create(
            room=self.room,
            sender=self.user2,
            body='Message from user 2'
        )

        messages = PublicChatMessage.objects.filter(room=self.room)
        self.assertEqual(messages.count(), 2)

    def test_messages_ordered_by_created_at(self):
        """Test that messages are ordered by created_at ascending."""
        PublicChatMessage.objects.create(
            room=self.room,
            sender=self.user1,
            body='First message'
        )
        PublicChatMessage.objects.create(
            room=self.room,
            sender=self.user2,
            body='Second message'
        )

        messages = list(PublicChatMessage.objects.filter(room=self.room))
        self.assertEqual(messages[0].body, 'First message')
        self.assertEqual(messages[1].body, 'Second message')


class PublicChatAPITestCase(APITestCase):
    """Test cases for Public Chat API endpoints."""

    def setUp(self):
        """Set up test data."""
        self.user = User.objects.create_user(
            email='test@test.com',
            password='testpass123',
            first_name='Test',
            last_name='User',
            timebank_balance=Decimal('10.00')
        )
        self.other_user = User.objects.create_user(
            email='other@test.com',
            password='testpass123',
            first_name='Other',
            last_name='User',
            timebank_balance=Decimal('5.00')
        )
        
        self.service = Service.objects.create(
            user=self.user,
            title='Test Service',
            description='A test service',
            type='Offer',
            duration=Decimal('2.00'),
            location_type='Online',
            max_participants=1,
            schedule_type='One-Time'
        )
        
        self.client = APIClient()

    def test_get_public_chat_authenticated(self):
        """Test that authenticated users can retrieve public chat."""
        self.client.force_authenticate(user=self.other_user)
        
        response = self.client.get(f'/api/public-chat/{self.service.id}/')
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('room', response.data)
        self.assertIn('messages', response.data)

    def test_get_public_chat_unauthenticated(self):
        """Test that unauthenticated users cannot access public chat."""
        response = self.client.get(f'/api/public-chat/{self.service.id}/')
        
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_send_message_authenticated(self):
        """Test that authenticated users can send messages."""
        self.client.force_authenticate(user=self.other_user)
        
        response = self.client.post(f'/api/public-chat/{self.service.id}/', {
            'body': 'Hello from the lobby!'
        })
        
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['body'], 'Hello from the lobby!')
        self.assertEqual(response.data['sender_name'], 'Other User')

    def test_send_message_unauthenticated(self):
        """Test that unauthenticated users cannot send messages."""
        response = self.client.post(f'/api/public-chat/{self.service.id}/', {
            'body': 'Hello!'
        })
        
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_send_empty_message_fails(self):
        """Test that empty messages are rejected."""
        self.client.force_authenticate(user=self.user)
        
        response = self.client.post(f'/api/public-chat/{self.service.id}/', {
            'body': ''
        })
        
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_send_message_whitespace_only_fails(self):
        """Test that whitespace-only messages are rejected."""
        self.client.force_authenticate(user=self.user)
        
        response = self.client.post(f'/api/public-chat/{self.service.id}/', {
            'body': '   '
        })
        
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_get_nonexistent_service(self):
        """Test getting public chat for nonexistent service."""
        self.client.force_authenticate(user=self.user)
        
        response = self.client.get('/api/public-chat/00000000-0000-0000-0000-000000000000/')
        
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_message_sanitization(self):
        """Test that HTML in messages is sanitized."""
        self.client.force_authenticate(user=self.user)
        
        response = self.client.post(f'/api/public-chat/{self.service.id}/', {
            'body': '<script>alert("xss")</script>Hello'
        })
        
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertNotIn('<script>', response.data['body'])
        self.assertIn('Hello', response.data['body'])

    def test_chat_room_auto_created_on_first_access(self):
        """Test that ChatRoom is created on first access if missing."""
        # Create a service without triggering the signal (manually delete the room)
        room = self.service.chat_room
        room.delete()
        
        self.client.force_authenticate(user=self.user)
        
        response = self.client.get(f'/api/public-chat/{self.service.id}/')
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        # Room should be recreated
        self.assertTrue(ChatRoom.objects.filter(related_service=self.service).exists())

