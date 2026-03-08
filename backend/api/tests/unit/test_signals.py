"""
Unit tests for Django signals
"""
import pytest
from unittest.mock import patch

from api.models import Service, Comment, ReputationRep, ChatRoom
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
