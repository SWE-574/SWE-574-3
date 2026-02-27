"""
Tests for Comments, Ranking Algorithm, and Extended Badge System
"""
from decimal import Decimal
from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient
from rest_framework import status
from unittest.mock import patch
from datetime import timedelta
from django.utils import timezone

from api.models import (
    User, Service, Handshake, Comment, NegativeRep, 
    ReputationRep, Badge, UserBadge, TransactionHistory
)
from api.ranking import calculate_hot_score, calculate_hot_scores_batch
from api.achievement_utils import check_and_assign_badges, get_user_stats, get_achievement_progress


class CommentModelTest(TestCase):
    """Test Comment model functionality"""
    
    def setUp(self):
        self.user = User.objects.create_user(
            email='test@example.com',
            password='testpass123',
            first_name='Test',
            last_name='User'
        )
        self.service = Service.objects.create(
            user=self.user,
            title='Test Service',
            description='A test service',
            type='Offer',
            duration=Decimal('2.00'),
            location_type='Online',
            schedule_type='One-Time'
        )
    
    def test_create_top_level_comment(self):
        """Test creating a top-level comment"""
        comment = Comment.objects.create(
            service=self.service,
            user=self.user,
            body='Great service!'
        )
        self.assertIsNotNone(comment.id)
        self.assertIsNone(comment.parent)
        self.assertFalse(comment.is_deleted)
    
    def test_create_reply_comment(self):
        """Test creating a reply to a comment"""
        parent = Comment.objects.create(
            service=self.service,
            user=self.user,
            body='Great service!'
        )
        reply = Comment.objects.create(
            service=self.service,
            user=self.user,
            parent=parent,
            body='Thanks!'
        )
        self.assertEqual(reply.parent, parent)
        self.assertEqual(parent.replies.count(), 1)
    
    def test_soft_delete_comment(self):
        """Test soft deleting a comment"""
        comment = Comment.objects.create(
            service=self.service,
            user=self.user,
            body='Test comment'
        )
        comment.is_deleted = True
        comment.save()
        
        # Comment still exists but is marked as deleted
        self.assertTrue(Comment.objects.filter(id=comment.id).exists())
        self.assertTrue(Comment.objects.get(id=comment.id).is_deleted)


class NegativeRepModelTest(TestCase):
    """Test NegativeRep model functionality"""
    
    def setUp(self):
        self.provider = User.objects.create_user(
            email='provider@example.com',
            password='testpass123',
            first_name='Provider',
            last_name='User',
            timebank_balance=Decimal('10.00')
        )
        self.receiver = User.objects.create_user(
            email='receiver@example.com',
            password='testpass123',
            first_name='Receiver',
            last_name='User',
            timebank_balance=Decimal('10.00')
        )
        self.service = Service.objects.create(
            user=self.provider,
            title='Test Service',
            description='A test service',
            type='Offer',
            duration=Decimal('2.00'),
            location_type='Online',
            schedule_type='One-Time'
        )
        self.handshake = Handshake.objects.create(
            service=self.service,
            requester=self.receiver,
            status='completed',
            provisioned_hours=Decimal('2.00')
        )
    
    def test_create_negative_rep(self):
        """Test creating a negative reputation"""
        neg_rep = NegativeRep.objects.create(
            handshake=self.handshake,
            giver=self.receiver,
            receiver=self.provider,
            is_late=True,
            comment='Was 30 minutes late'
        )
        self.assertIsNotNone(neg_rep.id)
        self.assertTrue(neg_rep.is_late)
        self.assertFalse(neg_rep.is_unhelpful)
        self.assertFalse(neg_rep.is_rude)
    
    def test_unique_negative_rep_per_handshake_giver(self):
        """Test that a user can only give one negative rep per handshake"""
        NegativeRep.objects.create(
            handshake=self.handshake,
            giver=self.receiver,
            receiver=self.provider,
            is_late=True
        )
        # Attempt to create another should raise IntegrityError
        from django.db import IntegrityError
        with self.assertRaises(IntegrityError):
            NegativeRep.objects.create(
                handshake=self.handshake,
                giver=self.receiver,
                receiver=self.provider,
                is_rude=True
            )


class RankingAlgorithmTest(TestCase):
    """Test hot score ranking algorithm"""
    
    def setUp(self):
        self.user = User.objects.create_user(
            email='test@example.com',
            password='testpass123',
            first_name='Test',
            last_name='User'
        )
        self.service = Service.objects.create(
            user=self.user,
            title='Test Service',
            description='A test service',
            type='Offer',
            duration=Decimal('2.00'),
            location_type='Online',
            schedule_type='One-Time'
        )
    
    def test_calculate_hot_score_new_service(self):
        """Test hot score for a brand new service"""
        score = calculate_hot_score(self.service)
        # New service with no reputation or comments should have score ~0
        self.assertGreaterEqual(score, 0)
    
    def test_hot_score_increases_with_comments(self):
        """Test that hot score increases with comments"""
        initial_score = calculate_hot_score(self.service)
        
        # Add comments
        for i in range(5):
            Comment.objects.create(
                service=self.service,
                user=self.user,
                body=f'Comment {i}'
            )
        
        new_score = calculate_hot_score(self.service)
        self.assertGreater(new_score, initial_score)
    
    def test_hot_score_decreases_with_time(self):
        """Test that hot score decreases as service ages"""
        # Add a comment to make scores non-zero
        Comment.objects.create(
            service=self.service,
            user=self.user,
            body='Test comment'
        )
        
        score1 = calculate_hot_score(self.service)
        
        # Create an older service with the same comment
        old_service = Service.objects.create(
            user=self.user,
            title='Old Service',
            description='An old service',
            type='Offer',
            duration=Decimal('2.00'),
            location_type='Online',
            schedule_type='One-Time'
        )
        # Manually set created_at to 1 week ago
        old_service.created_at = timezone.now() - timedelta(days=7)
        old_service.save(update_fields=['created_at'])
        
        # Add a comment to the old service too
        Comment.objects.create(
            service=old_service,
            user=self.user,
            body='Test comment'
        )
        
        score2 = calculate_hot_score(old_service)
        
        # Newer service should have higher score (same comments, different time)
        self.assertGreater(score1, score2)
    
    def test_batch_score_calculation(self):
        """Test batch hot score calculation"""
        # Create multiple services
        services = [self.service]
        for i in range(4):
            s = Service.objects.create(
                user=self.user,
                title=f'Service {i}',
                description='Test',
                type='Offer',
                duration=Decimal('1.00'),
                location_type='Online',
                schedule_type='One-Time'
            )
            services.append(s)
        
        scores = calculate_hot_scores_batch(services)
        
        self.assertEqual(len(scores), 5)
        for service in services:
            self.assertIn(service.id, scores)


class BadgeSystemTest(TestCase):
    """Test extended badge system"""
    
    def setUp(self):
        self.user = User.objects.create_user(
            email='test@example.com',
            password='testpass123',
            first_name='Test',
            last_name='User',
            timebank_balance=Decimal('10.00')
        )
        self.other_user = User.objects.create_user(
            email='other@example.com',
            password='testpass123',
            first_name='Other',
            last_name='User',
            timebank_balance=Decimal('10.00')
        )
    
    def test_get_user_stats(self):
        """Test that user stats are calculated correctly"""
        stats = get_user_stats(self.user)
        
        self.assertIn('completed_services', stats)
        self.assertIn('offer_count', stats)
        self.assertIn('helpful_count', stats)
        self.assertIn('kindness_count', stats)
        self.assertIn('punctual_count', stats)
        self.assertIn('comments_posted', stats)
        self.assertIn('comments_on_services', stats)
        self.assertIn('hours_given', stats)
        self.assertIn('negative_rep_count', stats)
    
    def test_community_voice_badge(self):
        """Test earning Community Voice badge for 10+ comments"""
        service = Service.objects.create(
            user=self.other_user,
            title='Test Service',
            description='Test',
            type='Offer',
            duration=Decimal('1.00'),
            location_type='Online',
            schedule_type='One-Time'
        )
        
        # Create 10 comments
        for i in range(10):
            Comment.objects.create(
                service=service,
                user=self.user,
                body=f'Comment {i}'
            )
        
        # Check badges
        new_badges = check_and_assign_badges(self.user)
        
        self.assertIn('community-voice', new_badges)
        self.assertTrue(
            UserBadge.objects.filter(user=self.user, badge_id='community-voice').exists()
        )
    
    def test_first_service_badge(self):
        """Test earning First Service badge after first completed handshake"""
        service = Service.objects.create(
            user=self.user,
            title='Test Service',
            description='Test',
            type='Offer',
            duration=Decimal('1.00'),
            location_type='Online',
            schedule_type='One-Time'
        )
        
        handshake = Handshake.objects.create(
            service=service,
            requester=self.other_user,
            status='completed',
            provisioned_hours=Decimal('1.00')
        )
        
        new_badges = check_and_assign_badges(self.user)
        
        self.assertIn('first-service', new_badges)
    
    def test_badge_not_duplicated(self):
        """Test that badges are not assigned twice"""
        service = Service.objects.create(
            user=self.user,
            title='Test Service',
            description='Test',
            type='Offer',
            duration=Decimal('1.00'),
            location_type='Online',
            schedule_type='One-Time'
        )
        
        Handshake.objects.create(
            service=service,
            requester=self.other_user,
            status='completed',
            provisioned_hours=Decimal('1.00')
        )
        
        # First check
        new_badges1 = check_and_assign_badges(self.user)
        # Second check
        new_badges2 = check_and_assign_badges(self.user)
        
        self.assertIn('first-service', new_badges1)
        self.assertNotIn('first-service', new_badges2)
        
        # Should only have one badge record
        self.assertEqual(
            UserBadge.objects.filter(user=self.user, badge_id='first-service').count(),
            1
        )
    
    def test_get_badge_progress(self):
        """Test getting badge progress"""
        progress = get_achievement_progress(self.user)
        
        self.assertIn('first-service', progress)
        self.assertIn('community-voice', progress)
        self.assertIn('time-giver-bronze', progress)
        
        # Check structure
        first_service = progress['first-service']
        self.assertIn('earned', first_service)
        self.assertIn('current', first_service)
        self.assertIn('threshold', first_service)
        self.assertIn('progress_percent', first_service)


class CommentAPITest(TestCase):
    """Test Comment API endpoints"""
    
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            email='test@example.com',
            password='testpass123',
            first_name='Test',
            last_name='User'
        )
        self.other_user = User.objects.create_user(
            email='other@example.com',
            password='testpass123',
            first_name='Other',
            last_name='User'
        )
        self.service = Service.objects.create(
            user=self.other_user,
            title='Test Service',
            description='A test service',
            type='Offer',
            duration=Decimal('2.00'),
            location_type='Online',
            schedule_type='One-Time'
        )
    
    def test_list_comments_unauthenticated(self):
        """Test that unauthenticated users can view comments"""
        Comment.objects.create(
            service=self.service,
            user=self.user,
            body='Test comment'
        )
        
        url = reverse('service-comments', kwargs={'service_id': self.service.id})
        response = self.client.get(url)
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
    
    def test_create_comment_authenticated(self):
        """Test that authenticated users cannot create service comments (read-only endpoint)"""
        self.client.force_authenticate(user=self.user)
        
        url = reverse('service-comments', kwargs={'service_id': self.service.id})
        data = {'body': 'Great service!'}
        response = self.client.post(url, data, format='json')
        
        self.assertEqual(response.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)
        self.assertEqual(Comment.objects.count(), 0)
    
    def test_create_comment_unauthenticated(self):
        """Test that unauthenticated users cannot create comments"""
        url = reverse('service-comments', kwargs={'service_id': self.service.id})
        data = {'body': 'Test comment'}
        response = self.client.post(url, data, format='json')
        
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
    
    def test_create_reply(self):
        """Test that replies cannot be created via service comments API (read-only endpoint)"""
        self.client.force_authenticate(user=self.user)
        
        parent = Comment.objects.create(
            service=self.service,
            user=self.other_user,
            body='Original comment'
        )
        
        url = reverse('service-comments', kwargs={'service_id': self.service.id})
        data = {'body': 'Reply!', 'parent_id': str(parent.id)}
        response = self.client.post(url, data, format='json')
        
        self.assertEqual(response.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)
        self.assertEqual(Comment.objects.count(), 1)
    
    def test_cannot_reply_to_reply(self):
        """Test that service comments API rejects posting (read-only endpoint)"""
        self.client.force_authenticate(user=self.user)
        
        parent = Comment.objects.create(
            service=self.service,
            user=self.other_user,
            body='Original comment'
        )
        reply = Comment.objects.create(
            service=self.service,
            user=self.user,
            parent=parent,
            body='Reply'
        )
        
        url = reverse('service-comments', kwargs={'service_id': self.service.id})
        data = {'body': 'Reply to reply!', 'parent_id': str(reply.id)}
        response = self.client.post(url, data, format='json')
        
        self.assertEqual(response.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)
    
    def test_edit_own_comment(self):
        """Test that service comments API rejects edits (read-only endpoint)"""
        self.client.force_authenticate(user=self.user)
        
        comment = Comment.objects.create(
            service=self.service,
            user=self.user,
            body='Original text'
        )
        
        url = reverse('service-comment-detail', kwargs={
            'service_id': self.service.id,
            'pk': comment.id
        })
        data = {'body': 'Updated text'}
        response = self.client.patch(url, data, format='json')
        
        self.assertEqual(response.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)
        comment.refresh_from_db()
        self.assertEqual(comment.body, 'Original text')
    
    def test_cannot_edit_others_comment(self):
        """Test that service comments API rejects edits (read-only endpoint)"""
        self.client.force_authenticate(user=self.user)
        
        comment = Comment.objects.create(
            service=self.service,
            user=self.other_user,
            body='Other user comment'
        )
        
        url = reverse('service-comment-detail', kwargs={
            'service_id': self.service.id,
            'pk': comment.id
        })
        data = {'body': 'Hacked!'}
        response = self.client.patch(url, data, format='json')
        
        self.assertEqual(response.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)
    
    def test_delete_own_comment(self):
        """Test that service comments API rejects deletes (read-only endpoint)"""
        self.client.force_authenticate(user=self.user)
        
        comment = Comment.objects.create(
            service=self.service,
            user=self.user,
            body='To be deleted'
        )
        
        url = reverse('service-comment-detail', kwargs={
            'service_id': self.service.id,
            'pk': comment.id
        })
        response = self.client.delete(url)
        
        self.assertEqual(response.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)
        comment.refresh_from_db()
        self.assertFalse(comment.is_deleted)
    
    def test_service_owner_can_delete_any_comment(self):
        """Test that service comments API rejects deletes even for service owners (read-only endpoint)"""
        self.client.force_authenticate(user=self.other_user)  # Service owner
        
        comment = Comment.objects.create(
            service=self.service,
            user=self.user,  # Different user
            body='Comment on my service'
        )
        
        url = reverse('service-comment-detail', kwargs={
            'service_id': self.service.id,
            'pk': comment.id
        })
        response = self.client.delete(url)
        
        self.assertEqual(response.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)

        comment.refresh_from_db()
        self.assertFalse(comment.is_deleted)


class NegativeRepAPITest(TestCase):
    """Test Negative Reputation API endpoints"""
    
    def setUp(self):
        self.client = APIClient()
        self.provider = User.objects.create_user(
            email='provider@example.com',
            password='testpass123',
            first_name='Provider',
            last_name='User',
            timebank_balance=Decimal('10.00'),
            karma_score=50
        )
        self.receiver = User.objects.create_user(
            email='receiver@example.com',
            password='testpass123',
            first_name='Receiver',
            last_name='User',
            timebank_balance=Decimal('10.00')
        )
        self.service = Service.objects.create(
            user=self.provider,
            title='Test Service',
            description='A test service',
            type='Offer',
            duration=Decimal('2.00'),
            location_type='Online',
            schedule_type='One-Time'
        )
        self.completed_handshake = Handshake.objects.create(
            service=self.service,
            requester=self.receiver,
            status='completed',
            provisioned_hours=Decimal('2.00')
        )
    
    def test_submit_negative_rep(self):
        """Test submitting negative reputation"""
        self.client.force_authenticate(user=self.receiver)
        
        url = reverse('negative-reputation')
        data = {
            'handshake_id': str(self.completed_handshake.id),
            'is_late': True,
            'is_unhelpful': False,
            'is_rude': False,
            'comment': 'Was 30 minutes late'
        }
        response = self.client.post(url, data, format='json')
        
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(NegativeRep.objects.count(), 1)
    
    def test_negative_rep_reduces_karma(self):
        """Test that negative rep reduces karma"""
        self.client.force_authenticate(user=self.receiver)
        initial_karma = self.provider.karma_score
        
        url = reverse('negative-reputation')
        data = {
            'handshake_id': str(self.completed_handshake.id),
            'is_late': True,
            'is_unhelpful': True,
            'is_rude': False
        }
        response = self.client.post(url, data, format='json')
        
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        
        self.provider.refresh_from_db()
        # Each negative trait costs -2 karma
        expected_karma = initial_karma - 4  # 2 traits × -2
        self.assertEqual(self.provider.karma_score, expected_karma)
    
    def test_cannot_submit_without_negative_trait(self):
        """Test that at least one negative trait must be selected"""
        self.client.force_authenticate(user=self.receiver)
        
        url = reverse('negative-reputation')
        data = {
            'handshake_id': str(self.completed_handshake.id),
            'is_late': False,
            'is_unhelpful': False,
            'is_rude': False
        }
        response = self.client.post(url, data, format='json')
        
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
    
    def test_cannot_submit_for_non_completed_handshake(self):
        """Test that negative rep can only be submitted for completed handshakes"""
        pending_handshake = Handshake.objects.create(
            service=self.service,
            requester=self.receiver,
            status='pending',
            provisioned_hours=Decimal('2.00')
        )
        
        self.client.force_authenticate(user=self.receiver)
        
        url = reverse('negative-reputation')
        data = {
            'handshake_id': str(pending_handshake.id),
            'is_late': True
        }
        response = self.client.post(url, data, format='json')
        
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)


class ServiceHotScoreSortingTest(TestCase):
    """Test service sorting by hot score"""
    
    def setUp(self):
        self.client = APIClient()
        # Use unique email to avoid conflicts with other tests
        self.user = User.objects.create_user(
            email='hotscore_test@example.com',
            password='testpass123',
            first_name='HotScore',
            last_name='Tester'
        )
        
        # Create services with different hot scores and unique prefix
        self.service1 = Service.objects.create(
            user=self.user,
            title='[HS] Low Score Service',
            description='Hot score test',
            type='Offer',
            duration=Decimal('1.00'),
            location_type='Online',
            schedule_type='One-Time'
        )
        self.service2 = Service.objects.create(
            user=self.user,
            title='[HS] High Score Service',
            description='Hot score test',
            type='Offer',
            duration=Decimal('1.00'),
            location_type='Online',
            schedule_type='One-Time'
        )
        self.service3 = Service.objects.create(
            user=self.user,
            title='[HS] Medium Score Service',
            description='Hot score test',
            type='Offer',
            duration=Decimal('1.00'),
            location_type='Online',
            schedule_type='One-Time'
        )

        # Service.save() calculates hot_score automatically for active services,
        # so set deterministic test values directly in DB.
        Service.objects.filter(pk=self.service1.pk).update(hot_score=0.5)
        Service.objects.filter(pk=self.service2.pk).update(hot_score=10.0)
        Service.objects.filter(pk=self.service3.pk).update(hot_score=5.0)
    
    def test_sort_by_hot_score(self):
        """Test sorting services by hot score"""
        # Filter to only our test services using search
        url = reverse('service-list') + '?sort=hot&search=[HS]'
        response = self.client.get(url)
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        results = response.data.get('results', response.data)
        # Filter to only our services (in case search isn't exact)
        our_services = [s for s in results if s['title'].startswith('[HS]')]
        titles = [s['title'] for s in our_services]
        
        # Should be ordered by hot_score descending
        self.assertEqual(len(our_services), 3)
        self.assertEqual(titles[0], '[HS] High Score Service')
        self.assertEqual(titles[1], '[HS] Medium Score Service')
        self.assertEqual(titles[2], '[HS] Low Score Service')
    
    def test_default_sort_by_latest(self):
        """Test that default sorting is by created_at descending"""
        # Filter to only our test services
        url = reverse('service-list') + '?search=[HS]'
        response = self.client.get(url)
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        results = response.data.get('results', response.data)
        # Filter to only our services
        our_services = [s for s in results if s['title'].startswith('[HS]')]
        
        # Most recently created (service3) should be first
        self.assertEqual(len(our_services), 3)
        self.assertEqual(our_services[0]['title'], '[HS] Medium Score Service')
