"""
Integration tests for service API endpoints
"""
import pytest
import requests
from unittest.mock import patch
from rest_framework import status
from rest_framework.test import APIClient
from decimal import Decimal
from datetime import timedelta
from django.utils import timezone

from api.tests.helpers.factories import UserFactory, ServiceFactory, TagFactory, HandshakeFactory
from api.tests.helpers.factories import AdminUserFactory
from api.tests.helpers.test_client import AuthenticatedAPIClient
from api.models import Service, Notification, TransactionHistory, Tag
from api.tests.helpers.assertions import assert_api_response, assert_problem_detail


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
        assert_api_response(response, 200, contains={'results'})
        assert len(response.data['results']) > 0
    
    def test_list_services_filtering(self):
        """Test service filtering"""
        ServiceFactory(type='Offer', status='Active')
        ServiceFactory(type='Need', status='Active')
        
        client = APIClient()
        response = client.get('/api/services/?type=Offer')
        assert_api_response(response, 200)
        assert all(s['type'] == 'Offer' for s in response.data['results'])

    def test_user_profile_service_list_includes_agreed_services(self):
        """Profile service lists should include services with active agreements."""
        owner = UserFactory()
        active_offer = ServiceFactory(user=owner, type='Offer', status='Active', title='Visible Active Offer')
        agreed_offer = ServiceFactory(user=owner, type='Offer', status='Agreed', title='Visible Agreed Offer')
        ServiceFactory(user=owner, type='Offer', status='Completed', title='Hidden Completed Offer')
        ServiceFactory(type='Offer', status='Agreed', title='Other Owner Agreed Offer')

        client = APIClient()
        response = client.get(f'/api/services/?user={owner.id}&type=Offer')

        assert_api_response(response, 200)
        returned_ids = {item['id'] for item in response.data['results']}
        assert str(active_offer.id) in returned_ids
        assert str(agreed_offer.id) in returned_ids
        assert all(item['status'] in {'Active', 'Agreed'} for item in response.data['results'])

    def test_user_profile_service_list_is_not_served_from_stale_cache(self):
        """Profile lists need live service state when agreements change status."""
        owner = UserFactory()
        service = ServiceFactory(user=owner, type='Offer', status='Active', title='Agreement Status Offer')

        client = APIClient()
        first = client.get(f'/api/services/?user={owner.id}&type=Offer')
        assert_api_response(first, 200)
        first_item = next(item for item in first.data['results'] if item['id'] == str(service.id))
        assert first_item['status'] == 'Active'

        Service.objects.filter(id=service.id).update(status='Agreed')

        second = client.get(f'/api/services/?user={owner.id}&type=Offer')
        assert_api_response(second, 200)
        second_item = next(item for item in second.data['results'] if item['id'] == str(service.id))
        assert second_item['status'] == 'Agreed'
    
    def test_list_services_pagination(self):
        """Test service pagination"""
        ServiceFactory.create_batch(25, status='Active')
        
        client = APIClient()
        response = client.get('/api/services/?page_size=10')
        assert_api_response(response, 200)
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
        assert_api_response(response, 201, schema={'title': 'New Service'})
        assert Service.objects.filter(id=response.data['id']).exists()

    def test_create_need_reserves_timebank_and_updates_profile_payload(self):
        """Creating a Need reserves the requester-side hours immediately."""
        owner = UserFactory(is_verified=True, timebank_balance=Decimal('3.00'))
        client = AuthenticatedAPIClient()
        client.authenticate_user(owner)

        me_before = client.get('/api/users/me/')
        assert_api_response(me_before, 200)
        assert Decimal(str(me_before.data['timebank_balance'])) == Decimal('3.00')

        response = client.post('/api/services/', {
            'title': 'Need Immediate Reservation',
            'description': 'Need create should reserve hours immediately.',
            'type': 'Need',
            'duration': 2.0,
            'location_type': 'Online',
            'max_participants': 1,
            'schedule_type': 'One-Time',
        })

        assert_api_response(response, 201)

        service = Service.objects.get(id=response.data['id'])
        owner.refresh_from_db()

        assert owner.timebank_balance == Decimal('1.00')
        assert service.reserved_timebank_hours == Decimal('2.00')
        assert TransactionHistory.objects.filter(
            user=owner,
            service=service,
            handshake=None,
            transaction_type='provision',
            amount=Decimal('-2.00'),
        ).exists()

        me_after = client.get('/api/users/me/')
        assert_api_response(me_after, 200)
        assert Decimal(str(me_after.data['timebank_balance'])) == Decimal('1.00')

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

        assert_api_response(response, 201, contains={'media'}, schema={'title': 'Service With Video'})
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
        assert_problem_detail(response, 400)

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

        assert_problem_detail(response, 403)
        assert response.data.get('code') == 'EMAIL_NOT_VERIFIED'
        assert not Service.objects.filter(title='Verified Only Offer').exists()

    def test_unverified_user_cannot_create_need(self):
        user = UserFactory(is_verified=False)
        client = AuthenticatedAPIClient().authenticate_user(user)

        response = client.post('/api/services/', self._need_payload())

        assert_problem_detail(response, 403)
        assert response.data.get('code') == 'EMAIL_NOT_VERIFIED'
        assert not Service.objects.filter(title='Help moving a sofa').exists()

    def test_unverified_user_cannot_create_event(self):
        user = UserFactory(is_verified=False)
        client = AuthenticatedAPIClient().authenticate_user(user)

        response = client.post('/api/services/', self._event_payload())

        assert_problem_detail(response, 403)
        assert response.data.get('code') == 'EMAIL_NOT_VERIFIED'
        assert not Service.objects.filter(title='Community picnic').exists()

    def test_verified_user_can_create_offer(self):
        user = UserFactory(is_verified=True)
        client = AuthenticatedAPIClient().authenticate_user(user)

        response = client.post('/api/services/', self._offer_payload())

        assert_api_response(response, 201)
        assert Service.objects.filter(id=response.data['id'], type='Offer').exists()

    def test_verified_user_can_create_need(self):
        user = UserFactory(is_verified=True)
        client = AuthenticatedAPIClient().authenticate_user(user)

        response = client.post('/api/services/', self._need_payload())

        assert_api_response(response, 201)
        assert Service.objects.filter(id=response.data['id'], type='Need').exists()

    def test_verified_user_can_create_event(self):
        user = UserFactory(is_verified=True)
        client = AuthenticatedAPIClient().authenticate_user(user)

        response = client.post('/api/services/', self._event_payload())

        assert_api_response(response, 201)
        assert Service.objects.filter(id=response.data['id'], type='Event').exists()
    
    def test_retrieve_service(self):
        """Test retrieving a single service"""
        service = ServiceFactory()
        client = APIClient()
        
        response = client.get(f'/api/services/{service.id}/')
        assert_api_response(response, 200, schema={'id': str(service.id), 'title': service.title})
    
    def test_update_service(self):
        """Test updating a service"""
        user = UserFactory()
        service = ServiceFactory(user=user)
        client = AuthenticatedAPIClient()
        client.authenticate_user(user)
        
        response = client.patch(f'/api/services/{service.id}/', {
            'title': 'Updated Title'
        })
        assert_api_response(response, 200, schema={'title': 'Updated Title'})
        
        service.refresh_from_db()
        assert service.title == 'Updated Title'

    def test_update_non_active_service_is_rejected_with_clear_403(self):
        """Editing must be limited to Active services. Non-Active statuses must
        return 403 with a status-aware message, not a misleading 404."""
        owner = UserFactory()
        client = AuthenticatedAPIClient().authenticate_user(owner)

        for status_value in ('Agreed', 'Completed', 'Cancelled'):
            service = ServiceFactory(user=owner, status=status_value, title='Original')
            response = client.patch(
                f'/api/services/{service.id}/', {'title': f'Renamed {status_value}'},
            )
            assert_problem_detail(response, 403, contains_text='no longer be edited')
            service.refresh_from_db()
            assert service.title == 'Original', (
                f'{status_value} service title was mutated despite 403 response.'
            )

    def test_update_active_hidden_service_is_allowed_for_owner(self):
        """Owners must still be able to edit their own hidden (is_visible=False)
        Active listings; the list visibility filter must not leak into writes."""
        owner = UserFactory()
        service = ServiceFactory(user=owner, status='Active', is_visible=False, title='Original')
        client = AuthenticatedAPIClient().authenticate_user(owner)

        response = client.patch(f'/api/services/{service.id}/', {'title': 'Renamed hidden'})
        assert_api_response(response, 200, schema={'title': 'Renamed hidden'})
        service.refresh_from_db()
        assert service.title == 'Renamed hidden'

    def test_update_offer_allowed_when_application_exists_and_notifies_applicant(self):
        """Offer owner can edit and pending applicants get notified."""
        owner = UserFactory()
        applicant = UserFactory()
        service = ServiceFactory(user=owner, type='Offer')
        HandshakeFactory(service=service, requester=applicant, status='pending')

        client = AuthenticatedAPIClient()
        client.authenticate_user(owner)

        response = client.patch(f'/api/services/{service.id}/', {'title': 'Updated title'})
        assert_api_response(response, 200)

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
        assert_api_response(response, 200)

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
        assert_api_response(response, 200)

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
        assert_problem_detail(response, 403)

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
        assert_api_response(response, 200)

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
        assert_api_response(response, 200)

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
        assert_api_response(response, 200)

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
        assert_problem_detail(response, 403)
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
        assert_problem_detail(response, 403)
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
        assert_problem_detail(response, 403)
    
    def test_delete_service(self):
        """Test soft-deleting a service (sets status to Cancelled)"""
        user = UserFactory()
        service = ServiceFactory(user=user)
        client = AuthenticatedAPIClient()
        client.authenticate_user(user)
        
        response = client.delete(f'/api/services/{service.id}/')
        assert_api_response(response, 204)
        service.refresh_from_db()
        assert service.status == 'Cancelled'

    def test_delete_need_releases_reserved_timebank(self):
        """Removing a valid Need releases its upfront reserved hours."""
        user = UserFactory(timebank_balance=Decimal('1.00'))
        service = ServiceFactory(
            user=user,
            type='Need',
            duration=Decimal('2.00'),
            reserved_timebank_hours=Decimal('2.00'),
        )
        client = AuthenticatedAPIClient()
        client.authenticate_user(user)

        response = client.delete(f'/api/services/{service.id}/')
        assert_api_response(response, 204)

        service.refresh_from_db()
        user.refresh_from_db()

        assert service.status == 'Cancelled'
        assert service.reserved_timebank_hours == Decimal('0.00')
        assert user.timebank_balance == Decimal('3.00')
        assert TransactionHistory.objects.filter(
            user=user,
            service=service,
            handshake=None,
            transaction_type='refund',
            amount=Decimal('2.00'),
        ).exists()

    def test_deleted_service_hidden_from_list_visible_to_admin(self):
        """Soft-deleted service is hidden from public list but visible to admin on user profile."""
        user = UserFactory()
        admin = AdminUserFactory()
        service = ServiceFactory(user=user, status='Active')

        owner_client = AuthenticatedAPIClient()
        owner_client.authenticate_user(user)

        # Soft-delete the service
        resp = owner_client.delete(f'/api/services/{service.id}/')
        assert_api_response(resp, 204)

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
        assert_problem_detail(response, 400)
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
        assert_api_response(response, 204)
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
        assert_problem_detail(response, 403)
        assert Service.objects.filter(id=service.id).exists()
    
    def test_search_services(self):
        """Test service search"""
        ServiceFactory(title='Cooking Lesson', description='Learn to cook')
        ServiceFactory(title='Tech Help', description='Computer assistance')
        
        client = APIClient()
        response = client.get('/api/services/?search=cooking')
        assert_api_response(response, 200)
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
        assert_api_response(report_resp, 201, contains={'report_id'})

        admin_user = AdminUserFactory()
        admin_client = AuthenticatedAPIClient()
        admin_client.authenticate_admin(admin_user)

        queue_resp = admin_client.get('/api/admin/reports/?status=pending')
        assert_api_response(queue_resp, 200)
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
        assert_api_response(response, 200, schema={'status': 'Agreed'})

    def test_retrieve_one_time_completed_returns_200(self):
        """Completed One-Time service is visible on the detail endpoint."""
        service = ServiceFactory(schedule_type='One-Time', status='Completed')
        response = APIClient().get(f'/api/services/{service.id}/')
        assert_api_response(response, 200, schema={'status': 'Completed'})

    def test_retrieve_one_time_cancelled_returns_200(self):
        """Cancelled One-Time service is visible on the detail endpoint."""
        service = ServiceFactory(schedule_type='One-Time', status='Cancelled')
        response = APIClient().get(f'/api/services/{service.id}/')
        assert_api_response(response, 200, schema={'status': 'Cancelled'})

    def test_retrieve_one_time_active_returns_200(self):
        """Active One-Time service is still reachable (regression guard)."""
        service = ServiceFactory(schedule_type='One-Time', status='Active')
        response = APIClient().get(f'/api/services/{service.id}/')
        assert_api_response(response, 200)

    # ── retrieve: Recurrent services are always Active ───────────────────────

    def test_retrieve_recurrent_active_returns_200(self):
        """Active Recurrent service is visible on the detail endpoint."""
        service = ServiceFactory(schedule_type='Recurrent', status='Active')
        response = APIClient().get(f'/api/services/{service.id}/')
        assert_api_response(response, 200)

    def test_retrieve_nonexistent_service_returns_404(self):
        """Unknown UUID must still return 404."""
        import uuid
        response = APIClient().get(f'/api/services/{uuid.uuid4()}/')
        assert_problem_detail(response, 404)

    # ── list: only Active services are exposed ────────────────────────────────

    def test_list_excludes_agreed_services(self):
        """Agreed services must not appear in the public list."""
        ServiceFactory(schedule_type='One-Time', status='Agreed')
        ServiceFactory(schedule_type='One-Time', status='Active')
        response = APIClient().get('/api/services/')
        assert_api_response(response, 200)
        statuses = [s['status'] for s in response.data['results']]
        assert 'Agreed' not in statuses

    def test_list_excludes_completed_services(self):
        """Completed services must not appear in the public list."""
        ServiceFactory(schedule_type='One-Time', status='Completed')
        ServiceFactory(schedule_type='One-Time', status='Active')
        response = APIClient().get('/api/services/')
        assert_api_response(response, 200)
        statuses = [s['status'] for s in response.data['results']]
        assert 'Completed' not in statuses

    def test_list_excludes_cancelled_services(self):
        """Cancelled services must not appear in the public list."""
        ServiceFactory(schedule_type='One-Time', status='Cancelled')
        ServiceFactory(schedule_type='One-Time', status='Active')
        response = APIClient().get('/api/services/')
        assert_api_response(response, 200)
        statuses = [s['status'] for s in response.data['results']]
        assert 'Cancelled' not in statuses

    def test_list_only_returns_active_services(self):
        """All items returned by the list endpoint must have status Active."""
        ServiceFactory.create_batch(3, status='Active')
        ServiceFactory(status='Agreed')
        ServiceFactory(status='Completed')
        ServiceFactory(status='Cancelled')
        response = APIClient().get('/api/services/')
        assert_api_response(response, 200)
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
        assert_api_response(response, 200)
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
        assert_api_response(response, 201, schema={'max_participants': 1})
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
            'location_lat': '41.042200',
            'location_lng': '29.008900',
            'max_participants': 5,
            'schedule_type': 'One-Time',
            'scheduled_time': (timezone.now() + timedelta(days=3)).isoformat(),
            'session_exact_location': 'Beşiktaş Culture Center, Beşiktaş, İstanbul',
            'session_exact_location_lat': '41.042200',
            'session_exact_location_lng': '29.008900',
        })
        assert_api_response(response, 201, schema={'max_participants': 5})
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
            'location_lat': '41.042200',
            'location_lng': '29.008900',
            'max_participants': 3,
            'schedule_type': 'One-Time',
        })
        assert_problem_detail(response, 400)
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

        assert_api_response(response, 201)
        service = Service.objects.get(id=response.data['id'])
        assert service.session_exact_location == 'Caferağa Mahallesi, Moda Caddesi No: 185, Kadıköy, İstanbul, Türkiye'
        assert service.session_exact_location_lat == Decimal('40.987654')
        assert service.session_exact_location_lng == Decimal('29.123456')
        assert service.session_location_guide == 'Veterinerin olduğu bina'


@pytest.mark.django_db
@pytest.mark.integration
class TestServiceDetailQueryCount:
    """Pin the detail-route query count so a regressed serializer cannot
    silently re-introduce N+1 against comments / saves / dismissals.

    NFR-13a: the service-detail page exceeded the 2 s budget on Docker CI
    because `comment_count`, `is_saved`, and `is_dismissed` each fired a
    per-row query on the detail path. The retrieve queryset now annotates
    those alongside the existing user / tags / handshakes prefetches.
    Cap the absolute count generously so unrelated middleware queries
    don't make this brittle, but reject growth that scales with the row
    counts of related tables (comments, saved-services, dismissals).
    """

    def test_detail_query_count_is_constant_across_comment_volume(self):
        from django.db import connection
        from django.test.utils import CaptureQueriesContext
        from api.models import Comment

        owner = UserFactory()
        viewer = UserFactory()
        small_service = ServiceFactory(user=owner, status='Active')
        large_service = ServiceFactory(user=owner, status='Active')

        # Seed differing comment volumes so per-row N+1 would show up as
        # a query-count delta tracking the comment counts.
        Comment.objects.create(service=small_service, user=viewer, body='one')
        for i in range(15):
            Comment.objects.create(
                service=large_service, user=viewer, body=f'c{i}'
            )

        client = APIClient()
        client.force_authenticate(user=viewer)

        # Warm caches and module imports so first-hit work doesn't skew the
        # second observation.
        client.get(f'/api/services/{small_service.id}/')

        with CaptureQueriesContext(connection) as ctx_small:
            resp = client.get(f'/api/services/{small_service.id}/')
            assert_api_response(resp, 200)

        with CaptureQueriesContext(connection) as ctx_large:
            resp = client.get(f'/api/services/{large_service.id}/')
            assert_api_response(resp, 200)

        # Detail must not scale with comment volume. Allow a tiny constant
        # delta for jitter (auth caching, throttle bookkeeping) but reject
        # anything that grows roughly linearly with the 14-row gap.
        assert len(ctx_large) - len(ctx_small) <= 2, (
            f'detail query count grew from {len(ctx_small)} to {len(ctx_large)} '
            f'when comment volume rose from 1 to 15 — N+1 likely back'
        )
        # Hard cap to prevent silent regressions stacking up across releases.
        assert len(ctx_large) <= 25, (
            f'detail query count {len(ctx_large)} exceeds the 25-query cap; '
            f'review the retrieve queryset / serializer'
        )

    def test_detail_query_count_does_not_scale_with_saved_or_dismissed_volume(self):
        from django.db import connection
        from django.test.utils import CaptureQueriesContext
        from api.models import SavedService, ServiceDismissal

        viewer = UserFactory()
        target = ServiceFactory(status='Active')

        # Pollute the SavedService / ServiceDismissal tables for unrelated
        # services to confirm the per-viewer is_saved / is_dismissed paths
        # are using EXISTS subqueries rather than per-row table scans.
        for _ in range(20):
            other = ServiceFactory(status='Active')
            SavedService.objects.create(user=viewer, service=other)
            ServiceDismissal.objects.create(viewer=viewer, service=other)

        client = APIClient()
        client.force_authenticate(user=viewer)
        # Warm.
        client.get(f'/api/services/{target.id}/')

        with CaptureQueriesContext(connection) as ctx:
            resp = client.get(f'/api/services/{target.id}/')
            assert_api_response(resp, 200)

        assert len(ctx) <= 25, (
            f'detail query count {len(ctx)} exceeds the 25-query cap '
            f'in the presence of unrelated SavedService / Dismissal rows'
        )

@pytest.mark.django_db
@pytest.mark.integration
class TestOfferCreateTagPayloads:
    """Regression tests for issue #575 — POST /api/services/ must never 500
    based on the contents of `tag_ids` or `tag_names`.

    The pre-fix create path raised on three legitimate inputs:

    1. A QID in `tag_ids` that did not yet exist as a Tag, where the
       Wikidata label happened to collide with an existing tag's `name`
       (`Tag.name` is unique). `Tag.objects.get_or_create(id=...,
       defaults={'name': label})` then surfaced an `IntegrityError` as
       a 500.
    2. A QID in `tag_ids` that did not yet exist as a Tag, where the
       Wikidata fetch raised an exception not caught upstream (anything
       that wasn't `RequestException / KeyError / ValueError`).
    3. The `tag_names` flow, where `Tag.objects.create(...)` raced with
       a concurrent insert on the unique `name` index.

    Each test below expects the create call to succeed with 201, with
    unresolvable QIDs silently dropped from the response payload. The
    pre-fix behaviour was 500.
    """

    def _payload(self, tag_ids=None, tag_names=None, wikidata_labels_json=None):
        body = {
            'title': 'Tag Payload Offer',
            'description': 'Exercises the tag-creation path on /api/services/.',
            'type': 'Offer',
            'duration': 1.0,
            'location_type': 'Online',
            'max_participants': 1,
            'schedule_type': 'One-Time',
            'status': 'Active',
        }
        if tag_ids is not None:
            body['tag_ids'] = tag_ids
        if tag_names is not None:
            body['tag_names'] = tag_names
        if wikidata_labels_json is not None:
            body['wikidata_labels_json'] = wikidata_labels_json
        return body

    def _client(self):
        user = UserFactory(is_verified=True)
        client = AuthenticatedAPIClient()
        client.authenticate_user(user)
        return client

    def test_create_with_valid_tag_ids_returns_201(self):
        """Baseline: existing tag id resolves and is attached."""
        tag = TagFactory()
        client = self._client()

        response = client.post('/api/services/', self._payload(tag_ids=[tag.id]))

        assert_api_response(response, 201)
        attached = {t['id'] for t in response.data.get('tags', [])}
        assert tag.id in attached

    def test_create_with_empty_tag_ids_returns_201(self):
        """Empty tag list must not regress the create path."""
        client = self._client()

        response = client.post('/api/services/', self._payload(tag_ids=[]))

        assert_api_response(response, 201)
        assert response.data.get('tags', []) == []

    @patch('api.wikidata.fetch_wikidata_claims', return_value=None)
    @patch('api.wikidata.fetch_wikidata_item', return_value=None)
    def test_create_with_mixed_valid_and_unknown_tag_ids_returns_201(
        self, _mock_item, _mock_claims
    ):
        """Mixed payload: valid tag survives, unknown non-QID id is dropped."""
        tag = TagFactory()
        client = self._client()

        response = client.post(
            '/api/services/',
            self._payload(tag_ids=[tag.id, 'not-a-real-tag-id-xyz']),
        )

        assert_api_response(response, 201)
        attached = {t['id'] for t in response.data.get('tags', [])}
        assert tag.id in attached
        assert 'not-a-real-tag-id-xyz' not in attached

    @patch(
        'api.wikidata.fetch_wikidata_item',
        side_effect=requests.RequestException('wikidata down'),
    )
    def test_create_with_qid_when_wikidata_raises_returns_201(self, _mock_item):
        """If Wikidata is down (raises RequestException), the create
        endpoint must still succeed — the QID is best-effort enrichment.

        Pre-fix this path 500'd because the exception propagated out of
        `ServiceSerializer.create`. The fix wraps the lookup in a
        defensive try/except so the create transaction commits and the
        caller gets 201.
        """
        client = self._client()

        response = client.post('/api/services/', self._payload(tag_ids=['Q424242']))

        assert_api_response(response, 201)

    @patch('api.wikidata.fetch_wikidata_claims', return_value=None)
    def test_create_with_qid_label_colliding_with_existing_tag_returns_201(
        self, _mock_claims
    ):
        """Reproduces the original #575 500: a fresh QID whose Wikidata
        label collides with an existing `Tag.name` triggered an
        IntegrityError on the unique-name index from
        `Tag.objects.get_or_create(id=..., defaults={'name': label})`.

        Post-fix the create succeeds and the existing tag is reused.
        """
        existing = Tag.objects.create(id='hand_made_tag', name='Yoga')
        client = self._client()

        with patch(
            'api.wikidata.fetch_wikidata_item',
            return_value={'id': 'Q9888', 'label': 'Yoga'},
        ):
            response = client.post(
                '/api/services/',
                self._payload(tag_ids=['Q9888']),
            )

        assert_api_response(response, 201)
        attached_ids = {t['id'] for t in response.data.get('tags', [])}
        # The fix must reuse the existing row by name rather than create
        # a new row with the same name and 500 on the unique index. Pin
        # to the stored row's id so a regression that resurrects the
        # parallel-INSERT path is caught — 'Q9888' showing up here would
        # mean the helper bypassed the name-collision lookup.
        assert existing.id in attached_ids
        assert 'Q9888' not in attached_ids
        assert not Tag.objects.filter(id='Q9888').exists()

    @patch('api.wikidata.fetch_wikidata_claims', return_value=None)
    @patch('api.wikidata.fetch_wikidata_item', return_value=None)
    def test_create_with_tag_names_reuses_existing_row_returns_201(
        self, _mock_item, _mock_claims
    ):
        """`tag_names` flow must reuse an existing tag with the same
        case-insensitive name instead of attempting a fresh INSERT
        (which 500'd via IntegrityError on the unique name index in the
        race window).
        """
        existing = Tag.objects.create(id='photography_seed', name='Photography')
        client = self._client()

        # Different casing — pre-fix the case-insensitive lookup found
        # the row, but in the race between get() and create() the INSERT
        # would still fire and 500 on the unique name index. Post-fix the
        # create path uses a save-pointed get_or_create equivalent.
        response = client.post(
            '/api/services/',
            self._payload(tag_names=['photography']),
        )

        assert_api_response(response, 201)
        attached_ids = {t['id'] for t in response.data.get('tags', [])}
        assert existing.id in attached_ids
