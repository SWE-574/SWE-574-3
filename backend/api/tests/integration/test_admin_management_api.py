import pytest
from rest_framework import status
from rest_framework.test import APIClient

from api.models import AdminAuditLog, Report
from api.tests.helpers.factories import AdminUserFactory, ForumTopicFactory, HandshakeFactory, ServiceFactory, UserFactory
from api.tests.helpers.test_client import AuthenticatedAPIClient


def _payload_items(data):
    if isinstance(data, list):
        return data
    if isinstance(data, dict):
        return data.get('results', data)
    return data


@pytest.mark.django_db
@pytest.mark.integration
class TestAdminManagementApi:
    def test_metrics_requires_authentication(self):
        response = APIClient().get('/api/metrics/')
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_non_admin_cannot_access_metrics(self):
        member = UserFactory()
        client = AuthenticatedAPIClient().authenticate_user(member)

        response = client.get('/api/metrics/')
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_admin_can_access_metrics(self):
        admin = AdminUserFactory()
        client = AuthenticatedAPIClient().authenticate_admin(admin)

        response = client.get('/api/metrics/')

        assert response.status_code == status.HTTP_200_OK
        payload = response.json()
        assert 'users' in payload
        assert 'services' in payload
        assert 'handshakes' in payload
        assert 'transactions' in payload

    def test_admin_users_list_requires_authentication(self):
        response = APIClient().get('/api/admin/users/')
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_non_admin_cannot_list_admin_users(self):
        member = UserFactory()
        client = AuthenticatedAPIClient().authenticate_user(member)

        response = client.get('/api/admin/users/')
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_admin_can_list_users(self):
        admin = AdminUserFactory()
        listed_user = UserFactory()

        client = AuthenticatedAPIClient().authenticate_admin(admin)
        response = client.get('/api/admin/users/')

        assert response.status_code == status.HTTP_200_OK
        items = _payload_items(response.data)
        ids = {item['id'] for item in items}
        assert str(listed_user.id) in ids

    def test_admin_can_warn_ban_unban_and_adjust_karma(self):
        admin = AdminUserFactory()
        target_user = UserFactory(karma_score=10, is_active=True)

        client = AuthenticatedAPIClient().authenticate_admin(admin)

        warn_response = client.post(
            f'/api/admin/users/{target_user.id}/warn/',
            {'message': 'Please follow guidelines.'},
            format='json',
        )
        assert warn_response.status_code == status.HTTP_200_OK

        ban_response = client.post(f'/api/admin/users/{target_user.id}/ban/', {}, format='json')
        assert ban_response.status_code == status.HTTP_200_OK
        target_user.refresh_from_db()
        assert target_user.is_active is False

        unban_response = client.post(f'/api/admin/users/{target_user.id}/unban/', {}, format='json')
        assert unban_response.status_code == status.HTTP_200_OK
        target_user.refresh_from_db()
        assert target_user.is_active is True

        karma_response = client.post(
            f'/api/admin/users/{target_user.id}/adjust-karma/',
            {'adjustment': -3},
            format='json',
        )
        assert karma_response.status_code == status.HTTP_200_OK
        target_user.refresh_from_db()
        assert target_user.karma_score == 7

    def test_admin_audit_logs_requires_authentication(self):
        response = APIClient().get('/api/admin/audit-logs/')
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_non_admin_gets_empty_admin_audit_logs(self):
        member = UserFactory()
        admin = AdminUserFactory()
        target_user = UserFactory()
        AdminAuditLog.objects.create(
            admin=admin,
            action_type='warn_user',
            target_entity='user',
            target_id=target_user.id,
            reason='Seed audit record',
        )

        client = AuthenticatedAPIClient().authenticate_user(member)
        response = client.get('/api/admin/audit-logs/')

        assert response.status_code == status.HTTP_200_OK
        items = _payload_items(response.data)
        assert len(items) == 0

    def test_admin_can_list_and_filter_audit_logs(self):
        admin = AdminUserFactory()
        target_user = UserFactory()
        reporter = UserFactory()
        service = ServiceFactory(user=target_user)
        report = Report.objects.create(
            reporter=reporter,
            reported_user=target_user,
            reported_service=service,
            type='spam',
            description='Spam listing report',
            status='pending',
        )
        AdminAuditLog.objects.create(
            admin=admin,
            action_type='warn_user',
            target_entity='user',
            target_id=target_user.id,
            reason='Warning test',
        )
        AdminAuditLog.objects.create(
            admin=admin,
            action_type='resolve_report',
            target_entity='report',
            target_id=report.id,
            reason='Resolve test',
        )

        client = AuthenticatedAPIClient().authenticate_admin(admin)

        all_response = client.get('/api/admin/audit-logs/')
        assert all_response.status_code == status.HTTP_200_OK
        all_items = _payload_items(all_response.data)
        assert len(all_items) >= 2

        filtered_response = client.get('/api/admin/audit-logs/?action_type=resolve_report&target_entity=report')
        assert filtered_response.status_code == status.HTTP_200_OK
        filtered_items = _payload_items(filtered_response.data)
        assert len(filtered_items) >= 1
        assert all(item['action_type'] == 'resolve_report' for item in filtered_items)
        assert all(item['target_entity'] == 'report' for item in filtered_items)

    def test_admin_cannot_suspend_themselves(self):
        """An admin cannot suspend their own account via the ban endpoint."""
        admin = AdminUserFactory()
        client = AuthenticatedAPIClient().authenticate_admin(admin)

        response = client.post(f'/api/admin/users/{admin.id}/ban/', {}, format='json')

        assert response.status_code == status.HTTP_403_FORBIDDEN
        admin.refresh_from_db()
        assert admin.is_active is True  # account must remain active

    def test_admin_cannot_warn_themselves(self):
        """An admin cannot issue a warning to their own account."""
        admin = AdminUserFactory()
        client = AuthenticatedAPIClient().authenticate_admin(admin)

        response = client.post(
            f'/api/admin/users/{admin.id}/warn/',
            {'message': 'Self-warning attempt'},
            format='json',
        )

        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_admin_can_still_suspend_other_users(self):
        """Regression: the self-suspend guard must not break normal ban flow."""
        admin = AdminUserFactory()
        target = UserFactory(is_active=True)
        client = AuthenticatedAPIClient().authenticate_admin(admin)

        response = client.post(f'/api/admin/users/{target.id}/ban/', {}, format='json')

        assert response.status_code == status.HTTP_200_OK
        target.refresh_from_db()
        assert target.is_active is False

    def test_resolved_report_is_retrievable_via_detail_endpoint(self):
        """Resolved reports must return 200 on the detail endpoint (not 404)."""
        admin = AdminUserFactory()
        reporter = UserFactory()
        reported = UserFactory()
        report = Report.objects.create(
            reporter=reporter,
            reported_user=reported,
            type='spam',
            description='Spam listing.',
            status='resolved',
        )

        client = AuthenticatedAPIClient().authenticate_admin(admin)
        response = client.get(f'/api/admin/reports/{report.id}/')

        assert response.status_code == status.HTTP_200_OK
        assert response.data['id'] == str(report.id)
        assert response.data['status'] == 'resolved'

    def test_dismissed_report_is_retrievable_via_detail_endpoint(self):
        """Dismissed reports must also return 200 on the detail endpoint."""
        admin = AdminUserFactory()
        reporter = UserFactory()
        reported = UserFactory()
        report = Report.objects.create(
            reporter=reporter,
            reported_user=reported,
            type='harassment',
            description='Harassment claim.',
            status='dismissed',
        )

        client = AuthenticatedAPIClient().authenticate_admin(admin)
        response = client.get(f'/api/admin/reports/{report.id}/')

        assert response.status_code == status.HTTP_200_OK
        assert response.data['status'] == 'dismissed'

    def test_admin_can_list_retrieve_and_pause_reports(self):
        admin = AdminUserFactory()
        provider = UserFactory()
        reporter = UserFactory()
        service = ServiceFactory(user=provider, type='Offer')
        handshake = HandshakeFactory(service=service, requester=reporter, status='accepted')
        report = Report.objects.create(
            reporter=reporter,
            reported_user=provider,
            related_handshake=handshake,
            reported_service=service,
            type='no_show',
            status='pending',
            description='Provider did not show up.',
        )

        client = AuthenticatedAPIClient().authenticate_admin(admin)

        list_response = client.get('/api/admin/reports/?status=pending')
        assert list_response.status_code == status.HTTP_200_OK
        list_items = _payload_items(list_response.data)
        report_ids = {item['id'] for item in list_items}
        assert str(report.id) in report_ids

        retrieve_response = client.get(f'/api/admin/reports/{report.id}/')
        assert retrieve_response.status_code == status.HTTP_200_OK
        assert retrieve_response.data['id'] == str(report.id)

        pause_response = client.post(f'/api/admin/reports/{report.id}/pause/', {}, format='json')
        assert pause_response.status_code == status.HTTP_200_OK
        handshake.refresh_from_db()
        assert handshake.status == 'paused'

    # ── Admin User Detail ──────────────────────────────────────────────────────

    def test_admin_user_detail_requires_authentication(self):
        target = UserFactory()
        response = APIClient().get(f'/api/admin/users/{target.id}/')
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_non_admin_cannot_retrieve_user_detail(self):
        member = UserFactory()
        target = UserFactory()
        client = AuthenticatedAPIClient().authenticate_user(member)
        response = client.get(f'/api/admin/users/{target.id}/')
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_admin_can_retrieve_user_detail(self):
        admin = AdminUserFactory()
        target = UserFactory(
            first_name='Jane', last_name='Doe',
            karma_score=25, is_active=True, is_verified=True,
        )
        client = AuthenticatedAPIClient().authenticate_admin(admin)

        response = client.get(f'/api/admin/users/{target.id}/')

        assert response.status_code == status.HTTP_200_OK
        data = response.data
        assert data['id'] == str(target.id)
        assert data['email'] == target.email
        assert data['first_name'] == 'Jane'
        assert data['last_name'] == 'Doe'
        assert data['karma_score'] == 25
        assert data['is_active'] is True
        assert data['is_verified'] is True
        assert 'date_joined' in data
        assert 'last_login' in data
        assert 'timebank_balance' in data
        assert 'no_show_count' in data
        assert 'is_event_banned_until' in data
        assert 'is_organizer_banned_until' in data
        assert 'offers_count' in data
        assert 'requests_count' in data
        assert 'events_count' in data
        assert 'handshakes_as_requester_count' in data
        assert 'handshakes_as_provider_count' in data
        assert 'forum_topics_count' in data
        assert 'recent_admin_actions' in data

    def test_admin_user_detail_counts_are_accurate(self):
        admin = AdminUserFactory()
        target = UserFactory()

        ServiceFactory(user=target, type='Offer')
        ServiceFactory(user=target, type='Offer')
        ServiceFactory(user=target, type='Need')
        ServiceFactory(user=target, type='Event')

        provider_service = ServiceFactory(user=UserFactory(), type='Offer')
        HandshakeFactory(service=provider_service, requester=target, status='completed')

        ForumTopicFactory(author=target)

        client = AuthenticatedAPIClient().authenticate_admin(admin)
        response = client.get(f'/api/admin/users/{target.id}/')

        assert response.status_code == status.HTTP_200_OK
        data = response.data
        assert data['offers_count'] == 2
        assert data['requests_count'] == 1
        assert data['events_count'] == 1
        assert data['handshakes_as_requester_count'] == 1
        assert data['forum_topics_count'] == 1

    def test_admin_user_detail_includes_recent_admin_actions(self):
        admin = AdminUserFactory()
        target = UserFactory()
        AdminAuditLog.objects.create(
            admin=admin,
            action_type='warn_user',
            target_entity='user',
            target_id=target.id,
            reason='Test warning',
        )

        client = AuthenticatedAPIClient().authenticate_admin(admin)
        response = client.get(f'/api/admin/users/{target.id}/')

        assert response.status_code == status.HTTP_200_OK
        actions = response.data['recent_admin_actions']
        assert len(actions) == 1
        assert actions[0]['action_type'] == 'warn_user'
        assert actions[0]['reason'] == 'Test warning'

    def test_admin_user_detail_returns_404_for_unknown_user(self):
        import uuid
        admin = AdminUserFactory()
        client = AuthenticatedAPIClient().authenticate_admin(admin)

        response = client.get(f'/api/admin/users/{uuid.uuid4()}/')
        assert response.status_code == status.HTTP_404_NOT_FOUND

    # ── Role-aware handshake counts ───────────────────────────────────────────

    def test_offer_requester_counts_as_requester(self):
        """When a user requests an Offer, they count as Requester (not Provider)."""
        admin = AdminUserFactory()
        user = UserFactory()
        offer = ServiceFactory(user=UserFactory(), type='Offer')
        HandshakeFactory(service=offer, requester=user)

        client = AuthenticatedAPIClient().authenticate_admin(admin)
        data = client.get(f'/api/admin/users/{user.id}/').data

        assert data['handshakes_as_requester_count'] == 1
        assert data['handshakes_as_provider_count'] == 0

    def test_offer_owner_counts_as_provider(self):
        """When a user owns an Offer that receives a handshake, they count as Provider."""
        admin = AdminUserFactory()
        provider = UserFactory()
        offer = ServiceFactory(user=provider, type='Offer')
        HandshakeFactory(service=offer, requester=UserFactory())

        client = AuthenticatedAPIClient().authenticate_admin(admin)
        data = client.get(f'/api/admin/users/{provider.id}/').data

        assert data['handshakes_as_provider_count'] == 1
        assert data['handshakes_as_requester_count'] == 0

    def test_want_owner_counts_as_requester(self):
        """When a user creates a Want (Need), they count as Requester because they seek the service."""
        admin = AdminUserFactory()
        seeker = UserFactory()
        want = ServiceFactory(user=seeker, type='Need')
        HandshakeFactory(service=want, requester=UserFactory())

        client = AuthenticatedAPIClient().authenticate_admin(admin)
        data = client.get(f'/api/admin/users/{seeker.id}/').data

        assert data['handshakes_as_requester_count'] == 1
        assert data['handshakes_as_provider_count'] == 0

    def test_want_responder_counts_as_provider(self):
        """When a user responds to a Want (their handshake.requester on a Need), they count as Provider."""
        admin = AdminUserFactory()
        responder = UserFactory()
        want = ServiceFactory(user=UserFactory(), type='Need')
        HandshakeFactory(service=want, requester=responder)

        client = AuthenticatedAPIClient().authenticate_admin(admin)
        data = client.get(f'/api/admin/users/{responder.id}/').data

        assert data['handshakes_as_provider_count'] == 1
        assert data['handshakes_as_requester_count'] == 0

    def test_events_excluded_from_handshake_counts(self):
        """Event handshakes must not appear in provider/requester counts."""
        admin = AdminUserFactory()
        organizer = UserFactory()
        event = ServiceFactory(user=organizer, type='Event')
        HandshakeFactory(service=event, requester=UserFactory())

        client = AuthenticatedAPIClient().authenticate_admin(admin)
        data = client.get(f'/api/admin/users/{organizer.id}/').data

        assert data['handshakes_as_provider_count'] == 0
        assert data['handshakes_as_requester_count'] == 0

    def test_mixed_roles_counted_independently(self):
        """A user can be both requester and provider across different services."""
        admin = AdminUserFactory()
        user = UserFactory()

        # user requests an offer → counts as requester
        offer = ServiceFactory(user=UserFactory(), type='Offer')
        HandshakeFactory(service=offer, requester=user)

        # user responds to a want → counts as provider
        want = ServiceFactory(user=UserFactory(), type='Need')
        HandshakeFactory(service=want, requester=user)

        client = AuthenticatedAPIClient().authenticate_admin(admin)
        data = client.get(f'/api/admin/users/{user.id}/').data

        assert data['handshakes_as_requester_count'] == 1
        assert data['handshakes_as_provider_count'] == 1

    # ── Recent service and topic previews ─────────────────────────────────────

    def test_recent_offers_returned_in_detail(self):
        admin = AdminUserFactory()
        user = UserFactory()
        s1 = ServiceFactory(user=user, type='Offer', title='Offer One')
        s2 = ServiceFactory(user=user, type='Offer', title='Offer Two')

        data = AuthenticatedAPIClient().authenticate_admin(admin).get(f'/api/admin/users/{user.id}/').data

        ids = {str(item['id']) for item in data['recent_offers']}
        assert str(s1.id) in ids
        assert str(s2.id) in ids

    def test_recent_forum_topics_returned_in_detail(self):
        admin = AdminUserFactory()
        user = UserFactory()
        topic = ForumTopicFactory(author=user)

        data = AuthenticatedAPIClient().authenticate_admin(admin).get(f'/api/admin/users/{user.id}/').data

        assert any(str(item['id']) == str(topic.id) for item in data['recent_forum_topics'])

    def test_recent_handshakes_as_requester_preview(self):
        """Preview shows the offer the user requested."""
        admin = AdminUserFactory()
        user = UserFactory()
        offer = ServiceFactory(user=UserFactory(), type='Offer', title='Piano Lessons')
        HandshakeFactory(service=offer, requester=user)

        data = AuthenticatedAPIClient().authenticate_admin(admin).get(f'/api/admin/users/{user.id}/').data

        assert len(data['recent_handshakes_as_requester']) == 1
        assert data['recent_handshakes_as_requester'][0]['title'] == 'Piano Lessons'
        assert len(data['recent_handshakes_as_provider']) == 0

    def test_recent_handshakes_as_provider_preview(self):
        """Preview shows the want the user responded to."""
        admin = AdminUserFactory()
        user = UserFactory()
        want = ServiceFactory(user=UserFactory(), type='Need', title='Need a Plumber')
        HandshakeFactory(service=want, requester=user)

        data = AuthenticatedAPIClient().authenticate_admin(admin).get(f'/api/admin/users/{user.id}/').data

        assert len(data['recent_handshakes_as_provider']) == 1
        assert data['recent_handshakes_as_provider'][0]['title'] == 'Need a Plumber'
        assert len(data['recent_handshakes_as_requester']) == 0

# ─────────────────────────────────────────────────────────────────────────────
# Role Assignment Tests
# POST /api/admin/users/{id}/assign-role/
# ─────────────────────────────────────────────────────────────────────────────

@pytest.mark.django_db
@pytest.mark.integration
class TestAdminRoleAssignment:
    """Integration tests for the assign_role admin action.

    Business rules exercised:
    1. Successful assignment by an authorised admin.
    2. Self-assignment is rejected (403).
    3. An admin cannot modify another admin (same or higher tier).
    4. An admin cannot elevate a user to admin (same tier).
    5. Unauthenticated requests are rejected (401).
    6. Member-role users are rejected (403).
    7. Audit log is written on success, and contains the expected fields.
    8. A super_admin can promote a member all the way to admin.
    """

    ASSIGN_ROLE_URL = '/api/admin/users/{id}/assign-role/'

    # ── helpers ──────────────────────────────────────────────────────────────

    def _url(self, user_id):
        return self.ASSIGN_ROLE_URL.format(id=user_id)

    def _post(self, client, user_id, role):
        return client.post(self._url(user_id), {'role': role}, format='json')

    # ── authentication / authorisation guard ─────────────────────────────────

    def test_unauthenticated_request_is_rejected(self):
        """Endpoint requires a valid session."""
        target = UserFactory()
        response = APIClient().post(self._url(target.id), {'role': 'moderator'}, format='json')
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_member_cannot_assign_roles(self):
        """A standard member must not access admin endpoints."""
        member = UserFactory()
        client = AuthenticatedAPIClient().authenticate_user(member)
        target = UserFactory()

        response = self._post(client, target.id, 'moderator')

        assert response.status_code == status.HTTP_403_FORBIDDEN
        target.refresh_from_db()
        assert target.role == 'member'

    # ── self-assignment ───────────────────────────────────────────────────────

    def test_admin_cannot_assign_own_role(self):
        """Self-modification is prohibited regardless of tier (FR-RBAC-3)."""
        admin = AdminUserFactory()
        client = AuthenticatedAPIClient().authenticate_admin(admin)

        response = self._post(client, admin.id, 'member')

        assert response.status_code == status.HTTP_403_FORBIDDEN
        admin.refresh_from_db()
        assert admin.role == 'admin'  # unchanged

    # ── peer / superior modification ──────────────────────────────────────────

    def test_admin_cannot_modify_another_admin(self):
        """An admin may not change the role of a peer (same tier) (FR-RBAC-2)."""
        admin = AdminUserFactory()
        peer_admin = AdminUserFactory()
        client = AuthenticatedAPIClient().authenticate_admin(admin)

        response = self._post(client, peer_admin.id, 'member')

        assert response.status_code == status.HTTP_403_FORBIDDEN
        peer_admin.refresh_from_db()
        assert peer_admin.role == 'admin'  # unchanged

    def test_admin_cannot_elevate_user_to_admin_tier(self):
        """An admin cannot grant a role equal to their own tier (FR-RBAC-2)."""
        admin = AdminUserFactory()
        target = UserFactory()  # member by default
        client = AuthenticatedAPIClient().authenticate_admin(admin)

        response = self._post(client, target.id, 'admin')

        assert response.status_code == status.HTTP_403_FORBIDDEN
        target.refresh_from_db()
        assert target.role == 'member'  # unchanged

    # ── successful assignments ────────────────────────────────────────────────

    def test_admin_can_promote_member_to_moderator(self):
        """Happy path: admin promotes a member to moderator."""
        admin = AdminUserFactory()
        target = UserFactory()  # member
        client = AuthenticatedAPIClient().authenticate_admin(admin)

        response = self._post(client, target.id, 'moderator')

        assert response.status_code == status.HTTP_200_OK
        payload = response.json()
        assert payload['status'] == 'success'
        assert payload['previous_role'] == 'member'
        assert payload['new_role'] == 'moderator'
        target.refresh_from_db()
        assert target.role == 'moderator'

    def test_admin_can_demote_moderator_to_member(self):
        """An admin can demote a moderator back to member."""
        admin = AdminUserFactory()
        target = UserFactory(role='moderator')
        client = AuthenticatedAPIClient().authenticate_admin(admin)

        response = self._post(client, target.id, 'member')

        assert response.status_code == status.HTTP_200_OK
        target.refresh_from_db()
        assert target.role == 'member'

    # ── super_admin privileges ────────────────────────────────────────────────

    def test_super_admin_can_promote_member_to_admin(self):
        """A super_admin can assign any role, including admin (FR-RBAC-2)."""
        super_admin = UserFactory(role='super_admin')
        target = UserFactory()  # member
        client = AuthenticatedAPIClient().authenticate_user(super_admin)

        response = self._post(client, target.id, 'admin')

        assert response.status_code == status.HTTP_200_OK
        target.refresh_from_db()
        assert target.role == 'admin'

    def test_super_admin_cannot_modify_another_super_admin(self):
        """Even a super_admin may not change a peer super_admin's role."""
        super_admin = UserFactory(role='super_admin')
        peer = UserFactory(role='super_admin')
        client = AuthenticatedAPIClient().authenticate_user(super_admin)

        response = self._post(client, peer.id, 'admin')

        assert response.status_code == status.HTTP_403_FORBIDDEN
        peer.refresh_from_db()
        assert peer.role == 'super_admin'

    # ── audit log ─────────────────────────────────────────────────────────────

    def test_audit_log_is_created_on_successful_assignment(self):
        """An immutable audit record must be written for every role change."""
        admin = AdminUserFactory()
        target = UserFactory()
        client = AuthenticatedAPIClient().authenticate_admin(admin)

        initial_log_count = AdminAuditLog.objects.filter(action_type='assign_role').count()
        response = self._post(client, target.id, 'moderator')
        assert response.status_code == status.HTTP_200_OK

        logs = AdminAuditLog.objects.filter(action_type='assign_role')
        assert logs.count() == initial_log_count + 1

        log = logs.latest('created_at')
        assert log.admin == admin
        assert str(log.target_id) == str(target.id)
        assert log.previous_role == 'member'
        assert log.new_role == 'moderator'
        assert log.target_entity == 'user'

    def test_audit_log_is_not_created_on_failed_assignment(self):
        """A rejected request must not create an audit record."""
        admin = AdminUserFactory()
        client = AuthenticatedAPIClient().authenticate_admin(admin)

        initial_count = AdminAuditLog.objects.filter(action_type='assign_role').count()
        # Attempt self-assignment — must fail
        self._post(client, admin.id, 'member')

        assert AdminAuditLog.objects.filter(action_type='assign_role').count() == initial_count

    # ── input validation ──────────────────────────────────────────────────────

    def test_invalid_role_value_returns_400(self):
        """Unrecognised role strings must be rejected before any DB write."""
        admin = AdminUserFactory()
        target = UserFactory()
        client = AuthenticatedAPIClient().authenticate_admin(admin)

        response = self._post(client, target.id, 'superuser')  # not a valid role

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        target.refresh_from_db()
        assert target.role == 'member'

    def test_missing_role_field_returns_400(self):
        """A request without a role body field must be rejected."""
        admin = AdminUserFactory()
        target = UserFactory()
        client = AuthenticatedAPIClient().authenticate_admin(admin)

        response = client.post(self._url(target.id), {}, format='json')

        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_unknown_user_id_returns_404(self):
        """A non-existent target user must return 404."""
        import uuid
        admin = AdminUserFactory()
        client = AuthenticatedAPIClient().authenticate_admin(admin)

        response = self._post(client, uuid.uuid4(), 'member')

        assert response.status_code == status.HTTP_404_NOT_FOUND


@pytest.mark.django_db
@pytest.mark.integration
class TestAdminForumTopicLockPin:
    """Integration tests for admin lock/pin operations on forum topics (FR-03d)."""

    def _lock_url(self, topic_id):
        return f'/api/forum/topics/{topic_id}/lock/'

    def _pin_url(self, topic_id):
        return f'/api/forum/topics/{topic_id}/pin/'

    # ── lock ──────────────────────────────────────────────────────────────────

    def test_admin_can_lock_topic(self):
        """POST lock/ on an unlocked topic sets is_locked=True and writes an audit log."""
        admin = AdminUserFactory()
        topic = ForumTopicFactory(is_locked=False)
        client = AuthenticatedAPIClient().authenticate_admin(admin)

        initial_count = AdminAuditLog.objects.filter(action_type='lock_topic').count()
        response = client.post(self._lock_url(topic.id), format='json')

        assert response.status_code == status.HTTP_200_OK
        topic.refresh_from_db()
        assert topic.is_locked is True

        logs = AdminAuditLog.objects.filter(action_type='lock_topic')
        assert logs.count() == initial_count + 1
        log = logs.latest('created_at')
        assert log.admin == admin
        assert str(log.target_id) == str(topic.id)
        assert log.target_entity == 'forum_topic'
        assert log.reason == 'Locked'

    def test_admin_can_unlock_topic(self):
        """POST lock/ on a locked topic sets is_locked=False and writes an audit log."""
        admin = AdminUserFactory()
        topic = ForumTopicFactory(is_locked=True)
        client = AuthenticatedAPIClient().authenticate_admin(admin)

        initial_count = AdminAuditLog.objects.filter(action_type='lock_topic').count()
        response = client.post(self._lock_url(topic.id), format='json')

        assert response.status_code == status.HTTP_200_OK
        topic.refresh_from_db()
        assert topic.is_locked is False

        logs = AdminAuditLog.objects.filter(action_type='lock_topic')
        assert logs.count() == initial_count + 1
        log = logs.latest('created_at')
        assert log.reason == 'Unlocked'

    def test_non_admin_cannot_lock_topic(self):
        """Regular members must receive 403 on POST lock/."""
        member = UserFactory()
        topic = ForumTopicFactory(is_locked=False)
        client = AuthenticatedAPIClient().authenticate_user(member)

        response = client.post(self._lock_url(topic.id), format='json')

        assert response.status_code == status.HTTP_403_FORBIDDEN
        topic.refresh_from_db()
        assert topic.is_locked is False

    def test_unauthenticated_cannot_lock_topic(self):
        """Unauthenticated requests must receive 401 on POST lock/."""
        topic = ForumTopicFactory(is_locked=False)

        response = APIClient().post(self._lock_url(topic.id), format='json')

        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    # ── pin ───────────────────────────────────────────────────────────────────

    def test_admin_can_pin_topic(self):
        """POST pin/ on an unpinned topic sets is_pinned=True and writes an audit log."""
        admin = AdminUserFactory()
        topic = ForumTopicFactory(is_pinned=False)
        client = AuthenticatedAPIClient().authenticate_admin(admin)

        initial_count = AdminAuditLog.objects.filter(action_type='pin_topic').count()
        response = client.post(self._pin_url(topic.id), format='json')

        assert response.status_code == status.HTTP_200_OK
        topic.refresh_from_db()
        assert topic.is_pinned is True

        logs = AdminAuditLog.objects.filter(action_type='pin_topic')
        assert logs.count() == initial_count + 1
        log = logs.latest('created_at')
        assert log.admin == admin
        assert str(log.target_id) == str(topic.id)
        assert log.target_entity == 'forum_topic'
        assert log.reason == 'Pinned'

    def test_admin_can_unpin_topic(self):
        """POST pin/ on a pinned topic sets is_pinned=False and writes an audit log."""
        admin = AdminUserFactory()
        topic = ForumTopicFactory(is_pinned=True)
        client = AuthenticatedAPIClient().authenticate_admin(admin)

        initial_count = AdminAuditLog.objects.filter(action_type='pin_topic').count()
        response = client.post(self._pin_url(topic.id), format='json')

        assert response.status_code == status.HTTP_200_OK
        topic.refresh_from_db()
        assert topic.is_pinned is False

        logs = AdminAuditLog.objects.filter(action_type='pin_topic')
        assert logs.count() == initial_count + 1
        log = logs.latest('created_at')
        assert log.reason == 'Unpinned'

    def test_non_admin_cannot_pin_topic(self):
        """Regular members must receive 403 on POST pin/."""
        member = UserFactory()
        topic = ForumTopicFactory(is_pinned=False)
        client = AuthenticatedAPIClient().authenticate_user(member)

        response = client.post(self._pin_url(topic.id), format='json')

        assert response.status_code == status.HTTP_403_FORBIDDEN
        topic.refresh_from_db()
        assert topic.is_pinned is False

    def test_unauthenticated_cannot_pin_topic(self):
        """Unauthenticated requests must receive 401 on POST pin/."""
        topic = ForumTopicFactory(is_pinned=False)

        response = APIClient().post(self._pin_url(topic.id), format='json')

        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    # ── idempotency / multiple toggles ────────────────────────────────────────

    def test_lock_and_pin_are_idempotent(self):
        """Toggling lock then lock again returns the topic to its original state."""
        admin = AdminUserFactory()
        topic = ForumTopicFactory(is_locked=False, is_pinned=False)
        client = AuthenticatedAPIClient().authenticate_admin(admin)

        # Lock → unlocked → locked: three round-trips
        for expected in [True, False, True]:
            response = client.post(self._lock_url(topic.id), format='json')
            assert response.status_code == status.HTTP_200_OK
            topic.refresh_from_db()
            assert topic.is_locked is expected

        # Pin → unpinned → pinned: three round-trips
        for expected in [True, False, True]:
            response = client.post(self._pin_url(topic.id), format='json')
            assert response.status_code == status.HTTP_200_OK
            topic.refresh_from_db()
            assert topic.is_pinned is expected

    def test_lock_and_pin_are_independent(self):
        """Locking a topic must not affect its pin state and vice versa."""
        admin = AdminUserFactory()
        topic = ForumTopicFactory(is_locked=False, is_pinned=False)
        client = AuthenticatedAPIClient().authenticate_admin(admin)

        client.post(self._lock_url(topic.id), format='json')
        topic.refresh_from_db()
        assert topic.is_locked is True
        assert topic.is_pinned is False

        client.post(self._pin_url(topic.id), format='json')
        topic.refresh_from_db()
        assert topic.is_locked is True
        assert topic.is_pinned is True
