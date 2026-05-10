"""Cascade audit for ``Report`` foreign keys (preventive).

PR #570 routed ``Report.reported_forum_topic`` through a soft-delete on
``ForumTopic`` so a topic deletion no longer wipes the moderation trail.
This file pins the equivalent guarantee for every other parent the
``Report`` model points at, so a future migration that adds a hard-delete
path on any of these parents cannot silently recur the same class of bug.

The assertions below describe the *current* (intended) behaviour of each
parent — soft-delete via a state column, soft-delete via ``is_deleted``,
or no destroy endpoint at all — and confirm that report rows survive each
parent's normal removal flow.
"""

import pytest

from api.models import (
    ForumPost,
    Handshake,
    Report,
    Service,
    User,
)
from api.tests.helpers.factories import (
    ForumPostFactory,
    HandshakeFactory,
    ServiceFactory,
    UserFactory,
)
from api.tests.helpers.assertions import assert_api_response, assert_problem_detail
from api.tests.helpers.test_client import AuthenticatedAPIClient


def _make_report(**kwargs) -> Report:
    """Helper: minimal Report row with the FK under test."""
    defaults = {
        "type": "spam",
        "description": "audit fixture",
    }
    defaults.update(kwargs)
    return Report.objects.create(**defaults)


@pytest.mark.django_db
@pytest.mark.integration
class TestReportCascadeAudit:
    """Each parent of ``Report`` must leave the report row intact on removal."""

    # ── reported_service ────────────────────────────────────────────────────

    def test_reported_service_soft_delete_preserves_report(self):
        """``ServiceViewSet.destroy`` flips status='Cancelled' instead of DELETE.

        The Service row stays, so the ``CASCADE`` FK never fires and the
        moderation trail is preserved. This is the intended (current) flow.
        """
        reporter = UserFactory()
        service_owner = UserFactory()
        service = ServiceFactory(user=service_owner)
        report = _make_report(reporter=reporter, reported_service=service)

        client = AuthenticatedAPIClient().authenticate_user(service_owner)
        response = client.delete(f"/api/services/{service.id}/")
        assert_api_response(response, 204)

        # Service row survives (soft-delete).
        service.refresh_from_db()
        assert service.status == "Cancelled"
        # Report still attached to the surviving service.
        report.refresh_from_db()
        assert report.reported_service_id == service.id

    # ── reported_forum_post ─────────────────────────────────────────────────

    def test_reported_forum_post_soft_delete_preserves_report(self):
        """``ForumPostViewSet.destroy`` sets ``is_deleted=True``; row stays."""
        reporter = UserFactory()
        post = ForumPostFactory()
        report = _make_report(reporter=reporter, reported_forum_post=post)

        client = AuthenticatedAPIClient().authenticate_user(post.author)
        response = client.delete(f"/api/forum/posts/{post.id}/")
        assert_api_response(response, 204)

        post.refresh_from_db()
        assert post.is_deleted is True
        # Report still references the (soft-deleted) post.
        report.refresh_from_db()
        assert report.reported_forum_post_id == post.id

    # ── related_handshake ───────────────────────────────────────────────────

    def test_related_handshake_has_no_destroy_endpoint(self):
        """``HandshakeViewSet`` exposes only state-transition actions.

        Handshakes are never row-deleted via the API; the DELETE method is
        not even allowed on the detail route. The CASCADE on
        ``related_handshake`` is therefore unreachable through normal flows.
        """
        reporter = UserFactory()
        handshake = HandshakeFactory()
        report = _make_report(reporter=reporter, related_handshake=handshake)

        client = AuthenticatedAPIClient().authenticate_user(reporter)
        response = client.delete(f"/api/handshakes/{handshake.id}/")
        # DRF returns 405 (Method Not Allowed) for unsupported HTTP verbs.
        # 403 / 404 are equally valid "no destructive operation here" replies.
        assert response.status_code in (405, 403, 404)

        handshake.refresh_from_db()
        report.refresh_from_db()
        assert report.related_handshake_id == handshake.id

    # ── reported_user ───────────────────────────────────────────────────────

    def test_reported_user_ban_preserves_report(self):
        """Admin ``ban`` flips ``is_active=False``; the User row is not deleted."""
        admin = UserFactory(role="admin", is_staff=True)
        reporter = UserFactory()
        target = UserFactory()
        report = _make_report(reporter=reporter, reported_user=target)

        client = AuthenticatedAPIClient().authenticate_user(admin)
        response = client.post(f"/api/admin/users/{target.id}/ban/")
        assert_api_response(response, 200)

        target.refresh_from_db()
        assert target.is_active is False
        report.refresh_from_db()
        assert report.reported_user_id == target.id

    # ── reporter ────────────────────────────────────────────────────────────

    def test_reporter_has_no_self_delete_endpoint(self):
        """The API does not expose a self-delete; reporter rows survive admin flows.

        Admin actions on a user are warn / ban / unban — none hard-delete.
        This pins the assumption so a future "delete account" endpoint that
        forgets to soft-delete cannot silently wipe filed reports through
        the ``CASCADE`` on ``Report.reporter``.
        """
        admin = UserFactory(role="admin", is_staff=True)
        reporter = UserFactory()
        target = UserFactory()
        report = _make_report(reporter=reporter, reported_user=target)

        client = AuthenticatedAPIClient().authenticate_user(reporter)
        # Self-delete on /api/users/me/ must not be available; 401/403/404/405
        # all encode "no destructive operation here".
        me_delete = client.delete("/api/users/me/")
        assert me_delete.status_code in (401, 403, 404, 405)

        # Admin ban on the reporter likewise leaves the row in place.
        admin_client = AuthenticatedAPIClient().authenticate_user(admin)
        ban = admin_client.post(f"/api/admin/users/{reporter.id}/ban/")
        assert_api_response(ban, 200)
        reporter.refresh_from_db()
        assert reporter.is_active is False

        report.refresh_from_db()
        assert report.reporter_id == reporter.id


@pytest.mark.django_db
@pytest.mark.integration
class TestReportCascadeAtModelLevel:
    """If a parent is *ever* hard-deleted at the ORM level, document the fallout.

    These tests simulate the worst case (e.g. a future shell session, a
    migration's data-cleanup, or a GDPR purge) and document precisely how
    each FK behaves so the moderation team and any future migration author
    knows the blast radius.
    """

    def test_hard_delete_of_handshake_cascades(self):
        """``related_handshake`` is CASCADE: hard-delete wipes the report row.

        This is the expected ORM behaviour today; no API path triggers it,
        but this assertion makes the contract explicit so a future change
        that introduces a hard-delete (e.g. data-purge command) is forced
        to acknowledge what it is removing.
        """
        reporter = UserFactory()
        handshake = HandshakeFactory()
        report = _make_report(reporter=reporter, related_handshake=handshake)
        report_id = report.id

        Handshake.objects.filter(pk=handshake.pk).delete()

        assert not Report.objects.filter(pk=report_id).exists()

    def test_hard_delete_of_service_cascades(self):
        """``reported_service`` is CASCADE — same documentation contract."""
        reporter = UserFactory()
        service = ServiceFactory()
        report = _make_report(reporter=reporter, reported_service=service)
        report_id = report.id

        Service.objects.filter(pk=service.pk).delete()

        assert not Report.objects.filter(pk=report_id).exists()

    def test_hard_delete_of_forum_post_cascades(self):
        """``reported_forum_post`` is CASCADE — same documentation contract."""
        reporter = UserFactory()
        post = ForumPostFactory()
        report = _make_report(reporter=reporter, reported_forum_post=post)
        report_id = report.id

        ForumPost.objects.filter(pk=post.pk).delete()

        assert not Report.objects.filter(pk=report_id).exists()

    def test_hard_delete_of_reported_user_cascades(self):
        """``reported_user`` is CASCADE — same documentation contract."""
        reporter = UserFactory()
        target = UserFactory()
        report = _make_report(reporter=reporter, reported_user=target)
        report_id = report.id

        User.objects.filter(pk=target.pk).delete()

        assert not Report.objects.filter(pk=report_id).exists()
