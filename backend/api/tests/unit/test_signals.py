"""
Unit tests for Django signals
"""
import pytest
from unittest.mock import patch

from api.models import Service, Comment, ReputationRep, ChatRoom, ScoreAuditLog
from api.tests.helpers.factories import (
    ServiceFactory, CommentFactory, ReputationRepFactory, HandshakeFactory, UserFactory
)


@pytest.mark.django_db
@pytest.mark.unit
class TestServiceSignals:
    """Test service-related signals"""
    
    def test_chat_room_created_on_service_creation(self):
        """Test ChatRoom is created when Service is created"""
        service = ServiceFactory()
        assert ChatRoom.objects.filter(related_service=service).exists()
    
    @patch('api.signals.transaction.on_commit', side_effect=lambda fn: fn())
    @patch('api.signals._update_service_hot_score')
    def test_hot_score_update_on_comment(self, mock_update, _mock_on_commit):
        """Test hot score updates when comment is created"""
        service = ServiceFactory(status='Active')
        CommentFactory(service=service)
        mock_update.assert_called()
    
    @patch('api.signals.transaction.on_commit', side_effect=lambda fn: fn())
    @patch('api.signals._update_service_hot_score')
    def test_hot_score_update_on_reputation(self, mock_update, _mock_on_commit):
        """Test hot score updates when reputation is created"""
        user = UserFactory()
        service = ServiceFactory(user=user, status='Active')
        giver = UserFactory()
        handshake = HandshakeFactory(service=service, requester=giver, status='completed')
        ReputationRepFactory(handshake=handshake, giver=giver, receiver=user)
        mock_update.assert_called()


# ---------------------------------------------------------------------------
# #450 section 1a -- silent error swallowing in _update_service_hot_score
# ---------------------------------------------------------------------------

import logging


@pytest.mark.django_db
@pytest.mark.unit
class TestSilentErrorLogged:
    """The hot_score updater must log on failure, not swallow."""

    def test_calculate_failure_is_logged(self):
        """Patch the logger directly -- pytest caplog can be stymied by Django's
        LOGGING dictConfig (propagate=False on app loggers). Asserting the
        logger.exception call directly is more robust and still verifies the
        bare 'except: pass' is gone.
        """
        from api.signals import _update_service_hot_score
        service = ServiceFactory(status='Active', type='Offer')

        with patch(
            'api.signals._compute_service_factors', side_effect=RuntimeError('boom'),
        ), patch('api.signals.logger') as mock_logger:
            _update_service_hot_score(service)

        mock_logger.exception.assert_called_once()
        call_args = mock_logger.exception.call_args
        assert 'hot_score update failed' in call_args[0][0]
        assert call_args[0][1] == service.pk


@pytest.mark.django_db
@pytest.mark.unit
class TestServiceDeleteCascade:
    """Deleting a Service must not raise an FK violation via the
    ScoreAuditLog write that the post_delete handlers on its children
    (Comment, ReputationRep, NegativeRep) would otherwise enqueue.
    """

    def test_delete_service_with_comments_does_not_violate_fk(self):
        service = ServiceFactory(status='Active', type='Offer')
        CommentFactory(service=service)
        CommentFactory(service=service)

        # No IntegrityError at COMMIT.
        service.delete()

        assert not Service.objects.filter(pk=service.pk).exists()
        assert not ScoreAuditLog.objects.filter(service_id=service.pk).exists()

    def test_bulk_delete_services_does_not_violate_fk(self):
        s1 = ServiceFactory(status='Active', type='Offer')
        s2 = ServiceFactory(status='Active', type='Offer')
        CommentFactory(service=s1)
        CommentFactory(service=s2)

        Service.objects.filter(pk__in=[s1.pk, s2.pk]).delete()

        assert not Service.objects.filter(pk__in=[s1.pk, s2.pk]).exists()
