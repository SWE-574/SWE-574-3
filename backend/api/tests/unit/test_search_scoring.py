"""
Tests for weighted search scoring (FR-SEA-01).

Phase 2.2 RED tests — these should fail until ScoringStrategy is implemented.
"""
from decimal import Decimal
from types import SimpleNamespace

import pytest

from api.models import Service, Tag, User
from api.search_filters import SearchEngine


@pytest.fixture
def env(db):
    user = User.objects.create_user(
        email='testuser@test.com',
        password='testpass123',
        first_name='Test',
        last_name='User',
        timebank_balance=Decimal('10.00'),
    )

    tag_python = Tag.objects.create(
        id='Q28865', name='Python',
        parent_qid='Q9143', entity_type='technology', depth=1,
    )
    tag_prog_lang = Tag.objects.create(
        id='Q9143', name='Programming language',
        entity_type='technology',
    )
    tag_cooking = Tag.objects.create(
        id='Q25403900', name='Cooking',
        parent_qid='Q2095', entity_type='food', depth=1,
    )

    svc_title_and_tag = Service.objects.create(
        user=user, title='Python Tutoring',
        description='Expert Python help', type='Offer',
        duration=Decimal('2.00'), location_type='Online',
        max_participants=1, schedule_type='One-Time',
    )
    svc_title_and_tag.tags.add(tag_python)

    svc_tag_only = Service.objects.create(
        user=user, title='Programming Help',
        description='Various programming', type='Offer',
        duration=Decimal('2.00'), location_type='Online',
        max_participants=1, schedule_type='One-Time',
    )
    svc_tag_only.tags.add(tag_python)

    svc_desc_only = Service.objects.create(
        user=user, title='Coding Class',
        description='Learn Python and more', type='Offer',
        duration=Decimal('2.00'), location_type='Online',
        max_participants=1, schedule_type='One-Time',
    )

    svc_unrelated = Service.objects.create(
        user=user, title='Cooking Class',
        description='Learn to cook', type='Offer',
        duration=Decimal('3.00'), location_type='In-Person',
        max_participants=5, schedule_type='Recurrent',
    )
    svc_unrelated.tags.add(tag_cooking)

    return SimpleNamespace(
        user=user,
        tag_python=tag_python,
        tag_prog_lang=tag_prog_lang,
        tag_cooking=tag_cooking,
        svc_title_and_tag=svc_title_and_tag,
        svc_tag_only=svc_tag_only,
        svc_desc_only=svc_desc_only,
        svc_unrelated=svc_unrelated,
        engine=SearchEngine(),
    )


@pytest.mark.django_db
def test_title_match_scores_highest(env):
    """Service with search term in title has the highest score."""
    qs = Service.objects.filter(status='Active')
    result = env.engine.search(qs, {'search': 'Python'})
    scored = list(result)

    assert hasattr(scored[0], 'search_score')
    assert scored[0].id == env.svc_title_and_tag.id


@pytest.mark.django_db
def test_tag_id_match_scores_0_8(env):
    """Service with direct tag ID match gets score of 0.8."""
    qs = Service.objects.filter(status='Active')
    result = env.engine.search(qs, {'tag': 'Q28865'})
    scored = {s.id: s.search_score for s in result if hasattr(s, 'search_score')}

    tag_score = scored.get(env.svc_tag_only.id, 0)
    assert tag_score >= 0.8


@pytest.mark.django_db
def test_scores_additive(env):
    """Title + tag match scores higher than tag match alone."""
    qs = Service.objects.filter(status='Active')
    result = env.engine.search(qs, {'search': 'Python'})
    scored = {s.id: s.search_score for s in result if hasattr(s, 'search_score')}

    title_and_tag = scored.get(env.svc_title_and_tag.id, 0)
    tag_only = scored.get(env.svc_tag_only.id, 0)
    assert title_and_tag > tag_only


@pytest.mark.django_db
def test_results_ordered_by_score(env):
    """Results are in descending score order."""
    qs = Service.objects.filter(status='Active')
    result = list(env.engine.search(qs, {'search': 'Python'}))

    scores = [getattr(s, 'search_score', 0) for s in result]
    assert scores == sorted(scores, reverse=True)


@pytest.mark.django_db
def test_no_search_no_scoring(env):
    """Without search/tag params, no search_score annotation."""
    qs = Service.objects.filter(status='Active')
    result = list(env.engine.search(qs, {}))

    for s in result:
        assert not hasattr(s, 'search_score')


@pytest.mark.django_db
def test_description_match_included(env):
    """Service with search term in description is found."""
    qs = Service.objects.filter(status='Active')
    result = list(env.engine.search(qs, {'search': 'Python'}))
    result_ids = [s.id for s in result]
    assert env.svc_desc_only.id in result_ids


@pytest.mark.django_db
def test_unrelated_not_in_results(env):
    """Unrelated service is not in search results."""
    qs = Service.objects.filter(status='Active')
    result = list(env.engine.search(qs, {'search': 'Python'}))
    result_ids = [s.id for s in result]
    assert env.svc_unrelated.id not in result_ids
