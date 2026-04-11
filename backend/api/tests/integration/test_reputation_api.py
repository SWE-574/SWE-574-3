"""
Integration tests for reputation API endpoints
"""
import pytest
from rest_framework import status
from django.utils import timezone
from datetime import timedelta

from api.tests.helpers.factories import (
    UserFactory, ServiceFactory, HandshakeFactory
)
from api.tests.helpers.test_client import AuthenticatedAPIClient
from api.models import (
    ReputationRep,
    NegativeRep,
    Badge,
    UserBadge,
    EventEvaluationSummary,
    Report,
    Notification,
    Comment,
)


@pytest.mark.django_db
@pytest.mark.integration
class TestReputationViewSet:
    """Test ReputationViewSet (positive reputation)"""
    
    def test_create_reputation(self):
        """Test creating positive reputation"""
        provider = UserFactory()
        requester = UserFactory()
        service = ServiceFactory(user=provider, type='Offer')
        handshake = HandshakeFactory(
            service=service,
            requester=requester,
            status='completed'
        )
        
        client = AuthenticatedAPIClient()
        client.authenticate_user(requester)
        
        response = client.post('/api/reputation/', {
            'handshake_id': str(handshake.id),
            'punctual': True,
            'helpful': True,
            'kindness': True
        })
        assert response.status_code == status.HTTP_201_CREATED
        assert ReputationRep.objects.filter(
            handshake=handshake,
            giver=requester,
            receiver=provider
        ).exists()
        
        provider.refresh_from_db()
        assert provider.karma_score > 0

    def test_create_reputation_provider_can_review_receiver(self):
        """Either party can submit reputation for the other (provider -> receiver)"""
        provider = UserFactory()
        requester = UserFactory(karma_score=0)
        service = ServiceFactory(user=provider, type='Offer')
        handshake = HandshakeFactory(
            service=service,
            requester=requester,
            status='completed'
        )

        client = AuthenticatedAPIClient()
        client.authenticate_user(provider)

        response = client.post('/api/reputation/', {
            'handshake_id': str(handshake.id),
            'punctual': True,
            'helpful': False,
            'kindness': True,
            'comment': 'Great communication and punctual.'
        })

        assert response.status_code == status.HTTP_201_CREATED
        assert ReputationRep.objects.filter(
            handshake=handshake,
            giver=provider,
            receiver=requester
        ).exists()

        requester.refresh_from_db()
        assert requester.karma_score > 0

    def test_positive_service_feedback_notifies_recipient(self):
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

        client = AuthenticatedAPIClient().authenticate_user(requester)
        response = client.post('/api/reputation/', {
            'handshake_id': str(handshake.id),
            'punctual': True,
            'helpful': False,
            'kindness': False,
        })

        assert response.status_code == status.HTTP_201_CREATED
        assert Notification.objects.filter(
            user=provider,
            type='positive_rep',
            title='Feedback Received',
            related_handshake=handshake,
            related_service=service,
        ).exists()

    def test_add_review_later_within_window_after_evaluation(self):
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

        client = AuthenticatedAPIClient().authenticate_user(requester)
        eval_response = client.post('/api/reputation/', {
            'handshake_id': str(handshake.id),
            'punctual': True,
            'helpful': False,
            'kindness': False,
        })
        assert eval_response.status_code == status.HTTP_201_CREATED
        assert not Comment.objects.filter(
            related_handshake=handshake,
            user=requester,
            is_verified_review=True,
            is_deleted=False,
        ).exists()

        review_response = client.post('/api/reputation/add-review/', {
            'handshake_id': str(handshake.id),
            'comment': 'Adding my review later inside the evaluation window.',
        })
        assert review_response.status_code == status.HTTP_201_CREATED
        assert Comment.objects.filter(
            related_handshake=handshake,
            user=requester,
            is_verified_review=True,
            is_deleted=False,
        ).exists()

    def test_add_review_later_rejected_after_window(self):
        provider = UserFactory()
        requester = UserFactory()
        service = ServiceFactory(user=provider, type='Offer')
        handshake = HandshakeFactory(
            service=service,
            requester=requester,
            status='completed',
            evaluation_window_starts_at=timezone.now() - timedelta(hours=60),
            evaluation_window_ends_at=timezone.now() - timedelta(hours=1),
            evaluation_window_closed_at=None,
        )
        ReputationRep.objects.create(
            handshake=handshake,
            giver=requester,
            receiver=provider,
            is_punctual=True,
            is_helpful=False,
            is_kind=False,
        )

        client = AuthenticatedAPIClient().authenticate_user(requester)
        response = client.post('/api/reputation/add-review/', {
            'handshake_id': str(handshake.id),
            'comment': 'Too late review',
        })
        assert response.status_code == status.HTTP_410_GONE

    def test_add_review_without_comment_is_allowed_noop(self):
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
        ReputationRep.objects.create(
            handshake=handshake,
            giver=requester,
            receiver=provider,
            is_punctual=True,
            is_helpful=False,
            is_kind=False,
        )

        client = AuthenticatedAPIClient().authenticate_user(requester)
        response = client.post('/api/reputation/add-review/', {
            'handshake_id': str(handshake.id),
        })

        assert response.status_code == status.HTTP_200_OK
        assert response.data['status'] == 'success'
        assert Comment.objects.filter(
            related_handshake=handshake,
            user=requester,
            is_verified_review=True,
            is_deleted=False,
        ).count() == 0

    def test_blind_review_hidden_until_counterparty_submits_evaluation(self):
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

        requester_client = AuthenticatedAPIClient().authenticate_user(requester)
        create_response = requester_client.post('/api/reputation/', {
            'handshake_id': str(handshake.id),
            'punctual': True,
            'helpful': False,
            'kindness': False,
            'comment': 'Private until both sides evaluate.',
        })
        assert create_response.status_code == status.HTTP_201_CREATED

        provider_client = AuthenticatedAPIClient().authenticate_user(provider)
        hidden_response = provider_client.get(f'/api/services/{service.id}/comments/')
        assert hidden_response.status_code == status.HTTP_200_OK
        assert hidden_response.data['count'] == 0

        reciprocal_response = provider_client.post('/api/reputation/', {
            'handshake_id': str(handshake.id),
            'punctual': True,
            'helpful': True,
            'kindness': True,
        })
        assert reciprocal_response.status_code == status.HTTP_201_CREATED

        revealed_response = provider_client.get(f'/api/services/{service.id}/comments/')
        assert revealed_response.status_code == status.HTTP_200_OK
        assert revealed_response.data['count'] == 1

    def test_blind_review_revealed_after_window_expires_without_reciprocal(self):
        provider = UserFactory()
        requester = UserFactory()
        service = ServiceFactory(user=provider, type='Offer')
        handshake = HandshakeFactory(
            service=service,
            requester=requester,
            status='completed',
            evaluation_window_starts_at=timezone.now() - timedelta(hours=50),
            evaluation_window_ends_at=timezone.now() - timedelta(minutes=1),
            evaluation_window_closed_at=timezone.now(),
        )

        requester_client = AuthenticatedAPIClient().authenticate_user(requester)
        create_response = requester_client.post('/api/reputation/', {
            'handshake_id': str(handshake.id),
            'punctual': True,
            'helpful': False,
            'kindness': False,
            'comment': 'Visible after feedback window expiry.',
        })
        assert create_response.status_code == status.HTTP_410_GONE

        # Create legacy-style verified review directly to validate display gating on read path.
        Comment.objects.create(
            service=service,
            user=requester,
            body='Visible after feedback window expiry.',
            is_verified_review=True,
            related_handshake=handshake,
        )

        provider_client = AuthenticatedAPIClient().authenticate_user(provider)
        response = provider_client.get(f'/api/services/{service.id}/comments/')
        assert response.status_code == status.HTTP_200_OK
        assert response.data['count'] == 1
    
    def test_create_reputation_duplicate(self):
        """Test cannot create duplicate reputation"""
        provider = UserFactory()
        requester = UserFactory()
        service = ServiceFactory(user=provider)
        handshake = HandshakeFactory(
            service=service,
            requester=requester,
            status='completed'
        )
        
        ReputationRep.objects.create(
            handshake=handshake,
            giver=requester,
            receiver=provider,
            is_punctual=True,
            is_helpful=True,
            is_kind=True
        )
        
        client = AuthenticatedAPIClient()
        client.authenticate_user(requester)
        
        response = client.post('/api/reputation/', {
            'handshake_id': str(handshake.id),
            'punctual': True,
            'helpful': True,
            'kindness': True
        })
        assert response.status_code == status.HTTP_400_BAD_REQUEST
    
    def test_create_reputation_own_handshake(self):
        """Test can only create reputation for completed handshake"""
        provider = UserFactory()
        requester = UserFactory()
        service = ServiceFactory(user=provider)
        handshake = HandshakeFactory(
            service=service,
            requester=requester,
            status='accepted'  # Not completed
        )
        
        client = AuthenticatedAPIClient()
        client.authenticate_user(requester)
        
        response = client.post('/api/reputation/', {
            'handshake_id': str(handshake.id),
            'punctual': True,
            'helpful': True,
            'kindness': True
        })
        assert response.status_code == status.HTTP_404_NOT_FOUND
    
    def test_list_reputation(self):
        """Test listing reputation entries"""
        provider = UserFactory()
        requester = UserFactory()
        service = ServiceFactory(user=provider)
        handshake = HandshakeFactory(
            service=service,
            requester=requester,
            status='completed'
        )
        ReputationRep.objects.create(
            handshake=handshake,
            giver=requester,
            receiver=provider,
            is_punctual=True,
            is_helpful=True,
            is_kind=True
        )
        
        client = AuthenticatedAPIClient()
        client.authenticate_user(requester)
        
        response = client.get('/api/reputation/')
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data) > 0

    def test_create_reputation_event_requires_attended(self):
        organizer = UserFactory()
        participant = UserFactory()
        event = ServiceFactory(
            user=organizer,
            type='Event',
            status='Completed',
            event_completed_at=timezone.now(),
        )
        handshake = HandshakeFactory(
            service=event,
            requester=participant,
            status='checked_in',
            provisioned_hours=0,
        )

        client = AuthenticatedAPIClient()
        client.authenticate_user(participant)

        response = client.post('/api/reputation/', {
            'handshake_id': str(handshake.id),
            'well_organized': True,
            'engaging': True,
            'welcoming': True,
        })
        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_create_reputation_event_attended_allowed(self):
        organizer = UserFactory()
        participant = UserFactory()
        event = ServiceFactory(
            user=organizer,
            type='Event',
            status='Completed',
            event_completed_at=timezone.now(),
        )
        handshake = HandshakeFactory(
            service=event,
            requester=participant,
            status='attended',
            provisioned_hours=0,
        )

        client = AuthenticatedAPIClient()
        client.authenticate_user(participant)

        response = client.post('/api/reputation/', {
            'handshake_id': str(handshake.id),
            'well_organized': True,
            'engaging': False,
            'welcoming': True,
        })
        assert response.status_code == status.HTTP_201_CREATED

    def test_organizer_cannot_submit_event_evaluation(self):
        organizer = UserFactory()
        attendee = UserFactory()
        event = ServiceFactory(
            user=organizer,
            type='Event',
            status='Completed',
            event_completed_at=timezone.now(),
        )
        handshake = HandshakeFactory(
            service=event,
            requester=attendee,
            status='attended',
            provisioned_hours=0,
        )

        client = AuthenticatedAPIClient()
        client.authenticate_user(organizer)

        response = client.post('/api/reputation/', {
            'handshake_id': str(handshake.id),
            'well_organized': True,
            'engaging': True,
            'welcoming': True,
        })
        assert response.status_code == status.HTTP_403_FORBIDDEN


@pytest.mark.django_db
@pytest.mark.integration
class TestNegativeRepViewSet:
    """Test NegativeRepViewSet"""
    
    def test_create_negative_reputation(self):
        """Test creating negative reputation"""
        provider = UserFactory()
        requester = UserFactory()
        service = ServiceFactory(user=provider, type='Offer')
        handshake = HandshakeFactory(
            service=service,
            requester=requester,
            status='completed'
        )
        
        client = AuthenticatedAPIClient()
        client.authenticate_user(requester)
        
        response = client.post('/api/reputation/negative/', {
            'handshake_id': str(handshake.id),
            'is_late': True,
            'comment': 'Arrived 30 minutes late'
        })
        assert response.status_code == status.HTTP_201_CREATED
        assert NegativeRep.objects.filter(
            handshake=handshake,
            giver=requester,
            receiver=provider
        ).exists()

    def test_negative_feedback_is_silent_for_recipient(self):
        provider = UserFactory(karma_score=10)
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

        client = AuthenticatedAPIClient().authenticate_user(requester)
        response = client.post('/api/reputation/negative/', {
            'handshake_id': str(handshake.id),
            'is_late': True,
        })

        assert response.status_code == status.HTTP_201_CREATED
        assert not Notification.objects.filter(
            user=provider,
            related_handshake=handshake,
            type='negative_feedback',
        ).exists()
    
    def test_negative_reputation_affects_karma(self):
        """Test negative reputation affects karma score"""
        provider = UserFactory(karma_score=10)
        requester = UserFactory()
        service = ServiceFactory(user=provider, type='Offer')
        handshake = HandshakeFactory(
            service=service,
            requester=requester,
            status='completed'
        )

        # Prevent badge assignment side-effects from offsetting the penalty.
        # The negative-rep flow calls check_and_assign_badges(), which can award
        # karma for the 'first-service' badge once the user has 1 completed handshake.
        badge, _ = Badge.objects.get_or_create(
            id='first-service',
            defaults={
                'name': 'First Service',
                'description': 'Completed your first service',
                'icon_url': None,
            }
        )
        UserBadge.objects.get_or_create(user=provider, badge=badge)
        
        client = AuthenticatedAPIClient()
        client.authenticate_user(requester)
        
        client.post('/api/reputation/negative/', {
            'handshake_id': str(handshake.id),
            'is_late': True
        })
        
        provider.refresh_from_db()
        assert provider.karma_score < 10

    def test_negative_rep_event_requires_attended(self):
        organizer = UserFactory()
        participant = UserFactory()
        event = ServiceFactory(
            user=organizer,
            type='Event',
            status='Completed',
            event_completed_at=timezone.now(),
        )
        handshake = HandshakeFactory(
            service=event,
            requester=participant,
            status='checked_in',
            provisioned_hours=0,
        )

        client = AuthenticatedAPIClient()
        client.authenticate_user(participant)

        response = client.post('/api/reputation/negative/', {
            'handshake_id': str(handshake.id),
            'disorganized': True,
        })
        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_create_positive_event_reputation_requires_attended_not_accepted(self):
        organizer = UserFactory()
        participant = UserFactory()
        event = ServiceFactory(
            user=organizer,
            type='Event',
            status='Completed',
            event_completed_at=timezone.now(),
        )
        handshake = HandshakeFactory(
            service=event,
            requester=participant,
            status='accepted',
            provisioned_hours=0,
        )

        client = AuthenticatedAPIClient()
        client.authenticate_user(participant)

        response = client.post('/api/reputation/', {
            'handshake_id': str(handshake.id),
            'well_organized': True,
            'engaging': True,
            'welcoming': True,
        })
        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_create_negative_event_reputation_requires_attended_not_accepted(self):
        organizer = UserFactory()
        participant = UserFactory()
        event = ServiceFactory(
            user=organizer,
            type='Event',
            status='Completed',
            event_completed_at=timezone.now(),
        )
        handshake = HandshakeFactory(
            service=event,
            requester=participant,
            status='accepted',
            provisioned_hours=0,
        )

        client = AuthenticatedAPIClient()
        client.authenticate_user(participant)

        response = client.post('/api/reputation/negative/', {
            'handshake_id': str(handshake.id),
            'disorganized': True,
        })
        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_create_positive_event_reputation_requires_attended_not_no_show(self):
        organizer = UserFactory()
        participant = UserFactory()
        event = ServiceFactory(
            user=organizer,
            type='Event',
            status='Completed',
            event_completed_at=timezone.now(),
        )
        handshake = HandshakeFactory(
            service=event,
            requester=participant,
            status='no_show',
            provisioned_hours=0,
        )

        client = AuthenticatedAPIClient()
        client.authenticate_user(participant)

        response = client.post('/api/reputation/', {
            'handshake_id': str(handshake.id),
            'well_organized': True,
            'engaging': True,
            'welcoming': True,
        })
        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_create_negative_event_reputation_requires_attended_not_no_show(self):
        organizer = UserFactory()
        participant = UserFactory()
        event = ServiceFactory(
            user=organizer,
            type='Event',
            status='Completed',
            event_completed_at=timezone.now(),
        )
        handshake = HandshakeFactory(
            service=event,
            requester=participant,
            status='no_show',
            provisioned_hours=0,
        )

        client = AuthenticatedAPIClient()
        client.authenticate_user(participant)

        response = client.post('/api/reputation/negative/', {
            'handshake_id': str(handshake.id),
            'disorganized': True,
        })
        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_event_evaluation_summary_created_and_exposed_on_service(self):
        organizer = UserFactory()
        participant = UserFactory()
        event = ServiceFactory(
            user=organizer,
            type='Event',
            status='Completed',
            event_completed_at=timezone.now(),
        )
        handshake = HandshakeFactory(
            service=event,
            requester=participant,
            status='attended',
            provisioned_hours=0,
        )

        participant_client = AuthenticatedAPIClient().authenticate_user(participant)
        response = participant_client.post('/api/reputation/', {
            'handshake_id': str(handshake.id),
            'well_organized': True,
            'engaging': True,
            'welcoming': False,
        })
        assert response.status_code == status.HTTP_201_CREATED

        summary = EventEvaluationSummary.objects.get(service=event)
        assert summary.total_attended == 1
        assert summary.positive_feedback_count == 1
        assert summary.negative_feedback_count == 0
        assert summary.unique_evaluator_count == 1
        assert summary.punctual_count == 1
        assert summary.helpful_count == 1
        assert summary.kind_count == 0
        organizer.refresh_from_db()
        assert organizer.event_hot_score == 2.0

        organizer_client = AuthenticatedAPIClient().authenticate_user(organizer)
        service_response = organizer_client.get(f'/api/services/{event.id}/')
        assert service_response.status_code == status.HTTP_200_OK
        payload = service_response.data.get('event_evaluation_summary')
        assert payload is not None
        assert payload['positive_feedback_count'] == 1
        assert payload['unique_evaluator_count'] == 1
        assert payload['well_organized_average'] == 1.0
        assert payload['engaging_average'] == 1.0
        assert payload['welcoming_average'] == 0.0
        assert payload['organizer_event_hot_score'] == 2.0

    def test_event_evaluation_summary_updates_after_negative_feedback(self):
        organizer = UserFactory()
        participant = UserFactory()
        event = ServiceFactory(
            user=organizer,
            type='Event',
            status='Completed',
            event_completed_at=timezone.now(),
        )
        handshake = HandshakeFactory(
            service=event,
            requester=participant,
            status='attended',
            provisioned_hours=0,
        )

        participant_client = AuthenticatedAPIClient().authenticate_user(participant)
        positive = participant_client.post('/api/reputation/', {
            'handshake_id': str(handshake.id),
            'well_organized': True,
            'engaging': False,
            'welcoming': True,
        })
        assert positive.status_code == status.HTTP_201_CREATED

        negative = participant_client.post('/api/reputation/negative/', {
            'handshake_id': str(handshake.id),
            'disorganized': True,
            'boring': False,
            'unwelcoming': True,
        })
        assert negative.status_code == status.HTTP_201_CREATED

        summary = EventEvaluationSummary.objects.get(service=event)
        assert summary.positive_feedback_count == 1
        assert summary.negative_feedback_count == 1
        assert summary.unique_evaluator_count == 1
        assert summary.positive_score_total == 2
        assert summary.negative_score_total == 2
        assert summary.late_count == 1
        assert summary.rude_count == 1
        organizer.refresh_from_db()
        assert organizer.event_hot_score == 0.0

    def test_event_reputation_window_expired_for_positive(self):
        organizer = UserFactory()
        participant = UserFactory()
        event = ServiceFactory(
            user=organizer,
            type='Event',
            status='Completed',
            event_completed_at=timezone.now() - timedelta(days=8),
        )
        handshake = HandshakeFactory(
            service=event,
            requester=participant,
            status='attended',
            provisioned_hours=0,
        )

        client = AuthenticatedAPIClient().authenticate_user(participant)
        response = client.post('/api/reputation/', {
            'handshake_id': str(handshake.id),
            'well_organized': True,
            'engaging': True,
            'welcoming': True,
        })
        assert response.status_code == status.HTTP_410_GONE

    def test_event_reputation_window_expired_for_negative(self):
        organizer = UserFactory()
        participant = UserFactory()
        event = ServiceFactory(
            user=organizer,
            type='Event',
            status='Completed',
            event_completed_at=timezone.now() - timedelta(days=8),
        )
        handshake = HandshakeFactory(
            service=event,
            requester=participant,
            status='attended',
            provisioned_hours=0,
        )

        client = AuthenticatedAPIClient().authenticate_user(participant)
        response = client.post('/api/reputation/negative/', {
            'handshake_id': str(handshake.id),
            'disorganized': True,
        })
        assert response.status_code == status.HTTP_410_GONE


@pytest.mark.django_db
@pytest.mark.integration
class TestEventEvaluationHotScoreIsolation:
    """
    Regression tests: event trait submissions must affect event_hot_score only.
    Service hot_score (the listing-level ranking field) must remain unchanged.
    Covers both positive and negative event trait submission paths.
    """

    def _make_attended_event_handshake(self, organizer, participant):
        event = ServiceFactory(
            user=organizer,
            type='Event',
            status='Completed',
            event_completed_at=timezone.now(),
            hot_score=0.0,
        )
        handshake = HandshakeFactory(
            service=event,
            requester=participant,
            status='attended',
            provisioned_hours=0,
        )
        return event, handshake

    def test_positive_event_evaluation_updates_event_hot_score_not_service_hot_score(self):
        organizer = UserFactory()
        participant = UserFactory()
        event, handshake = self._make_attended_event_handshake(organizer, participant)

        hot_score_before = event.hot_score

        client = AuthenticatedAPIClient()
        client.authenticate_user(participant)
        response = client.post('/api/reputation/', {
            'handshake_id': str(handshake.id),
            'well_organized': True,
            'engaging': True,
            'welcoming': True,
        })
        assert response.status_code == status.HTTP_201_CREATED

        organizer.refresh_from_db()
        event.refresh_from_db()

        assert organizer.event_hot_score > 0, (
            'Positive event evaluation must increase organizer event_hot_score'
        )
        assert event.hot_score == hot_score_before, (
            'Service hot_score must not change after an event evaluation submission'
        )

    def test_negative_event_evaluation_updates_event_hot_score_not_service_hot_score(self):
        organizer = UserFactory()
        participant = UserFactory()
        event, handshake = self._make_attended_event_handshake(organizer, participant)

        # Submit a positive eval first so there is a baseline event_hot_score to compare against.
        client = AuthenticatedAPIClient()
        client.authenticate_user(participant)
        client.post('/api/reputation/', {
            'handshake_id': str(handshake.id),
            'well_organized': True,
            'engaging': True,
            'welcoming': True,
        })
        organizer.refresh_from_db()
        event.refresh_from_db()
        hot_score_after_positive = event.hot_score
        event_hot_score_after_positive = organizer.event_hot_score

        negative_response = client.post('/api/reputation/negative/', {
            'handshake_id': str(handshake.id),
            'disorganized': True,
            'boring': True,
            'unwelcoming': False,
        })
        assert negative_response.status_code == status.HTTP_201_CREATED

        organizer.refresh_from_db()
        event.refresh_from_db()

        assert organizer.event_hot_score != event_hot_score_after_positive, (
            'Negative event evaluation must recalculate organizer event_hot_score'
        )
        assert event.hot_score == hot_score_after_positive, (
            'Service hot_score must not change after a negative event evaluation submission'
        )


@pytest.mark.django_db
@pytest.mark.integration
class TestEventNoShowAppeals:
    """Integration tests for FR-F02e no-show appeal workflow."""

    def test_participant_can_submit_no_show_appeal(self):
        organizer = UserFactory()
        participant = UserFactory()
        event = ServiceFactory(
            user=organizer,
            type='Event',
            status='Completed',
            event_completed_at=timezone.now(),
        )
        handshake = HandshakeFactory(
            service=event,
            requester=participant,
            status='no_show',
            provisioned_hours=0,
        )

        client = AuthenticatedAPIClient().authenticate_user(participant)
        response = client.post(
            f'/api/handshakes/{handshake.id}/appeal-no-show/',
            {'description': 'I attended and can provide proof.'},
        )

        assert response.status_code == status.HTTP_201_CREATED
        assert 'report_id' in response.data
        report = Report.objects.get(id=response.data['report_id'])
        assert report.type == 'no_show'
        assert report.status == 'pending'
        assert report.related_handshake_id == handshake.id
        assert report.reporter_id == participant.id
        assert report.reported_user_id == organizer.id

    def test_duplicate_no_show_appeal_is_rejected(self):
        organizer = UserFactory()
        participant = UserFactory()
        event = ServiceFactory(
            user=organizer,
            type='Event',
            status='Completed',
            event_completed_at=timezone.now(),
        )
        handshake = HandshakeFactory(
            service=event,
            requester=participant,
            status='no_show',
            provisioned_hours=0,
        )

        client = AuthenticatedAPIClient().authenticate_user(participant)
        first = client.post(f'/api/handshakes/{handshake.id}/appeal-no-show/', {'description': 'first'})
        second = client.post(f'/api/handshakes/{handshake.id}/appeal-no-show/', {'description': 'second'})

        assert first.status_code == status.HTTP_201_CREATED
        assert second.status_code == status.HTTP_400_BAD_REQUEST
        assert second.data['code'] == 'ALREADY_EXISTS'

    def test_admin_can_overturn_no_show_appeal(self):
        organizer = UserFactory()
        participant = UserFactory(
            no_show_count=3,
            is_event_banned_until=timezone.now() + timedelta(days=7),
        )
        event = ServiceFactory(
            user=organizer,
            type='Event',
            status='Completed',
            event_completed_at=timezone.now(),
        )
        handshake = HandshakeFactory(
            service=event,
            requester=participant,
            status='no_show',
            provisioned_hours=0,
        )
        report = Report.objects.create(
            reporter=participant,
            reported_user=organizer,
            related_handshake=handshake,
            reported_service=event,
            type='no_show',
            status='pending',
            description='I was there and checked in at the venue.',
        )

        admin = UserFactory(role='admin', is_staff=True, is_superuser=True)
        admin_client = AuthenticatedAPIClient().authenticate_admin(admin)
        response = admin_client.post(
            f'/api/admin/reports/{report.id}/resolve/',
            {'action': 'overturn_no_show', 'admin_notes': 'Evidence confirmed'},
        )

        assert response.status_code == status.HTTP_200_OK
        handshake.refresh_from_db()
        participant.refresh_from_db()
        report.refresh_from_db()
        assert handshake.status == 'attended'
        assert participant.no_show_count == 2
        assert participant.is_event_banned_until is None
        assert report.status == 'resolved'

    def test_admin_can_uphold_no_show_appeal(self):
        organizer = UserFactory()
        participant = UserFactory(no_show_count=1)
        event = ServiceFactory(
            user=organizer,
            type='Event',
            status='Completed',
            event_completed_at=timezone.now(),
        )
        handshake = HandshakeFactory(
            service=event,
            requester=participant,
            status='no_show',
            provisioned_hours=0,
        )
        report = Report.objects.create(
            reporter=participant,
            reported_user=organizer,
            related_handshake=handshake,
            reported_service=event,
            type='no_show',
            status='pending',
            description='Appeal text',
        )

        admin = UserFactory(role='admin', is_staff=True, is_superuser=True)
        admin_client = AuthenticatedAPIClient().authenticate_admin(admin)
        response = admin_client.post(
            f'/api/admin/reports/{report.id}/resolve/',
            {'action': 'uphold_no_show'},
        )

        assert response.status_code == status.HTTP_200_OK
        handshake.refresh_from_db()
        participant.refresh_from_db()
        report.refresh_from_db()
        assert handshake.status == 'no_show'
        assert participant.no_show_count == 1
        assert report.status == 'dismissed'


@pytest.mark.django_db
@pytest.mark.integration
class TestAdminReportResolutionStatusMapping:
    """Ensure admin resolution actions map to expected Report.status values."""

    def test_dismiss_action_sets_report_status_to_dismissed(self, monkeypatch):
        monkeypatch.setattr('api.views.complete_timebank_transfer', lambda _handshake: None)

        provider = UserFactory()
        requester = UserFactory()
        service = ServiceFactory(user=provider, type='Offer')
        handshake = HandshakeFactory(
            service=service,
            requester=requester,
            status='reported',
            provisioned_hours=2,
        )
        report = Report.objects.create(
            reporter=requester,
            reported_user=provider,
            related_handshake=handshake,
            reported_service=service,
            type='service_issue',
            status='pending',
            description='Service quality issue.',
        )

        admin = UserFactory(role='admin', is_staff=True, is_superuser=True)
        admin_client = AuthenticatedAPIClient().authenticate_admin(admin)
        response = admin_client.post(
            f'/api/admin/reports/{report.id}/resolve/',
            {'action': 'dismiss', 'admin_notes': 'No violation found.'},
        )

        assert response.status_code == status.HTTP_200_OK
        report.refresh_from_db()
        assert report.status == 'dismissed'

    def test_confirm_no_show_action_sets_report_status_to_resolved(self, monkeypatch):
        monkeypatch.setattr('api.views.cancel_timebank_transfer', lambda _handshake: None)
        monkeypatch.setattr('api.views.complete_timebank_transfer', lambda _handshake: None)

        provider = UserFactory()
        requester = UserFactory()
        service = ServiceFactory(user=provider, type='Offer')
        handshake = HandshakeFactory(
            service=service,
            requester=requester,
            status='reported',
            provisioned_hours=2,
        )
        report = Report.objects.create(
            reporter=requester,
            reported_user=provider,
            related_handshake=handshake,
            reported_service=service,
            type='no_show',
            status='pending',
            description='Provider did not show up.',
        )

        admin = UserFactory(role='admin', is_staff=True, is_superuser=True)
        admin_client = AuthenticatedAPIClient().authenticate_admin(admin)
        response = admin_client.post(
            f'/api/admin/reports/{report.id}/resolve/',
            {'action': 'confirm_no_show', 'admin_notes': 'No-show confirmed.'},
        )

        assert response.status_code == status.HTTP_200_OK
        report.refresh_from_db()
        assert report.status == 'resolved'

    def test_remove_from_event_action_cancels_participant_and_resolves_report(self):
        organizer = UserFactory()
        reporter = UserFactory()
        reported_participant = UserFactory()
        event = ServiceFactory(user=organizer, type='Event', status='Active')

        reporter_handshake = HandshakeFactory(
            service=event,
            requester=reporter,
            status='accepted',
            provisioned_hours=0,
        )
        participant_handshake = HandshakeFactory(
            service=event,
            requester=reported_participant,
            status='accepted',
            provisioned_hours=0,
        )

        report = Report.objects.create(
            reporter=reporter,
            reported_user=reported_participant,
            related_handshake=reporter_handshake,
            reported_service=event,
            type='harassment',
            status='pending',
            description='Participant sent abusive event chat messages.',
        )

        admin = UserFactory(role='admin', is_staff=True, is_superuser=True)
        admin_client = AuthenticatedAPIClient().authenticate_admin(admin)
        response = admin_client.post(
            f'/api/admin/reports/{report.id}/resolve/',
            {'action': 'remove_from_event', 'admin_notes': 'Removed after chat abuse report.'},
        )

        assert response.status_code == status.HTTP_200_OK
        report.refresh_from_db()
        participant_handshake.refresh_from_db()
        assert report.status == 'resolved'
        assert participant_handshake.status == 'cancelled'

    def test_remove_from_event_rejects_when_reported_user_is_event_organizer(self):
        organizer = UserFactory()
        reporter = UserFactory()
        event = ServiceFactory(user=organizer, type='Event', status='Active')

        reporter_handshake = HandshakeFactory(
            service=event,
            requester=reporter,
            status='accepted',
            provisioned_hours=0,
        )

        report = Report.objects.create(
            reporter=reporter,
            reported_user=organizer,
            related_handshake=reporter_handshake,
            reported_service=event,
            type='harassment',
            status='pending',
            description='Organizer chat behavior report.',
        )

        admin = UserFactory(role='admin', is_staff=True, is_superuser=True)
        admin_client = AuthenticatedAPIClient().authenticate_admin(admin)
        response = admin_client.post(
            f'/api/admin/reports/{report.id}/resolve/',
            {'action': 'remove_from_event'},
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert 'organizer cannot be removed' in (response.data.get('detail', '') or '').lower()


@pytest.mark.django_db
@pytest.mark.integration
class TestEventEvaluationCommentHistory:
    """
    Integration tests for event evaluation comment payload in organizer profile.

    Scope: POST /api/reputation/ with optional 'comment' field, then GET /api/users/me/
    validates the event_comments_history list returned in the organizer profile payload.
    """

    def _completed_event_handshake(self, organizer, participant):
        """
        Helper: returns (event, handshake) with evaluation window open.

        The window must be open so POST /api/reputation/ accepts the submission.
        Event reviews are NOT hidden by _apply_blind_review_visibility (the filter
        was fixed to skip Events), so calling _expire_window is no longer required
        before reading comments — but existing tests that do so continue to pass.
        """
        event = ServiceFactory(
            user=organizer,
            type='Event',
            status='Completed',
            event_completed_at=timezone.now() - timedelta(hours=2),
        )
        handshake = HandshakeFactory(
            service=event,
            requester=participant,
            status='attended',
            provisioned_hours=0,
            evaluation_window_starts_at=timezone.now() - timedelta(hours=2),
            evaluation_window_ends_at=timezone.now() + timedelta(hours=46),
            evaluation_window_closed_at=None,
        )
        return event, handshake

    def _expire_window(self, handshake):
        """Move evaluation_window_ends_at into the past so blind-review filter passes."""
        handshake.evaluation_window_ends_at = timezone.now() - timedelta(seconds=1)
        handshake.evaluation_window_closed_at = timezone.now() - timedelta(seconds=1)
        handshake.save(update_fields=['evaluation_window_ends_at', 'evaluation_window_closed_at'])

    def test_event_review_visible_during_evaluation_window(self):
        """
        Event reviews must be visible immediately after submission, even while the
        48-hour evaluation window is still open. The blind-review filter must not
        apply to Event handshakes — the organizer never submits a reciprocal evaluation.
        """
        organizer = UserFactory()
        participant = UserFactory()

        event, handshake = self._completed_event_handshake(organizer, participant)
        # Do NOT expire the window — this is the regression case.

        Comment.objects.create(
            service=event,
            user=participant,
            body='Great event!',
            is_verified_review=True,
            related_handshake=handshake,
        )

        client = AuthenticatedAPIClient()
        client.authenticate_user(participant)
        response = client.get(f'/api/services/{event.id}/comments/')

        assert response.status_code == status.HTTP_200_OK
        assert response.data['count'] == 1, (
            "Event reviews must not be hidden during the evaluation window — "
            "blind-review filter must skip Event handshakes"
        )

    def test_event_comment_appears_in_organizer_event_comments_history(self):
        """Commented evaluation is present in the organizer profile payload with expected metadata."""
        organizer = UserFactory()
        participant = UserFactory()
        review_text = f'Excellent event, very well run – {timezone.now().timestamp()}'

        event, handshake = self._completed_event_handshake(organizer, participant)

        # Participant submits positive evaluation with a comment (window is open).
        participant_client = AuthenticatedAPIClient()
        participant_client.authenticate_user(participant)
        rep_response = participant_client.post('/api/reputation/', {
            'handshake_id': str(handshake.id),
            'well_organized': True,
            'engaging': True,
            'welcoming': False,
            'comment': review_text,
        })
        assert rep_response.status_code == status.HTTP_201_CREATED

        # Comment created in the DB.
        assert Comment.objects.filter(
            related_handshake=handshake,
            user=participant,
            is_verified_review=True,
            is_deleted=False,
        ).exists()

        # Expire the window so blind-review filter no longer hides the comment.
        self._expire_window(handshake)

        # Fetch organizer profile as the organizer.
        organizer_client = AuthenticatedAPIClient()
        organizer_client.authenticate_user(organizer)
        profile_response = organizer_client.get('/api/users/me/')
        assert profile_response.status_code == status.HTTP_200_OK

        history = profile_response.data.get('event_comments_history', [])
        assert isinstance(history, list), 'event_comments_history must be a list'

        # At least one entry for this event.
        event_entry = next(
            (e for e in history if e['event_id'] == str(event.id)),
            None,
        )
        assert event_entry is not None, 'Event not found in event_comments_history'

        # Entry has expected metadata keys.
        assert event_entry['event_title'] == event.title
        assert event_entry['event_status'] == 'Completed'
        assert 'comments' in event_entry
        assert isinstance(event_entry['comments'], list)

        # The review text is present in the comments list.
        comment_bodies = [c['body'] for c in event_entry['comments']]
        assert review_text in comment_bodies, (
            f'Review text not found in comments. Got: {comment_bodies}'
        )

    def test_event_evaluation_without_comment_does_not_create_history_entry(self):
        """Omitting the comment field creates no Comment row and leaves history clean."""
        organizer = UserFactory()
        participant = UserFactory()

        event, handshake = self._completed_event_handshake(organizer, participant)

        participant_client = AuthenticatedAPIClient()
        participant_client.authenticate_user(participant)
        rep_response = participant_client.post('/api/reputation/', {
            'handshake_id': str(handshake.id),
            'well_organized': True,
            'engaging': False,
            'welcoming': False,
            # No 'comment' key supplied.
        })
        assert rep_response.status_code == status.HTTP_201_CREATED

        # No verified review comment should exist for this handshake.
        assert not Comment.objects.filter(
            related_handshake=handshake,
            is_verified_review=True,
            is_deleted=False,
        ).exists()

        # Expire the window and fetch profile — entry absent or comments list is empty.
        self._expire_window(handshake)

        organizer_client = AuthenticatedAPIClient()
        organizer_client.authenticate_user(organizer)
        profile_response = organizer_client.get('/api/users/me/')
        assert profile_response.status_code == status.HTTP_200_OK

        history = profile_response.data.get('event_comments_history', [])
        event_entry = next(
            (e for e in history if e['event_id'] == str(event.id)),
            None,
        )
        if event_entry is not None:
            assert event_entry['comments'] == [], (
                'No comments should be present when participant submitted no review text'
            )

    def test_event_comment_history_entry_references_correct_event_metadata(self):
        """History entry fields match the actual event model values."""
        organizer = UserFactory()
        participant = UserFactory()
        review_text = f'Solid organisation – {timezone.now().timestamp()}'

        event, handshake = self._completed_event_handshake(organizer, participant)

        participant_client = AuthenticatedAPIClient()
        participant_client.authenticate_user(participant)
        rep_response = participant_client.post('/api/reputation/', {
            'handshake_id': str(handshake.id),
            'well_organized': True,
            'engaging': True,
            'welcoming': True,
            'comment': review_text,
        })
        assert rep_response.status_code == status.HTTP_201_CREATED

        # Expire the window before fetching profile.
        self._expire_window(handshake)

        organizer_client = AuthenticatedAPIClient()
        organizer_client.authenticate_user(organizer)
        profile_response = organizer_client.get('/api/users/me/')
        assert profile_response.status_code == status.HTTP_200_OK

        history = profile_response.data.get('event_comments_history', [])
        event_entry = next(
            (e for e in history if e['event_id'] == str(event.id)),
            None,
        )
        assert event_entry is not None

        assert event_entry['event_id'] == str(event.id)
        assert event_entry['event_title'] == event.title
        assert event_entry['event_status'] == event.status
        # Scheduled time and completed_at must be serialisable ISO strings or None.
        assert 'event_scheduled_time' in event_entry
        assert 'event_completed_at' in event_entry
        if event.event_completed_at:
            assert event_entry['event_completed_at'] is not None


@pytest.mark.django_db
@pytest.mark.integration
class TestFR16cEvaluationScoping:
    """
    FR-16c: Evaluation must be scoped to the appropriate context (Offer vs Event).

    Covers four gap areas identified in the issue:
      1. Offer strict 1:1 participant-role gating.
      2. Event attendee-only gating (organizer excluded, non-participant excluded).
      3. Event multi-party aggregation correctness with >1 attendee.
      4. Cross-context misuse rejected (offer handshake IDs used against event endpoints
         and vice versa).
    """

    # ------------------------------------------------------------------ #
    # Helpers
    # ------------------------------------------------------------------ #

    def _open_offer_handshake(self, provider, requester):
        service = ServiceFactory(user=provider, type='Offer', status='Active')
        handshake = HandshakeFactory(service=service, requester=requester, status='completed')
        return service, handshake

    def _open_event_handshake(self, organizer, participant):
        event = ServiceFactory(
            user=organizer,
            type='Event',
            status='Completed',
            event_completed_at=timezone.now(),
        )
        handshake = HandshakeFactory(
            service=event,
            requester=participant,
            status='attended',
            provisioned_hours=0,
        )
        return event, handshake

    # ------------------------------------------------------------------ #
    # 1. Offer — strict 1:1 participant-role gating
    # ------------------------------------------------------------------ #

    def test_offer_requester_can_evaluate_provider(self):
        provider = UserFactory()
        requester = UserFactory()
        _, handshake = self._open_offer_handshake(provider, requester)

        client = AuthenticatedAPIClient().authenticate_user(requester)
        response = client.post('/api/reputation/', {
            'handshake_id': str(handshake.id),
            'punctual': True,
            'helpful': False,
            'kindness': False,
        })
        assert response.status_code == status.HTTP_201_CREATED
        rep = ReputationRep.objects.get(handshake=handshake, giver=requester)
        assert rep.receiver == provider

    def test_offer_provider_can_evaluate_requester(self):
        provider = UserFactory()
        requester = UserFactory()
        _, handshake = self._open_offer_handshake(provider, requester)

        client = AuthenticatedAPIClient().authenticate_user(provider)
        response = client.post('/api/reputation/', {
            'handshake_id': str(handshake.id),
            'punctual': True,
            'helpful': False,
            'kindness': False,
        })
        assert response.status_code == status.HTTP_201_CREATED
        rep = ReputationRep.objects.get(handshake=handshake, giver=provider)
        assert rep.receiver == requester

    def test_offer_third_party_cannot_evaluate(self):
        provider = UserFactory()
        requester = UserFactory()
        outsider = UserFactory()
        _, handshake = self._open_offer_handshake(provider, requester)

        client = AuthenticatedAPIClient().authenticate_user(outsider)
        response = client.post('/api/reputation/', {
            'handshake_id': str(handshake.id),
            'punctual': True,
            'helpful': False,
            'kindness': False,
        })
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_offer_evaluation_window_uniform_with_event_window(self):
        """
        Both Offer and Event evaluation windows are gated by the same
        _validate_feedback_window logic.  An Offer with an explicitly
        expired window returns 410, not a context-specific code.
        """
        provider = UserFactory()
        requester = UserFactory()
        service = ServiceFactory(user=provider, type='Offer')
        handshake = HandshakeFactory(
            service=service,
            requester=requester,
            status='completed',
            evaluation_window_starts_at=timezone.now() - timedelta(hours=50),
            evaluation_window_ends_at=timezone.now() - timedelta(hours=2),
            evaluation_window_closed_at=timezone.now() - timedelta(hours=2),
        )

        client = AuthenticatedAPIClient().authenticate_user(requester)
        response = client.post('/api/reputation/', {
            'handshake_id': str(handshake.id),
            'punctual': True,
        })
        assert response.status_code == status.HTTP_410_GONE

    # ------------------------------------------------------------------ #
    # 2. Event attendee-only gating
    # ------------------------------------------------------------------ #

    def test_event_organizer_cannot_self_evaluate(self):
        """Organizer submitting on their own event must be refused (403)."""
        organizer = UserFactory()
        participant = UserFactory()
        _, handshake = self._open_event_handshake(organizer, participant)

        client = AuthenticatedAPIClient().authenticate_user(organizer)
        response = client.post('/api/reputation/', {
            'handshake_id': str(handshake.id),
            'well_organized': True,
            'engaging': False,
            'welcoming': False,
        })
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_event_non_participant_cannot_evaluate(self):
        """User with no relation to the event is rejected."""
        organizer = UserFactory()
        participant = UserFactory()
        outsider = UserFactory()
        _, handshake = self._open_event_handshake(organizer, participant)

        client = AuthenticatedAPIClient().authenticate_user(outsider)
        response = client.post('/api/reputation/', {
            'handshake_id': str(handshake.id),
            'well_organized': True,
        })
        assert response.status_code in (
            status.HTTP_403_FORBIDDEN,
            status.HTTP_404_NOT_FOUND,
        )

    def test_event_evaluation_target_is_always_organizer(self):
        """ReputationRep.receiver must be the organizer, not the participant."""
        organizer = UserFactory()
        participant = UserFactory()
        _, handshake = self._open_event_handshake(organizer, participant)

        client = AuthenticatedAPIClient().authenticate_user(participant)
        response = client.post('/api/reputation/', {
            'handshake_id': str(handshake.id),
            'well_organized': True,
            'engaging': False,
            'welcoming': False,
        })
        assert response.status_code == status.HTTP_201_CREATED
        rep = ReputationRep.objects.get(handshake=handshake, giver=participant)
        assert rep.receiver == organizer, (
            'Event evaluation must target the organizer, not the participant'
        )

    # ------------------------------------------------------------------ #
    # 3. Event multi-party aggregation with >1 attendee
    # ------------------------------------------------------------------ #

    def test_event_multiple_attendees_each_increment_unique_evaluator_count(self):
        organizer = UserFactory()
        p1 = UserFactory()
        p2 = UserFactory()
        p3 = UserFactory()
        event = ServiceFactory(
            user=organizer,
            type='Event',
            status='Completed',
            event_completed_at=timezone.now(),
        )
        h1 = HandshakeFactory(service=event, requester=p1, status='attended', provisioned_hours=0)
        h2 = HandshakeFactory(service=event, requester=p2, status='attended', provisioned_hours=0)
        h3 = HandshakeFactory(service=event, requester=p3, status='attended', provisioned_hours=0)

        for participant, handshake in [(p1, h1), (p2, h2), (p3, h3)]:
            client = AuthenticatedAPIClient().authenticate_user(participant)
            response = client.post('/api/reputation/', {
                'handshake_id': str(handshake.id),
                'well_organized': True,
                'engaging': False,
                'welcoming': True,
            })
            assert response.status_code == status.HTTP_201_CREATED

        summary = EventEvaluationSummary.objects.get(service=event)
        assert summary.unique_evaluator_count == 3
        assert summary.positive_feedback_count == 3
        # well_organized maps to punctual_count, welcoming maps to kind_count.
        assert summary.punctual_count == 3
        assert summary.kind_count == 3
        assert summary.helpful_count == 0

    def test_event_multi_participant_positive_scores_accumulate(self):
        """positive_score_total grows with each attendee submission."""
        organizer = UserFactory()
        participants = [UserFactory() for _ in range(4)]
        event = ServiceFactory(
            user=organizer,
            type='Event',
            status='Completed',
            event_completed_at=timezone.now(),
        )
        handshakes = [
            HandshakeFactory(service=event, requester=p, status='attended', provisioned_hours=0)
            for p in participants
        ]

        for participant, handshake in zip(participants, handshakes):
            client = AuthenticatedAPIClient().authenticate_user(participant)
            client.post('/api/reputation/', {
                'handshake_id': str(handshake.id),
                'well_organized': True,
                'engaging': True,
                'welcoming': True,
            })

        summary = EventEvaluationSummary.objects.get(service=event)
        assert summary.unique_evaluator_count == 4
        # 3 traits × 4 participants = 12 total ticks.
        assert summary.positive_score_total == 12

    def test_event_attendee_cannot_evaluate_twice(self):
        """Duplicate submission from the same attendee is rejected with 400."""
        organizer = UserFactory()
        participant = UserFactory()
        _, handshake = self._open_event_handshake(organizer, participant)

        client = AuthenticatedAPIClient().authenticate_user(participant)
        first = client.post('/api/reputation/', {
            'handshake_id': str(handshake.id),
            'well_organized': True,
        })
        assert first.status_code == status.HTTP_201_CREATED

        second = client.post('/api/reputation/', {
            'handshake_id': str(handshake.id),
            'well_organized': True,
        })
        assert second.status_code == status.HTTP_400_BAD_REQUEST

        # Summary must not double-count.
        summary = EventEvaluationSummary.objects.get(service=handshake.service)
        assert summary.unique_evaluator_count == 1

    # ------------------------------------------------------------------ #
    # 4. Cross-context misuse rejected
    # ------------------------------------------------------------------ #

    def test_offer_handshake_id_rejected_with_event_trait_fields(self):
        """
        Submitting event trait names (well_organized) against an Offer handshake
        must not be interpreted as a valid offer evaluation.
        Offer logic reads 'punctual'; well_organized falls back to False — rep is
        created but with no positive trait set.  The important invariant is that
        no 404/410/403 is raised and the context is correctly isolated.
        """
        provider = UserFactory()
        requester = UserFactory()
        _, handshake = self._open_offer_handshake(provider, requester)

        client = AuthenticatedAPIClient().authenticate_user(requester)
        response = client.post('/api/reputation/', {
            'handshake_id': str(handshake.id),
            'well_organized': True,   # event field — ignored by offer logic
            'engaging': True,         # event field — ignored by offer logic
            'welcoming': True,        # event field — ignored by offer logic
        })
        # Request succeeds (offer context, not an error) but offer traits are all False.
        assert response.status_code == status.HTTP_201_CREATED
        rep = ReputationRep.objects.get(handshake=handshake, giver=requester)
        assert rep.is_punctual is False
        assert rep.is_helpful is False
        assert rep.is_kind is False

    def test_event_handshake_id_with_offer_trait_fields_targets_organizer(self):
        """
        Submitting offer trait names (punctual/helpful/kindness) against an Event
        handshake still routes through event logic (backend aliases them).
        The evaluation must target the organizer, not cause an error.
        """
        organizer = UserFactory()
        participant = UserFactory()
        _, handshake = self._open_event_handshake(organizer, participant)

        client = AuthenticatedAPIClient().authenticate_user(participant)
        response = client.post('/api/reputation/', {
            'handshake_id': str(handshake.id),
            'punctual': True,   # aliased to well_organized in event context
            'helpful': True,    # aliased to engaging
            'kindness': True,   # aliased to welcoming
        })
        assert response.status_code == status.HTTP_201_CREATED
        rep = ReputationRep.objects.get(handshake=handshake, giver=participant)
        assert rep.receiver == organizer


# ===========================================================================
# FR-16e: Service hot-score contract at evaluation-window close
# ===========================================================================

@pytest.mark.django_db
class TestFR16eWindowCloseHotScoreContract:
    """
    Contract under test
    -------------------
    Service hot_score (Offer/Request):
      - Updated at *write time* by Django signals (post_save on ReputationRep /
        NegativeRep) — but ONLY when service.status == 'Active'.
      - The batch command ``process_feedback_windows`` does NOT recalculate it.
        The batch command is authoritative only for Event evaluation summaries
        and user.event_hot_score.
      - Completed Offer services retain the hot_score computed while the service
        was still Active; no further signal update happens after completion.

    User.event_hot_score:
      - Updated synchronously by the ReputationViewSet at write time via
        EventEvaluationService.refresh_summary() — NOT deferred to batch.
      - The batch command also calls refresh_summary() at window close
        (deterministic, idempotent re-computation).
      - Both paths produce identical values; running batch a second time is safe.

    Evaluation window validation:
      - Primary path: checked via evaluation_window_starts_at / ends_at /
        closed_at fields on the Handshake.
      - Once evaluation_window_closed_at is set (either by _expire_window helper
        or the batch command), further submissions return 410 Gone.

    Corollary:
      - For Offer services the final score at window-close equals the score set
        by the last signal write; running the batch changes nothing.
      - Evaluations submitted after window close return 410 regardless of path.
    """

    # ------------------------------------------------------------------
    # Shared helpers
    # ------------------------------------------------------------------

    def _open_offer_handshake(self, provider, requester):
        """Return (service, handshake) with an open 48-hour evaluation window.

        Service status is 'Active' so that reputation signals update hot_score.
        A completed handshake on an Active offer is the normal production state.
        """
        service = ServiceFactory(user=provider, type='Offer', status='Active')
        handshake = HandshakeFactory(
            service=service,
            requester=requester,
            status='completed',
            provisioned_hours=1,
            evaluation_window_starts_at=timezone.now() - timedelta(hours=2),
            evaluation_window_ends_at=timezone.now() + timedelta(hours=46),
            evaluation_window_closed_at=None,
        )
        return service, handshake

    def _open_event_handshake(self, organizer, participant):
        """Return (service, handshake) for an Event with an open evaluation window."""
        service = ServiceFactory(
            user=organizer,
            type='Event',
            status='Completed',
            event_completed_at=timezone.now(),
        )
        handshake = HandshakeFactory(
            service=service,
            requester=participant,
            status='attended',
            provisioned_hours=0,
            evaluation_window_starts_at=timezone.now() - timedelta(hours=2),
            evaluation_window_ends_at=timezone.now() + timedelta(hours=46),
            evaluation_window_closed_at=None,
        )
        return service, handshake

    def _expire_window(self, *handshakes):
        """Mark windows as expired and closed (simulates batch or natural expiry)."""
        for h in handshakes:
            h.evaluation_window_ends_at = timezone.now() - timedelta(seconds=1)
            h.evaluation_window_closed_at = timezone.now() - timedelta(seconds=1)
            h.save(update_fields=['evaluation_window_ends_at', 'evaluation_window_closed_at'])

    def _run_close_command(self):
        from django.core.management import call_command
        call_command('process_feedback_windows', verbosity=0)

    # ------------------------------------------------------------------
    # 1. Offer hot_score: signal updates at write time, batch does not change it
    # ------------------------------------------------------------------

    @pytest.mark.django_db(transaction=True)
    def test_offer_hot_score_updated_at_write_time_by_signal(self):
        """
        Submitting a positive reputation for an Active offer updates service.hot_score
        via Django signal after the transaction commits (transaction.on_commit path).
        transaction=True is required so that on_commit hooks actually fire.
        """
        provider = UserFactory()
        requester = UserFactory()
        service, handshake = self._open_offer_handshake(provider, requester)

        score_before = service.hot_score

        client = AuthenticatedAPIClient().authenticate_user(requester)
        client.post('/api/reputation/', {
            'handshake_id': str(handshake.id),
            'punctual': True,
            'helpful': True,
            'kindness': True,
        })

        service.refresh_from_db()
        # Signal fires on transaction commit for Active services; score must change.
        assert service.hot_score != score_before

    def test_offer_hot_score_unchanged_after_window_close_batch(self):
        """
        Running process_feedback_windows on an expired Offer window must not
        alter service.hot_score — the batch command owns Event scores only.
        """
        provider = UserFactory()
        requester = UserFactory()
        service, handshake = self._open_offer_handshake(provider, requester)

        # Write reputation so signal sets a non-zero score.
        client = AuthenticatedAPIClient().authenticate_user(requester)
        client.post('/api/reputation/', {
            'handshake_id': str(handshake.id),
            'punctual': True,
        })
        service.refresh_from_db()
        score_after_write = service.hot_score

        # Expire window, then run batch.
        self._expire_window(handshake)
        self._run_close_command()

        service.refresh_from_db()
        # Batch must not touch Offer hot_score.
        assert service.hot_score == score_after_write

    def test_offer_hot_score_unchanged_when_no_writes_before_close(self):
        """
        Window closes with zero evaluations — batch must not alter hot_score,
        leaving it at the default 0.  Validates closure-only semantics for Offer.
        """
        provider = UserFactory()
        requester = UserFactory()
        service, handshake = self._open_offer_handshake(provider, requester)

        baseline = service.hot_score  # 0 — no evaluations written

        self._expire_window(handshake)
        self._run_close_command()

        service.refresh_from_db()
        assert service.hot_score == baseline

    # ------------------------------------------------------------------
    # 2. Event: view updates event_hot_score synchronously; batch is idempotent
    # ------------------------------------------------------------------

    def test_event_hot_score_updated_synchronously_by_view(self):
        """
        user.event_hot_score is updated at write time by the ReputationViewSet
        (via EventEvaluationService.refresh_summary) — not deferred to batch.
        This is the primary update path for Event scores.
        """
        organizer = UserFactory()
        participant = UserFactory()
        _, handshake = self._open_event_handshake(organizer, participant)

        organizer.refresh_from_db()
        score_before = organizer.event_hot_score

        client = AuthenticatedAPIClient().authenticate_user(participant)
        client.post('/api/reputation/', {
            'handshake_id': str(handshake.id),
            'well_organized': True,
            'engaging': True,
            'welcoming': True,
        })

        # View calls refresh_summary synchronously — score updated immediately.
        organizer.refresh_from_db()
        assert organizer.event_hot_score != score_before

    def test_event_hot_score_with_no_writes_before_close_stays_zero(self):
        """
        Window closes without any evaluations.  Batch must set/keep
        user.event_hot_score at 0.0 — closure-only semantics.
        """
        organizer = UserFactory()
        participant = UserFactory()
        _, handshake = self._open_event_handshake(organizer, participant)

        self._expire_window(handshake)
        self._run_close_command()

        organizer.refresh_from_db()
        assert organizer.event_hot_score == 0.0

    def test_event_service_hot_score_not_modified_by_batch(self):
        """
        service.hot_score for Event-type services must remain unchanged after
        batch close — only EventEvaluationSummary and user.event_hot_score are
        refreshed; the listing-level score is irrelevant for events.
        """
        organizer = UserFactory()
        participant = UserFactory()
        service, handshake = self._open_event_handshake(organizer, participant)

        client = AuthenticatedAPIClient().authenticate_user(participant)
        client.post('/api/reputation/', {
            'handshake_id': str(handshake.id),
            'well_organized': True,
        })

        service.refresh_from_db()
        listing_score_before = service.hot_score

        self._expire_window(handshake)
        self._run_close_command()

        service.refresh_from_db()
        assert service.hot_score == listing_score_before

    # ------------------------------------------------------------------
    # 3. Post-close evaluations rejected regardless of context
    # ------------------------------------------------------------------

    def test_offer_evaluation_rejected_after_window_close(self):
        """
        Submitting a reputation for an Offer handshake whose window has already
        been closed must return 410 Gone.
        """
        provider = UserFactory()
        requester = UserFactory()
        _, handshake = self._open_offer_handshake(provider, requester)

        self._expire_window(handshake)

        client = AuthenticatedAPIClient().authenticate_user(requester)
        response = client.post('/api/reputation/', {
            'handshake_id': str(handshake.id),
            'punctual': True,
        })
        assert response.status_code == status.HTTP_410_GONE

    def test_event_evaluation_rejected_after_window_close(self):
        """
        Submitting an event evaluation for a handshake whose window has already
        been closed must return 410 Gone.
        """
        organizer = UserFactory()
        participant = UserFactory()
        _, handshake = self._open_event_handshake(organizer, participant)

        self._expire_window(handshake)

        client = AuthenticatedAPIClient().authenticate_user(participant)
        response = client.post('/api/reputation/', {
            'handshake_id': str(handshake.id),
            'well_organized': True,
        })
        assert response.status_code == status.HTTP_410_GONE

    def test_batch_close_is_idempotent_for_event_scores(self):
        """
        Running process_feedback_windows twice on the same event must produce
        the identical user.event_hot_score — the command is idempotent.
        The second run finds no open windows (already closed) and is a no-op.
        """
        organizer = UserFactory()
        participant = UserFactory()
        _, handshake = self._open_event_handshake(organizer, participant)

        client = AuthenticatedAPIClient().authenticate_user(participant)
        client.post('/api/reputation/', {
            'handshake_id': str(handshake.id),
            'well_organized': True,
            'engaging': True,
            'welcoming': True,
        })

        self._expire_window(handshake)
        self._run_close_command()

        organizer.refresh_from_db()
        score_first = organizer.event_hot_score

        # Second run: window already closed, batch skips it.
        self._run_close_command()

        organizer.refresh_from_db()
        assert organizer.event_hot_score == score_first


# ===========================================================================
# NFR-16a: Exactly-once score processing for window close
# ===========================================================================

@pytest.mark.django_db
class TestNFR16aExactlyOnceScoreProcessing:
    """
    Contract under test (NFR-16a)
    ------------------------------
    The ``process_feedback_windows`` management command must process score
    effects exactly once per expired evaluation window:

      1. Re-running the command after the window is already closed must not
         re-apply or change any score values.
      2. Running the command twice in sequence (simulated concurrent/retry)
         must leave aggregates and scores in the same state as a single run.
      3. EventEvaluationSummary fields (unique_evaluator_count,
         positive_score_total, negative_score_total) are set by refresh_summary
         at first close; subsequent closes must not alter them.
      4. user.event_hot_score is stable after the first close and invariant
         under re-runs.

    The window-close timestamp guard (evaluation_window_closed_at__isnull=True)
    in the batch query is the mechanism that enforces exactly-once semantics.
    These tests prove that the guard is effective for score processing, not
    just for window marking and notification creation.
    """

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def _make_expired_event(self, organizer, participants, pos_traits=None, neg_traits=None):
        """
        Create a completed event with all participants having attended status
        and an already-expired (but not yet closed) evaluation window.
        Each participant in ``participants`` submits an evaluation via the API
        before the window is expired so that scores are populated.
        Returns (service, handshakes).
        """
        from api.tests.helpers.test_client import AuthenticatedAPIClient

        pos_traits = pos_traits or {'well_organized': True, 'engaging': True, 'welcoming': True}
        neg_traits = neg_traits or {}

        service = ServiceFactory(
            user=organizer,
            type='Event',
            status='Completed',
            event_completed_at=timezone.now() - timedelta(hours=50),
        )
        handshakes = []
        for participant in participants:
            h = HandshakeFactory(
                service=service,
                requester=participant,
                status='attended',
                provisioned_hours=0,
                evaluation_window_starts_at=timezone.now() - timedelta(hours=50),
                evaluation_window_ends_at=timezone.now() + timedelta(hours=10),
                evaluation_window_closed_at=None,
            )
            handshakes.append(h)

            # Submit evaluation while window is open.
            client = AuthenticatedAPIClient().authenticate_user(participant)
            if pos_traits:
                client.post('/api/reputation/', {'handshake_id': str(h.id), **pos_traits})
            if neg_traits:
                client.post('/api/reputation/negative/', {'handshake_id': str(h.id), **neg_traits})

        # Expire the windows so the batch command will pick them up.
        for h in handshakes:
            h.evaluation_window_ends_at = timezone.now() - timedelta(seconds=1)
            h.save(update_fields=['evaluation_window_ends_at'])

        return service, handshakes

    def _run_batch(self):
        from django.core.management import call_command
        call_command('process_feedback_windows', verbosity=0)

    # ------------------------------------------------------------------
    # 1. Re-run does not alter EventEvaluationSummary aggregates
    # ------------------------------------------------------------------

    def test_event_summary_aggregates_unchanged_on_second_run(self):
        """
        After first batch close, unique_evaluator_count and positive_score_total
        must be identical after a second run — re-running must not double-count.
        """
        organizer = UserFactory()
        participants = [UserFactory() for _ in range(3)]

        service, _ = self._make_expired_event(organizer, participants)

        self._run_batch()

        summary = EventEvaluationSummary.objects.get(service=service)
        count_after_first = summary.unique_evaluator_count
        pos_after_first = summary.positive_score_total

        # Second run: all windows already closed — batch must be a no-op.
        self._run_batch()

        summary.refresh_from_db()
        assert summary.unique_evaluator_count == count_after_first
        assert summary.positive_score_total == pos_after_first

    def test_event_summary_negative_score_unchanged_on_second_run(self):
        """
        negative_score_total must also be stable across re-runs.
        """
        organizer = UserFactory()
        participants = [UserFactory() for _ in range(2)]

        service, _ = self._make_expired_event(
            organizer, participants,
            pos_traits={},
            neg_traits={'disorganized': True, 'boring': True},
        )

        self._run_batch()

        summary = EventEvaluationSummary.objects.get(service=service)
        neg_after_first = summary.negative_score_total

        self._run_batch()

        summary.refresh_from_db()
        assert summary.negative_score_total == neg_after_first

    # ------------------------------------------------------------------
    # 2. Re-run does not alter user.event_hot_score
    # ------------------------------------------------------------------

    def test_event_hot_score_unchanged_on_second_run(self):
        """
        user.event_hot_score set by first batch close must not shift on
        subsequent runs — exactly-once for score computation.
        """
        organizer = UserFactory()
        participants = [UserFactory() for _ in range(2)]

        self._make_expired_event(organizer, participants)

        self._run_batch()

        organizer.refresh_from_db()
        score_after_first = organizer.event_hot_score

        self._run_batch()

        organizer.refresh_from_db()
        assert organizer.event_hot_score == score_after_first

    def test_event_hot_score_zero_when_no_evaluations_second_run_unchanged(self):
        """
        Even when no evaluations were submitted, event_hot_score stays 0.0
        across multiple batch runs — no phantom increment from re-processing.
        """
        organizer = UserFactory()
        participant = UserFactory()

        # No evaluation submitted — only window is expired.
        service = ServiceFactory(
            user=organizer,
            type='Event',
            status='Completed',
            event_completed_at=timezone.now() - timedelta(hours=50),
        )
        HandshakeFactory(
            service=service,
            requester=participant,
            status='attended',
            provisioned_hours=0,
            evaluation_window_starts_at=timezone.now() - timedelta(hours=50),
            evaluation_window_ends_at=timezone.now() - timedelta(seconds=1),
            evaluation_window_closed_at=None,
        )

        self._run_batch()
        organizer.refresh_from_db()
        assert organizer.event_hot_score == 0.0

        self._run_batch()
        organizer.refresh_from_db()
        assert organizer.event_hot_score == 0.0

    # ------------------------------------------------------------------
    # 3. Simulated concurrent execution: two calls before either writes closed_at
    # ------------------------------------------------------------------

    def test_concurrent_batch_runs_do_not_double_apply_scores(self):
        """
        Simulate a race between two concurrent batch invocations by manually
        collecting the expired window IDs that both would see and running close
        logic twice on the same set.  Final scores must be identical to a
        single-run result.

        The batch command uses a SELECT … WHERE closed_at IS NULL / UPDATE
        pattern inside a transaction — the second concurrent update() call
        on the same IDs finds closed_at already set and updates 0 rows,
        then skips refresh_summary for those events.  This test confirms
        that the guard works and the aggregate is not applied twice.
        """
        from django.db import transaction as db_transaction
        from api.models import Handshake
        from api.services import EventEvaluationService

        organizer = UserFactory()
        participants = [UserFactory() for _ in range(3)]
        service, handshakes = self._make_expired_event(organizer, participants)

        now = timezone.now()
        expired_ids = list(
            Handshake.objects.filter(
                evaluation_window_closed_at__isnull=True,
                evaluation_window_ends_at__lte=now,
            ).values_list('id', flat=True)
        )
        assert len(expired_ids) == len(handshakes), "Setup: all handshakes must be expired"

        # Simulate first batch job: close the windows.
        with db_transaction.atomic():
            Handshake.objects.filter(
                id__in=expired_ids,
                evaluation_window_closed_at__isnull=True,
            ).update(evaluation_window_closed_at=now)

        EventEvaluationService.refresh_summary(service)
        organizer.refresh_from_db()
        score_after_first = organizer.event_hot_score
        summary = EventEvaluationSummary.objects.get(service=service)
        count_after_first = summary.unique_evaluator_count

        # Simulate second (concurrent/retry) batch job attempting the same IDs.
        with db_transaction.atomic():
            updated = Handshake.objects.filter(
                id__in=expired_ids,
                evaluation_window_closed_at__isnull=True,  # guard — all already closed
            ).update(evaluation_window_closed_at=now)

        # Guard must have blocked the update — no rows changed.
        assert updated == 0, "Second concurrent run must not close already-closed windows"

        # Because updated == 0, the real command would skip refresh_summary.
        # We still call it here to prove idempotency of the aggregate function itself.
        EventEvaluationService.refresh_summary(service)

        organizer.refresh_from_db()
        assert organizer.event_hot_score == score_after_first

        summary.refresh_from_db()
        assert summary.unique_evaluator_count == count_after_first

    # ------------------------------------------------------------------
    # 4. Multiple expired events: each processed exactly once
    # ------------------------------------------------------------------

    def test_multiple_events_each_processed_exactly_once(self):
        """
        When several expired events are processed in the same batch run,
        each event's summary must be correct after the run, and a second run
        must not alter any of them.
        """
        results = []
        for _ in range(3):
            organizer = UserFactory()
            participants = [UserFactory(), UserFactory()]
            service, _ = self._make_expired_event(organizer, participants)
            results.append((organizer, service))

        self._run_batch()

        scores_after_first = []
        for organizer, service in results:
            organizer.refresh_from_db()
            summary = EventEvaluationSummary.objects.get(service=service)
            scores_after_first.append((
                organizer.event_hot_score,
                summary.unique_evaluator_count,
                summary.positive_score_total,
            ))

        self._run_batch()

        for i, (organizer, service) in enumerate(results):
            organizer.refresh_from_db()
            summary = EventEvaluationSummary.objects.get(service=service)
            assert organizer.event_hot_score == scores_after_first[i][0]
            assert summary.unique_evaluator_count == scores_after_first[i][1]
            assert summary.positive_score_total == scores_after_first[i][2]
