"""
Tests for profile media fields and user history endpoint.

Covers:
- User model video_intro_url, portfolio_images, show_history fields
- GET /api/users/{id}/history/ endpoint
- Privacy toggle behavior
"""
import uuid
from decimal import Decimal
from types import SimpleNamespace

import pytest
from django.urls import reverse
from rest_framework.test import APIClient

from api.models import Handshake, Service, User


@pytest.fixture
def basic_user(db):
    return User.objects.create_user(
        email='test@example.com', password='testpass123',
        first_name='Test', last_name='User',
        timebank_balance=Decimal('5.00'),
    )


@pytest.mark.django_db
def test_video_intro_url_default_null(basic_user):
    assert basic_user.video_intro_url is None


@pytest.mark.django_db
def test_video_intro_url_can_be_set(basic_user):
    basic_user.video_intro_url = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
    basic_user.save()
    basic_user.refresh_from_db()
    assert basic_user.video_intro_url == 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'


@pytest.mark.django_db
def test_portfolio_images_default_empty_list(basic_user):
    assert basic_user.portfolio_images == []


@pytest.mark.django_db
def test_portfolio_images_can_store_urls(basic_user):
    images = [
        'https://example.com/image1.jpg',
        'https://example.com/image2.jpg',
        'https://example.com/image3.jpg',
    ]
    basic_user.portfolio_images = images
    basic_user.save()
    basic_user.refresh_from_db()
    assert basic_user.portfolio_images == images


@pytest.mark.django_db
def test_show_history_default_true(basic_user):
    assert basic_user.show_history


@pytest.mark.django_db
def test_show_history_can_be_toggled(basic_user):
    basic_user.show_history = False
    basic_user.save()
    basic_user.refresh_from_db()
    assert not basic_user.show_history


@pytest.fixture
def history_env(db):
    user1 = User.objects.create_user(
        email='user1@example.com', password='testpass123',
        first_name='User', last_name='One',
        timebank_balance=Decimal('10.00'), show_history=True,
    )
    user2 = User.objects.create_user(
        email='user2@example.com', password='testpass123',
        first_name='User', last_name='Two',
        timebank_balance=Decimal('10.00'), show_history=True,
    )
    private_user = User.objects.create_user(
        email='private@example.com', password='testpass123',
        first_name='Private', last_name='User',
        timebank_balance=Decimal('10.00'), show_history=False,
    )
    service = Service.objects.create(
        user=user1, title='Test Service', description='A test service',
        type='Offer', duration=Decimal('2.00'), location_type='Online',
        status='Active', max_participants=1, schedule_type='One-Time',
    )
    handshake = Handshake.objects.create(
        service=service, requester=user2,
        status='completed', provisioned_hours=Decimal('2.00'),
        provider_confirmed_complete=True, receiver_confirmed_complete=True,
    )
    return SimpleNamespace(
        user1=user1, user2=user2, private_user=private_user,
        service=service, handshake=handshake, client=APIClient(),
    )


@pytest.mark.django_db
def test_history_endpoint_returns_completed_handshakes(history_env):
    url = reverse('user-history', kwargs={'id': history_env.user1.id})
    response = history_env.client.get(url)

    assert response.status_code == 200
    assert len(response.data) == 1
    assert response.data[0]['service_title'] == 'Test Service'


@pytest.mark.django_db
def test_history_endpoint_includes_correct_fields(history_env):
    url = reverse('user-history', kwargs={'id': history_env.user1.id})
    response = history_env.client.get(url)

    assert response.status_code == 200
    item = response.data[0]
    assert 'service_title' in item
    assert 'service_type' in item
    assert 'duration' in item
    assert 'partner_name' in item
    assert 'partner_id' in item
    assert 'completed_date' in item
    assert 'was_provider' in item


@pytest.mark.django_db
def test_history_identifies_provider_correctly(history_env):
    url = reverse('user-history', kwargs={'id': history_env.user1.id})
    response = history_env.client.get(url)
    assert response.status_code == 200
    assert response.data[0]['was_provider']

    url = reverse('user-history', kwargs={'id': history_env.user2.id})
    response = history_env.client.get(url)
    assert response.status_code == 200
    assert not response.data[0]['was_provider']


@pytest.mark.django_db
def test_private_history_returns_empty_for_others(history_env):
    service = Service.objects.create(
        user=history_env.private_user,
        title='Private Service', description='A private service',
        type='Offer', duration=Decimal('1.00'), location_type='Online',
        status='Active', max_participants=1, schedule_type='One-Time',
    )
    Handshake.objects.create(
        service=service, requester=history_env.user1,
        status='completed', provisioned_hours=Decimal('1.00'),
        provider_confirmed_complete=True, receiver_confirmed_complete=True,
    )

    url = reverse('user-history', kwargs={'id': history_env.private_user.id})
    response = history_env.client.get(url)

    assert response.status_code == 200
    assert response.data == []


@pytest.mark.django_db
def test_owner_can_see_own_private_history(history_env):
    service = Service.objects.create(
        user=history_env.private_user,
        title='Private Service', description='A private service',
        type='Offer', duration=Decimal('1.00'), location_type='Online',
        status='Active', max_participants=1, schedule_type='One-Time',
    )
    Handshake.objects.create(
        service=service, requester=history_env.user1,
        status='completed', provisioned_hours=Decimal('1.00'),
        provider_confirmed_complete=True, receiver_confirmed_complete=True,
    )

    history_env.client.force_authenticate(user=history_env.private_user)
    url = reverse('user-history', kwargs={'id': history_env.private_user.id})
    response = history_env.client.get(url)

    assert response.status_code == 200
    assert len(response.data) == 1


@pytest.mark.django_db
def test_nonexistent_user_returns_404(history_env):
    fake_id = uuid.uuid4()
    url = reverse('user-history', kwargs={'id': fake_id})
    response = history_env.client.get(url)
    assert response.status_code == 404


@pytest.mark.django_db
def test_history_only_shows_completed_handshakes(history_env):
    Handshake.objects.create(
        service=history_env.service, requester=history_env.user2,
        status='pending', provisioned_hours=Decimal('1.00'),
    )
    url = reverse('user-history', kwargs={'id': history_env.user1.id})
    response = history_env.client.get(url)

    assert response.status_code == 200
    assert len(response.data) == 1


@pytest.fixture
def authed_client(db):
    user = User.objects.create_user(
        email='test@example.com', password='testpass123',
        first_name='Test', last_name='User',
        timebank_balance=Decimal('5.00'),
    )
    client = APIClient()
    client.force_authenticate(user=user)
    return SimpleNamespace(user=user, client=client)


@pytest.mark.django_db
def test_portfolio_images_max_5(authed_client):
    url = reverse('user-profile')
    response = authed_client.client.patch(url, {
        'portfolio_images': [
            'https://example.com/1.jpg',
            'https://example.com/2.jpg',
            'https://example.com/3.jpg',
            'https://example.com/4.jpg',
            'https://example.com/5.jpg',
            'https://example.com/6.jpg',
        ],
    }, format='json')
    assert response.status_code == 400


@pytest.mark.django_db
def test_portfolio_images_accepts_5_or_less(authed_client):
    url = reverse('user-profile')
    response = authed_client.client.patch(url, {
        'portfolio_images': [
            'https://example.com/1.jpg',
            'https://example.com/2.jpg',
            'https://example.com/3.jpg',
        ],
    }, format='json')
    assert response.status_code == 200
    assert len(response.data['portfolio_images']) == 3


@pytest.mark.django_db
def test_youtube_url_accepted(authed_client):
    url = reverse('user-profile')
    data = {'video_intro_url': 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'}
    response = authed_client.client.patch(url, data, format='json')
    assert response.status_code == 200
    assert response.data['video_intro_url'] == data['video_intro_url']


@pytest.mark.django_db
def test_vimeo_url_accepted(authed_client):
    url = reverse('user-profile')
    data = {'video_intro_url': 'https://vimeo.com/123456789'}
    response = authed_client.client.patch(url, data, format='json')
    assert response.status_code == 200
    assert response.data['video_intro_url'] == data['video_intro_url']


@pytest.mark.django_db
def test_https_url_accepted(authed_client):
    url = reverse('user-profile')
    response = authed_client.client.patch(url, {'video_intro_url': 'https://example.com/video.mp4'}, format='json')
    assert response.status_code == 200


@pytest.mark.django_db
def test_show_history_can_be_updated(authed_client):
    url = reverse('user-profile')

    response = authed_client.client.patch(url, {'show_history': False}, format='json')
    assert response.status_code == 200
    assert not response.data['show_history']

    authed_client.user.refresh_from_db()
    assert not authed_client.user.show_history

    response = authed_client.client.patch(url, {'show_history': True}, format='json')
    assert response.status_code == 200
    assert response.data['show_history']


@pytest.mark.django_db
def test_show_history_included_in_profile_response(authed_client):
    url = reverse('user-profile')
    response = authed_client.client.get(url)
    assert response.status_code == 200
    assert 'show_history' in response.data
