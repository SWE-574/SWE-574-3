"""
Tests for hierarchical TagStrategy (parent traversal and entity_type filtering).

Phase 2.1 RED tests — these should fail until search_filters.py is updated.
"""
from decimal import Decimal
from types import SimpleNamespace

import pytest

from api.models import Service, Tag, User
from api.search_filters import TagStrategy


@pytest.fixture
def env(db):
    user = User.objects.create_user(
        email='testuser@test.com',
        password='testpass123',
        first_name='Test',
        last_name='User',
        timebank_balance=Decimal('10.00'),
    )

    tag_prog_lang = Tag.objects.create(
        id='Q9143', name='Programming language',
        entity_type='technology',
    )
    tag_python = Tag.objects.create(
        id='Q28865', name='Python',
        parent_qid='Q9143', entity_type='technology', depth=1,
    )
    tag_django = Tag.objects.create(
        id='Q290053', name='Django',
        parent_qid='Q1330336', entity_type='technology', depth=1,
    )
    tag_cooking = Tag.objects.create(
        id='Q25403900', name='Cooking',
        parent_qid='Q2095', entity_type='food', depth=1,
    )

    svc_python = Service.objects.create(
        user=user, title='Python Tutoring',
        description='Learn Python', type='Offer',
        duration=Decimal('2.00'), location_type='Online',
        max_participants=1, schedule_type='One-Time',
    )
    svc_python.tags.add(tag_python)

    svc_django = Service.objects.create(
        user=user, title='Django Help',
        description='Django web framework', type='Offer',
        duration=Decimal('2.00'), location_type='Online',
        max_participants=1, schedule_type='One-Time',
    )
    svc_django.tags.add(tag_django)

    svc_cooking = Service.objects.create(
        user=user, title='Cooking Class',
        description='Learn to cook', type='Offer',
        duration=Decimal('3.00'), location_type='In-Person',
        max_participants=5, schedule_type='Recurrent',
    )
    svc_cooking.tags.add(tag_cooking)

    return SimpleNamespace(
        user=user,
        tag_prog_lang=tag_prog_lang,
        tag_python=tag_python,
        tag_django=tag_django,
        tag_cooking=tag_cooking,
        svc_python=svc_python,
        svc_django=svc_django,
        svc_cooking=svc_cooking,
        strategy=TagStrategy(),
    )


@pytest.mark.django_db
def test_direct_tag_match_still_works(env):
    qs = Service.objects.filter(status='Active')
    result = list(env.strategy.apply(qs, {'tag': 'Q28865'}))
    assert len(result) == 1
    assert result[0].title == 'Python Tutoring'


@pytest.mark.django_db
def test_finds_services_via_parent_qid(env):
    qs = Service.objects.filter(status='Active')
    result = list(env.strategy.apply(qs, {'tag': 'Q9143'}))
    titles = [s.title for s in result]
    assert 'Python Tutoring' in titles


@pytest.mark.django_db
def test_entity_type_filter(env):
    qs = Service.objects.filter(status='Active')
    result = list(env.strategy.apply(qs, {'entity_type': 'technology'}))
    titles = [s.title for s in result]
    assert 'Python Tutoring' in titles
    assert 'Django Help' in titles
    assert 'Cooking Class' not in titles


@pytest.mark.django_db
def test_no_false_positives(env):
    qs = Service.objects.filter(status='Active')
    result = list(env.strategy.apply(qs, {'entity_type': 'food'}))
    titles = [s.title for s in result]
    assert 'Cooking Class' in titles
    assert 'Python Tutoring' not in titles
    assert 'Django Help' not in titles


@pytest.mark.django_db
def test_parent_qid_and_direct_combined(env):
    qs = Service.objects.filter(status='Active')
    result = list(env.strategy.apply(qs, {'tags': ['Q9143', 'Q25403900']}))
    titles = [s.title for s in result]
    assert 'Python Tutoring' in titles
    assert 'Cooking Class' in titles
