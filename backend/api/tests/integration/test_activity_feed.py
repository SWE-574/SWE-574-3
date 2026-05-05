"""Integration tests for the activity feed (#482).

Producer signals fire on Service create, Handshake accept, and UserFollow
create. The /api/activity/feed/ endpoint returns events from followed
actors plus actors near the viewer's lat/lng.
"""
from datetime import timedelta

import pytest
from django.contrib.gis.geos import Point
from django.utils import timezone
from rest_framework.test import APIClient

from api.tests.helpers.factories import (
    HandshakeFactory,
    ServiceFactory,
    UserFactory,
)


@pytest.mark.django_db
@pytest.mark.integration
class TestActivityProducers:
    def test_service_create_emits_event(self):
        from api.models import ActivityEvent

        owner = UserFactory()
        svc = ServiceFactory(user=owner, type='Offer', status='Active', is_visible=True)
        assert ActivityEvent.objects.filter(
            actor=owner, verb=ActivityEvent.SERVICE_CREATED, service=svc,
        ).exists()

    def test_hidden_service_emits_no_event(self):
        from api.models import ActivityEvent

        owner = UserFactory()
        ServiceFactory(user=owner, type='Offer', status='Active', is_visible=False)
        assert not ActivityEvent.objects.filter(
            verb=ActivityEvent.SERVICE_CREATED,
        ).exists()

    def test_handshake_accept_emits_event(self):
        from api.models import ActivityEvent, Handshake

        owner = UserFactory()
        viewer = UserFactory()
        svc = ServiceFactory(user=owner, type='Offer', status='Active')
        hs = HandshakeFactory(service=svc, requester=viewer, status='pending')
        # Reload to set _status_changed=False initially.
        hs = Handshake.objects.get(pk=hs.pk)
        hs.status = 'accepted'
        hs.save()
        assert ActivityEvent.objects.filter(
            actor=viewer,
            verb=ActivityEvent.HANDSHAKE_ACCEPTED,
            service=svc,
            target_user=owner,
        ).exists()

    def test_user_follow_emits_event(self):
        from api.models import ActivityEvent, UserFollow

        a = UserFactory()
        b = UserFactory()
        UserFollow.objects.create(follower=a, following=b)
        assert ActivityEvent.objects.filter(
            actor=a, verb=ActivityEvent.USER_FOLLOWED, target_user=b,
        ).exists()


@pytest.mark.django_db
@pytest.mark.integration
class TestActivityFeedEndpoint:
    def test_anonymous_returns_401(self):
        client = APIClient()
        resp = client.get('/api/activity/feed/')
        assert resp.status_code == 401

    def test_returns_events_from_followed_users(self):
        from api.models import UserFollow

        viewer = UserFactory()
        followed = UserFactory()
        stranger = UserFactory()
        UserFollow.objects.create(follower=viewer, following=followed)

        # followed posts a service -> event
        ServiceFactory(user=followed, type='Offer', status='Active')
        # stranger posts a service -> event but viewer doesn't follow
        ServiceFactory(user=stranger, type='Offer', status='Active')

        client = APIClient()
        client.force_authenticate(user=viewer)
        resp = client.get('/api/activity/feed/')

        assert resp.status_code == 200
        data = resp.json()
        actors = {row['actor']['id'] for row in data['results']}
        assert str(followed.id) in actors
        assert str(stranger.id) not in actors

    def test_returns_nearby_events_when_viewer_passes_lat_lng(self):
        viewer = UserFactory()
        nearby_owner = UserFactory()
        far_owner = UserFactory()

        from decimal import Decimal as D
        # Nearby service ~110m north of (0, 0)
        ServiceFactory(
            user=nearby_owner, type='Offer', status='Active',
            location_lat=D('0.001'), location_lng=D('0.0'),
        )
        # Far service ~200km north
        ServiceFactory(
            user=far_owner, type='Offer', status='Active',
            location_lat=D('1.8'), location_lng=D('0.0'),
        )

        client = APIClient()
        client.force_authenticate(user=viewer)
        resp = client.get('/api/activity/feed/?lat=0.0&lng=0.0')

        assert resp.status_code == 200
        actors = {row['actor']['id'] for row in resp.json()['results']}
        assert str(nearby_owner.id) in actors
        assert str(far_owner.id) not in actors

    def test_excludes_viewer_own_events(self):
        from api.models import UserFollow

        viewer = UserFactory()
        followed = UserFactory()
        UserFollow.objects.create(follower=viewer, following=followed)
        # Viewer posts a service -> event but should not appear in own feed
        ServiceFactory(user=viewer, type='Offer', status='Active')
        ServiceFactory(user=followed, type='Offer', status='Active')

        client = APIClient()
        client.force_authenticate(user=viewer)
        resp = client.get('/api/activity/feed/')
        actors = {row['actor']['id'] for row in resp.json()['results']}
        assert str(viewer.id) not in actors

    def test_days_param_bounds_window(self):
        from api.models import ActivityEvent, UserFollow

        viewer = UserFactory()
        followed = UserFactory()
        UserFollow.objects.create(follower=viewer, following=followed)
        old_event = ActivityEvent.objects.create(
            actor=followed, verb=ActivityEvent.SERVICE_CREATED,
        )
        ActivityEvent.objects.filter(pk=old_event.pk).update(
            created_at=timezone.now() - timedelta(days=30),
        )

        client = APIClient()
        client.force_authenticate(user=viewer)
        resp_recent = client.get('/api/activity/feed/?days=7')
        ids_recent = {row['id'] for row in resp_recent.json()['results']}
        assert old_event.id not in ids_recent

        resp_long = client.get('/api/activity/feed/?days=60')
        ids_long = {row['id'] for row in resp_long.json()['results']}
        assert old_event.id in ids_long
