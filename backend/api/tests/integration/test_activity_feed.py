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

    def test_handshake_complete_emits_celebration_event(self):
        from api.models import ActivityEvent, Handshake

        owner = UserFactory()
        viewer = UserFactory()
        svc = ServiceFactory(user=owner, type='Offer', status='Active')
        hs = HandshakeFactory(service=svc, requester=viewer, status='accepted')
        hs = Handshake.objects.get(pk=hs.pk)
        hs.status = 'completed'
        hs.save()
        assert ActivityEvent.objects.filter(
            actor=viewer,
            verb=ActivityEvent.HANDSHAKE_COMPLETED,
            service=svc,
            target_user=owner,
        ).exists()

    def test_event_filling_up_fires_once_at_threshold(self):
        from api.models import ActivityEvent, Handshake

        organizer = UserFactory()
        # Event with 5 max participants -> threshold trips at 4 (>= 0.8 * 5).
        event = ServiceFactory(
            user=organizer, type='Event', status='Active', max_participants=5,
        )

        # 3 accepted participants -- below threshold.
        for _ in range(3):
            HandshakeFactory(service=event, status='accepted')
        assert not ActivityEvent.objects.filter(
            service=event, verb=ActivityEvent.EVENT_FILLING_UP,
        ).exists()

        # 4th accepted -- should trip.
        HandshakeFactory(service=event, status='accepted')
        assert ActivityEvent.objects.filter(
            service=event, verb=ActivityEvent.EVENT_FILLING_UP,
        ).count() == 1

        # 5th accepted -- already fired, idempotency holds.
        HandshakeFactory(service=event, status='accepted')
        assert ActivityEvent.objects.filter(
            service=event, verb=ActivityEvent.EVENT_FILLING_UP,
        ).count() == 1

    def test_new_neighbor_event_fires_when_user_finishes_onboarding(self):
        from api.models import ActivityEvent

        # UserFactory may or may not set is_onboarded -- force the transition.
        u = UserFactory(is_onboarded=False)
        assert not ActivityEvent.objects.filter(
            actor=u, verb=ActivityEvent.NEW_NEIGHBOR,
        ).exists()
        u.is_onboarded = True
        u.save()
        assert ActivityEvent.objects.filter(
            actor=u, verb=ActivityEvent.NEW_NEIGHBOR,
        ).count() == 1
        # Saving again does not double-emit.
        u.save()
        assert ActivityEvent.objects.filter(
            actor=u, verb=ActivityEvent.NEW_NEIGHBOR,
        ).count() == 1


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

    def test_sort_nearby_orders_by_distance_and_caps_at_12(self):
        from decimal import Decimal as D

        viewer = UserFactory()
        # Five service authors, each posting at increasing distance from (0,0).
        for i, dist in enumerate([0.001, 0.005, 0.01, 0.05, 0.1]):
            owner = UserFactory()
            ServiceFactory(
                user=owner, type='Offer', status='Active',
                location_lat=D(str(dist)), location_lng=D('0.0'),
            )

        client = APIClient()
        client.force_authenticate(user=viewer)
        resp = client.get('/api/activity/feed/?lat=0.0&lng=0.0&sort=nearby')
        assert resp.status_code == 200
        results = resp.json()['results']
        assert len(results) <= 12
        # Distances should be monotonically increasing.
        distances = [row['distance_km'] for row in results if row['distance_km'] is not None]
        assert distances == sorted(distances)

    def test_event_capacity_pct_populated_on_event_filling_up_card(self):
        from api.models import ActivityEvent

        organizer = UserFactory()
        viewer = UserFactory()
        # Make viewer follow organizer so the event_filling_up card is
        # included in the feed regardless of location.
        from api.models import UserFollow
        UserFollow.objects.create(follower=viewer, following=organizer)

        event = ServiceFactory(
            user=organizer, type='Event', status='Active', max_participants=5,
        )
        for _ in range(4):
            HandshakeFactory(service=event, status='accepted')

        client = APIClient()
        client.force_authenticate(user=viewer)
        resp = client.get('/api/activity/feed/')
        assert resp.status_code == 200
        rows = [
            r for r in resp.json()['results']
            if r['verb'] == ActivityEvent.EVENT_FILLING_UP
        ]
        assert len(rows) == 1
        assert rows[0]['event_capacity_pct'] == 80.0

    def test_handshake_duration_hours_populated_on_completed_card(self):
        from api.models import ActivityEvent, Handshake, UserFollow

        owner = UserFactory()
        viewer = UserFactory()
        actor = UserFactory()
        UserFollow.objects.create(follower=viewer, following=actor)

        svc = ServiceFactory(user=owner, type='Offer', status='Active')
        hs = HandshakeFactory(
            service=svc, requester=actor, status='accepted',
            provisioned_hours=2.5,
        )
        hs = Handshake.objects.get(pk=hs.pk)
        hs.status = 'completed'
        hs.save()

        client = APIClient()
        client.force_authenticate(user=viewer)
        resp = client.get('/api/activity/feed/')
        rows = [
            r for r in resp.json()['results']
            if r['verb'] == ActivityEvent.HANDSHAKE_COMPLETED
        ]
        assert len(rows) >= 1
        assert rows[0]['handshake_duration_hours'] == 2.5

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
