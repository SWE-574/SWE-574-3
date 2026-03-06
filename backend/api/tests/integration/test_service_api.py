"""
Integration tests for service API endpoints
"""
import pytest
from rest_framework import status
from rest_framework.test import APIClient
from decimal import Decimal

from api.tests.helpers.factories import UserFactory, ServiceFactory, TagFactory, HandshakeFactory
from api.tests.helpers.factories import AdminUserFactory
from api.tests.helpers.test_client import AuthenticatedAPIClient
from api.models import Service


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
        user = UserFactory()
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
            'max_participants': 2,
            'schedule_type': 'One-Time',
            'status': 'Active',
            'tag_ids': [tag.id]
        })
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data['title'] == 'New Service'
        assert Service.objects.filter(id=response.data['id']).exists()

    def test_create_service_with_video_media(self):
        """Test creating a service with a video URL media item"""
        user = UserFactory()
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
