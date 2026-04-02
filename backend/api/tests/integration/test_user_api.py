"""
Integration tests for user API endpoints
"""
import uuid

import pytest
from rest_framework import status
from decimal import Decimal
from datetime import timedelta
from django.utils import timezone

from api.tests.helpers.factories import UserFactory, ServiceFactory, HandshakeFactory
from api.tests.helpers.test_client import AuthenticatedAPIClient
from api.models import (
    Handshake,
    TransactionHistory,
    Badge,
    UserBadge,
    Comment,
    ReputationRep,
    UserFollow,
    UserFollowEvent,
)


@pytest.mark.django_db
@pytest.mark.integration
class TestUserProfileView:
    """Test UserProfileView (GET /api/users/me/, PATCH /api/users/me/)"""
    
    def test_get_current_user_profile(self):
        """Test retrieving current user profile"""
        user = UserFactory(
            first_name='Elif',
            last_name='Yilmaz',
            bio='I like helping people with design feedback.',
            avatar_url='https://example.com/avatars/elif.jpg',
        )
        client = AuthenticatedAPIClient()
        client.authenticate_user(user)
        
        response = client.get('/api/users/me/')
        assert response.status_code == status.HTTP_200_OK
        assert response.data['email'] == user.email
        assert response.data['first_name'] == user.first_name
        assert response.data['last_name'] == user.last_name
        assert response.data['bio'] == user.bio
        assert response.data['avatar_url'] == user.avatar_url
        assert response.data['date_joined'].startswith(user.date_joined.date().isoformat())
        assert 'achievements' in response.data

    def test_get_current_user_profile_includes_event_sections(self):
        user = UserFactory()
        created_event = ServiceFactory(user=user, type='Event', status='Active')

        joined_event = ServiceFactory(type='Event', status='Active')
        joined_handshake = HandshakeFactory(
            service=joined_event,
            requester=user,
            status='accepted',
            provisioned_hours=Decimal('0.00'),
        )

        invited_event = ServiceFactory(type='Event', status='Active')
        invited_handshake = HandshakeFactory(
            service=invited_event,
            requester=user,
            status='pending',
            provisioned_hours=Decimal('0.00'),
        )

        client = AuthenticatedAPIClient().authenticate_user(user)
        response = client.get('/api/users/me/')

        assert response.status_code == status.HTTP_200_OK
        assert 'created_events' in response.data
        assert 'joined_events' in response.data
        assert 'invited_events' in response.data

        created_ids = {event['id'] for event in response.data['created_events']}
        joined_ids = {event['id'] for event in response.data['joined_events']}
        invited_ids = {event['id'] for event in response.data['invited_events']}

        assert str(created_event.id) in created_ids
        assert str(joined_handshake.id) in joined_ids
        assert str(invited_handshake.id) in invited_ids
    
    def test_update_user_profile(self):
        """Test updating user profile"""
        user = UserFactory()
        client = AuthenticatedAPIClient()
        client.authenticate_user(user)
        
        response = client.patch('/api/users/me/', {
            'bio': 'Updated bio',
            'first_name': 'Updated',
            'last_name': 'Profile',
            'avatar_url': 'https://example.com/avatars/updated.jpg',
            'show_history': False,
            'email': 'should-not-change@example.com',
        })
        assert response.status_code == status.HTTP_200_OK
        assert response.data['bio'] == 'Updated bio'
        assert response.data['first_name'] == 'Updated'
        assert response.data['last_name'] == 'Profile'
        assert response.data['avatar_url'] == 'https://example.com/avatars/updated.jpg'
        assert response.data['show_history'] is False
        assert response.data['email'] == user.email
        
        user.refresh_from_db()
        assert user.bio == 'Updated bio'
        assert user.first_name == 'Updated'
        assert user.last_name == 'Profile'
        assert user.avatar_url == 'https://example.com/avatars/updated.jpg'
        assert user.show_history is False
        assert user.email != 'should-not-change@example.com'
    
    def test_update_user_profile_validation(self):
        """Test profile update validation"""
        user = UserFactory(bio='Initial bio')
        client = AuthenticatedAPIClient()
        client.authenticate_user(user)
        
        response = client.patch('/api/users/me/', {
            'bio': 'x' * 1001  # Exceeds limit
        })
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert 'field_errors' in response.data
        assert 'bio' in response.data['field_errors']
        user.refresh_from_db()
        assert user.bio == 'Initial bio'

    def test_me_profile_includes_follow_fields(self):
        user = UserFactory()
        peer = UserFactory()
        UserFollow.objects.create(follower=peer, following=user)
        UserFollow.objects.create(follower=user, following=peer)
        client = AuthenticatedAPIClient().authenticate_user(user)
        response = client.get('/api/users/me/')
        assert response.status_code == status.HTTP_200_OK
        assert response.data['followers_count'] == 1
        assert response.data['following_count'] == 1
        assert response.data['is_following'] is False

    def test_other_user_profile_is_following_and_counts(self):
        viewer = UserFactory()
        target = UserFactory()
        UserFollow.objects.create(follower=viewer, following=target)
        UserFollow.objects.create(follower=UserFactory(), following=target)
        client = AuthenticatedAPIClient().authenticate_user(viewer)
        response = client.get(f'/api/users/{target.id}/')
        assert response.status_code == status.HTTP_200_OK
        assert response.data['is_following'] is True
        assert response.data['followers_count'] == 2
        assert response.data['following_count'] == 0


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

    def test_get_user_history_includes_completed_event_attendance(self):
        organizer = UserFactory()
        participant = UserFactory()
        event = ServiceFactory(
            user=organizer,
            type='Event',
            status='Completed',
            duration=Decimal('2.50'),
        )
        HandshakeFactory(
            service=event,
            requester=participant,
            status='attended',
            provisioned_hours=Decimal('0.00'),
        )

        client = AuthenticatedAPIClient().authenticate_user(participant)
        response = client.get(f'/api/users/{participant.id}/history/')

        assert response.status_code == status.HTTP_200_OK
        assert len(response.data) == 1
        assert response.data[0]['service_type'] == 'Event'
        assert Decimal(str(response.data[0]['duration'])) == Decimal('2.50')

    def test_get_user_history_includes_attended_event_before_service_completion(self):
        organizer = UserFactory()
        participant = UserFactory()
        event = ServiceFactory(
            user=organizer,
            type='Event',
            status='Active',
            duration=Decimal('2.00'),
        )
        HandshakeFactory(
            service=event,
            requester=participant,
            status='attended',
            provisioned_hours=Decimal('0.00'),
        )

        client = AuthenticatedAPIClient().authenticate_user(participant)
        response = client.get(f'/api/users/{participant.id}/history/')

        assert response.status_code == status.HTTP_200_OK
        assert len(response.data) == 1
        assert response.data[0]['service_type'] == 'Event'

    def test_get_user_history_includes_completed_event_for_organizer(self):
        organizer = UserFactory()
        participant = UserFactory()
        event = ServiceFactory(
            user=organizer,
            type='Event',
            status='Completed',
            duration=Decimal('1.50'),
        )
        HandshakeFactory(
            service=event,
            requester=participant,
            status='attended',
            provisioned_hours=Decimal('0.00'),
        )

        client = AuthenticatedAPIClient().authenticate_user(organizer)
        response = client.get(f'/api/users/{organizer.id}/history/')

        assert response.status_code == status.HTTP_200_OK
        assert len(response.data) == 1
        assert response.data[0]['service_type'] == 'Event'
        assert response.data[0]['was_provider'] is True

    def test_get_user_history_includes_completed_owned_event_without_handshake(self):
        organizer = UserFactory()
        ServiceFactory(
            user=organizer,
            type='Event',
            status='Completed',
            duration=Decimal('3.00'),
            event_completed_at=timezone.now() - timedelta(hours=2),
        )

        client = AuthenticatedAPIClient().authenticate_user(organizer)
        response = client.get(f'/api/users/{organizer.id}/history/')

        assert response.status_code == status.HTTP_200_OK
        assert len(response.data) == 1
        assert response.data[0]['service_type'] == 'Event'
        assert response.data[0]['was_provider'] is True


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
        assert 'role' not in response.data
        assert 'timebank_balance' not in response.data
        assert 'is_verified' not in response.data
        assert 'is_onboarded' not in response.data

    def test_public_profile_includes_created_and_joined_events(self):
        viewer = UserFactory()
        profile_user = UserFactory()

        created_event = ServiceFactory(user=profile_user, type='Event', status='Active')
        joined_event = ServiceFactory(type='Event', status='Active')
        joined_handshake = HandshakeFactory(
            service=joined_event,
            requester=profile_user,
            status='accepted',
            provisioned_hours=Decimal('0.00'),
        )
        HandshakeFactory(
            service=ServiceFactory(type='Event', status='Active'),
            requester=profile_user,
            status='pending',
            provisioned_hours=Decimal('0.00'),
        )

        client = AuthenticatedAPIClient().authenticate_user(viewer)
        response = client.get(f'/api/users/{profile_user.id}/')

        assert response.status_code == status.HTTP_200_OK
        assert 'created_events' in response.data
        assert 'joined_events' in response.data
        assert 'invited_events' not in response.data

        created_ids = {event['id'] for event in response.data['created_events']}
        joined_ids = {event['id'] for event in response.data['joined_events']}

        assert str(created_event.id) in created_ids
        assert str(joined_handshake.id) in joined_ids


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


@pytest.mark.django_db
@pytest.mark.integration
class TestUserFollowView:
    """POST/DELETE /api/users/{id}/follow/"""

    def test_follow_success_creates_follow_and_event(self):
        follower = UserFactory()
        target = UserFactory()
        client = AuthenticatedAPIClient().authenticate_user(follower)
        response = client.post(f'/api/users/{target.id}/follow/')
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data['message'] == 'Successfully followed user.'
        assert response.data['follow']['follower_id'] == str(follower.id)
        assert response.data['follow']['following_id'] == str(target.id)
        assert 'id' in response.data['follow']
        assert 'created_at' in response.data['follow']
        assert UserFollow.objects.filter(follower=follower, following=target).count() == 1
        assert UserFollowEvent.objects.filter(
            follower=follower,
            following=target,
            action=UserFollowEvent.ACTION_FOLLOW,
        ).count() == 1

    def test_follow_target_not_found(self):
        client = AuthenticatedAPIClient().authenticate_user(UserFactory())
        response = client.post(f'/api/users/{uuid.uuid4()}/follow/')
        assert response.status_code == status.HTTP_404_NOT_FOUND
        assert response.data['code'] == 'NOT_FOUND'

    def test_follow_self_returns_400(self):
        user = UserFactory()
        client = AuthenticatedAPIClient().authenticate_user(user)
        response = client.post(f'/api/users/{user.id}/follow/')
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert response.data['code'] == 'VALIDATION_ERROR'

    def test_follow_duplicate_returns_400(self):
        follower = UserFactory()
        target = UserFactory()
        UserFollow.objects.create(follower=follower, following=target)
        client = AuthenticatedAPIClient().authenticate_user(follower)
        response = client.post(f'/api/users/{target.id}/follow/')
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert response.data['code'] == 'ALREADY_EXISTS'

    def test_follow_requires_authentication(self):
        from rest_framework.test import APIClient

        target = UserFactory()
        client = APIClient()
        response = client.post(f'/api/users/{target.id}/follow/')
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_follow_invalidates_cached_me_profile(self):
        follower = UserFactory()
        target = UserFactory()
        client = AuthenticatedAPIClient().authenticate_user(follower)
        first = client.get('/api/users/me/')
        assert first.data['following_count'] == 0
        client.post(f'/api/users/{target.id}/follow/')
        second = client.get('/api/users/me/')
        assert second.data['following_count'] == 1

    def test_unfollow_invalidates_cached_me_profile(self):
        follower = UserFactory()
        target = UserFactory()
        UserFollow.objects.create(follower=follower, following=target)
        client = AuthenticatedAPIClient().authenticate_user(follower)
        first = client.get('/api/users/me/')
        assert first.data['following_count'] == 1
        client.delete(f'/api/users/{target.id}/follow/')
        second = client.get('/api/users/me/')
        assert second.data['following_count'] == 0

    def test_unfollow_success_removes_follow_and_creates_event(self):
        follower = UserFactory()
        target = UserFactory()
        UserFollow.objects.create(follower=follower, following=target)
        client = AuthenticatedAPIClient().authenticate_user(follower)
        response = client.delete(f'/api/users/{target.id}/follow/')
        assert response.status_code == status.HTTP_200_OK
        assert response.data['message'] == 'Successfully unfollowed user.'
        assert not UserFollow.objects.filter(follower=follower, following=target).exists()
        assert UserFollowEvent.objects.filter(
            follower=follower,
            following=target,
            action=UserFollowEvent.ACTION_UNFOLLOW,
        ).count() == 1

    def test_unfollow_target_not_found(self):
        client = AuthenticatedAPIClient().authenticate_user(UserFactory())
        response = client.delete(f'/api/users/{uuid.uuid4()}/follow/')
        assert response.status_code == status.HTTP_404_NOT_FOUND
        assert response.data['code'] == 'NOT_FOUND'

    def test_unfollow_self_returns_400(self):
        user = UserFactory()
        client = AuthenticatedAPIClient().authenticate_user(user)
        response = client.delete(f'/api/users/{user.id}/follow/')
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert response.data['code'] == 'VALIDATION_ERROR'

    def test_unfollow_when_not_following_returns_400(self):
        follower = UserFactory()
        target = UserFactory()
        client = AuthenticatedAPIClient().authenticate_user(follower)
        response = client.delete(f'/api/users/{target.id}/follow/')
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert response.data['code'] == 'INVALID_STATE'

    def test_unfollow_requires_authentication(self):
        from rest_framework.test import APIClient

        target = UserFactory()
        client = APIClient()
        response = client.delete(f'/api/users/{target.id}/follow/')
        assert response.status_code == status.HTTP_401_UNAUTHORIZED


@pytest.mark.django_db
@pytest.mark.integration
class TestUserFollowListViews:
    """GET /api/users/{id}/followers/ and /following/"""

    def test_followers_list_returns_user_summaries(self):
        target = UserFactory()
        follower_a = UserFactory()
        follower_b = UserFactory()
        UserFollow.objects.create(follower=follower_a, following=target)
        UserFollow.objects.create(follower=follower_b, following=target)
        client = AuthenticatedAPIClient().authenticate_user(UserFactory())
        response = client.get(f'/api/users/{target.id}/followers/')
        assert response.status_code == status.HTTP_200_OK
        results = response.data['results']
        assert len(results) == 2
        ids = {row['id'] for row in results}
        assert str(follower_a.id) in ids
        assert str(follower_b.id) in ids
        assert 'first_name' in results[0]
        assert 'avatar_url' in results[0]

    def test_following_list_returns_user_summaries(self):
        source = UserFactory()
        u1 = UserFactory()
        u2 = UserFactory()
        UserFollow.objects.create(follower=source, following=u1)
        UserFollow.objects.create(follower=source, following=u2)
        client = AuthenticatedAPIClient().authenticate_user(UserFactory())
        response = client.get(f'/api/users/{source.id}/following/')
        assert response.status_code == status.HTTP_200_OK
        results = response.data['results']
        assert len(results) == 2
        ids = {row['id'] for row in results}
        assert str(u1.id) in ids
        assert str(u2.id) in ids

    def test_followers_list_user_not_found(self):
        client = AuthenticatedAPIClient().authenticate_user(UserFactory())
        response = client.get(f'/api/users/{uuid.uuid4()}/followers/')
        assert response.status_code == status.HTTP_404_NOT_FOUND
        assert response.data['code'] == 'NOT_FOUND'

    def test_followers_list_requires_authentication(self):
        from rest_framework.test import APIClient

        target = UserFactory()
        response = APIClient().get(f'/api/users/{target.id}/followers/')
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_following_list_requires_authentication(self):
        from rest_framework.test import APIClient

        source = UserFactory()
        response = APIClient().get(f'/api/users/{source.id}/following/')
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_inactive_follower_excluded_from_list_and_count(self):
        target = UserFactory()
        active_follower = UserFactory()
        inactive_follower = UserFactory(is_active=False)
        UserFollow.objects.create(follower=active_follower, following=target)
        UserFollow.objects.create(follower=inactive_follower, following=target)
        client = AuthenticatedAPIClient().authenticate_user(UserFactory())
        response = client.get(f'/api/users/{target.id}/followers/')
        assert response.status_code == status.HTTP_200_OK
        results = response.data['results']
        ids = {row['id'] for row in results}
        assert str(active_follower.id) in ids
        assert str(inactive_follower.id) not in ids

    def test_inactive_following_excluded_from_list(self):
        source = UserFactory()
        active_target = UserFactory()
        inactive_target = UserFactory(is_active=False)
        UserFollow.objects.create(follower=source, following=active_target)
        UserFollow.objects.create(follower=source, following=inactive_target)
        client = AuthenticatedAPIClient().authenticate_user(UserFactory())
        response = client.get(f'/api/users/{source.id}/following/')
        assert response.status_code == status.HTTP_200_OK
        results = response.data['results']
        ids = {row['id'] for row in results}
        assert str(active_target.id) in ids
        assert str(inactive_target.id) not in ids
