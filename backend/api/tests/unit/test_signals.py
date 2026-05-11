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


@pytest.mark.django_db
class TestTagEnrichmentSignal:
    """post_save on Tag should backfill parent_qid + depth + entity_type via
    Wikidata. Idempotent (a second save with parent_qid set is a no-op).
    Defensive (Wikidata failures swallow without breaking the parent save).
    """

    def test_qid_tag_gets_enriched_with_claims(self):
        from api.models import Tag

        with (
            patch(
                'api.wikidata.fetch_wikidata_claims',
                return_value={'instance_of': ['Q735'], 'subclass_of': []},
            ),
            patch('api.wikidata.resolve_entity_type', return_value='art'),
        ):
            tag = Tag.objects.create(id='Q11629', name='Painting')

        tag.refresh_from_db()
        assert tag.parent_qid == 'Q735'
        assert tag.depth == 1
        assert tag.entity_type == 'art'

    def test_idempotent_when_parent_already_set(self):
        from api.models import Tag

        # Pre-populated tag -- signal should not call Wikidata.
        Tag.objects.create(id='Q11629', name='Painting', parent_qid='Q735', depth=1)
        with patch('api.wikidata.fetch_wikidata_claims') as claims_mock:
            tag = Tag.objects.get(id='Q11629')
            tag.name = 'Painting (renamed)'
            tag.save()
            claims_mock.assert_not_called()

    def test_non_qid_name_resolves_via_search(self):
        from api.models import Tag

        with (
            patch(
                'api.wikidata.search_wikidata_items',
                return_value=[{'id': 'Q1071', 'label': 'Hiking'}],
            ),
            patch(
                'api.wikidata.fetch_wikidata_claims',
                return_value={'instance_of': ['Q56297'], 'subclass_of': []},
            ),
            patch('api.wikidata.resolve_entity_type', return_value='sports'),
        ):
            tag = Tag.objects.create(id='hiking', name='hiking')

        tag.refresh_from_db()
        assert tag.parent_qid == 'Q56297'
        assert tag.entity_type == 'sports'

    def test_wikidata_failure_does_not_break_save(self):
        from api.models import Tag

        with (
            patch('api.wikidata.search_wikidata_items', side_effect=Exception('boom')),
            patch('api.wikidata.fetch_wikidata_claims', side_effect=Exception('boom')),
        ):
            tag = Tag.objects.create(id='free-text', name='free-text')

        assert Tag.objects.filter(pk=tag.pk).exists()
