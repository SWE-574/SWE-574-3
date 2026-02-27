"""
Unit tests for achievement utilities
"""
import pytest
from decimal import Decimal
from django.utils import timezone
from datetime import timedelta

from api.models import User, Handshake, Service, Comment, ReputationRep, TransactionHistory, Badge, UserBadge
from api.achievement_utils import (
    check_and_assign_badges, get_user_stats, assign_achievement,
    get_achievement_progress, is_newcomer, get_seniority_indicator
)
from api.tests.helpers.factories import (
    UserFactory, ServiceFactory, HandshakeFactory, CommentFactory,
    ReputationRepFactory, TransactionHistoryFactory
)


@pytest.mark.django_db
@pytest.mark.unit
class TestGetUserStats:
    """Test get_user_stats function"""
    
    def test_completed_services_count(self):
        """Test completed services counting"""
        user = UserFactory()
        service1 = ServiceFactory(user=user, type='Offer')
        service2 = ServiceFactory(user=user, type='Need')
        requester = UserFactory()
        
        HandshakeFactory(service=service1, requester=requester, status='completed')
        HandshakeFactory(service=service2, requester=requester, status='completed')
        
        stats = get_user_stats(user)
        assert stats['completed_services'] == 2
    
    def test_offer_count(self):
        """Test offer count"""
        user = UserFactory()
        ServiceFactory(user=user, type='Offer')
        ServiceFactory(user=user, type='Offer')
        ServiceFactory(user=user, type='Need')
        
        stats = get_user_stats(user)
        assert stats['offer_count'] == 2
    
    def test_reputation_counts(self):
        """Test reputation counting"""
        user = UserFactory()
        giver = UserFactory()
        handshake = HandshakeFactory(service=ServiceFactory(user=user), requester=giver, status='completed')
        
        ReputationRepFactory(
            handshake=handshake,
            giver=giver,
            receiver=user,
            is_punctual=True,
            is_helpful=True,
            is_kind=True
        )
        
        stats = get_user_stats(user)
        assert stats['punctual_count'] == 1
        assert stats['helpful_count'] == 1
        assert stats['kindness_count'] == 1
        assert stats['total_positive_reputation'] == 3
    
    def test_comments_posted_count(self):
        """Test comments posted count"""
        user = UserFactory()
        service = ServiceFactory()
        CommentFactory(user=user, service=service)
        CommentFactory(user=user, service=service)
        
        stats = get_user_stats(user)
        assert stats['comments_posted'] == 2
    
    def test_hours_given_count(self):
        """Test hours given count"""
        user = UserFactory()
        handshake = HandshakeFactory(status='completed')
        TransactionHistoryFactory(
            user=user,
            transaction_type='transfer',
            amount=Decimal('2.00'),
            handshake=handshake
        )
        TransactionHistoryFactory(
            user=user,
            transaction_type='transfer',
            amount=Decimal('3.00'),
            handshake=handshake
        )
        
        stats = get_user_stats(user)
        assert stats['hours_given'] == 5
    
    def test_time_based_stats(self):
        """Test time-based registration stats"""
        user = UserFactory(date_joined=timezone.now() - timedelta(days=100))
        stats = get_user_stats(user)
        assert stats['months_registered'] >= 3
        assert stats['years_registered'] == 0


@pytest.mark.django_db
@pytest.mark.unit
class TestAssignAchievement:
    """Test assign_achievement function"""
    
    def test_assign_first_service_achievement(self):
        """Test assigning first service achievement"""
        user = UserFactory()
        service = ServiceFactory(user=user, type='Offer')
        requester = UserFactory()
        HandshakeFactory(service=service, requester=requester, status='completed')
        
        result = assign_achievement(user, 'first-service')
        assert result is True
        
        user.refresh_from_db()
        assert UserBadge.objects.filter(user=user, badge_id='first-service').exists()
        assert user.karma_score > 0
    
    def test_assign_achievement_twice(self):
        """Test assigning same achievement twice returns False"""
        user = UserFactory()
        assign_achievement(user, 'first-service')
        result = assign_achievement(user, 'first-service')
        assert result is False


@pytest.mark.django_db
@pytest.mark.unit
class TestCheckAndAssignBadges:
    """Test check_and_assign_badges function"""
    
    def test_assign_first_service(self):
        """Test automatic assignment of first service achievement"""
        user = UserFactory()
        service = ServiceFactory(user=user, type='Offer')
        requester = UserFactory()
        HandshakeFactory(service=service, requester=requester, status='completed')
        
        newly_assigned = check_and_assign_badges(user)
        assert 'first-service' in newly_assigned
    
    def test_assign_seniority_achievement(self):
        """Test seniority achievement after 5 completed services"""
        user = UserFactory()
        for i in range(5):
            service = ServiceFactory(user=user, type='Offer')
            requester = UserFactory()
            HandshakeFactory(service=service, requester=requester, status='completed')
        
        newly_assigned = check_and_assign_badges(user)
        assert 'seniority' in newly_assigned
    
    def test_assign_time_based_achievements(self):
        """Test time-based achievement assignment"""
        user = UserFactory(date_joined=timezone.now() - timedelta(days=95))
        newly_assigned = check_and_assign_badges(user)
        assert 'registered-3-months' in newly_assigned


@pytest.mark.django_db
@pytest.mark.unit
class TestGetAchievementProgress:
    """Test get_achievement_progress function"""
    
    def test_achievement_progress_structure(self):
        """Test achievement progress data structure"""
        user = UserFactory()
        progress = get_achievement_progress(user)
        
        assert 'first-service' in progress
        assert 'achievement' in progress['first-service']
        assert 'earned' in progress['first-service']
        assert 'current' in progress['first-service']
        assert 'threshold' in progress['first-service']
        assert 'progress_percent' in progress['first-service']
    
    def test_achievement_progress_earned(self):
        """Test progress shows earned status"""
        user = UserFactory()
        service = ServiceFactory(user=user, type='Offer')
        requester = UserFactory()
        HandshakeFactory(service=service, requester=requester, status='completed')
        check_and_assign_badges(user)
        
        progress = get_achievement_progress(user)
        assert progress['first-service']['earned'] is True


@pytest.mark.django_db
@pytest.mark.unit
class TestIsNewcomer:
    """Test is_newcomer function"""
    
    def test_newcomer_recent_registration(self):
        """Test user registered recently is newcomer"""
        user = UserFactory(date_joined=timezone.now() - timedelta(days=15))
        assert is_newcomer(user) is True
    
    def test_not_newcomer_old_registration(self):
        """Test user registered long ago is not newcomer"""
        user = UserFactory(date_joined=timezone.now() - timedelta(days=35))
        assert is_newcomer(user) is False


@pytest.mark.django_db
@pytest.mark.unit
class TestGetSeniorityIndicator:
    """Test get_seniority_indicator function"""
    
    def test_seniority_with_5_services(self):
        """Test seniority indicator with 5 completed services"""
        user = UserFactory(date_joined=timezone.now() - timedelta(days=100))
        for i in range(5):
            service = ServiceFactory(user=user, type='Offer')
            requester = UserFactory()
            HandshakeFactory(service=service, requester=requester, status='completed')
        
        indicator = get_seniority_indicator(user)
        assert indicator is not None
        assert 'Months' in indicator or 'Years' in indicator
    
    def test_no_seniority_with_few_services(self):
        """Test no seniority with less than 5 services"""
        user = UserFactory()
        for i in range(3):
            service = ServiceFactory(user=user, type='Offer')
            requester = UserFactory()
            HandshakeFactory(service=service, requester=requester, status='completed')
        
        indicator = get_seniority_indicator(user)
        assert indicator is None
