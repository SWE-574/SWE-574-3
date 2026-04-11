"""
Integration tests for review photo attachments (FR-14f, FR-14g, FR-15g, FR-15h, NFR-14d).

Covers:
  FR-14f  — users can attach up to 3 images to a review (JPG/PNG/GIF/WebP, ≤10 MB each)
  FR-14g  — photos are stored and returned in the CommentSerializer media field
  FR-15g  — same photo constraints apply to event evaluation reviews
  FR-15h  — event reviews visible immediately; blind-review suppression must not apply
  NFR-14d — photo upload failure must not block the evaluation itself
"""
import io
import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from django.utils import timezone
from datetime import timedelta
from rest_framework import status

from api.tests.helpers.factories import (
    UserFactory, ServiceFactory, HandshakeFactory, CommentFactory,
)
from api.tests.helpers.test_client import AuthenticatedAPIClient
from api.models import Comment, CommentMedia


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _small_image(name: str = 'photo.jpg', fmt: str = 'image/jpeg') -> SimpleUploadedFile:
    """Return a minimal valid 1×1 JPEG as an in-memory upload."""
    # Minimal valid JPEG bytes (1x1 white pixel)
    jpeg_bytes = (
        b'\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x00\x00\x01\x00\x01\x00\x00'
        b'\xff\xdb\x00C\x00\x08\x06\x06\x07\x06\x05\x08\x07\x07\x07\t\t'
        b'\x08\n\x0c\x14\r\x0c\x0b\x0b\x0c\x19\x12\x13\x0f\x14\x1d\x1a'
        b'\x1f\x1e\x1d\x1a\x1c\x1c $.\' ",#\x1c\x1c(7),01444\x1f\'9=82<.342\x1e\xc0'
        b'\x00\x0b\x08\x00\x01\x00\x01\x01\x01\x11\x00\xff\xc4\x00\x1f\x00'
        b'\x00\x01\x05\x01\x01\x01\x01\x01\x01\x00\x00\x00\x00\x00\x00\x00'
        b'\x00\x01\x02\x03\x04\x05\x06\x07\x08\t\n\x0b\xff\xda\x00\x08\x01'
        b'\x01\x00\x00?\x00\xfb\xd2\x8a(\x03\xff\xd9'
    )
    return SimpleUploadedFile(name, jpeg_bytes, content_type=fmt)


def _make_completed_offer_handshake(provider=None, requester=None):
    provider = provider or UserFactory()
    requester = requester or UserFactory()
    service = ServiceFactory(user=provider, type='Offer')
    handshake = HandshakeFactory(
        service=service,
        requester=requester,
        status='completed',
        evaluation_window_starts_at=timezone.now() - timedelta(hours=2),
        evaluation_window_ends_at=timezone.now() + timedelta(hours=46),
        evaluation_window_closed_at=None,
    )
    # Pre-create the reputation so add-review accepts the request
    from api.models import ReputationRep
    ReputationRep.objects.create(
        handshake=handshake,
        giver=requester,
        receiver=provider,
        is_punctual=True,
    )
    return handshake


def _make_completed_event_handshake(organizer=None, participant=None):
    organizer = organizer or UserFactory()
    participant = participant or UserFactory()
    event = ServiceFactory(
        user=organizer,
        type='Event',
        status='Completed',
        event_completed_at=timezone.now() - timedelta(hours=2),
    )
    handshake = HandshakeFactory(
        service=event,
        requester=participant,
        status='attended',
        provisioned_hours=0,
        evaluation_window_starts_at=timezone.now() - timedelta(hours=2),
        evaluation_window_ends_at=timezone.now() + timedelta(hours=46),
        evaluation_window_closed_at=None,
    )
    from api.models import ReputationRep
    ReputationRep.objects.create(
        handshake=handshake,
        giver=participant,
        receiver=organizer,
        is_punctual=True,
    )
    return handshake


# ---------------------------------------------------------------------------
# FR-14f / FR-14g — Photo attachment on service (Offer/Need) reviews
# ---------------------------------------------------------------------------

@pytest.mark.django_db
@pytest.mark.integration
class TestReviewPhotoAttachment:
    """FR-14f / FR-14g: photo attachment to service exchange reviews."""

    def test_attach_single_image_to_review(self):
        """FR-14f: a user can attach one image to a review via /reputation/add-review/."""
        handshake = _make_completed_offer_handshake()
        requester = handshake.requester

        client = AuthenticatedAPIClient()
        client.authenticate_user(requester)

        img = _small_image('review.jpg')
        response = client.post(
            '/api/reputation/add-review/',
            data={'handshake_id': str(handshake.id), 'images': img},
            format='multipart',
        )

        assert response.status_code == status.HTTP_201_CREATED
        assert CommentMedia.objects.filter(
            comment__related_handshake=handshake,
            comment__user=requester,
        ).count() == 1

    def test_attach_up_to_three_images(self):
        """FR-14f: up to 3 images allowed per review."""
        handshake = _make_completed_offer_handshake()
        requester = handshake.requester

        client = AuthenticatedAPIClient()
        client.authenticate_user(requester)

        images = [_small_image(f'img{i}.jpg') for i in range(3)]
        response = client.post(
            '/api/reputation/add-review/',
            data={
                'handshake_id': str(handshake.id),
                'images': images,
            },
            format='multipart',
        )

        assert response.status_code == status.HTTP_201_CREATED
        assert CommentMedia.objects.filter(
            comment__related_handshake=handshake,
        ).count() == 3

    def test_more_than_three_images_rejected(self):
        """FR-14f: attaching more than 3 images returns 400."""
        handshake = _make_completed_offer_handshake()
        requester = handshake.requester

        client = AuthenticatedAPIClient()
        client.authenticate_user(requester)

        images = [_small_image(f'img{i}.jpg') for i in range(4)]
        response = client.post(
            '/api/reputation/add-review/',
            data={'handshake_id': str(handshake.id), 'images': images},
            format='multipart',
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert 'Maximum 3 images' in (response.data.get('detail') or '')

    def test_unsupported_image_format_rejected(self):
        """FR-14f: only JPG, PNG, GIF, WebP are allowed."""
        handshake = _make_completed_offer_handshake()
        requester = handshake.requester

        client = AuthenticatedAPIClient()
        client.authenticate_user(requester)

        bad_file = SimpleUploadedFile('doc.pdf', b'%PDF-1.4', content_type='application/pdf')
        response = client.post(
            '/api/reputation/add-review/',
            data={'handshake_id': str(handshake.id), 'images': bad_file},
            format='multipart',
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert 'Unsupported image format' in (response.data.get('detail') or '')

    def test_image_url_returned_in_comment_serializer(self):
        """FR-14g: GET /api/services/{id}/comments/ returns media list with file_url."""
        handshake = _make_completed_offer_handshake()
        requester = handshake.requester
        service = handshake.service

        # Create the comment and attach media directly
        comment = Comment.objects.create(
            service=service,
            user=requester,
            body='Great service!',
            is_verified_review=True,
            related_handshake=handshake,
        )
        media = CommentMedia.objects.create(
            comment=comment,
            file_url='https://storage.example.com/comment_media/photo.jpg',
        )

        # The blind_target_user_id for a comment by requester is the provider (service.user).
        # To make blind_target_positive_eval=True (so the comment isn't suppressed), we need
        # a ReputationRep where giver=provider.  _make_completed_offer_handshake already added
        # requester→provider; add provider→requester here as well.
        from api.models import ReputationRep
        ReputationRep.objects.get_or_create(
            handshake=handshake,
            giver=service.user,
            defaults={'receiver': requester, 'is_punctual': True},
        )

        client = AuthenticatedAPIClient()
        client.authenticate_user(requester)
        response = client.get(f'/api/services/{service.id}/comments/')

        assert response.status_code == status.HTTP_200_OK
        results = response.data.get('results', response.data)
        comment_data = next((c for c in results if str(c['id']) == str(comment.id)), None)
        assert comment_data is not None, 'Comment not found in response'
        assert 'media' in comment_data
        assert len(comment_data['media']) == 1
        assert comment_data['media'][0]['file_url'] == media.file_url

    def test_attach_images_to_existing_comment(self):
        """FR-14f/NFR-14d: images attach to an existing comment created during reputation submit."""
        handshake = _make_completed_offer_handshake()
        requester = handshake.requester
        service = handshake.service

        # Simulate: reputation submit already created a Comment (the normal flow)
        existing_comment = Comment.objects.create(
            service=service,
            user=requester,
            body='Loved it!',
            is_verified_review=True,
            related_handshake=handshake,
        )

        client = AuthenticatedAPIClient()
        client.authenticate_user(requester)

        img = _small_image('extra.jpg')
        response = client.post(
            '/api/reputation/add-review/',
            data={'handshake_id': str(handshake.id), 'images': img},
            format='multipart',
        )

        assert response.status_code == status.HTTP_201_CREATED
        # Image must be attached to the existing comment, not a new one
        assert Comment.objects.filter(
            related_handshake=handshake, user=requester, is_verified_review=True,
        ).count() == 1
        assert CommentMedia.objects.filter(comment=existing_comment).count() == 1

    def test_unauthenticated_user_cannot_attach_images(self):
        """Security: unauthenticated requests to add-review are rejected."""
        handshake = _make_completed_offer_handshake()

        client = AuthenticatedAPIClient()  # not authenticated
        img = _small_image()
        response = client.post(
            '/api/reputation/add-review/',
            data={'handshake_id': str(handshake.id), 'images': img},
            format='multipart',
        )

        assert response.status_code in (
            status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN
        )


# ---------------------------------------------------------------------------
# FR-15g — Photo attachment on event evaluation reviews
# ---------------------------------------------------------------------------

@pytest.mark.django_db
@pytest.mark.integration
class TestEventReviewPhotoAttachment:
    """FR-15g: photo attachment applies equally to event evaluations."""

    def test_attendee_can_attach_image_to_event_review(self):
        """FR-15g: attendee attaches a photo to their event evaluation."""
        handshake = _make_completed_event_handshake()
        participant = handshake.requester

        client = AuthenticatedAPIClient()
        client.authenticate_user(participant)

        img = _small_image('event_review.jpg')
        response = client.post(
            '/api/reputation/add-review/',
            data={'handshake_id': str(handshake.id), 'images': img},
            format='multipart',
        )

        assert response.status_code == status.HTTP_201_CREATED
        assert CommentMedia.objects.filter(
            comment__related_handshake=handshake,
            comment__user=participant,
        ).count() == 1

    def test_event_review_photo_visible_on_service_detail(self):
        """FR-15g: photo attached to event review appears in service comments endpoint."""
        handshake = _make_completed_event_handshake()
        participant = handshake.requester
        event = handshake.service

        comment = Comment.objects.create(
            service=event,
            user=participant,
            body='Amazing event!',
            is_verified_review=True,
            related_handshake=handshake,
        )
        CommentMedia.objects.create(
            comment=comment,
            file_url='https://storage.example.com/comment_media/event_photo.jpg',
        )

        client = AuthenticatedAPIClient()
        client.authenticate_user(participant)
        response = client.get(f'/api/services/{event.id}/comments/')

        assert response.status_code == status.HTTP_200_OK
        results = response.data.get('results', response.data)
        comment_data = next((c for c in results if str(c['id']) == str(comment.id)), None)
        assert comment_data is not None
        assert len(comment_data['media']) == 1

    def test_event_review_photo_same_constraints_as_service_review(self):
        """FR-15g: same 3-image limit applies to event reviews."""
        handshake = _make_completed_event_handshake()
        participant = handshake.requester

        client = AuthenticatedAPIClient()
        client.authenticate_user(participant)

        images = [_small_image(f'ev{i}.jpg') for i in range(4)]
        response = client.post(
            '/api/reputation/add-review/',
            data={'handshake_id': str(handshake.id), 'images': images},
            format='multipart',
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST


# ---------------------------------------------------------------------------
# FR-15h — Event reviews not suppressed by blind-review filter
# ---------------------------------------------------------------------------

@pytest.mark.django_db
@pytest.mark.integration
class TestEventReviewImmediateVisibility:
    """FR-15h: event reviews must be visible immediately, not suppressed by blind-review rules."""

    def _make_event_with_open_window(self):
        organizer = UserFactory()
        participant = UserFactory()
        event = ServiceFactory(
            user=organizer,
            type='Event',
            status='Completed',
            event_completed_at=timezone.now() - timedelta(hours=1),
        )
        handshake = HandshakeFactory(
            service=event,
            requester=participant,
            status='attended',
            provisioned_hours=0,
            evaluation_window_starts_at=timezone.now() - timedelta(hours=1),
            evaluation_window_ends_at=timezone.now() + timedelta(hours=47),  # still open
            evaluation_window_closed_at=None,
        )
        return event, handshake, organizer, participant

    def test_event_review_visible_while_window_open(self):
        """FR-15h: event review is returned immediately, even when both eval flags are False."""
        event, handshake, organizer, participant = self._make_event_with_open_window()

        Comment.objects.create(
            service=event,
            user=participant,
            body='Brilliant event, well organised!',
            is_verified_review=True,
            related_handshake=handshake,
        )

        client = AuthenticatedAPIClient()
        client.authenticate_user(participant)
        response = client.get(f'/api/services/{event.id}/comments/')

        assert response.status_code == status.HTTP_200_OK
        results = response.data.get('results', response.data)
        assert len(results) == 1, (
            'Event review must be visible immediately — '
            'blind-review suppression must not apply to Event handshakes'
        )

    def test_event_review_visible_in_organizer_profile(self):
        """FR-15h: event review appears in organizer verified-reviews with role=organizer."""
        event, handshake, organizer, participant = self._make_event_with_open_window()

        Comment.objects.create(
            service=event,
            user=participant,
            body='Great event!',
            is_verified_review=True,
            related_handshake=handshake,
        )

        client = AuthenticatedAPIClient()
        client.authenticate_user(participant)
        response = client.get(
            f'/api/users/{organizer.id}/verified-reviews/',
            {'role': 'organizer'},
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data['count'] == 1

    def test_offer_review_still_suppressed_during_window(self):
        """
        Regression: blind-review suppression must still apply to Offer/Need handshakes.
        This ensures FR-15h fix is scoped to Events only.
        """
        provider = UserFactory()
        requester = UserFactory()
        service = ServiceFactory(user=provider, type='Offer')
        handshake = HandshakeFactory(
            service=service,
            requester=requester,
            status='completed',
            evaluation_window_starts_at=timezone.now() - timedelta(hours=1),
            evaluation_window_ends_at=timezone.now() + timedelta(hours=47),
            evaluation_window_closed_at=None,
            # No ReputationRep created → blind_target_positive_eval=False → comment suppressed
        )
        Comment.objects.create(
            service=service,
            user=requester,
            body='Nice service.',
            is_verified_review=True,
            related_handshake=handshake,
        )

        client = AuthenticatedAPIClient()
        client.authenticate_user(requester)
        response = client.get(f'/api/services/{service.id}/comments/')

        assert response.status_code == status.HTTP_200_OK
        results = response.data.get('results', response.data)
        # Must be hidden — both flags False and window still open
        assert len(results) == 0, (
            'Offer review must remain suppressed while evaluation window is open '
            'and no reciprocal evaluation has been submitted'
        )

    def test_organizer_section_excludes_offer_reviews(self):
        """FR-15h companion: role=organizer must return only Event reviews, not Offer/Need."""
        organizer = UserFactory()

        # Event review — should appear
        event = ServiceFactory(user=organizer, type='Event', status='Completed',
                               event_completed_at=timezone.now() - timedelta(hours=2))
        participant = UserFactory()
        event_handshake = HandshakeFactory(
            service=event, requester=participant, status='attended', provisioned_hours=0,
            evaluation_window_ends_at=timezone.now() + timedelta(hours=46),
        )
        Comment.objects.create(
            service=event, user=participant, body='Great event!',
            is_verified_review=True, related_handshake=event_handshake,
        )

        # Offer review — must NOT appear in organizer section
        offer = ServiceFactory(user=organizer, type='Offer')
        requester = UserFactory()
        offer_handshake = HandshakeFactory(
            service=offer, requester=requester, status='completed',
            evaluation_window_ends_at=timezone.now() - timedelta(hours=1),
            evaluation_window_closed_at=timezone.now() - timedelta(hours=1),
        )
        Comment.objects.create(
            service=offer, user=requester, body='Good offer.',
            is_verified_review=True, related_handshake=offer_handshake,
        )

        client = AuthenticatedAPIClient()
        client.authenticate_user(participant)
        response = client.get(
            f'/api/users/{organizer.id}/verified-reviews/',
            {'role': 'organizer'},
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data['count'] == 1
        assert response.data['results'][0]['body'] == 'Great event!'
