"""Tests for onboarding tag fallback to the explore pool (issue #478).

When an onboarded user with declared skills hits the recommendation feed and
fewer than RANKING_ONBOARDING_MIN_RESULTS services match those skills, the
feed should keep the matches at the top and top up the tail with services
from the existing Phase 3 explore pool (cold start, undershown quality,
stale recurring). Each service in the response carries a source field of
either tag_match or explore_topup so the UI can label them. Anonymous and
not yet onboarded users see no behavior change.
"""
from datetime import timedelta

import pytest
from django.test import override_settings
from django.utils import timezone

from api.tests.helpers.factories import (
    HandshakeFactory,
    ReputationRepFactory,
    ServiceFactory,
    UserFactory,
)


def _make_tag(tag_id, name=None):
    from api.models import Tag

    return Tag.objects.create(id=tag_id, name=name or tag_id)


def _make_request(user, params):
    from rest_framework.request import Request
    from rest_framework.test import APIRequestFactory

    factory = APIRequestFactory()
    django_request = factory.get('/api/services/', params)
    request = Request(django_request)
    request.user = user
    return request


@pytest.mark.django_db
@pytest.mark.unit
class TestOnboardingFallback:
    def _onboarded_with_skill(self, tag_id='Q1'):
        tag = _make_tag(tag_id)
        user = UserFactory(
            date_joined=timezone.now() - timedelta(days=200), is_onboarded=True,
        )
        user.skills.add(tag)
        return user, tag

    def _service_with_tag(self, owner, tag, hot_score=1.0):
        from api.models import Service

        svc = ServiceFactory(
            user=owner, type='Offer', status='Active',
        )
        svc.tags.add(tag)
        Service.objects.filter(pk=svc.id).update(hot_score=hot_score)
        svc.refresh_from_db()
        return svc

    def _cold_start_service(self, hot_score=2.0):
        """A service whose owner has no completed handshakes (cold start pool)."""
        from api.models import Service

        owner = UserFactory(date_joined=timezone.now() - timedelta(days=200))
        svc = ServiceFactory(user=owner, type='Offer', status='Active')
        Service.objects.filter(pk=svc.id).update(hot_score=hot_score)
        svc.refresh_from_db()
        return svc

    def test_low_yield_triggers_topup_with_source_field(self):
        """Two skill matches plus a threshold of 5 should yield 5 items
        with the first two as tag_match and the rest as explore_topup."""
        from api.views import ServiceViewSet

        viewer, tag = self._onboarded_with_skill()
        owner = UserFactory(date_joined=timezone.now() - timedelta(days=200))
        match_a = self._service_with_tag(owner, tag, hot_score=2.0)
        match_b = self._service_with_tag(owner, tag, hot_score=1.0)
        # Three cold-start (explore-eligible) services owned by other newcomers
        # whose owners have no completed handshakes.
        topup_1 = self._cold_start_service(hot_score=0.5)
        topup_2 = self._cold_start_service(hot_score=0.4)
        topup_3 = self._cold_start_service(hot_score=0.3)

        request = _make_request(viewer, {'sort': 'hot'})
        viewset = ServiceViewSet()
        viewset.action = 'list'
        viewset.request = request
        with override_settings(RANKING_ONBOARDING_MIN_RESULTS=5):
            qs = viewset.get_queryset()
            results = list(qs)

        # The two matches plus three explore items.
        ids = [s.id for s in results]
        assert match_a.id in ids
        assert match_b.id in ids
        assert topup_1.id in ids or topup_2.id in ids or topup_3.id in ids

        # The two matches must have source=tag_match; explore items source=explore_topup.
        source_by_id = {s.id: getattr(s, 'source', None) for s in results}
        assert source_by_id[match_a.id] == 'tag_match'
        assert source_by_id[match_b.id] == 'tag_match'
        topup_sources = [
            source_by_id[i] for i in ids if i not in {match_a.id, match_b.id}
        ]
        assert topup_sources, 'expected at least one topup item'
        assert all(s == 'explore_topup' for s in topup_sources)

    def test_above_threshold_uses_only_matches(self):
        """When matched services exceed the threshold, no top-up applies and
        every result is a tag match."""
        from api.views import ServiceViewSet

        viewer, tag = self._onboarded_with_skill()
        owner = UserFactory(date_joined=timezone.now() - timedelta(days=200))
        matches = [
            self._service_with_tag(owner, tag, hot_score=1.0 + 0.01 * i)
            for i in range(6)
        ]
        # An unrelated service that should NOT be in the results.
        outside = ServiceFactory(user=owner, type='Offer', status='Active')

        request = _make_request(viewer, {'sort': 'hot'})
        viewset = ServiceViewSet()
        viewset.action = 'list'
        viewset.request = request
        with override_settings(RANKING_ONBOARDING_MIN_RESULTS=5):
            qs = viewset.get_queryset()
            results = list(qs)
            ids = [s.id for s in results]

        for m in matches:
            assert m.id in ids, 'expected matched service in results'
        assert outside.id not in ids
        assert all(getattr(s, 'source', None) == 'tag_match' for s in results)

    def test_anonymous_user_no_behavior_change(self):
        """Anonymous viewers see services without a source annotation."""
        from django.contrib.auth.models import AnonymousUser

        from api.views import ServiceViewSet

        owner = UserFactory(date_joined=timezone.now() - timedelta(days=200))
        ServiceFactory(user=owner, type='Offer', status='Active')

        request = _make_request(AnonymousUser(), {'sort': 'hot'})
        viewset = ServiceViewSet()
        viewset.action = 'list'
        viewset.request = request
        with override_settings(RANKING_ONBOARDING_MIN_RESULTS=5):
            qs = viewset.get_queryset()
            results = list(qs)

        # No source annotation on results for anonymous viewers.
        assert all(getattr(s, 'source', None) is None for s in results)

    def test_not_onboarded_user_no_behavior_change(self):
        from api.views import ServiceViewSet

        viewer = UserFactory(
            date_joined=timezone.now() - timedelta(days=200), is_onboarded=False,
        )
        owner = UserFactory(date_joined=timezone.now() - timedelta(days=200))
        ServiceFactory(user=owner, type='Offer', status='Active')

        request = _make_request(viewer, {'sort': 'hot'})
        viewset = ServiceViewSet()
        viewset.action = 'list'
        viewset.request = request
        with override_settings(RANKING_ONBOARDING_MIN_RESULTS=5):
            qs = viewset.get_queryset()
            results = list(qs)

        assert all(getattr(s, 'source', None) is None for s in results)

    def test_explicit_tag_param_skips_fallback(self):
        """When the user explicitly passes tags=, the fallback does not engage."""
        from api.views import ServiceViewSet

        viewer, tag = self._onboarded_with_skill()
        other_tag = _make_tag('Q99')
        owner = UserFactory(date_joined=timezone.now() - timedelta(days=200))
        svc_with_other_tag = ServiceFactory(
            user=owner, type='Offer', status='Active',
        )
        svc_with_other_tag.tags.add(other_tag)

        request = _make_request(viewer, {'sort': 'hot', 'tags': 'Q99'})
        viewset = ServiceViewSet()
        viewset.action = 'list'
        viewset.request = request
        with override_settings(RANKING_ONBOARDING_MIN_RESULTS=5):
            qs = viewset.get_queryset()
            results = list(qs)

        assert all(getattr(s, 'source', None) is None for s in results)
        assert svc_with_other_tag.id in [s.id for s in results]


@pytest.mark.django_db
@pytest.mark.unit
class TestOnboardingFallbackHelper:
    """Direct tests for the apply_onboarding_fallback helper in api/ranking."""

    def test_returns_unchanged_for_anonymous_or_unonboarded(self):
        from django.contrib.auth.models import AnonymousUser
        from api.models import Service
        from api.ranking import apply_onboarding_fallback

        ServiceFactory(status='Active')
        base = Service.objects.filter(status='Active')

        out_qs, applied = apply_onboarding_fallback(base, AnonymousUser(), 10)
        assert applied is False
        assert list(out_qs) == list(base)

        viewer = UserFactory(is_onboarded=False)
        out_qs, applied = apply_onboarding_fallback(base, viewer, 10)
        assert applied is False
        assert list(out_qs) == list(base)

    def test_returns_unchanged_when_skills_empty(self):
        from api.models import Service
        from api.ranking import apply_onboarding_fallback

        ServiceFactory(status='Active')
        base = Service.objects.filter(status='Active')

        viewer = UserFactory(is_onboarded=True)
        # No skills set on viewer.
        out_qs, applied = apply_onboarding_fallback(base, viewer, 10)
        assert applied is False
        assert list(out_qs) == list(base)
