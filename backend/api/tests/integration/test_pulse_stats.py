"""Integration tests for Pulse stats and visit-tracking endpoints."""
from datetime import timedelta

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from api.tests.helpers.factories import (
    HandshakeFactory,
    ServiceFactory,
    UserFactory,
)
from api.tests.helpers.assertions import assert_api_response, assert_problem_detail


def _make_tag(qid):
    from api.models import Tag

    return Tag.objects.create(id=qid, name=qid)


@pytest.mark.django_db
@pytest.mark.integration
class TestPulseVisit:
    def test_post_updates_last_pulse_visit_at(self):
        viewer = UserFactory()
        assert viewer.last_pulse_visit_at is None
        client = APIClient()
        client.force_authenticate(user=viewer)

        before = timezone.now()
        resp = client.post('/api/pulse/visit/')
        assert_api_response(resp, 200)

        viewer.refresh_from_db(fields=['last_pulse_visit_at'])
        assert viewer.last_pulse_visit_at is not None
        assert viewer.last_pulse_visit_at >= before

    def test_anonymous_blocked(self):
        resp = APIClient().post('/api/pulse/visit/')
        assert_problem_detail(resp, 401)


@pytest.mark.django_db
@pytest.mark.integration
class TestPulseStats:
    def test_anonymous_blocked(self):
        resp = APIClient().get('/api/pulse/stats/')
        assert_problem_detail(resp, 401)

    def test_returns_expected_shape(self):
        viewer = UserFactory()
        client = APIClient()
        client.force_authenticate(user=viewer)
        resp = client.get('/api/pulse/stats/')
        assert_api_response(resp, 200)
        body = resp.json()
        assert set(body.keys()) == {
            'new_since_last_visit', 'saved_count', 'follow_handshakes_week',
        }
        assert body['new_since_last_visit'] == 0
        assert body['saved_count'] == 0
        assert body['follow_handshakes_week'] == 0

    def test_saved_count_counts_only_my_saves(self):
        from api.models import SavedService

        viewer = UserFactory()
        other = UserFactory()
        svc1 = ServiceFactory(type='Offer', status='Active')
        svc2 = ServiceFactory(type='Offer', status='Active')
        SavedService.objects.create(user=viewer, service=svc1)
        SavedService.objects.create(user=other, service=svc2)

        client = APIClient()
        client.force_authenticate(user=viewer)
        body = client.get('/api/pulse/stats/').json()
        assert body['saved_count'] == 1

    def test_new_since_last_visit_counts_skill_matches_after_visit(self):
        tag = _make_tag('Q42')
        viewer = UserFactory(is_onboarded=True)
        viewer.skills.add(tag)
        viewer.last_pulse_visit_at = timezone.now() - timedelta(hours=1)
        viewer.save(update_fields=['last_pulse_visit_at'])

        # Service posted before visit — should NOT count.
        old = ServiceFactory(type='Offer', status='Active')
        old.tags.add(tag)
        # Force its created_at into the past, before last_pulse_visit_at.
        from api.models import Service
        Service.objects.filter(pk=old.pk).update(
            created_at=viewer.last_pulse_visit_at - timedelta(hours=1),
        )

        # Service posted after last visit — counts.
        fresh = ServiceFactory(type='Offer', status='Active')
        fresh.tags.add(tag)

        client = APIClient()
        client.force_authenticate(user=viewer)
        body = client.get('/api/pulse/stats/').json()
        assert body['new_since_last_visit'] == 1

    def test_new_since_last_visit_excludes_own_services(self):
        tag = _make_tag('Q43')
        viewer = UserFactory(is_onboarded=True)
        viewer.skills.add(tag)
        viewer.last_pulse_visit_at = timezone.now() - timedelta(hours=1)
        viewer.save(update_fields=['last_pulse_visit_at'])

        own = ServiceFactory(user=viewer, type='Offer', status='Active')
        own.tags.add(tag)

        client = APIClient()
        client.force_authenticate(user=viewer)
        body = client.get('/api/pulse/stats/').json()
        assert body['new_since_last_visit'] == 0

    def test_follow_handshakes_week_counts_follow_actor_handshakes(self):
        """Counts handshake-accepted/completed events from people the viewer
        follows in the past 7 days. Counted whether the followed user is the
        requester (actor) or the service owner."""
        from api.models import ActivityEvent, UserFollow

        viewer = UserFactory()
        partner = UserFactory()
        followed = UserFactory()
        UserFollow.objects.create(follower=viewer, following=followed)

        # Two events: one where 'followed' is the actor (requester), one
        # where 'followed' is the service owner.
        svc_a = ServiceFactory(user=followed, type='Offer', status='Active')
        svc_b = ServiceFactory(user=partner, type='Offer', status='Active')
        ActivityEvent.objects.create(
            actor=partner, verb=ActivityEvent.HANDSHAKE_ACCEPTED, service=svc_a,
            target_user=followed,
        )
        ActivityEvent.objects.create(
            actor=followed, verb=ActivityEvent.HANDSHAKE_COMPLETED, service=svc_b,
            target_user=partner,
        )

        client = APIClient()
        client.force_authenticate(user=viewer)
        body = client.get('/api/pulse/stats/').json()
        assert body['follow_handshakes_week'] == 2

    def test_follow_handshakes_week_excludes_unrelated_handshakes(self):
        from api.models import ActivityEvent, UserFollow

        viewer = UserFactory()
        followed = UserFactory()
        stranger_a = UserFactory()
        stranger_b = UserFactory()
        UserFollow.objects.create(follower=viewer, following=followed)

        svc = ServiceFactory(user=stranger_a, type='Offer', status='Active')
        # Handshake event between two strangers; 'followed' is neither actor
        # nor service owner.
        ActivityEvent.objects.create(
            actor=stranger_b, verb=ActivityEvent.HANDSHAKE_ACCEPTED, service=svc,
            target_user=stranger_a,
        )

        client = APIClient()
        client.force_authenticate(user=viewer)
        body = client.get('/api/pulse/stats/').json()
        assert body['follow_handshakes_week'] == 0
