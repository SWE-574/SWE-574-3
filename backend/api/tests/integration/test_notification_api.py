"""
Integration tests for notification API endpoints
"""
import pytest
from rest_framework import status

from api.tests.helpers.factories import (
    UserFactory, NotificationFactory, ServiceFactory,
    HandshakeFactory, ServiceGroupChatMessageFactory,
)
from api.tests.helpers.test_client import AuthenticatedAPIClient
from api.models import Notification


@pytest.mark.django_db
@pytest.mark.integration
class TestNotificationViewSet:
    """Test NotificationViewSet endpoints."""

    def test_list_notifications(self):
        user = UserFactory()
        NotificationFactory.create_batch(3, user=user)
        # Notification for another user — should not appear
        NotificationFactory()

        client = AuthenticatedAPIClient()
        client.authenticate_user(user)

        response = client.get('/api/notifications/?page=1')
        assert response.status_code == status.HTTP_200_OK
        assert response.data['count'] == 3
        assert len(response.data['results']) == 3

    def test_list_requires_auth(self):
        client = AuthenticatedAPIClient()
        response = client.get('/api/notifications/')
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_retrieve_own_notification(self):
        user = UserFactory()
        notification = NotificationFactory(user=user)

        client = AuthenticatedAPIClient()
        client.authenticate_user(user)

        response = client.get(f'/api/notifications/{notification.id}/')
        assert response.status_code == status.HTTP_200_OK
        assert response.data['id'] == str(notification.id)

    def test_cannot_retrieve_other_users_notification(self):
        user = UserFactory()
        other = UserFactory()
        notification = NotificationFactory(user=other)

        client = AuthenticatedAPIClient()
        client.authenticate_user(user)

        response = client.get(f'/api/notifications/{notification.id}/')
        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_unread_count(self):
        user = UserFactory()
        NotificationFactory.create_batch(2, user=user, is_read=False)
        NotificationFactory(user=user, is_read=True)

        client = AuthenticatedAPIClient()
        client.authenticate_user(user)

        response = client.get('/api/notifications/unread-count/')
        assert response.status_code == status.HTTP_200_OK
        assert response.data['count'] == 2

    def test_mark_single_as_read(self):
        user = UserFactory()
        notification = NotificationFactory(user=user, is_read=False)

        client = AuthenticatedAPIClient()
        client.authenticate_user(user)

        response = client.patch(f'/api/notifications/{notification.id}/read/')
        assert response.status_code == status.HTTP_200_OK
        assert response.data['is_read'] is True

        notification.refresh_from_db()
        assert notification.is_read is True

    def test_mark_all_as_read(self):
        user = UserFactory()
        NotificationFactory.create_batch(3, user=user, is_read=False)

        client = AuthenticatedAPIClient()
        client.authenticate_user(user)

        response = client.post('/api/notifications/read/')
        assert response.status_code == status.HTTP_200_OK

        assert Notification.objects.filter(user=user, is_read=False).count() == 0

    def test_mark_all_does_not_affect_other_user(self):
        user = UserFactory()
        other = UserFactory()
        NotificationFactory(user=user, is_read=False)
        NotificationFactory(user=other, is_read=False)

        client = AuthenticatedAPIClient()
        client.authenticate_user(user)

        client.post('/api/notifications/read/')
        assert Notification.objects.filter(user=other, is_read=False).count() == 1

    def test_list_ordered_newest_first(self):
        user = UserFactory()
        n1 = NotificationFactory(user=user, title='First')
        n2 = NotificationFactory(user=user, title='Second')

        client = AuthenticatedAPIClient()
        client.authenticate_user(user)

        response = client.get('/api/notifications/?page=1')
        ids = [r['id'] for r in response.data['results']]
        assert ids == [str(n2.id), str(n1.id)]

    def test_related_service_type_exposed(self):
        user = UserFactory()
        event_service = ServiceFactory(type='Event')
        offer_service = ServiceFactory(type='Offer')
        n_event = NotificationFactory(user=user, related_service=event_service)
        n_offer = NotificationFactory(user=user, related_service=offer_service)
        n_no_service = NotificationFactory(user=user)

        client = AuthenticatedAPIClient()
        client.authenticate_user(user)

        response = client.get('/api/notifications/?page=1')
        assert response.status_code == status.HTTP_200_OK
        results_by_id = {r['id']: r for r in response.data['results']}

        assert results_by_id[str(n_event.id)]['related_service_type'] == 'Event'
        assert results_by_id[str(n_offer.id)]['related_service_type'] == 'Offer'
        assert results_by_id[str(n_no_service.id)]['related_service_type'] is None


@pytest.mark.django_db(transaction=True)
@pytest.mark.integration
class TestGroupChatNotificationSignal:
    """Test that ServiceGroupChatMessage creates notifications for the right recipients."""

    def _make_service_with_participants(self):
        organizer = UserFactory()
        service = ServiceFactory(user=organizer, type='Offer', schedule_type='One-Time', max_participants=5)
        participant1 = UserFactory()
        participant2 = UserFactory()
        HandshakeFactory(service=service, requester=participant1, status='accepted')
        HandshakeFactory(service=service, requester=participant2, status='accepted')
        return organizer, service, participant1, participant2

    def test_participants_notified_on_group_message(self):
        organizer, service, participant1, participant2 = self._make_service_with_participants()

        ServiceGroupChatMessageFactory(service=service, sender=organizer)

        notified_users = set(Notification.objects.values_list('user_id', flat=True))
        assert participant1.pk in notified_users
        assert participant2.pk in notified_users

    def test_sender_not_notified(self):
        organizer, service, participant1, participant2 = self._make_service_with_participants()

        ServiceGroupChatMessageFactory(service=service, sender=organizer)

        assert not Notification.objects.filter(user=organizer).exists()

    def test_organizer_notified_when_participant_sends(self):
        organizer, service, participant1, participant2 = self._make_service_with_participants()

        ServiceGroupChatMessageFactory(service=service, sender=participant1)

        notified_users = set(Notification.objects.values_list('user_id', flat=True))
        assert organizer.pk in notified_users
        assert participant2.pk in notified_users
        assert participant1.pk not in notified_users

    def test_pending_handshake_not_notified(self):
        organizer = UserFactory()
        service = ServiceFactory(user=organizer, type='Offer', schedule_type='One-Time', max_participants=5)
        active = UserFactory()
        pending = UserFactory()
        HandshakeFactory(service=service, requester=active, status='accepted')
        HandshakeFactory(service=service, requester=pending, status='pending')

        ServiceGroupChatMessageFactory(service=service, sender=organizer)

        notified_users = set(Notification.objects.values_list('user_id', flat=True))
        assert active.pk in notified_users
        assert pending.pk not in notified_users
