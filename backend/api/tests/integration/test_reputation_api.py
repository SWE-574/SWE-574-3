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
