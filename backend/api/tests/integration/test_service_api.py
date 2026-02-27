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
        """Test deleting a service"""
        user = UserFactory()
        service = ServiceFactory(user=user)
        client = AuthenticatedAPIClient()
        client.authenticate_user(user)
        
        response = client.delete(f'/api/services/{service.id}/')
        assert response.status_code == status.HTTP_204_NO_CONTENT
        assert not Service.objects.filter(id=service.id).exists()

    def test_delete_service_blocked_when_handshake_exists(self):
        """Service cannot be deleted once any handshake exists."""
        user = UserFactory()
        service = ServiceFactory(user=user)
        HandshakeFactory(service=service)

        client = AuthenticatedAPIClient()
        client.authenticate_user(user)

        response = client.delete(f'/api/services/{service.id}/')
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert response.data.get('code') == 'INVALID_STATE'
        assert Service.objects.filter(id=service.id).exists()

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
