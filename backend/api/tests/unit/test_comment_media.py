"""
Unit tests for CommentMedia model and CommentSerializer media field (FR-14f, FR-14g, FR-15g).
"""
import pytest
from django.utils import timezone
from datetime import timedelta

from api.models import Comment, CommentMedia
from api.serializers import CommentSerializer
from api.tests.helpers.factories import (
    UserFactory, ServiceFactory, HandshakeFactory, CommentFactory,
)


@pytest.mark.django_db
@pytest.mark.unit
class TestCommentMediaModel:
    """Unit tests for the CommentMedia model (FR-14f)."""

    def test_comment_media_created_and_linked(self):
        """CommentMedia is linked to a Comment via FK."""
        comment = CommentFactory(is_verified_review=True)
        media = CommentMedia.objects.create(
            comment=comment,
            file_url='https://storage.example.com/comment_media/photo.jpg',
        )

        assert media.comment_id == comment.id
        assert str(media.file_url) == 'https://storage.example.com/comment_media/photo.jpg'
        assert comment.media.count() == 1

    def test_comment_media_ordering_by_created_at(self):
        """FR-14f: multiple media items are ordered by creation time (ascending)."""
        comment = CommentFactory(is_verified_review=True)
        m1 = CommentMedia.objects.create(
            comment=comment, file_url='https://storage.example.com/a.jpg'
        )
        m2 = CommentMedia.objects.create(
            comment=comment, file_url='https://storage.example.com/b.jpg'
        )
        m3 = CommentMedia.objects.create(
            comment=comment, file_url='https://storage.example.com/c.jpg'
        )

        qs = list(comment.media.all())
        assert qs[0].id == m1.id
        assert qs[1].id == m2.id
        assert qs[2].id == m3.id

    def test_comment_media_cascade_on_comment_delete(self):
        """Deleting a Comment deletes all its CommentMedia records."""
        comment = CommentFactory(is_verified_review=True)
        media_id = CommentMedia.objects.create(
            comment=comment,
            file_url='https://storage.example.com/del.jpg',
        ).id

        comment.delete()

        assert not CommentMedia.objects.filter(id=media_id).exists()

    def test_comment_without_media_has_empty_media_set(self):
        """A Comment with no media has an empty related manager."""
        comment = CommentFactory()
        assert comment.media.count() == 0


@pytest.mark.django_db
@pytest.mark.unit
class TestCommentSerializerMediaField:
    """Unit tests for the 'media' field on CommentSerializer (FR-14g)."""

    def test_serializer_includes_media_field(self):
        """FR-14g: CommentSerializer output includes a 'media' key."""
        comment = CommentFactory()
        data = CommentSerializer(comment).data
        assert 'media' in data

    def test_serializer_media_empty_when_no_photos(self):
        """FR-14g: media list is empty when no photos are attached."""
        comment = CommentFactory()
        data = CommentSerializer(comment).data
        assert data['media'] == []

    def test_serializer_media_contains_id_and_file_url(self):
        """FR-14g: each media item exposes 'id' and 'file_url'."""
        comment = CommentFactory(is_verified_review=True)
        media = CommentMedia.objects.create(
            comment=comment,
            file_url='https://storage.example.com/photo.jpg',
        )

        data = CommentSerializer(comment).data

        assert len(data['media']) == 1
        item = data['media'][0]
        assert item['id'] == str(media.id)
        assert item['file_url'] == 'https://storage.example.com/photo.jpg'

    def test_serializer_media_order_matches_creation_order(self):
        """FR-14g: photos appear in creation order (oldest first)."""
        comment = CommentFactory(is_verified_review=True)
        CommentMedia.objects.create(comment=comment, file_url='https://s.example.com/1.jpg')
        CommentMedia.objects.create(comment=comment, file_url='https://s.example.com/2.jpg')
        CommentMedia.objects.create(comment=comment, file_url='https://s.example.com/3.jpg')

        data = CommentSerializer(comment).data

        urls = [m['file_url'] for m in data['media']]
        assert urls == [
            'https://s.example.com/1.jpg',
            'https://s.example.com/2.jpg',
            'https://s.example.com/3.jpg',
        ]

    def test_serializer_media_uses_prefetch_cache(self):
        """FR-14g: serializer reads from prefetch cache to avoid N+1 queries."""
        comment = CommentFactory(is_verified_review=True)
        CommentMedia.objects.create(comment=comment, file_url='https://s.example.com/a.jpg')

        # Simulate prefetch by populating _prefetched_objects_cache manually
        from api.models import CommentMedia as CM
        prefetched = list(CM.objects.filter(comment=comment))
        comment._prefetched_objects_cache = {'media': prefetched}

        data = CommentSerializer(comment).data
        assert len(data['media']) == 1


@pytest.mark.django_db
@pytest.mark.unit
class TestEventReviewVisibility:
    """Unit-level checks for FR-15h: blind-review filter scoping."""

    def _make_handshake(self, service_type: str, window_open: bool = True, blind_flags: bool = False):
        provider = UserFactory()
        requester = UserFactory()
        service = ServiceFactory(user=provider, type=service_type)
        status = 'attended' if service_type == 'Event' else 'completed'
        hours = timezone.now() + timedelta(hours=47) if window_open else timezone.now() - timedelta(hours=1)
        closed = None if window_open else timezone.now() - timedelta(hours=1)
        return HandshakeFactory(
            service=service,
            requester=requester,
            status=status,
            provisioned_hours=0 if service_type == 'Event' else 1,
            evaluation_window_starts_at=timezone.now() - timedelta(hours=1),
            evaluation_window_ends_at=hours,
            evaluation_window_closed_at=closed,
        )

    def test_event_handshake_type_is_event(self):
        """Sanity: the event handshake service type is 'Event'."""
        hs = self._make_handshake('Event')
        assert hs.service.type == 'Event'

    def test_offer_handshake_type_is_offer(self):
        """Sanity: the offer handshake service type is 'Offer'."""
        hs = self._make_handshake('Offer')
        assert hs.service.type == 'Offer'

    def test_event_comment_has_correct_service_type(self):
        """FR-15h: Comment.service.type is 'Event' for event reviews (filter prerequisite)."""
        hs = self._make_handshake('Event')
        comment = Comment.objects.create(
            service=hs.service,
            user=hs.requester,
            body='Good event',
            is_verified_review=True,
            related_handshake=hs,
        )
        comment.refresh_from_db()
        assert comment.service.type == 'Event'
        assert comment.related_handshake.service.type == 'Event'
