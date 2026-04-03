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
        After calling this helper the test is responsible for expiring the window
        (via _expire_window) before fetching the organizer profile so that
        _apply_blind_review_visibility does not hide the comment.
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
