"""
Tests for profile media fields and user history endpoint.

Covers:
- User model video_intro_url, portfolio_images, show_history fields
- GET /api/users/{id}/history/ endpoint
- Privacy toggle behavior
"""

from decimal import Decimal
from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APITestCase
from rest_framework import status

from api.models import User, Service, Handshake


class UserProfileMediaFieldsTestCase(TestCase):
    """Test cases for User model profile media fields."""
    
    def setUp(self):
        self.user = User.objects.create_user(
            email='test@example.com',
            password='testpass123',
            first_name='Test',
            last_name='User',
            timebank_balance=Decimal('5.00')
        )
    
    def test_video_intro_url_default_null(self):
        """video_intro_url should be null by default."""
        self.assertIsNone(self.user.video_intro_url)
    
    def test_video_intro_url_can_be_set(self):
        """video_intro_url can be set to a YouTube URL."""
        self.user.video_intro_url = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
        self.user.save()
        self.user.refresh_from_db()
        self.assertEqual(
            self.user.video_intro_url, 
            'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
        )
    
    def test_portfolio_images_default_empty_list(self):
        """portfolio_images should default to an empty list."""
        self.assertEqual(self.user.portfolio_images, [])
    
    def test_portfolio_images_can_store_urls(self):
        """portfolio_images can store an array of URLs."""
        images = [
            'https://example.com/image1.jpg',
            'https://example.com/image2.jpg',
            'https://example.com/image3.jpg',
        ]
        self.user.portfolio_images = images
        self.user.save()
        self.user.refresh_from_db()
        self.assertEqual(self.user.portfolio_images, images)
    
    def test_show_history_default_true(self):
        """show_history should default to True."""
        self.assertTrue(self.user.show_history)
    
    def test_show_history_can_be_toggled(self):
        """show_history can be set to False."""
        self.user.show_history = False
        self.user.save()
        self.user.refresh_from_db()
        self.assertFalse(self.user.show_history)


class UserHistoryEndpointTestCase(APITestCase):
    """Test cases for GET /api/users/{id}/history/ endpoint."""
    
    def setUp(self):
        # Create users
        self.user1 = User.objects.create_user(
            email='user1@example.com',
            password='testpass123',
            first_name='User',
            last_name='One',
            timebank_balance=Decimal('10.00'),
            show_history=True
        )
        self.user2 = User.objects.create_user(
            email='user2@example.com',
            password='testpass123',
            first_name='User',
            last_name='Two',
            timebank_balance=Decimal('10.00'),
            show_history=True
        )
        self.private_user = User.objects.create_user(
            email='private@example.com',
            password='testpass123',
            first_name='Private',
            last_name='User',
            timebank_balance=Decimal('10.00'),
            show_history=False
        )
        
        # Create a service by user1 (offer)
        self.service = Service.objects.create(
            user=self.user1,
            title='Test Service',
            description='A test service',
            type='Offer',
            duration=Decimal('2.00'),
            location_type='Online',
            status='Active',
            max_participants=1,
            schedule_type='One-Time'
        )
        
        # Create a completed handshake (user2 requested from user1's offer)
        self.handshake = Handshake.objects.create(
            service=self.service,
            requester=self.user2,
            status='completed',
            provisioned_hours=Decimal('2.00'),
            provider_confirmed_complete=True,
            receiver_confirmed_complete=True
        )
    
    def test_history_endpoint_returns_completed_handshakes(self):
        """History endpoint returns completed handshakes for public users."""
        url = reverse('user-history', kwargs={'id': self.user1.id})
        response = self.client.get(url)
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]['service_title'], 'Test Service')
    
    def test_history_endpoint_includes_correct_fields(self):
        """History response includes all required fields."""
        url = reverse('user-history', kwargs={'id': self.user1.id})
        response = self.client.get(url)
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        item = response.data[0]
        
        self.assertIn('service_title', item)
        self.assertIn('service_type', item)
        self.assertIn('duration', item)
        self.assertIn('partner_name', item)
        self.assertIn('partner_id', item)
        self.assertIn('completed_date', item)
        self.assertIn('was_provider', item)
    
    def test_history_identifies_provider_correctly(self):
        """History correctly identifies when user was provider vs receiver."""
        # User1 was the provider (service owner for Offer)
        url = reverse('user-history', kwargs={'id': self.user1.id})
        response = self.client.get(url)
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data[0]['was_provider'])
        
        # User2 was the receiver (requester for Offer)
        url = reverse('user-history', kwargs={'id': self.user2.id})
        response = self.client.get(url)
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(response.data[0]['was_provider'])
    
    def test_private_history_returns_empty_for_others(self):
        """Private user's history returns empty list for other users."""
        # Create a completed handshake for private user
        service = Service.objects.create(
            user=self.private_user,
            title='Private Service',
            description='A private service',
            type='Offer',
            duration=Decimal('1.00'),
            location_type='Online',
            status='Active',
            max_participants=1,
            schedule_type='One-Time'
        )
        Handshake.objects.create(
            service=service,
            requester=self.user1,
            status='completed',
            provisioned_hours=Decimal('1.00'),
            provider_confirmed_complete=True,
            receiver_confirmed_complete=True
        )
        
        # Anonymous request should get empty list
        url = reverse('user-history', kwargs={'id': self.private_user.id})
        response = self.client.get(url)
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data, [])
    
    def test_owner_can_see_own_private_history(self):
        """User can see their own history even if private."""
        # Create a completed handshake for private user
        service = Service.objects.create(
            user=self.private_user,
            title='Private Service',
            description='A private service',
            type='Offer',
            duration=Decimal('1.00'),
            location_type='Online',
            status='Active',
            max_participants=1,
            schedule_type='One-Time'
        )
        Handshake.objects.create(
            service=service,
            requester=self.user1,
            status='completed',
            provisioned_hours=Decimal('1.00'),
            provider_confirmed_complete=True,
            receiver_confirmed_complete=True
        )
        
        # Authenticated request as owner should see history
        self.client.force_authenticate(user=self.private_user)
        url = reverse('user-history', kwargs={'id': self.private_user.id})
        response = self.client.get(url)
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
    
    def test_nonexistent_user_returns_404(self):
        """Request for nonexistent user returns 404."""
        import uuid
        fake_id = uuid.uuid4()
        url = reverse('user-history', kwargs={'id': fake_id})
        response = self.client.get(url)
        
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
    
    def test_history_only_shows_completed_handshakes(self):
        """History only includes completed handshakes, not pending/cancelled."""
        # Create a pending handshake
        Handshake.objects.create(
            service=self.service,
            requester=self.user2,
            status='pending',
            provisioned_hours=Decimal('1.00')
        )
        
        url = reverse('user-history', kwargs={'id': self.user1.id})
        response = self.client.get(url)
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        # Should only show the completed one, not the pending
        self.assertEqual(len(response.data), 1)


class PortfolioImagesValidationTestCase(APITestCase):
    """Test cases for portfolio images validation."""
    
    def setUp(self):
        self.user = User.objects.create_user(
            email='test@example.com',
            password='testpass123',
            first_name='Test',
            last_name='User',
            timebank_balance=Decimal('5.00')
        )
        self.client.force_authenticate(user=self.user)
    
    def test_portfolio_images_max_5(self):
        """Portfolio images are limited to 5 items."""
        url = reverse('user-profile')
        data = {
            'portfolio_images': [
                'https://example.com/1.jpg',
                'https://example.com/2.jpg',
                'https://example.com/3.jpg',
                'https://example.com/4.jpg',
                'https://example.com/5.jpg',
                'https://example.com/6.jpg',  # This exceeds the limit
            ]
        }
        response = self.client.patch(url, data, format='json')
        
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
    
    def test_portfolio_images_accepts_5_or_less(self):
        """Portfolio images accepts 5 or fewer items."""
        url = reverse('user-profile')
        data = {
            'portfolio_images': [
                'https://example.com/1.jpg',
                'https://example.com/2.jpg',
                'https://example.com/3.jpg',
            ]
        }
        response = self.client.patch(url, data, format='json')
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data['portfolio_images']), 3)


class VideoIntroValidationTestCase(APITestCase):
    """Test cases for video intro URL validation."""
    
    def setUp(self):
        self.user = User.objects.create_user(
            email='test@example.com',
            password='testpass123',
            first_name='Test',
            last_name='User',
            timebank_balance=Decimal('5.00')
        )
        self.client.force_authenticate(user=self.user)
    
    def test_youtube_url_accepted(self):
        """YouTube URLs are accepted."""
        url = reverse('user-profile')
        data = {
            'video_intro_url': 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
        }
        response = self.client.patch(url, data, format='json')
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['video_intro_url'], data['video_intro_url'])
    
    def test_vimeo_url_accepted(self):
        """Vimeo URLs are accepted."""
        url = reverse('user-profile')
        data = {
            'video_intro_url': 'https://vimeo.com/123456789'
        }
        response = self.client.patch(url, data, format='json')
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['video_intro_url'], data['video_intro_url'])
    
    def test_https_url_accepted(self):
        """Regular HTTPS URLs are accepted."""
        url = reverse('user-profile')
        data = {
            'video_intro_url': 'https://example.com/video.mp4'
        }
        response = self.client.patch(url, data, format='json')
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)


class PrivacyToggleTestCase(APITestCase):
    """Test cases for privacy toggle persistence and behavior."""
    
    def setUp(self):
        self.user = User.objects.create_user(
            email='test@example.com',
            password='testpass123',
            first_name='Test',
            last_name='User',
            timebank_balance=Decimal('5.00')
        )
        self.client.force_authenticate(user=self.user)
    
    def test_show_history_can_be_updated(self):
        """show_history can be updated via API."""
        url = reverse('user-profile')
        
        # Turn off
        response = self.client.patch(url, {'show_history': False}, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(response.data['show_history'])
        
        # Verify in database
        self.user.refresh_from_db()
        self.assertFalse(self.user.show_history)
        
        # Turn back on
        response = self.client.patch(url, {'show_history': True}, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data['show_history'])
    
    def test_show_history_included_in_profile_response(self):
        """show_history is included in profile response."""
        url = reverse('user-profile')
        response = self.client.get(url)
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('show_history', response.data)
