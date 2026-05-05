"""Integration tests for the For You feed endpoint and CTR proxy (#481)."""
from datetime import timedelta

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from api.tests.helpers.factories import (
    HandshakeFactory,
    ServiceFactory,
    UserFactory,
)


def _make_tag(qid):
    from api.models import Tag

    return Tag.objects.create(id=qid, name=qid)


def _onboarded_with_skill(qid='Q1'):
    tag = _make_tag(qid)
    user = UserFactory(is_onboarded=True)
    user.skills.add(tag)
    return user, tag


@pytest.mark.django_db
@pytest.mark.integration
class TestForYouFeedEndpoint:
    def test_returns_results_with_for_you_signals(self):
        viewer, tag = _onboarded_with_skill()
        owner = UserFactory()
        svc = ServiceFactory(user=owner, type='Offer', status='Active')
        svc.tags.add(tag)

        client = APIClient()
        client.force_authenticate(user=viewer)
        resp = client.get('/api/services/?sort=for_you')

        assert resp.status_code == 200
        data = resp.json()
        results = data['results']
        assert len(results) >= 1
        assert results[0]['source'] == 'for_you'
        assert 'for_you_signals' in results[0]
        signals = results[0]['for_you_signals']
        assert set(signals.keys()) == {
            'tag', 'follow', 'cooccur', 'recency_penalty',
        }

    def test_anonymous_viewer_gets_empty_for_you(self):
        ServiceFactory(type='Offer', status='Active')
        client = APIClient()
        resp = client.get('/api/services/?sort=for_you')
        assert resp.status_code == 200
        assert resp.json()['results'] == []

    def test_not_onboarded_viewer_gets_empty_for_you(self):
        viewer = UserFactory(is_onboarded=False)
        ServiceFactory(type='Offer', status='Active')
        client = APIClient()
        client.force_authenticate(user=viewer)
        resp = client.get('/api/services/?sort=for_you')
        assert resp.status_code == 200
        assert resp.json()['results'] == []

    def test_onboarded_without_skills_gets_empty_for_you(self):
        viewer = UserFactory(is_onboarded=True)
        ServiceFactory(type='Offer', status='Active')
        client = APIClient()
        client.force_authenticate(user=viewer)
        resp = client.get('/api/services/?sort=for_you')
        assert resp.status_code == 200
        assert resp.json()['results'] == []

    def test_impressions_logged_on_for_you_response(self):
        from api.models import ForYouEvent

        viewer, tag = _onboarded_with_skill()
        owner = UserFactory()
        svc = ServiceFactory(user=owner, type='Offer', status='Active')
        svc.tags.add(tag)

        client = APIClient()
        client.force_authenticate(user=viewer)
        client.get('/api/services/?sort=for_you')

        assert ForYouEvent.objects.filter(
            viewer=viewer, service=svc,
            kind=ForYouEvent.IMPRESSION, source=ForYouEvent.SOURCE_FOR_YOU,
        ).exists()


@pytest.mark.django_db
@pytest.mark.integration
class TestForYouClickAttribution:
    def test_from_for_you_logs_click_event(self):
        from api.models import ForYouEvent

        viewer = UserFactory()
        svc = ServiceFactory(type='Offer', status='Active')
        client = APIClient()
        client.force_authenticate(user=viewer)
        resp = client.get(f'/api/services/{svc.id}/?from=for_you')
        assert resp.status_code == 200
        assert ForYouEvent.objects.filter(
            viewer=viewer, service=svc,
            kind=ForYouEvent.CLICK, source=ForYouEvent.SOURCE_FOR_YOU,
        ).exists()

    def test_from_hot_logs_click_event(self):
        from api.models import ForYouEvent

        viewer = UserFactory()
        svc = ServiceFactory(type='Offer', status='Active')
        client = APIClient()
        client.force_authenticate(user=viewer)
        client.get(f'/api/services/{svc.id}/?from=hot')
        assert ForYouEvent.objects.filter(
            viewer=viewer, service=svc,
            kind=ForYouEvent.CLICK, source=ForYouEvent.SOURCE_HOT,
        ).exists()

    def test_no_from_param_logs_no_click_event(self):
        from api.models import ForYouEvent

        viewer = UserFactory()
        svc = ServiceFactory(type='Offer', status='Active')
        client = APIClient()
        client.force_authenticate(user=viewer)
        client.get(f'/api/services/{svc.id}/')
        assert not ForYouEvent.objects.filter(
            viewer=viewer, service=svc,
        ).exists()


@pytest.mark.django_db
@pytest.mark.integration
class TestHandshakeAttributionSignal:
    def test_handshake_after_for_you_click_emits_handshake_event(self):
        from api.models import ForYouEvent

        viewer = UserFactory()
        owner = UserFactory()
        svc = ServiceFactory(user=owner, type='Offer', status='Active')

        client = APIClient()
        client.force_authenticate(user=viewer)
        # First click via the For You path
        client.get(f'/api/services/{svc.id}/?from=for_you')
        # Then create a handshake via the factory (signal fires on post_save)
        HandshakeFactory(service=svc, requester=viewer, status='pending')

        assert ForYouEvent.objects.filter(
            viewer=viewer, service=svc,
            kind=ForYouEvent.HANDSHAKE, source=ForYouEvent.SOURCE_FOR_YOU,
        ).exists()

    def test_handshake_without_recent_click_does_not_emit(self):
        from api.models import ForYouEvent

        viewer = UserFactory()
        owner = UserFactory()
        svc = ServiceFactory(user=owner, type='Offer', status='Active')
        # No click event recorded
        HandshakeFactory(service=svc, requester=viewer, status='pending')
        assert not ForYouEvent.objects.filter(
            kind=ForYouEvent.HANDSHAKE,
        ).exists()


@pytest.mark.django_db
@pytest.mark.integration
class TestForYouMetricsEndpoint:
    def test_admin_can_read_metrics(self):
        from api.models import ForYouEvent
        from api.tests.helpers.factories import AdminUserFactory

        admin = AdminUserFactory()
        viewer = UserFactory()
        svc = ServiceFactory(type='Offer', status='Active')
        ForYouEvent.objects.create(
            service=svc, viewer=viewer,
            kind=ForYouEvent.IMPRESSION, source=ForYouEvent.SOURCE_FOR_YOU,
        )
        ForYouEvent.objects.create(
            service=svc, viewer=viewer,
            kind=ForYouEvent.CLICK, source=ForYouEvent.SOURCE_FOR_YOU,
        )

        client = APIClient()
        client.force_authenticate(user=admin)
        resp = client.get('/api/services/for-you-metrics/?days=7')
        assert resp.status_code == 200
        body = resp.json()
        assert body['days'] == 7
        # Today's live rows should include both kinds
        kinds = {row['kind'] for row in body['rows']}
        assert 'impression' in kinds
        assert 'click' in kinds

    def test_non_admin_blocked(self):
        viewer = UserFactory()
        client = APIClient()
        client.force_authenticate(user=viewer)
        resp = client.get('/api/services/for-you-metrics/?days=7')
        assert resp.status_code == 403
