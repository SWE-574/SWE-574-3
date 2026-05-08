"""Integration tests for the For You feed endpoint and CTR proxy (#481)."""
from datetime import timedelta

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from api.tests.helpers.factories import (
    EndorsementFactory,
    HandshakeFactory,
    SavedServiceFactory,
    ServiceDismissalFactory,
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
            'engagement', 'dismissed_similarity',
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
        # Top-level note documents what `count` actually represents so admins
        # don't read it as user-count or page-view-count.
        assert 'note' in body
        assert 'count' in body['note']
        assert 'unique_viewers' in body['note']
        # Today's live rows should include both kinds
        kinds = {row['kind'] for row in body['rows']}
        assert 'impression' in kinds
        assert 'click' in kinds
        # Each row exposes both raw count and a distinct-viewer count.
        for row in body['rows']:
            assert 'count' in row
            assert 'unique_viewers' in row
            assert row['unique_viewers'] <= row['count']

    def test_non_admin_blocked(self):
        viewer = UserFactory()
        client = APIClient()
        client.force_authenticate(user=viewer)
        resp = client.get('/api/services/for-you-metrics/?days=7')
        assert resp.status_code == 403


@pytest.mark.django_db
@pytest.mark.integration
class TestForYouEngagementSignals:
    """Round 3 — saves are a positive signal, dismissals are a soft negative
    signal, endorsements are deliberately *not* an engagement input.
    """
    def _signals_for(self, results, service_id):
        for row in results:
            if row['id'] == str(service_id):
                return row['for_you_signals']
        return None

    def test_saved_service_boosts_similar_candidates(self):
        viewer, skill_tag = _onboarded_with_skill('Q_seed')
        cooking = _make_tag('Q_cooking')

        # The viewer has saved a cooking-tagged service in the past.
        already_saved = ServiceFactory(type='Offer', status='Active')
        already_saved.tags.add(cooking)
        SavedServiceFactory(user=viewer, service=already_saved)

        # Two fresh candidates: one cooking-tagged, one unrelated.
        cooking_candidate = ServiceFactory(type='Offer', status='Active')
        cooking_candidate.tags.add(skill_tag, cooking)
        neutral_candidate = ServiceFactory(type='Offer', status='Active')
        neutral_candidate.tags.add(skill_tag)

        client = APIClient()
        client.force_authenticate(user=viewer)
        resp = client.get('/api/services/?sort=for_you')
        assert resp.status_code == 200
        results = resp.json()['results']
        cooking_signals = self._signals_for(results, cooking_candidate.id)
        neutral_signals = self._signals_for(results, neutral_candidate.id)
        assert cooking_signals is not None
        assert neutral_signals is not None
        # Cooking candidate shares the saved tag set; neutral does not.
        assert cooking_signals['engagement'] > neutral_signals['engagement']

    def test_endorsement_does_not_boost_for_engagement(self):
        viewer, skill_tag = _onboarded_with_skill('Q_seed')
        cooking = _make_tag('Q_cooking')

        # The viewer endorsed a cooking-tagged service. Endorsements are a
        # public quality signal, deliberately excluded from the personal
        # engagement signal.
        endorsed = ServiceFactory(type='Offer', status='Active')
        endorsed.tags.add(cooking)
        EndorsementFactory(endorser=viewer, service=endorsed)

        # Two fresh candidates as before.
        cooking_candidate = ServiceFactory(type='Offer', status='Active')
        cooking_candidate.tags.add(skill_tag, cooking)
        neutral_candidate = ServiceFactory(type='Offer', status='Active')
        neutral_candidate.tags.add(skill_tag)

        client = APIClient()
        client.force_authenticate(user=viewer)
        resp = client.get('/api/services/?sort=for_you')
        assert resp.status_code == 200
        results = resp.json()['results']
        cooking_signals = self._signals_for(results, cooking_candidate.id)
        neutral_signals = self._signals_for(results, neutral_candidate.id)
        # Endorsement must NOT lift engagement — both should read 0.0.
        assert cooking_signals['engagement'] == 0.0
        assert neutral_signals['engagement'] == 0.0

    def test_dismissed_service_penalises_similar_candidates(self):
        viewer, skill_tag = _onboarded_with_skill('Q_seed')
        cooking = _make_tag('Q_cooking')

        # The viewer dismissed a cooking-tagged service.
        dismissed = ServiceFactory(type='Offer', status='Active')
        dismissed.tags.add(cooking)
        ServiceDismissalFactory(viewer=viewer, service=dismissed)

        cooking_candidate = ServiceFactory(type='Offer', status='Active')
        cooking_candidate.tags.add(skill_tag, cooking)
        neutral_candidate = ServiceFactory(type='Offer', status='Active')
        neutral_candidate.tags.add(skill_tag)

        client = APIClient()
        client.force_authenticate(user=viewer)
        resp = client.get('/api/services/?sort=for_you')
        assert resp.status_code == 200
        results = resp.json()['results']
        cooking_signals = self._signals_for(results, cooking_candidate.id)
        neutral_signals = self._signals_for(results, neutral_candidate.id)
        assert cooking_signals is not None
        assert neutral_signals is not None
        # Cooking candidate shares the dismissed tag set; the dismissed
        # similarity score reflects that. Neutral candidate is unaffected.
        assert cooking_signals['dismissed_similarity'] > neutral_signals['dismissed_similarity']

    def test_mmr_top_results_are_diverse(self):
        from django.test import override_settings

        viewer, skill_tag = _onboarded_with_skill('Q_seed')
        common = _make_tag('Q_common')
        outlier_tag = _make_tag('Q_outlier')

        # Six services share the common tag (and the viewer's skill).
        for _ in range(6):
            svc = ServiceFactory(type='Offer', status='Active')
            svc.tags.add(skill_tag, common)

        # One outlier with a different secondary tag.
        outlier = ServiceFactory(type='Offer', status='Active')
        outlier.tags.add(skill_tag, outlier_tag)

        client = APIClient()
        client.force_authenticate(user=viewer)
        with override_settings(
            RANKING_FOR_YOU_MMR_LAMBDA=0.6, RANKING_FOR_YOU_MMR_TOP_K=10,
            RANKING_FOR_YOU_LIMIT=4,
        ):
            resp = client.get('/api/services/?sort=for_you')
        assert resp.status_code == 200
        results = resp.json()['results']
        # The outlier should land in the top-4 because MMR penalises the
        # near-duplicates of the common-tagged services.
        top_ids = {row['id'] for row in results[:4]}
        assert str(outlier.id) in top_ids
