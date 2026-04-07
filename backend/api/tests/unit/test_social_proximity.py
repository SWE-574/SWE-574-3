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
from django.test import TestCase
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


class SocialProximityBoostTests(TestCase):

    def setUp(self):
        self.viewer = _make_user('viewer@test.com')
        self.u1 = _make_user('u1@test.com')
        self.u2 = _make_user('u2@test.com')
        self.u3 = _make_user('u3@test.com')
        self.stranger = _make_user('stranger@test.com')

    def _boost(self, result, user):
        """Look up boost by UUID key."""
        return result.get(user.id)

    def test_no_viewer_returns_empty(self):
        result = get_social_proximity_boosts(None)
        self.assertEqual(result, {})

    def test_no_connections_returns_empty(self):
        result = get_social_proximity_boosts(self.viewer.id)
        self.assertEqual(result, {})

    def test_first_degree_via_follow(self):
        UserFollow.objects.create(follower=self.viewer, following=self.u1)
        result = get_social_proximity_boosts(self.viewer.id)
        self.assertAlmostEqual(self._boost(result, self.u1), 1.0)

    def test_first_degree_via_completed_handshake_as_requester(self):
        _make_completed_handshake(provider=self.u1, requester=self.viewer)
        result = get_social_proximity_boosts(self.viewer.id)
        self.assertAlmostEqual(self._boost(result, self.u1), 1.0)

    def test_first_degree_via_completed_handshake_as_provider(self):
        _make_completed_handshake(provider=self.viewer, requester=self.u1)
        result = get_social_proximity_boosts(self.viewer.id)
        self.assertAlmostEqual(self._boost(result, self.u1), 1.0)

    def test_second_degree_via_follow_chain(self):
        # viewer -> u1 -> u2
        UserFollow.objects.create(follower=self.viewer, following=self.u1)
        UserFollow.objects.create(follower=self.u1, following=self.u2)
        result = get_social_proximity_boosts(self.viewer.id)
        self.assertAlmostEqual(self._boost(result, self.u2), 0.5)

    def test_second_degree_via_transaction_chain(self):
        # viewer -[completed]- u1 -[completed]- u2
        _make_completed_handshake(provider=self.u1, requester=self.viewer)
        _make_completed_handshake(provider=self.u1, requester=self.u2)
        result = get_social_proximity_boosts(self.viewer.id)
        self.assertAlmostEqual(self._boost(result, self.u2), 0.5)

    def test_first_degree_takes_precedence_over_second(self):
        # u1 is directly followed AND reachable via u2 (2nd-degree path)
        UserFollow.objects.create(follower=self.viewer, following=self.u1)
        UserFollow.objects.create(follower=self.viewer, following=self.u2)
        UserFollow.objects.create(follower=self.u2, following=self.u1)
        result = get_social_proximity_boosts(self.viewer.id)
        self.assertAlmostEqual(self._boost(result, self.u1), 1.0)

    def test_stranger_has_no_entry(self):
        UserFollow.objects.create(follower=self.viewer, following=self.u1)
        result = get_social_proximity_boosts(self.viewer.id)
        self.assertIsNone(self._boost(result, self.stranger))

    def test_viewer_excluded_from_own_results(self):
        UserFollow.objects.create(follower=self.viewer, following=self.u1)
        result = get_social_proximity_boosts(self.viewer.id)
        self.assertIsNone(self._boost(result, self.viewer))

    def test_pending_handshake_does_not_count(self):
        svc = _make_service(self.u1)
        Handshake.objects.create(
            service=svc, requester=self.viewer,
            status='pending', provisioned_hours=Decimal('1.00'),
        )
        result = get_social_proximity_boosts(self.viewer.id)
        self.assertIsNone(self._boost(result, self.u1))

    def test_multiple_paths_do_not_duplicate_entries(self):
        # u1 is reachable via two 1st-degree paths (follow + handshake)
        UserFollow.objects.create(follower=self.viewer, following=self.u1)
        _make_completed_handshake(provider=self.u1, requester=self.viewer)
        result = get_social_proximity_boosts(self.viewer.id)
        self.assertAlmostEqual(self._boost(result, self.u1), 1.0)
        # Only one entry, not two
        self.assertEqual(list(result.values()).count(1.0), 1)
