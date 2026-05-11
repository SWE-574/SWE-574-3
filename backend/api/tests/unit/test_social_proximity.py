"""
Unit tests for get_social_proximity_boosts() in api/services.py.

Covers:
- No viewer returns empty
- 1st-degree via follow
- 1st-degree via completed handshake (as provider and as requester)
- 2nd-degree via follow chain
- 2nd-degree via transaction chain
- 1st-degree takes precedence over 2nd-degree
- Viewer excluded from own results
- Stranger (no connection) has no entry
- Pending handshake does not count
"""
from decimal import Decimal
from types import SimpleNamespace

import pytest
from django.contrib.auth import get_user_model

from api.models import Service, Handshake, UserFollow
from api.services import get_social_proximity_boosts

User = get_user_model()


def _make_user(email, balance=Decimal('5.00')):
    return User.objects.create_user(
        email=email, password='pass', first_name='T', last_name='U',
        timebank_balance=balance,
    )


def _make_service(owner):
    return Service.objects.create(
        user=owner, title='Test', description='desc', duration=1,
        location_type='Online', status='Active', type='Offer',
    )


def _make_completed_handshake(provider, requester):
    svc = _make_service(provider)
    return Handshake.objects.create(
        service=svc, requester=requester,
        status='completed', provisioned_hours=Decimal('1.00'),
    )


def _boost(result, user):
    """Look up boost by UUID key."""
    return result.get(user.id)


@pytest.fixture
def env(db):
    return SimpleNamespace(
        viewer=_make_user('viewer@test.com'),
        u1=_make_user('u1@test.com'),
        u2=_make_user('u2@test.com'),
        u3=_make_user('u3@test.com'),
        stranger=_make_user('stranger@test.com'),
    )


@pytest.mark.django_db
def test_no_viewer_returns_empty():
    result = get_social_proximity_boosts(None)
    assert result == {}


@pytest.mark.django_db
def test_no_connections_returns_empty(env):
    result = get_social_proximity_boosts(env.viewer.id)
    assert result == {}


@pytest.mark.django_db
def test_first_degree_via_follow(env):
    UserFollow.objects.create(follower=env.viewer, following=env.u1)
    result = get_social_proximity_boosts(env.viewer.id)
    assert _boost(result, env.u1) == pytest.approx(1.0)


@pytest.mark.django_db
def test_first_degree_via_completed_handshake_as_requester(env):
    _make_completed_handshake(provider=env.u1, requester=env.viewer)
    result = get_social_proximity_boosts(env.viewer.id)
    assert _boost(result, env.u1) == pytest.approx(1.0)


@pytest.mark.django_db
def test_first_degree_via_completed_handshake_as_provider(env):
    _make_completed_handshake(provider=env.viewer, requester=env.u1)
    result = get_social_proximity_boosts(env.viewer.id)
    assert _boost(result, env.u1) == pytest.approx(1.0)


@pytest.mark.django_db
def test_second_degree_via_follow_chain(env):
    UserFollow.objects.create(follower=env.viewer, following=env.u1)
    UserFollow.objects.create(follower=env.u1, following=env.u2)
    result = get_social_proximity_boosts(env.viewer.id)
    assert _boost(result, env.u2) == pytest.approx(0.5)


@pytest.mark.django_db
def test_second_degree_via_transaction_chain(env):
    _make_completed_handshake(provider=env.u1, requester=env.viewer)
    _make_completed_handshake(provider=env.u1, requester=env.u2)
    result = get_social_proximity_boosts(env.viewer.id)
    assert _boost(result, env.u2) == pytest.approx(0.5)


@pytest.mark.django_db
def test_first_degree_takes_precedence_over_second(env):
    UserFollow.objects.create(follower=env.viewer, following=env.u1)
    UserFollow.objects.create(follower=env.viewer, following=env.u2)
    UserFollow.objects.create(follower=env.u2, following=env.u1)
    result = get_social_proximity_boosts(env.viewer.id)
    assert _boost(result, env.u1) == pytest.approx(1.0)


@pytest.mark.django_db
def test_stranger_has_no_entry(env):
    UserFollow.objects.create(follower=env.viewer, following=env.u1)
    result = get_social_proximity_boosts(env.viewer.id)
    assert _boost(result, env.stranger) is None


@pytest.mark.django_db
def test_viewer_excluded_from_own_results(env):
    UserFollow.objects.create(follower=env.viewer, following=env.u1)
    result = get_social_proximity_boosts(env.viewer.id)
    assert _boost(result, env.viewer) is None


@pytest.mark.django_db
def test_pending_handshake_does_not_count(env):
    svc = _make_service(env.u1)
    Handshake.objects.create(
        service=svc, requester=env.viewer,
        status='pending', provisioned_hours=Decimal('1.00'),
    )
    result = get_social_proximity_boosts(env.viewer.id)
    assert _boost(result, env.u1) is None


@pytest.mark.django_db
def test_multiple_paths_do_not_duplicate_entries(env):
    UserFollow.objects.create(follower=env.viewer, following=env.u1)
    _make_completed_handshake(provider=env.u1, requester=env.viewer)
    result = get_social_proximity_boosts(env.viewer.id)
    assert _boost(result, env.u1) == pytest.approx(1.0)
    assert list(result.values()).count(1.0) == 1
