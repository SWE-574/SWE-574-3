"""
Tests for Comments, Ranking Algorithm, and Extended Badge System
"""
from decimal import Decimal
from types import SimpleNamespace

import pytest
from django.urls import reverse
from rest_framework.test import APIClient

from api.achievement_utils import (
    check_and_assign_badges, get_achievement_progress, get_user_stats,
)
from api.models import (
    Comment, Handshake, NegativeRep, ReputationRep, Service, User, UserBadge,
)
from api.ranking import calculate_hot_score, calculate_hot_scores_batch


# ── Comment model ────────────────────────────────────────────────────────────

@pytest.fixture
def comment_env(db):
    user = User.objects.create_user(
        email='test@example.com', password='testpass123',
        first_name='Test', last_name='User',
    )
    service = Service.objects.create(
        user=user, title='Test Service', description='A test service',
        type='Offer', duration=Decimal('2.00'), location_type='Online',
        schedule_type='One-Time',
    )
    return SimpleNamespace(user=user, service=service)


@pytest.mark.django_db
def test_create_top_level_comment(comment_env):
    comment = Comment.objects.create(
        service=comment_env.service, user=comment_env.user, body='Great service!',
    )
    assert comment.id is not None
    assert comment.parent is None
    assert not comment.is_deleted


@pytest.mark.django_db
def test_create_reply_comment(comment_env):
    parent = Comment.objects.create(
        service=comment_env.service, user=comment_env.user, body='Great service!',
    )
    reply = Comment.objects.create(
        service=comment_env.service, user=comment_env.user,
        parent=parent, body='Thanks!',
    )
    assert reply.parent == parent
    assert parent.replies.count() == 1


@pytest.mark.django_db
def test_soft_delete_comment(comment_env):
    comment = Comment.objects.create(
        service=comment_env.service, user=comment_env.user, body='Test comment',
    )
    comment.is_deleted = True
    comment.save()

    assert Comment.objects.filter(id=comment.id).exists()
    assert Comment.objects.get(id=comment.id).is_deleted


# ── NegativeRep model ────────────────────────────────────────────────────────

@pytest.fixture
def neg_rep_env(db):
    provider = User.objects.create_user(
        email='provider@example.com', password='testpass123',
        first_name='Provider', last_name='User',
        timebank_balance=Decimal('10.00'),
    )
    receiver = User.objects.create_user(
        email='receiver@example.com', password='testpass123',
        first_name='Receiver', last_name='User',
        timebank_balance=Decimal('10.00'),
    )
    service = Service.objects.create(
        user=provider, title='Test Service', description='A test service',
        type='Offer', duration=Decimal('2.00'), location_type='Online',
        schedule_type='One-Time',
    )
    handshake = Handshake.objects.create(
        service=service, requester=receiver,
        status='completed', provisioned_hours=Decimal('2.00'),
    )
    return SimpleNamespace(provider=provider, receiver=receiver, service=service, handshake=handshake)


@pytest.mark.django_db
def test_create_negative_rep(neg_rep_env):
    neg_rep = NegativeRep.objects.create(
        handshake=neg_rep_env.handshake,
        giver=neg_rep_env.receiver,
        receiver=neg_rep_env.provider,
        is_late=True, comment='Was 30 minutes late',
    )
    assert neg_rep.id is not None
    assert neg_rep.is_late
    assert not neg_rep.is_unhelpful
    assert not neg_rep.is_rude


@pytest.mark.django_db
def test_unique_negative_rep_per_handshake_giver(neg_rep_env):
    NegativeRep.objects.create(
        handshake=neg_rep_env.handshake,
        giver=neg_rep_env.receiver,
        receiver=neg_rep_env.provider,
        is_late=True,
    )
    from django.db import IntegrityError
    with pytest.raises(IntegrityError):
        NegativeRep.objects.create(
            handshake=neg_rep_env.handshake,
            giver=neg_rep_env.receiver,
            receiver=neg_rep_env.provider,
            is_rude=True,
        )


# ── Hot score ────────────────────────────────────────────────────────────────

@pytest.mark.django_db
def test_calculate_hot_score_new_service(comment_env):
    score = calculate_hot_score(comment_env.service)
    assert score >= 0


@pytest.mark.django_db
def test_hot_score_increases_with_comments(comment_env):
    """Hot score increases with comments after seeded positive reputation."""
    for i in range(5):
        requester = User.objects.create_user(
            email=f'rep-giver-{i}@example.com',
            password='testpass123', first_name='Giver', last_name=str(i),
        )
        base_service = Service.objects.create(
            user=comment_env.user, title=f'Quality seed {i}', description='seed',
            type='Offer', duration=Decimal('1.00'), location_type='Online',
            schedule_type='One-Time',
        )
        hs = Handshake.objects.create(
            service=base_service, requester=requester,
            status='completed', provisioned_hours=Decimal('1.00'),
        )
        ReputationRep.objects.create(
            handshake=hs, giver=requester, receiver=comment_env.user,
            is_helpful=True,
        )

    initial_score = calculate_hot_score(comment_env.service)

    for i in range(5):
        Comment.objects.create(
            service=comment_env.service, user=comment_env.user, body=f'Comment {i}',
        )

    new_score = calculate_hot_score(comment_env.service)
    assert new_score > initial_score


@pytest.mark.django_db
def test_batch_score_calculation(comment_env):
    services = [comment_env.service]
    for i in range(4):
        s = Service.objects.create(
            user=comment_env.user, title=f'Service {i}', description='Test',
            type='Offer', duration=Decimal('1.00'), location_type='Online',
            schedule_type='One-Time',
        )
        services.append(s)

    scores = calculate_hot_scores_batch(services)

    assert len(scores) == 5
    for service in services:
        assert service.id in scores


# ── Extended badge system ────────────────────────────────────────────────────

@pytest.fixture
def badge_env(db):
    user = User.objects.create_user(
        email='test@example.com', password='testpass123',
        first_name='Test', last_name='User',
        timebank_balance=Decimal('10.00'),
    )
    other_user = User.objects.create_user(
        email='other@example.com', password='testpass123',
        first_name='Other', last_name='User',
        timebank_balance=Decimal('10.00'),
    )
    return SimpleNamespace(user=user, other_user=other_user)


@pytest.mark.django_db
def test_get_user_stats(badge_env):
    stats = get_user_stats(badge_env.user)

    assert 'completed_services' in stats
    assert 'offer_count' in stats
    assert 'helpful_count' in stats
    assert 'kindness_count' in stats
    assert 'punctual_count' in stats
    assert 'comments_posted' in stats
    assert 'comments_on_services' in stats
    assert 'hours_given' in stats
    assert 'negative_rep_count' in stats


@pytest.mark.django_db
def test_community_voice_badge(badge_env):
    """Earn Community Voice badge for 10+ comments."""
    service = Service.objects.create(
        user=badge_env.other_user, title='Test Service', description='Test',
        type='Offer', duration=Decimal('1.00'), location_type='Online',
        schedule_type='One-Time',
    )

    for i in range(10):
        Comment.objects.create(service=service, user=badge_env.user, body=f'Comment {i}')

    new_badges = check_and_assign_badges(badge_env.user)

    assert 'community-voice' in new_badges
    assert UserBadge.objects.filter(user=badge_env.user, badge_id='community-voice').exists()


@pytest.mark.django_db
def test_first_service_badge(badge_env):
    service = Service.objects.create(
        user=badge_env.user, title='Test Service', description='Test',
        type='Offer', duration=Decimal('1.00'), location_type='Online',
        schedule_type='One-Time',
    )

    Handshake.objects.create(
        service=service, requester=badge_env.other_user,
        status='completed', provisioned_hours=Decimal('1.00'),
    )

    new_badges = check_and_assign_badges(badge_env.user)
    assert 'first-service' in new_badges


@pytest.mark.django_db
def test_badge_not_duplicated(badge_env):
    service = Service.objects.create(
        user=badge_env.user, title='Test Service', description='Test',
        type='Offer', duration=Decimal('1.00'), location_type='Online',
        schedule_type='One-Time',
    )
    Handshake.objects.create(
        service=service, requester=badge_env.other_user,
        status='completed', provisioned_hours=Decimal('1.00'),
    )

    new_badges1 = check_and_assign_badges(badge_env.user)
    new_badges2 = check_and_assign_badges(badge_env.user)

    assert 'first-service' in new_badges1
    assert 'first-service' not in new_badges2

    assert UserBadge.objects.filter(user=badge_env.user, badge_id='first-service').count() == 1


@pytest.mark.django_db
def test_get_badge_progress(badge_env):
    progress = get_achievement_progress(badge_env.user)

    assert 'first-service' in progress
    assert 'community-voice' in progress
    assert 'time-giver-bronze' in progress

    first_service = progress['first-service']
    assert 'earned' in first_service
    assert 'current' in first_service
    assert 'threshold' in first_service
    assert 'progress_percent' in first_service


# ── Comment API endpoints ────────────────────────────────────────────────────

@pytest.fixture
def comment_api_env(db):
    user = User.objects.create_user(
        email='test@example.com', password='testpass123',
        first_name='Test', last_name='User',
    )
    other_user = User.objects.create_user(
        email='other@example.com', password='testpass123',
        first_name='Other', last_name='User',
    )
    service = Service.objects.create(
        user=other_user, title='Test Service', description='A test service',
        type='Offer', duration=Decimal('2.00'), location_type='Online',
        schedule_type='One-Time',
    )
    return SimpleNamespace(user=user, other_user=other_user, service=service, client=APIClient())


@pytest.mark.django_db
def test_list_comments_unauthenticated(comment_api_env):
    Comment.objects.create(
        service=comment_api_env.service, user=comment_api_env.user, body='Test comment',
    )

    url = reverse('service-comments', kwargs={'service_id': comment_api_env.service.id})
    response = comment_api_env.client.get(url)

    assert response.status_code == 200


@pytest.mark.django_db
def test_create_comment_authenticated(comment_api_env):
    """Service-comments endpoint is read-only."""
    comment_api_env.client.force_authenticate(user=comment_api_env.user)

    url = reverse('service-comments', kwargs={'service_id': comment_api_env.service.id})
    response = comment_api_env.client.post(url, {'body': 'Great service!'}, format='json')

    assert response.status_code == 405
    assert Comment.objects.count() == 0


@pytest.mark.django_db
def test_create_comment_unauthenticated(comment_api_env):
    url = reverse('service-comments', kwargs={'service_id': comment_api_env.service.id})
    response = comment_api_env.client.post(url, {'body': 'Test comment'}, format='json')
    assert response.status_code == 401


@pytest.mark.django_db
def test_create_reply(comment_api_env):
    """Replies cannot be created via service comments API (read-only endpoint)."""
    comment_api_env.client.force_authenticate(user=comment_api_env.user)

    parent = Comment.objects.create(
        service=comment_api_env.service, user=comment_api_env.other_user, body='Original comment',
    )

    url = reverse('service-comments', kwargs={'service_id': comment_api_env.service.id})
    response = comment_api_env.client.post(
        url, {'body': 'Reply!', 'parent_id': str(parent.id)}, format='json',
    )

    assert response.status_code == 405
    assert Comment.objects.count() == 1


@pytest.mark.django_db
def test_cannot_reply_to_reply(comment_api_env):
    """Service comments API rejects posting (read-only endpoint)."""
    comment_api_env.client.force_authenticate(user=comment_api_env.user)

    parent = Comment.objects.create(
        service=comment_api_env.service, user=comment_api_env.other_user, body='Original comment',
    )
    reply = Comment.objects.create(
        service=comment_api_env.service, user=comment_api_env.user, parent=parent, body='Reply',
    )

    url = reverse('service-comments', kwargs={'service_id': comment_api_env.service.id})
    response = comment_api_env.client.post(
        url, {'body': 'Reply to reply!', 'parent_id': str(reply.id)}, format='json',
    )

    assert response.status_code == 405


@pytest.mark.django_db
def test_edit_own_comment(comment_api_env):
    """Service comments API rejects edits (read-only endpoint)."""
    comment_api_env.client.force_authenticate(user=comment_api_env.user)

    comment = Comment.objects.create(
        service=comment_api_env.service, user=comment_api_env.user, body='Original text',
    )

    url = reverse(
        'service-comment-detail',
        kwargs={'service_id': comment_api_env.service.id, 'pk': comment.id},
    )
    response = comment_api_env.client.patch(url, {'body': 'Updated text'}, format='json')

    assert response.status_code == 405
    comment.refresh_from_db()
    assert comment.body == 'Original text'


@pytest.mark.django_db
def test_cannot_edit_others_comment(comment_api_env):
    comment_api_env.client.force_authenticate(user=comment_api_env.user)

    comment = Comment.objects.create(
        service=comment_api_env.service, user=comment_api_env.other_user, body='Other user comment',
    )

    url = reverse(
        'service-comment-detail',
        kwargs={'service_id': comment_api_env.service.id, 'pk': comment.id},
    )
    response = comment_api_env.client.patch(url, {'body': 'Hacked!'}, format='json')

    assert response.status_code == 405


@pytest.mark.django_db
def test_delete_own_comment(comment_api_env):
    comment_api_env.client.force_authenticate(user=comment_api_env.user)

    comment = Comment.objects.create(
        service=comment_api_env.service, user=comment_api_env.user, body='To be deleted',
    )

    url = reverse(
        'service-comment-detail',
        kwargs={'service_id': comment_api_env.service.id, 'pk': comment.id},
    )
    response = comment_api_env.client.delete(url)

    assert response.status_code == 405
    comment.refresh_from_db()
    assert not comment.is_deleted


@pytest.mark.django_db
def test_service_owner_can_delete_any_comment(comment_api_env):
    """Service comments API rejects deletes even for service owners."""
    comment_api_env.client.force_authenticate(user=comment_api_env.other_user)

    comment = Comment.objects.create(
        service=comment_api_env.service, user=comment_api_env.user,
        body='Comment on my service',
    )

    url = reverse(
        'service-comment-detail',
        kwargs={'service_id': comment_api_env.service.id, 'pk': comment.id},
    )
    response = comment_api_env.client.delete(url)

    assert response.status_code == 405
    comment.refresh_from_db()
    assert not comment.is_deleted


# ── Negative Reputation API ──────────────────────────────────────────────────

@pytest.fixture
def negative_api_env(db):
    provider = User.objects.create_user(
        email='provider@example.com', password='testpass123',
        first_name='Provider', last_name='User',
        timebank_balance=Decimal('10.00'), karma_score=50,
    )
    receiver = User.objects.create_user(
        email='receiver@example.com', password='testpass123',
        first_name='Receiver', last_name='User',
        timebank_balance=Decimal('10.00'),
    )
    service = Service.objects.create(
        user=provider, title='Test Service', description='A test service',
        type='Offer', duration=Decimal('2.00'), location_type='Online',
        schedule_type='One-Time',
    )
    completed_handshake = Handshake.objects.create(
        service=service, requester=receiver,
        status='completed', provisioned_hours=Decimal('2.00'),
    )
    return SimpleNamespace(
        provider=provider, receiver=receiver, service=service,
        completed_handshake=completed_handshake, client=APIClient(),
    )


@pytest.mark.django_db
def test_submit_negative_rep(negative_api_env):
    negative_api_env.client.force_authenticate(user=negative_api_env.receiver)

    url = reverse('negative-reputation')
    response = negative_api_env.client.post(url, {
        'handshake_id': str(negative_api_env.completed_handshake.id),
        'is_late': True, 'is_unhelpful': False, 'is_rude': False,
        'comment': 'Was 30 minutes late',
    }, format='json')

    assert response.status_code == 201
    assert NegativeRep.objects.count() == 1


@pytest.mark.django_db
def test_negative_rep_reduces_karma(negative_api_env):
    negative_api_env.client.force_authenticate(user=negative_api_env.receiver)
    initial_karma = negative_api_env.provider.karma_score

    url = reverse('negative-reputation')
    response = negative_api_env.client.post(url, {
        'handshake_id': str(negative_api_env.completed_handshake.id),
        'is_late': True, 'is_unhelpful': True, 'is_rude': False,
    }, format='json')

    assert response.status_code == 201

    negative_api_env.provider.refresh_from_db()
    expected_karma = initial_karma - 4
    assert negative_api_env.provider.karma_score == expected_karma


@pytest.mark.django_db
def test_cannot_submit_without_negative_trait(negative_api_env):
    negative_api_env.client.force_authenticate(user=negative_api_env.receiver)

    url = reverse('negative-reputation')
    response = negative_api_env.client.post(url, {
        'handshake_id': str(negative_api_env.completed_handshake.id),
        'is_late': False, 'is_unhelpful': False, 'is_rude': False,
    }, format='json')

    assert response.status_code == 400


@pytest.mark.django_db
def test_cannot_submit_for_non_completed_handshake(negative_api_env):
    pending_handshake = Handshake.objects.create(
        service=negative_api_env.service, requester=negative_api_env.receiver,
        status='pending', provisioned_hours=Decimal('2.00'),
    )

    negative_api_env.client.force_authenticate(user=negative_api_env.receiver)

    url = reverse('negative-reputation')
    response = negative_api_env.client.post(url, {
        'handshake_id': str(pending_handshake.id), 'is_late': True,
    }, format='json')

    assert response.status_code == 404


# ── Service hot-score sorting ────────────────────────────────────────────────

@pytest.fixture
def hot_sort_env(db):
    user = User.objects.create_user(
        email='hotscore_test@example.com', password='testpass123',
        first_name='HotScore', last_name='Tester',
    )

    service1 = Service.objects.create(
        user=user, title='[HS] Low Score Service', description='Hot score test',
        type='Offer', duration=Decimal('1.00'), location_type='Online',
        schedule_type='One-Time',
    )
    service2 = Service.objects.create(
        user=user, title='[HS] High Score Service', description='Hot score test',
        type='Offer', duration=Decimal('1.00'), location_type='Online',
        schedule_type='One-Time',
    )
    service3 = Service.objects.create(
        user=user, title='[HS] Medium Score Service', description='Hot score test',
        type='Offer', duration=Decimal('1.00'), location_type='Online',
        schedule_type='One-Time',
    )

    Service.objects.filter(pk=service1.pk).update(hot_score=0.5)
    Service.objects.filter(pk=service2.pk).update(hot_score=10.0)
    Service.objects.filter(pk=service3.pk).update(hot_score=5.0)

    return SimpleNamespace(
        user=user, service1=service1, service2=service2, service3=service3,
        client=APIClient(),
    )


@pytest.mark.django_db
def test_sort_by_hot_score(hot_sort_env):
    url = reverse('service-list') + '?sort=hot&search=[HS]'
    response = hot_sort_env.client.get(url)

    assert response.status_code == 200

    results = response.data.get('results', response.data)
    our_services = [s for s in results if s['title'].startswith('[HS]')]
    titles = [s['title'] for s in our_services]

    assert len(our_services) == 3
    assert titles[0] == '[HS] High Score Service'
    assert titles[1] == '[HS] Medium Score Service'
    assert titles[2] == '[HS] Low Score Service'


@pytest.mark.django_db
def test_default_sort_by_latest(hot_sort_env):
    url = reverse('service-list') + '?search=[HS]'
    response = hot_sort_env.client.get(url)

    assert response.status_code == 200

    results = response.data.get('results', response.data)
    our_services = [s for s in results if s['title'].startswith('[HS]')]

    assert len(our_services) == 3
    assert our_services[0]['title'] == '[HS] Medium Score Service'
