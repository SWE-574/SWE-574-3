"""
Integration tests for user API endpoints
"""
import pytest
from rest_framework import status
from decimal import Decimal
from datetime import timedelta
from django.utils import timezone

from api.tests.helpers.factories import UserFactory, ServiceFactory, HandshakeFactory
from api.tests.helpers.test_client import AuthenticatedAPIClient
from api.models import Handshake, TransactionHistory, Badge, UserBadge, Comment, ReputationRep


@pytest.mark.django_db
@pytest.mark.integration
class TestUserProfileView:
    """Test UserProfileView (GET /api/users/me/, PATCH /api/users/me/)"""
    
    def test_get_current_user_profile(self):
        """Test retrieving current user profile"""
        user = UserFactory()
        client = AuthenticatedAPIClient()
        client.authenticate_user(user)
        
        response = client.get('/api/users/me/')
        assert response.status_code == status.HTTP_200_OK
        assert response.data['email'] == user.email
        assert response.data['first_name'] == user.first_name
        assert 'achievements' in response.data
    
    def test_update_user_profile(self):
        """Test updating user profile"""
        user = UserFactory()
        client = AuthenticatedAPIClient()
        client.authenticate_user(user)
        
        response = client.patch('/api/users/me/', {
            'bio': 'Updated bio',
            'first_name': 'Updated'
        })
        assert response.status_code == status.HTTP_200_OK
        assert response.data['bio'] == 'Updated bio'
        assert response.data['first_name'] == 'Updated'
        
        user.refresh_from_db()
        assert user.bio == 'Updated bio'
    
    def test_update_user_profile_validation(self):
        """Test profile update validation"""
        user = UserFactory()
        client = AuthenticatedAPIClient()
        client.authenticate_user(user)
        
        response = client.patch('/api/users/me/', {
            'bio': 'x' * 1001  # Exceeds limit
        })
        assert response.status_code == status.HTTP_400_BAD_REQUEST


@pytest.mark.django_db
@pytest.mark.integration
class TestUserHistoryView:
    """Test UserHistoryView (GET /api/users/{id}/history/)"""
    
    def test_get_user_history(self):
        """Test retrieving user transaction history"""
        user = UserFactory()
        service = ServiceFactory(user=user, type='Offer')
        requester = UserFactory()
        handshake = HandshakeFactory(
            service=service,
            requester=requester,
            status='completed'
        )
        
        client = AuthenticatedAPIClient()
        client.authenticate_user(user)
        
        response = client.get(f'/api/users/{user.id}/history/')
        assert response.status_code == status.HTTP_200_OK
        assert isinstance(response.data, list)
    
    def test_user_history_empty(self):
        """Test user history for user with no transactions"""
        user = UserFactory()
        client = AuthenticatedAPIClient()
        client.authenticate_user(user)
        
        response = client.get(f'/api/users/{user.id}/history/')
        assert response.status_code == status.HTTP_200_OK
        assert response.data == []


@pytest.mark.django_db
@pytest.mark.integration
class TestUserBadgeProgressView:
    """Test UserBadgeProgressView (GET /api/users/{id}/badge-progress/)"""
    
    def test_get_achievement_progress(self):
        """Test retrieving achievement progress"""
        user = UserFactory()
        service = ServiceFactory(user=user, type='Offer')
        requester = UserFactory()
        HandshakeFactory(service=service, requester=requester, status='completed')
        
        client = AuthenticatedAPIClient()
        client.authenticate_user(user)
        
        response = client.get(f'/api/users/{user.id}/badge-progress/')
        assert response.status_code == status.HTTP_200_OK
        assert 'first-service' in response.data
        assert 'achievement' in response.data['first-service']
    
    def test_get_achievement_progress_other_user(self):
        """Test cannot view other user's achievement progress"""
        user1 = UserFactory()
        user2 = UserFactory()
        
        client = AuthenticatedAPIClient()
        client.authenticate_user(user1)
        
        response = client.get(f'/api/users/{user2.id}/badge-progress/')
        assert response.status_code == status.HTTP_403_FORBIDDEN


@pytest.mark.django_db
@pytest.mark.integration
class TestUserVerifiedReviewsView:
    """Test UserVerifiedReviewsView (GET /api/users/{id}/verified-reviews/)"""
    
    def test_get_verified_reviews(self):
        """Test retrieving verified reviews for a user"""
        user = UserFactory()
        service = ServiceFactory(user=user, type='Offer')
        requester = UserFactory()
        handshake = HandshakeFactory(
            service=service,
            requester=requester,
            status='completed'
        )
        
        from api.models import Comment
        Comment.objects.create(
            service=service,
            user=requester,
            body='Great service!',
            is_verified_review=True,
            related_handshake=handshake
        )
        
        client = AuthenticatedAPIClient()
        client.authenticate_user(user)
        
        response = client.get(f'/api/users/{user.id}/verified-reviews/')
        assert response.status_code == status.HTTP_200_OK
        assert isinstance(response.data, dict)
        assert 'results' in response.data
        if len(response.data['results']) > 0:
            assert response.data['results'][0]['is_verified_review'] is True

    def test_hides_one_sided_review_until_reciprocal_evaluation(self):
        provider = UserFactory()
        requester = UserFactory()
        service = ServiceFactory(user=provider, type='Offer')
        handshake = HandshakeFactory(
            service=service,
            requester=requester,
            status='completed',
            evaluation_window_starts_at=timezone.now() - timedelta(hours=1),
            evaluation_window_ends_at=timezone.now() + timedelta(hours=47),
            evaluation_window_closed_at=None,
        )
        Comment.objects.create(
            service=service,
            user=requester,
            body='Hidden before reciprocal evaluation.',
            is_verified_review=True,
            related_handshake=handshake,
        )

        client = AuthenticatedAPIClient().authenticate_user(provider)
        hidden_response = client.get(f'/api/users/{provider.id}/verified-reviews/')
        assert hidden_response.status_code == status.HTTP_200_OK
        assert hidden_response.data['count'] == 0

        ReputationRep.objects.create(
            handshake=handshake,
            giver=provider,
            receiver=requester,
            is_punctual=True,
            is_helpful=False,
            is_kind=False,
        )

        revealed_response = client.get(f'/api/users/{provider.id}/verified-reviews/')
        assert revealed_response.status_code == status.HTTP_200_OK
        assert revealed_response.data['count'] == 1

    def test_role_filter_offer_provider(self):
        """Offer: target user is provider; role=provider returns review, role=receiver returns none."""
        provider = UserFactory()
        requester = UserFactory()
        service = ServiceFactory(user=provider, type='Offer')
        handshake = HandshakeFactory(service=service, requester=requester, status='completed')
        ReputationRep.objects.create(
            handshake=handshake, giver=requester, receiver=provider,
            is_punctual=True, is_helpful=False, is_kind=False,
        )
        ReputationRep.objects.create(
            handshake=handshake, giver=provider, receiver=requester,
            is_punctual=True, is_helpful=False, is_kind=False,
        )
        Comment.objects.create(
            service=service, user=requester, body='Great provider!',
            is_verified_review=True, related_handshake=handshake,
        )
        client = AuthenticatedAPIClient().authenticate_user(provider)
        r_provider = client.get(f'/api/users/{provider.id}/verified-reviews/', {'role': 'provider'})
        r_receiver = client.get(f'/api/users/{provider.id}/verified-reviews/', {'role': 'receiver'})
        assert r_provider.status_code == status.HTTP_200_OK
        assert r_receiver.status_code == status.HTTP_200_OK
        assert r_provider.data['count'] == 1
        assert r_receiver.data['count'] == 0
        assert r_provider.data['results'][0].get('reviewed_user_role') == 'provider'

    def test_role_filter_offer_receiver(self):
        """Offer: target user is receiver (requester); role=receiver returns review, role=provider returns none."""
        provider = UserFactory()
        requester = UserFactory()
        service = ServiceFactory(user=provider, type='Offer')
        handshake = HandshakeFactory(service=service, requester=requester, status='completed')
        ReputationRep.objects.create(
            handshake=handshake, giver=provider, receiver=requester,
            is_punctual=True, is_helpful=False, is_kind=False,
        )
        ReputationRep.objects.create(
            handshake=handshake, giver=requester, receiver=provider,
            is_punctual=True, is_helpful=False, is_kind=False,
        )
        Comment.objects.create(
            service=service, user=provider, body='Great taker!',
            is_verified_review=True, related_handshake=handshake,
        )
        client = AuthenticatedAPIClient().authenticate_user(requester)
        r_provider = client.get(f'/api/users/{requester.id}/verified-reviews/', {'role': 'provider'})
        r_receiver = client.get(f'/api/users/{requester.id}/verified-reviews/', {'role': 'receiver'})
        assert r_provider.status_code == status.HTTP_200_OK
        assert r_receiver.status_code == status.HTTP_200_OK
        assert r_provider.data['count'] == 0
        assert r_receiver.data['count'] == 1
        assert r_receiver.data['results'][0].get('reviewed_user_role') == 'receiver'

    def test_role_filter_need_provider(self):
        """Need: target user is provider (requester); role=provider returns review."""
        need_owner = UserFactory()
        requester = UserFactory()
        service = ServiceFactory(user=need_owner, type='Need')
        handshake = HandshakeFactory(service=service, requester=requester, status='completed')
        ReputationRep.objects.create(
            handshake=handshake, giver=need_owner, receiver=requester,
            is_punctual=True, is_helpful=False, is_kind=False,
        )
        ReputationRep.objects.create(
            handshake=handshake, giver=requester, receiver=need_owner,
            is_punctual=True, is_helpful=False, is_kind=False,
        )
        Comment.objects.create(
            service=service, user=need_owner, body='Great help!',
            is_verified_review=True, related_handshake=handshake,
        )
        client = AuthenticatedAPIClient().authenticate_user(requester)
        r_provider = client.get(f'/api/users/{requester.id}/verified-reviews/', {'role': 'provider'})
        r_receiver = client.get(f'/api/users/{requester.id}/verified-reviews/', {'role': 'receiver'})
        assert r_provider.status_code == status.HTTP_200_OK
        assert r_receiver.status_code == status.HTTP_200_OK
        assert r_provider.data['count'] == 1
        assert r_receiver.data['count'] == 0
        assert r_provider.data['results'][0].get('reviewed_user_role') == 'provider'

    def test_role_filter_need_receiver(self):
        """Need: target user is receiver (service owner); role=receiver returns review."""
        need_owner = UserFactory()
        requester = UserFactory()
        service = ServiceFactory(user=need_owner, type='Need')
        handshake = HandshakeFactory(service=service, requester=requester, status='completed')
        ReputationRep.objects.create(
            handshake=handshake, giver=requester, receiver=need_owner,
            is_punctual=True, is_helpful=False, is_kind=False,
        )
        ReputationRep.objects.create(
            handshake=handshake, giver=need_owner, receiver=requester,
            is_punctual=True, is_helpful=False, is_kind=False,
        )
        Comment.objects.create(
            service=service, user=requester, body='Thanks for the need!',
            is_verified_review=True, related_handshake=handshake,
        )
        client = AuthenticatedAPIClient().authenticate_user(need_owner)
        r_provider = client.get(f'/api/users/{need_owner.id}/verified-reviews/', {'role': 'provider'})
        r_receiver = client.get(f'/api/users/{need_owner.id}/verified-reviews/', {'role': 'receiver'})
        assert r_provider.status_code == status.HTTP_200_OK
        assert r_receiver.status_code == status.HTTP_200_OK
        assert r_provider.data['count'] == 0
        assert r_receiver.data['count'] == 1
        assert r_receiver.data['results'][0].get('reviewed_user_role') == 'receiver'

    def test_role_filter_blind_review_visibility_unchanged(self):
        """Blind review visibility still applies when role filter is used."""
        provider = UserFactory()
        requester = UserFactory()
        service = ServiceFactory(user=provider, type='Offer')
        handshake = HandshakeFactory(
            service=service,
            requester=requester,
            status='completed',
            evaluation_window_starts_at=timezone.now() - timedelta(hours=1),
            evaluation_window_ends_at=timezone.now() + timedelta(hours=47),
            evaluation_window_closed_at=None,
        )
        Comment.objects.create(
            service=service,
            user=requester,
            body='Hidden until reciprocal.',
            is_verified_review=True,
            related_handshake=handshake,
        )
        ReputationRep.objects.create(
            handshake=handshake,
            giver=provider,
            receiver=requester,
            is_punctual=True,
            is_helpful=False,
            is_kind=False,
        )
        client = AuthenticatedAPIClient().authenticate_user(provider)
        r = client.get(f'/api/users/{provider.id}/verified-reviews/', {'role': 'provider'})
        assert r.status_code == status.HTTP_200_OK
        assert r.data['count'] == 1


@pytest.mark.django_db
@pytest.mark.integration
class TestPublicUserProfile:
    """Test public user profile endpoint (GET /api/users/{id}/)"""
    
    def test_get_public_profile(self):
        """Test retrieving public user profile"""
        user = UserFactory()
        client = AuthenticatedAPIClient()
        client.authenticate_user(user)
        
        response = client.get(f'/api/users/{user.id}/')
        assert response.status_code == status.HTTP_200_OK
        assert response.data['id'] == str(user.id)
        assert 'achievements' in response.data
        assert 'services' in response.data
    
    def test_public_profile_excludes_sensitive_data(self):
        """Test public profile excludes sensitive information"""
        user = UserFactory()
        other_user = UserFactory()
        
        client = AuthenticatedAPIClient()
        client.authenticate_user(user)
        
        response = client.get(f'/api/users/{other_user.id}/')
        assert response.status_code == status.HTTP_200_OK
        assert 'email' not in response.data
        assert 'timebank_balance' not in response.data


@pytest.mark.django_db
@pytest.mark.integration
class TestEventCommentsHistoryOnProfile:
    def test_profile_includes_event_comments_grouped_newest_first(self):
        organizer = UserFactory()
        viewer = UserFactory()

        old_event = ServiceFactory(user=organizer, type='Event', status='Completed')
        new_event = ServiceFactory(user=organizer, type='Event', status='Completed')

        old_hs = HandshakeFactory(
            service=old_event,
            requester=UserFactory(),
            status='attended',
            evaluation_window_starts_at=timezone.now() - timedelta(hours=72),
            evaluation_window_ends_at=timezone.now() - timedelta(hours=24),
            evaluation_window_closed_at=timezone.now() - timedelta(hours=24),
        )
        new_hs_1 = HandshakeFactory(
            service=new_event,
            requester=UserFactory(),
            status='attended',
            evaluation_window_starts_at=timezone.now() - timedelta(hours=72),
            evaluation_window_ends_at=timezone.now() - timedelta(hours=24),
            evaluation_window_closed_at=timezone.now() - timedelta(hours=24),
        )
        new_hs_2 = HandshakeFactory(
            service=new_event,
            requester=UserFactory(),
            status='attended',
            evaluation_window_starts_at=timezone.now() - timedelta(hours=72),
            evaluation_window_ends_at=timezone.now() - timedelta(hours=24),
            evaluation_window_closed_at=timezone.now() - timedelta(hours=24),
        )

        old_comment = Comment.objects.create(
            service=old_event,
            user=old_hs.requester,
            body='Older event review',
            is_verified_review=True,
            related_handshake=old_hs,
        )
        new_comment_1 = Comment.objects.create(
            service=new_event,
            user=new_hs_1.requester,
            body='Older review on newer event',
            is_verified_review=True,
            related_handshake=new_hs_1,
        )
        new_comment_2 = Comment.objects.create(
            service=new_event,
            user=new_hs_2.requester,
            body='Newest review on newer event',
            is_verified_review=True,
            related_handshake=new_hs_2,
        )

        Comment.objects.filter(id=old_comment.id).update(created_at=timezone.now() - timedelta(days=3))
        Comment.objects.filter(id=new_comment_1.id).update(created_at=timezone.now() - timedelta(days=2))
        Comment.objects.filter(id=new_comment_2.id).update(created_at=timezone.now() - timedelta(days=1))

        client = AuthenticatedAPIClient().authenticate_user(viewer)
        response = client.get(f'/api/users/{organizer.id}/')

        assert response.status_code == status.HTTP_200_OK
        assert 'event_comments_history' in response.data
        history = response.data['event_comments_history']
        assert len(history) == 2

        assert history[0]['event_id'] == str(new_event.id)
        assert history[1]['event_id'] == str(old_event.id)
        assert history[0]['comments'][0]['body'] == 'Newest review on newer event'
        assert history[0]['comments'][1]['body'] == 'Older review on newer event'

    def test_event_comment_hidden_until_reciprocal_evaluation(self):
        organizer = UserFactory()
        viewer = UserFactory()
        attendee = UserFactory()
        event = ServiceFactory(user=organizer, type='Event', status='Completed')
        handshake = HandshakeFactory(
            service=event,
            requester=attendee,
            status='attended',
            evaluation_window_starts_at=timezone.now() - timedelta(hours=1),
            evaluation_window_ends_at=timezone.now() + timedelta(hours=47),
            evaluation_window_closed_at=None,
        )

        Comment.objects.create(
            service=event,
            user=attendee,
            body='Should stay hidden until organizer also evaluates.',
            is_verified_review=True,
            related_handshake=handshake,
        )

        client = AuthenticatedAPIClient().authenticate_user(viewer)
        hidden_response = client.get(f'/api/users/{organizer.id}/')
        assert hidden_response.status_code == status.HTTP_200_OK
        assert hidden_response.data['event_comments_history'] == []

        ReputationRep.objects.create(
            handshake=handshake,
            giver=organizer,
            receiver=attendee,
            is_punctual=True,
            is_helpful=False,
            is_kind=False,
        )

        visible_response = client.get(f'/api/users/{organizer.id}/')
        assert visible_response.status_code == status.HTTP_200_OK
        assert len(visible_response.data['event_comments_history']) == 1
        assert visible_response.data['event_comments_history'][0]['comments'][0]['body'] == (
            'Should stay hidden until organizer also evaluates.'
        )
