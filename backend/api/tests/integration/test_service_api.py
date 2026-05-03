"""
Integration tests for service API endpoints
"""
import pytest
from rest_framework import status
from rest_framework.test import APIClient
from decimal import Decimal
from datetime import timedelta
from django.utils import timezone

from api.tests.helpers.factories import UserFactory, ServiceFactory, TagFactory, HandshakeFactory
from api.tests.helpers.factories import AdminUserFactory
from api.tests.helpers.test_client import AuthenticatedAPIClient
from api.models import Service, Notification


@pytest.mark.django_db
@pytest.mark.integration
class TestServiceViewSet:
    """Test ServiceViewSet CRUD operations"""
    
    def test_list_services(self):
        """Test listing services"""
        ServiceFactory.create_batch(5, status='Active')
        ServiceFactory(status='Completed')
        
        client = APIClient()
        response = client.get('/api/services/')
        assert response.status_code == status.HTTP_200_OK
        assert 'results' in response.data
        assert len(response.data['results']) > 0
    
    def test_list_services_filtering(self):
        """Test service filtering"""
        ServiceFactory(type='Offer', status='Active')
        ServiceFactory(type='Need', status='Active')
        
        client = APIClient()
        response = client.get('/api/services/?type=Offer')
        assert response.status_code == status.HTTP_200_OK
        assert all(s['type'] == 'Offer' for s in response.data['results'])
    
    def test_list_services_pagination(self):
        """Test service pagination"""
        ServiceFactory.create_batch(25, status='Active')
        
        client = APIClient()
        response = client.get('/api/services/?page_size=10')
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data['results']) == 10
        assert 'next' in response.data or response.data['count'] <= 10
    
    def test_create_service(self):
        """Test creating a service"""
        user = UserFactory(is_verified=True)
        tag = TagFactory()
        client = AuthenticatedAPIClient()
        client.authenticate_user(user)
        
        response = client.post('/api/services/', {
            'title': 'New Service',
            'description': 'A new service description',
            'type': 'Offer',
            'duration': 2.0,
            'location_type': 'In-Person',
            'location_area': 'Beşiktaş',
            'location_lat': 41.0422,
            'location_lng': 29.0089,
            'max_participants': 1,
            'schedule_type': 'One-Time',
            'scheduled_time': (timezone.now() + timedelta(days=3)).isoformat(),
            'status': 'Active',
            'tag_ids': [tag.id]
        })
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data['title'] == 'New Service'
        assert Service.objects.filter(id=response.data['id']).exists()

    def test_create_service_with_video_media(self):
        """Test creating a service with a video URL media item"""
        user = UserFactory(is_verified=True)
        client = AuthenticatedAPIClient()
        client.authenticate_user(user)

        response = client.post('/api/services/', {
            'title': 'Service With Video',
            'description': 'This service includes an optional video.',
            'type': 'Offer',
            'duration': 1.0,
            'location_type': 'Online',
            'max_participants': 1,
            'schedule_type': 'One-Time',
            'status': 'Active',
            'media': [
                {
                    'media_type': 'video',
                    'file_url': 'https://www.youtube.com/watch?v=a1b2c3d4e5F'
                }
            ]
        }, format='json')

        assert response.status_code == status.HTTP_201_CREATED
        assert response.data['title'] == 'Service With Video'
        assert 'media' in response.data
        assert any(m.get('media_type') == 'video' for m in response.data.get('media', []))
    
    def test_create_service_validation(self):
        """Test service creation validation"""
        user = UserFactory()
        client = AuthenticatedAPIClient()
        client.authenticate_user(user)
        
        response = client.post('/api/services/', {
            'title': 'ab',  # Too short
            'description': 'Test'
        })
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    # ── Email verification gate for service creation ────────────────────
    # Offers, Needs and Events all require a verified email address.
    # Verified users can still create any of the three types as before.

    def _offer_payload(self):
        return {
            'title': 'Verified Only Offer',
            'description': 'Should only be creatable by verified users.',
            'type': 'Offer',
            'duration': 1.0,
            'location_type': 'Online',
            'max_participants': 1,
            'schedule_type': 'One-Time',
            'status': 'Active',
        }

    def _need_payload(self):
        return {
            'title': 'Help moving a sofa',
            'description': 'Need an extra hand on Saturday.',
            'type': 'Need',
            'duration': 1.0,
            'location_type': 'In-Person',
            'location_area': 'Beşiktaş',
            'location_lat': 41.0422,
            'location_lng': 29.0089,
            'max_participants': 1,
            'schedule_type': 'One-Time',
            'scheduled_time': (timezone.now() + timedelta(days=2)).isoformat(),
            'status': 'Active',
        }

    def _event_payload(self):
        return {
            'title': 'Community picnic',
            'description': 'Open to all neighbours.',
            'type': 'Event',
            'duration': 2.0,
            'location_type': 'In-Person',
            'location_area': 'Maçka Park',
            'location_lat': 41.0463,
            'location_lng': 28.9956,
            'max_participants': 20,
            'schedule_type': 'One-Time',
            'scheduled_time': (timezone.now() + timedelta(days=5)).isoformat(),
            'status': 'Active',
        }

    def test_unverified_user_cannot_create_offer(self):
        user = UserFactory(is_verified=False)
        client = AuthenticatedAPIClient().authenticate_user(user)

        response = client.post('/api/services/', self._offer_payload())

        assert response.status_code == status.HTTP_403_FORBIDDEN
        assert response.data.get('code') == 'EMAIL_NOT_VERIFIED'
        assert not Service.objects.filter(title='Verified Only Offer').exists()

    def test_unverified_user_cannot_create_need(self):
        user = UserFactory(is_verified=False)
        client = AuthenticatedAPIClient().authenticate_user(user)

        response = client.post('/api/services/', self._need_payload())

        assert response.status_code == status.HTTP_403_FORBIDDEN
        assert response.data.get('code') == 'EMAIL_NOT_VERIFIED'
        assert not Service.objects.filter(title='Help moving a sofa').exists()

    def test_unverified_user_cannot_create_event(self):
        user = UserFactory(is_verified=False)
        client = AuthenticatedAPIClient().authenticate_user(user)

        response = client.post('/api/services/', self._event_payload())

        assert response.status_code == status.HTTP_403_FORBIDDEN
        assert response.data.get('code') == 'EMAIL_NOT_VERIFIED'
        assert not Service.objects.filter(title='Community picnic').exists()

    def test_verified_user_can_create_offer(self):
        user = UserFactory(is_verified=True)
        client = AuthenticatedAPIClient().authenticate_user(user)

        response = client.post('/api/services/', self._offer_payload())

        assert response.status_code == status.HTTP_201_CREATED
        assert Service.objects.filter(id=response.data['id'], type='Offer').exists()

    def test_verified_user_can_create_need(self):
        user = UserFactory(is_verified=True)
        client = AuthenticatedAPIClient().authenticate_user(user)

        response = client.post('/api/services/', self._need_payload())

        assert response.status_code == status.HTTP_201_CREATED
        assert Service.objects.filter(id=response.data['id'], type='Need').exists()

    def test_verified_user_can_create_event(self):
        user = UserFactory(is_verified=True)
        client = AuthenticatedAPIClient().authenticate_user(user)

        response = client.post('/api/services/', self._event_payload())

        assert response.status_code == status.HTTP_201_CREATED
        assert Service.objects.filter(id=response.data['id'], type='Event').exists()
    
    def test_retrieve_service(self):
        """Test retrieving a single service"""
        service = ServiceFactory()
        client = APIClient()
        
        response = client.get(f'/api/services/{service.id}/')
        assert response.status_code == status.HTTP_200_OK
        assert response.data['id'] == str(service.id)
        assert response.data['title'] == service.title
    
    def test_update_service(self):
        """Test updating a service"""
        user = UserFactory()
        service = ServiceFactory(user=user)
        client = AuthenticatedAPIClient()
        client.authenticate_user(user)
        
        response = client.patch(f'/api/services/{service.id}/', {
            'title': 'Updated Title'
        })
        assert response.status_code == status.HTTP_200_OK
        assert response.data['title'] == 'Updated Title'
        
        service.refresh_from_db()
        assert service.title == 'Updated Title'

    def test_update_offer_allowed_when_application_exists_and_notifies_applicant(self):
        """Offer owner can edit and pending applicants get notified."""
        owner = UserFactory()
        applicant = UserFactory()
        service = ServiceFactory(user=owner, type='Offer')
        HandshakeFactory(service=service, requester=applicant, status='pending')

        client = AuthenticatedAPIClient()
        client.authenticate_user(owner)

        response = client.patch(f'/api/services/{service.id}/', {'title': 'Updated title'})
        assert response.status_code == status.HTTP_200_OK

        service.refresh_from_db()
        assert service.title == 'Updated title'
        assert Notification.objects.filter(
            user=applicant,
            type='service_updated',
            related_service=service,
        ).exists()

    def test_update_need_allowed_when_application_exists_and_notifies_applicant(self):
        """Need owner can edit and pending applicants get notified."""
        owner = UserFactory()
        applicant = UserFactory()
        service = ServiceFactory(user=owner, type='Need')
        HandshakeFactory(service=service, requester=applicant, status='pending')

        client = AuthenticatedAPIClient()
        client.authenticate_user(owner)

        response = client.patch(f'/api/services/{service.id}/', {'title': 'Updated title'})
        assert response.status_code == status.HTTP_200_OK

        service.refresh_from_db()
        assert service.title == 'Updated title'
        assert Notification.objects.filter(
            user=applicant,
            type='service_updated',
            related_service=service,
        ).exists()

    def test_update_offer_allowed_after_completed_session(self):
        """One-time offer owner can edit again once the approved session is completed."""
        owner = UserFactory()
        applicant = UserFactory()
        service = ServiceFactory(user=owner, type='Offer', schedule_type='One-Time')
        HandshakeFactory(
            service=service,
            requester=applicant,
            status='completed',
            provider_confirmed_complete=True,
            receiver_confirmed_complete=True,
        )

        client = AuthenticatedAPIClient()
        client.authenticate_user(owner)

        response = client.patch(f'/api/services/{service.id}/', {'title': 'Completed Updated'})
        assert response.status_code == status.HTTP_200_OK

        service.refresh_from_db()
        assert service.title == 'Completed Updated'

    def test_update_offer_blocked_after_accepted_session(self):
        """One-time offer owner cannot edit once a session is approved (accepted)."""
        owner = UserFactory()
        applicant = UserFactory()
        service = ServiceFactory(user=owner, type='Offer', schedule_type='One-Time')
        HandshakeFactory(
            service=service,
            requester=applicant,
            status='accepted',
        )

        client = AuthenticatedAPIClient()
        client.authenticate_user(owner)

        response = client.patch(f'/api/services/{service.id}/', {'title': 'Should Fail'})
        assert response.status_code == status.HTTP_403_FORBIDDEN

        service.refresh_from_db()
        assert service.title != 'Should Fail'

    def test_update_recurrent_offer_allowed_after_completed_session(self):
        """Recurring offers stay editable after completed sessions for future cycles."""
        owner = UserFactory()
        applicant = UserFactory()
        service = ServiceFactory(user=owner, type='Offer', schedule_type='Recurrent')
        HandshakeFactory(
            service=service,
            requester=applicant,
            status='completed',
            provider_confirmed_complete=True,
            receiver_confirmed_complete=True,
        )

        client = AuthenticatedAPIClient()
        client.authenticate_user(owner)

        response = client.patch(f'/api/services/{service.id}/', {'title': 'Recurring Updated'})
        assert response.status_code == status.HTTP_200_OK

        service.refresh_from_db()
        assert service.title == 'Recurring Updated'

    def test_update_event_notifies_joined_and_checked_in_participants(self):
        """Event edits notify active event participants (joined/check-in) only."""
        owner = UserFactory(first_name='Owner')
        joined_user = UserFactory()
        checked_in_user = UserFactory()
        attended_user = UserFactory()
        service = ServiceFactory(
            user=owner,
            type='Event',
            schedule_type='One-Time',
            scheduled_time=timezone.now() + timedelta(days=2),
        )

        HandshakeFactory(service=service, requester=joined_user, status='accepted')
        HandshakeFactory(service=service, requester=checked_in_user, status='checked_in')
        HandshakeFactory(service=service, requester=attended_user, status='attended')

        client = AuthenticatedAPIClient()
        client.authenticate_user(owner)

        response = client.patch(f'/api/services/{service.id}/', {'title': 'Updated Event Title'})
        assert response.status_code == status.HTTP_200_OK

        joined_notification = Notification.objects.filter(
            user=joined_user,
            type='service_updated',
            related_service=service,
        ).exists()
        checked_in_notification = Notification.objects.filter(
            user=checked_in_user,
            type='service_updated',
            related_service=service,
        ).exists()
        attended_notification = Notification.objects.filter(
            user=attended_user,
            type='service_updated',
            related_service=service,
        ).exists()

        assert joined_notification is True
        assert checked_in_notification is True
        assert attended_notification is False

    def test_update_event_notification_includes_changed_fields_summary(self):
        """Event edit notification message should include changed field names."""
        owner = UserFactory(first_name='Owner')
        participant = UserFactory()
        service = ServiceFactory(
            user=owner,
            type='Event',
            schedule_type='One-Time',
            scheduled_time=timezone.now() + timedelta(days=2),
            title='Original Event Title',
            description='Original event description',
        )
        HandshakeFactory(service=service, requester=participant, status='accepted')

        client = AuthenticatedAPIClient()
        client.authenticate_user(owner)

        response = client.patch(
            f'/api/services/{service.id}/',
            {
                'title': 'Updated Event Title',
                'description': 'Updated event description',
            },
        )
        assert response.status_code == status.HTTP_200_OK

        notification = Notification.objects.filter(
            user=participant,
            type='service_updated',
            related_service=service,
        ).order_by('-created_at').first()
        assert notification is not None
        assert 'Changed fields:' in notification.message
        assert 'title' in notification.message
        assert 'description' in notification.message

    def test_update_event_blocked_within_lockdown_window(self):
        """Organizer cannot edit event details inside the 24-hour lock window."""
        owner = UserFactory()
        service = ServiceFactory(
            user=owner,
            type='Event',
            schedule_type='One-Time',
            scheduled_time=timezone.now() + timedelta(hours=12),
            title='Event In Lockdown',
        )
        client = AuthenticatedAPIClient()
        client.authenticate_user(owner)

        response = client.patch(f'/api/services/{service.id}/', {'title': 'Should Be Blocked'})
        assert response.status_code == status.HTTP_403_FORBIDDEN
        service.refresh_from_db()
        assert service.title == 'Event In Lockdown'

    def test_update_event_blocked_after_start_time(self):
        """Organizer remains locked from editing once event start time has passed."""
        owner = UserFactory()
        service = ServiceFactory(
            user=owner,
            type='Event',
            schedule_type='One-Time',
            scheduled_time=timezone.now() - timedelta(hours=1),
            status='Active',
            title='Past Event',
        )
        client = AuthenticatedAPIClient()
        client.authenticate_user(owner)

        response = client.patch(f'/api/services/{service.id}/', {'title': 'Should Also Be Blocked'})
        assert response.status_code == status.HTTP_403_FORBIDDEN
        service.refresh_from_db()
        assert service.title == 'Past Event'
    
    def test_update_service_unauthorized(self):
        """Test updating service as non-owner fails"""
        owner = UserFactory()
        other_user = UserFactory()
        service = ServiceFactory(user=owner)
        
        client = AuthenticatedAPIClient()
        client.authenticate_user(other_user)
        
        response = client.patch(f'/api/services/{service.id}/', {
            'title': 'Hacked Title'
        })
        assert response.status_code == status.HTTP_403_FORBIDDEN
    
    def test_delete_service(self):
        """Test soft-deleting a service (sets status to Cancelled)"""
        user = UserFactory()
        service = ServiceFactory(user=user)
        client = AuthenticatedAPIClient()
        client.authenticate_user(user)
        
        response = client.delete(f'/api/services/{service.id}/')
        assert response.status_code == status.HTTP_204_NO_CONTENT
        service.refresh_from_db()
        assert service.status == 'Cancelled'

    def test_deleted_service_hidden_from_list_visible_to_admin(self):
        """Soft-deleted service is hidden from public list but visible to admin on user profile."""
        user = UserFactory()
        admin = AdminUserFactory()
        service = ServiceFactory(user=user, status='Active')

        owner_client = AuthenticatedAPIClient()
        owner_client.authenticate_user(user)

        # Soft-delete the service
        resp = owner_client.delete(f'/api/services/{service.id}/')
        assert resp.status_code == status.HTTP_204_NO_CONTENT

        # Public service list should not include cancelled service
        response = APIClient().get('/api/services/')
        assert all(s['id'] != str(service.id) for s in response.data['results'])

        # Admin viewing user profile should still see the cancelled service
        admin_client = AuthenticatedAPIClient()
        admin_client.authenticate_user(admin)
        resp = admin_client.get(f'/api/users/{user.id}/')
        svc_ids = [s['id'] for s in resp.data.get('services', [])]
        assert str(service.id) in svc_ids

        # Non-admin viewing user profile should NOT see the cancelled service
        other = UserFactory()
        other_client = AuthenticatedAPIClient()
        other_client.authenticate_user(other)
        resp = other_client.get(f'/api/users/{user.id}/')
        svc_ids = [s['id'] for s in resp.data.get('services', [])]
        assert str(service.id) not in svc_ids

    def test_delete_service_blocked_when_active_handshake_exists(self):
        """Service cannot be removed while it has active (non-terminal) handshakes."""
        user = UserFactory()
        service = ServiceFactory(user=user)
        HandshakeFactory(service=service, status='pending')

        client = AuthenticatedAPIClient()
        client.authenticate_user(user)

        response = client.delete(f'/api/services/{service.id}/')
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert response.data.get('code') == 'INVALID_STATE'
        assert 'active handshakes' in response.data.get('detail', '').lower()
        assert Service.objects.filter(id=service.id).exists()

    def test_delete_service_allowed_when_only_terminal_handshakes(self):
        """Service can be removed when all handshakes are in terminal states."""
        user = UserFactory()
        service = ServiceFactory(user=user)
        HandshakeFactory(service=service, status='completed')
        HandshakeFactory(service=service, status='cancelled')
        HandshakeFactory(service=service, status='denied')

        client = AuthenticatedAPIClient()
        client.authenticate_user(user)

        response = client.delete(f'/api/services/{service.id}/')
        assert response.status_code == status.HTTP_204_NO_CONTENT
        service.refresh_from_db()
        assert service.status == 'Cancelled'

    def test_delete_service_non_owner_does_not_leak_handshake_state(self):
        """Non-owner should get 403 even if the service has handshakes."""
        owner = UserFactory()
        other_user = UserFactory()
        service = ServiceFactory(user=owner)
        HandshakeFactory(service=service)

        client = AuthenticatedAPIClient()
        client.authenticate_user(other_user)

        response = client.delete(f'/api/services/{service.id}/')
        assert response.status_code == status.HTTP_403_FORBIDDEN
        assert Service.objects.filter(id=service.id).exists()
    
    def test_search_services(self):
        """Test service search"""
        ServiceFactory(title='Cooking Lesson', description='Learn to cook')
        ServiceFactory(title='Tech Help', description='Computer assistance')
        
        client = APIClient()
        response = client.get('/api/services/?search=cooking')
        assert response.status_code == status.HTTP_200_OK
        assert any('cooking' in s['title'].lower() for s in response.data['results'])

    def test_report_service_visible_in_admin_reports_queue(self):
        """Reporting a service should create a pending report visible to admin/moderator dashboard."""
        reporter = UserFactory()
        service = ServiceFactory()

        reporter_client = AuthenticatedAPIClient()
        reporter_client.authenticate_user(reporter)

        report_resp = reporter_client.post(
            f'/api/services/{service.id}/report/',
            {
                'issue_type': 'spam',
                'description': 'This listing looks like spam.'
            },
            format='json'
        )
        assert report_resp.status_code == status.HTTP_201_CREATED
        assert 'report_id' in report_resp.data

        admin_user = AdminUserFactory()
        admin_client = AuthenticatedAPIClient()
        admin_client.authenticate_admin(admin_user)

        queue_resp = admin_client.get('/api/admin/reports/?status=pending')
        assert queue_resp.status_code == status.HTTP_200_OK
        # Not paginated: should be a list of reports.
        report_ids = {r['id'] for r in queue_resp.data}
        assert report_resp.data['report_id'] in report_ids

        created_report = next(r for r in queue_resp.data if r['id'] == report_resp.data['report_id'])
        assert created_report['status'] == 'pending'
        # DRF may surface UUIDs as UUID objects in `.data` for tests.
        assert str(created_report['reported_service']) == str(service.id)


@pytest.mark.django_db
@pytest.mark.integration
class TestServiceRetrieveStatusVisibility:
    """Tests for the retrieve endpoint status-visibility rules.

    One-Time services must be accessible regardless of status so that owners
    and participants can revisit service history (Agreed, Completed, Cancelled).
    Recurrent services stay Active permanently, so they are always reachable.
    The list endpoint must never expose non-Active services.
    """

    # ── retrieve: One-Time non-Active statuses are visible ───────────────────

    def test_retrieve_one_time_agreed_returns_200(self):
        """Agreed One-Time service is visible on the detail endpoint."""
        service = ServiceFactory(schedule_type='One-Time', status='Agreed')
        response = APIClient().get(f'/api/services/{service.id}/')
        assert response.status_code == status.HTTP_200_OK
        assert response.data['status'] == 'Agreed'

    def test_retrieve_one_time_completed_returns_200(self):
        """Completed One-Time service is visible on the detail endpoint."""
        service = ServiceFactory(schedule_type='One-Time', status='Completed')
        response = APIClient().get(f'/api/services/{service.id}/')
        assert response.status_code == status.HTTP_200_OK
        assert response.data['status'] == 'Completed'

    def test_retrieve_one_time_cancelled_returns_200(self):
        """Cancelled One-Time service is visible on the detail endpoint."""
        service = ServiceFactory(schedule_type='One-Time', status='Cancelled')
        response = APIClient().get(f'/api/services/{service.id}/')
        assert response.status_code == status.HTTP_200_OK
        assert response.data['status'] == 'Cancelled'

    def test_retrieve_one_time_active_returns_200(self):
        """Active One-Time service is still reachable (regression guard)."""
        service = ServiceFactory(schedule_type='One-Time', status='Active')
        response = APIClient().get(f'/api/services/{service.id}/')
        assert response.status_code == status.HTTP_200_OK

    # ── retrieve: Recurrent services are always Active ───────────────────────

    def test_retrieve_recurrent_active_returns_200(self):
        """Active Recurrent service is visible on the detail endpoint."""
        service = ServiceFactory(schedule_type='Recurrent', status='Active')
        response = APIClient().get(f'/api/services/{service.id}/')
        assert response.status_code == status.HTTP_200_OK

    def test_retrieve_nonexistent_service_returns_404(self):
        """Unknown UUID must still return 404."""
        import uuid
        response = APIClient().get(f'/api/services/{uuid.uuid4()}/')
        assert response.status_code == status.HTTP_404_NOT_FOUND

    # ── list: only Active services are exposed ────────────────────────────────

    def test_list_excludes_agreed_services(self):
        """Agreed services must not appear in the public list."""
        ServiceFactory(schedule_type='One-Time', status='Agreed')
        ServiceFactory(schedule_type='One-Time', status='Active')
        response = APIClient().get('/api/services/')
        assert response.status_code == status.HTTP_200_OK
        statuses = [s['status'] for s in response.data['results']]
        assert 'Agreed' not in statuses

    def test_list_excludes_completed_services(self):
        """Completed services must not appear in the public list."""
        ServiceFactory(schedule_type='One-Time', status='Completed')
        ServiceFactory(schedule_type='One-Time', status='Active')
        response = APIClient().get('/api/services/')
        assert response.status_code == status.HTTP_200_OK
        statuses = [s['status'] for s in response.data['results']]
        assert 'Completed' not in statuses

    def test_list_excludes_cancelled_services(self):
        """Cancelled services must not appear in the public list."""
        ServiceFactory(schedule_type='One-Time', status='Cancelled')
        ServiceFactory(schedule_type='One-Time', status='Active')
        response = APIClient().get('/api/services/')
        assert response.status_code == status.HTTP_200_OK
        statuses = [s['status'] for s in response.data['results']]
        assert 'Cancelled' not in statuses

    def test_list_only_returns_active_services(self):
        """All items returned by the list endpoint must have status Active."""
        ServiceFactory.create_batch(3, status='Active')
        ServiceFactory(status='Agreed')
        ServiceFactory(status='Completed')
        ServiceFactory(status='Cancelled')
        response = APIClient().get('/api/services/')
        assert response.status_code == status.HTTP_200_OK
        assert all(s['status'] == 'Active' for s in response.data['results'])

    def test_list_excludes_expired_group_offers_from_feed(self):
        """Past one-time group offers should disappear from the public feed."""
        expired = ServiceFactory(
            type='Offer',
            status='Active',
            schedule_type='One-Time',
            max_participants=3,
            scheduled_time=timezone.now() - timedelta(hours=1),
        )
        future = ServiceFactory(
            type='Offer',
            status='Active',
            schedule_type='One-Time',
            max_participants=3,
            scheduled_time=timezone.now() + timedelta(days=1),
        )

        response = APIClient().get('/api/services/')
        assert response.status_code == status.HTTP_200_OK
        ids = {item['id'] for item in response.data['results']}
        assert str(expired.id) not in ids
        assert str(future.id) in ids

    def test_need_service_max_participants_forced_to_one(self):
        """Creating a Need service must force max_participants to 1."""
        user = UserFactory()
        client = AuthenticatedAPIClient()
        client.authenticate_user(user)

        response = client.post('/api/services/', {
            'title': 'Need With Group',
            'description': 'Trying to set max_participants on a Need',
            'type': 'Need',
            'duration': 1.0,
            'location_type': 'Online',
            'max_participants': 5,
            'schedule_type': 'One-Time',
        })
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data['max_participants'] == 1
        service = Service.objects.get(id=response.data['id'])
        assert service.max_participants == 1

    def test_offer_service_respects_max_participants(self):
        """Creating an Offer service must keep the requested max_participants value."""
        user = UserFactory(is_verified=True)
        client = AuthenticatedAPIClient()
        client.authenticate_user(user)

        response = client.post('/api/services/', {
            'title': 'Offer Group Session',
            'description': 'Group session with multiple participants',
            'type': 'Offer',
            'duration': 2.0,
            'location_type': 'In-Person',
            'location_area': 'Beşiktaş Culture Center',
            'max_participants': 5,
            'schedule_type': 'Recurrent',
        })
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data['max_participants'] == 5
        service = Service.objects.get(id=response.data['id'])
        assert service.max_participants == 5

    def test_group_offer_requires_future_schedule_and_exact_location(self):
        """One-time group offers must include fixed meeting details."""
        user = UserFactory(is_verified=True)
        client = AuthenticatedAPIClient()
        client.authenticate_user(user)

        response = client.post('/api/services/', {
            'title': 'Incomplete Group Offer',
            'description': 'Missing fixed meeting details',
            'type': 'Offer',
            'duration': 2.0,
            'location_type': 'In-Person',
            'max_participants': 3,
            'schedule_type': 'One-Time',
        })
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        field_errors = response.data.get('field_errors', {})
        assert 'location_area' in field_errors or 'scheduled_time' in field_errors

    def test_group_offer_create_persists_exact_location_coords_and_guide(self):
        """One-time in-person group offers should persist exact session details for later handshakes."""
        user = UserFactory(is_verified=True)
        client = AuthenticatedAPIClient()
        client.authenticate_user(user)

        response = client.post('/api/services/', {
            'title': 'Exact Location Group Offer',
            'description': 'Group offer with fixed exact address and an optional guide note.',
            'type': 'Offer',
            'duration': 2.0,
            'location_type': 'In-Person',
            'location_area': 'Kadıköy',
            'location_lat': '40.987654',
            'location_lng': '29.123456',
            'max_participants': 3,
            'schedule_type': 'One-Time',
            'scheduled_time': (timezone.now() + timedelta(days=3)).isoformat(),
            'session_exact_location': 'Caferağa Mahallesi, Moda Caddesi No: 185, Kadıköy, İstanbul, Türkiye',
            'session_exact_location_lat': '40.987654',
            'session_exact_location_lng': '29.123456',
            'session_location_guide': 'Veterinerin olduğu bina',
        })

        assert response.status_code == status.HTTP_201_CREATED
        service = Service.objects.get(id=response.data['id'])
        assert service.session_exact_location == 'Caferağa Mahallesi, Moda Caddesi No: 185, Kadıköy, İstanbul, Türkiye'
        assert service.session_exact_location_lat == Decimal('40.987654')
        assert service.session_exact_location_lng == Decimal('29.123456')
        assert service.session_location_guide == 'Veterinerin olduğu bina'
