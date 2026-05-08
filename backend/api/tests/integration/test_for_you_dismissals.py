"""Integration tests: dismissed services are excluded from the For You feed.

A user clicking 'Not interested' on a service should never see it again in
their personalised feed, but other viewers should remain unaffected and the
service should still appear in unranked browse listings.
"""
import pytest
from rest_framework.test import APIClient

from api.tests.helpers.factories import ServiceFactory, UserFactory
from api.tests.helpers.assertions import assert_api_response, assert_problem_detail


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
class TestForYouDismissals:
    def test_dismissed_service_is_excluded_for_dismisser(self):
        from api.models import ServiceDismissal

        viewer, tag = _onboarded_with_skill()
        owner = UserFactory()
        svc = ServiceFactory(user=owner, type='Offer', status='Active')
        svc.tags.add(tag)
        ServiceDismissal.objects.create(viewer=viewer, service=svc)

        client = APIClient()
        client.force_authenticate(user=viewer)
        resp = client.get('/api/services/?sort=for_you')

        assert_api_response(resp, 200)
        ids = {row['id'] for row in resp.json()['results']}
        assert str(svc.id) not in ids

    def test_dismissal_is_per_viewer_only(self):
        from api.models import ServiceDismissal

        viewer_a, tag = _onboarded_with_skill('Q1')
        viewer_b, _ = _onboarded_with_skill('Q2')
        viewer_b.skills.add(tag)
        owner = UserFactory()
        svc = ServiceFactory(user=owner, type='Offer', status='Active')
        svc.tags.add(tag)
        ServiceDismissal.objects.create(viewer=viewer_a, service=svc)

        client_b = APIClient()
        client_b.force_authenticate(user=viewer_b)
        resp = client_b.get('/api/services/?sort=for_you')

        ids = {row['id'] for row in resp.json()['results']}
        assert str(svc.id) in ids, (
            'Dismissal by viewer_a should not affect viewer_b'
        )

    def test_dismissed_service_still_visible_in_unranked_list(self):
        from api.models import ServiceDismissal

        viewer, tag = _onboarded_with_skill()
        owner = UserFactory()
        svc = ServiceFactory(user=owner, type='Offer', status='Active')
        svc.tags.add(tag)
        ServiceDismissal.objects.create(viewer=viewer, service=svc)

        client = APIClient()
        client.force_authenticate(user=viewer)
        # Default sort (no for_you): dismissal must NOT hide the service.
        resp = client.get('/api/services/')
        ids = {row['id'] for row in resp.json()['results']}
        assert str(svc.id) in ids

    def test_undismiss_reinstates_service_in_for_you(self):
        viewer, tag = _onboarded_with_skill()
        owner = UserFactory()
        svc = ServiceFactory(user=owner, type='Offer', status='Active')
        svc.tags.add(tag)

        client = APIClient()
        client.force_authenticate(user=viewer)
        client.post(f'/api/services/{svc.id}/dismiss/')
        resp_after = client.get('/api/services/?sort=for_you')
        assert str(svc.id) not in {r['id'] for r in resp_after.json()['results']}

        client.delete(f'/api/services/{svc.id}/dismiss/')
        resp_undo = client.get('/api/services/?sort=for_you')
        assert str(svc.id) in {r['id'] for r in resp_undo.json()['results']}
