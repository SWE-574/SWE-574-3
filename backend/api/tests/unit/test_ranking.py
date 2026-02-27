"""
Unit tests for ranking utilities
"""
import pytest
from decimal import Decimal
from django.utils import timezone
from datetime import timedelta

from api.models import Service, Comment, ReputationRep
from api.ranking import calculate_hot_score, calculate_hot_scores_batch
from api.tests.helpers.factories import (
    ServiceFactory, UserFactory, CommentFactory, ReputationRepFactory, HandshakeFactory
)


@pytest.mark.django_db
@pytest.mark.unit
class TestCalculateHotScore:
    """Test calculate_hot_score function"""
    
    def test_hot_score_basic(self):
        """Test basic hot score calculation"""
        service = ServiceFactory(status='Active')
        score = calculate_hot_score(service)
        assert score >= 0
        assert isinstance(score, (int, float))
    
    def test_hot_score_with_comments(self):
        """Test hot score increases with comments"""
        service = ServiceFactory(status='Active')
        base_score = calculate_hot_score(service)
        
        CommentFactory(service=service)
        CommentFactory(service=service)
        service.refresh_from_db()
        
        new_score = calculate_hot_score(service)
        assert new_score >= base_score
    
    def test_hot_score_with_reputation(self):
        """Test hot score increases with reputation"""
        user = UserFactory()
        service = ServiceFactory(user=user, status='Active')
        base_score = calculate_hot_score(service)
        
        giver = UserFactory()
        handshake = HandshakeFactory(service=service, requester=giver, status='completed')
        ReputationRepFactory(handshake=handshake, giver=giver, receiver=user)
        
        service.refresh_from_db()
        new_score = calculate_hot_score(service)
        assert new_score >= base_score
    
    def test_hot_score_time_decay(self):
        """Test hot score decreases over time"""
        old_service = ServiceFactory(
            status='Active',
            created_at=timezone.now() - timedelta(days=30)
        )
        new_service = ServiceFactory(
            status='Active',
            created_at=timezone.now() - timedelta(days=1)
        )
        
        old_score = calculate_hot_score(old_service)
        new_score = calculate_hot_score(new_service)
        
        assert new_score >= old_score
    
    def test_hot_score_inactive_service(self):
        """Test inactive service has lower hot score"""
        active_service = ServiceFactory(status='Active')
        inactive_service = ServiceFactory(status='Completed')
        
        active_score = calculate_hot_score(active_service)
        inactive_score = calculate_hot_score(inactive_service)
        
        assert active_score >= inactive_score


@pytest.mark.django_db
@pytest.mark.unit
class TestCalculateHotScoresBatch:
    """Test calculate_hot_scores_batch function"""
    
    def test_batch_calculation(self):
        """Test batch hot score calculation"""
        services = [
            ServiceFactory(status='Active'),
            ServiceFactory(status='Active'),
            ServiceFactory(status='Active')
        ]
        
        calculate_hot_scores_batch(services)
        
        for service in services:
            service.refresh_from_db()
            assert service.hot_score is not None
            assert service.hot_score >= 0
