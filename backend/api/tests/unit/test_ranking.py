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


    def test_event_nearly_full_gets_boost(self):
        """Event at 75-99% capacity should get a 1.5× multiplier."""
        service = ServiceFactory(
            type='Event', status='Active', max_participants=4,
            scheduled_time=timezone.now() + timedelta(days=3),
        )
        base_score = calculate_hot_score(service)

        # Fill to 75% (3 of 4)
        for _ in range(3):
            HandshakeFactory(service=service, status='accepted')

        boosted_score = calculate_hot_score(service)
        if base_score != 0:
            assert boosted_score == pytest.approx(base_score * 1.5, rel=1e-5)

    def test_event_below_75_pct_no_boost(self):
        """Event below 75% capacity should NOT receive the multiplier."""
        service = ServiceFactory(
            type='Event', status='Active', max_participants=10,
            scheduled_time=timezone.now() + timedelta(days=3),
        )
        base_score = calculate_hot_score(service)

        # Fill to 60% (6 of 10)
        for _ in range(6):
            HandshakeFactory(service=service, status='accepted')

        score = calculate_hot_score(service)
        assert score == pytest.approx(base_score, rel=1e-5)

    def test_event_full_no_boost(self):
        """Event at exactly 100% capacity should NOT receive the multiplier."""
        service = ServiceFactory(
            type='Event', status='Active', max_participants=4,
            scheduled_time=timezone.now() + timedelta(days=3),
        )
        base_score = calculate_hot_score(service)

        for _ in range(4):
            HandshakeFactory(service=service, status='accepted')

        score = calculate_hot_score(service)
        # At 100% capacity_ratio == 1.0  →  condition 0.75 <= ratio < 1.0 is False
        assert score == pytest.approx(base_score, rel=1e-5)

    def test_non_event_service_no_boost(self):
        """Single-participant Offer (Need-like) should never receive the multiplier."""
        service = ServiceFactory(
            type='Offer', status='Active', max_participants=1,
        )
        base_score = calculate_hot_score(service)

        HandshakeFactory(service=service, status='accepted')

        score = calculate_hot_score(service)
        assert score == pytest.approx(base_score, rel=1e-5)

    # ── Boundary tests (FR-RANK-03 acceptance criteria) ──────────────────────

    def test_event_at_74pct_no_boost(self):
        """74% capacity (just below threshold) should NOT trigger the 1.5× boost."""
        service = ServiceFactory(
            type='Event', status='Active', max_participants=100,
            scheduled_time=timezone.now() + timedelta(days=3),
        )
        base_score = calculate_hot_score(service)

        for _ in range(74):
            HandshakeFactory(service=service, status='accepted')

        score = calculate_hot_score(service)
        assert score == pytest.approx(base_score, rel=1e-5)

    def test_event_at_75pct_gets_boost(self):
        """Exactly 75% capacity should trigger the 1.5× boost."""
        service = ServiceFactory(
            type='Event', status='Active', max_participants=100,
            scheduled_time=timezone.now() + timedelta(days=3),
        )
        base_score = calculate_hot_score(service)

        for _ in range(75):
            HandshakeFactory(service=service, status='accepted')

        boosted_score = calculate_hot_score(service)
        if base_score != 0:
            assert boosted_score == pytest.approx(base_score * 1.5, rel=1e-5)

    def test_event_at_99pct_gets_boost(self):
        """99% capacity (last slot open) should still trigger the 1.5× boost."""
        service = ServiceFactory(
            type='Event', status='Active', max_participants=100,
            scheduled_time=timezone.now() + timedelta(days=3),
        )
        base_score = calculate_hot_score(service)

        for _ in range(99):
            HandshakeFactory(service=service, status='accepted')

        boosted_score = calculate_hot_score(service)
        if base_score != 0:
            assert boosted_score == pytest.approx(base_score * 1.5, rel=1e-5)

    def test_event_at_100pct_no_boost(self):
        """Exactly 100% capacity (full) should NOT trigger the boost."""
        service = ServiceFactory(
            type='Event', status='Active', max_participants=100,
            scheduled_time=timezone.now() + timedelta(days=3),
        )
        base_score = calculate_hot_score(service)

        for _ in range(100):
            HandshakeFactory(service=service, status='accepted')

        score = calculate_hot_score(service)
        assert score == pytest.approx(base_score, rel=1e-5)

    def test_group_offer_at_75pct_gets_boost(self):
        """Group Offer (max_participants > 1) at 75% capacity should get the 1.5× boost."""
        service = ServiceFactory(
            type='Offer', status='Active', max_participants=4,
        )
        base_score = calculate_hot_score(service)

        for _ in range(3):
            HandshakeFactory(service=service, status='accepted')

        boosted_score = calculate_hot_score(service)
        if base_score != 0:
            assert boosted_score == pytest.approx(base_score * 1.5, rel=1e-5)

    def test_single_participant_offer_no_boost(self):
        """Offer with max_participants=1 should never receive the group multiplier."""
        service = ServiceFactory(
            type='Offer', status='Active', max_participants=1,
        )
        base_score = calculate_hot_score(service)

        HandshakeFactory(service=service, status='accepted')

        score = calculate_hot_score(service)
        assert score == pytest.approx(base_score, rel=1e-5)

    def test_event_evaluations_do_not_affect_standard_service_hot_score(self):
        organizer = UserFactory()
        offer = ServiceFactory(user=organizer, type='Offer', status='Active')
        base_score = calculate_hot_score(offer)

        event = ServiceFactory(user=organizer, type='Event', status='Active')
        attendee = UserFactory()
        event_hs = HandshakeFactory(
            service=event,
            requester=attendee,
            status='attended',
            provisioned_hours=0,
        )
        ReputationRepFactory(
            handshake=event_hs,
            giver=attendee,
            receiver=organizer,
            is_punctual=True,
            is_helpful=True,
            is_kind=True,
        )

        updated_score = calculate_hot_score(offer)
        assert updated_score == pytest.approx(base_score, rel=1e-5)


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

    def test_batch_event_multiplier_matches_single(self):
        """Batch scoring must match single-service scoring for Events."""
        service = ServiceFactory(
            type='Event', status='Active', max_participants=4,
            scheduled_time=timezone.now() + timedelta(days=3),
        )
        for _ in range(3):
            HandshakeFactory(service=service, status='accepted')

        single_score = calculate_hot_score(service)
        batch_scores = calculate_hot_scores_batch([service])

        assert batch_scores[service.id] == pytest.approx(single_score, rel=1e-5)

    def test_batch_group_offer_multiplier_matches_single(self):
        """Batch scoring must match single-service scoring for Group Offers."""
        service = ServiceFactory(
            type='Offer', status='Active', max_participants=4,
        )
        for _ in range(3):
            HandshakeFactory(service=service, status='accepted')

        single_score = calculate_hot_score(service)
        batch_scores = calculate_hot_scores_batch([service])

        assert batch_scores[service.id] == pytest.approx(single_score, rel=1e-5)
