"""
Integration tests for forum API endpoints
"""
import pytest
from datetime import timedelta
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from api.tests.helpers.factories import (
    UserFactory, AdminUserFactory, ForumCategoryFactory, ForumTopicFactory, ForumPostFactory
)
from api.tests.helpers.test_client import AuthenticatedAPIClient
from api.models import ForumCategory, ForumTopic, ForumPost, Report


@pytest.mark.django_db
@pytest.mark.integration
class TestForumCategoryViewSet:
    """Test ForumCategoryViewSet"""
    
    def test_list_categories(self):
        """Test listing forum categories"""
        ForumCategoryFactory.create_batch(3, is_active=True)
        ForumCategoryFactory(is_active=False)
        
        client = APIClient()
        response = client.get('/api/forum/categories/')
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data) == 3
    
    def test_retrieve_category_by_slug(self):
        """Test retrieving category by slug"""
        category = ForumCategoryFactory(slug='general', is_active=True)
        
        client = APIClient()
        response = client.get(f'/api/forum/categories/{category.slug}/')
        assert response.status_code == status.HTTP_200_OK
        assert response.data['slug'] == 'general'
    
    def test_create_category_admin_only(self):
        """Test only admins can create categories"""
        admin = AdminUserFactory()
        regular_user = UserFactory()
        
        client = AuthenticatedAPIClient()
        client.authenticate_user(regular_user)
        
        response = client.post('/api/forum/categories/', {
            'name': 'New Category',
            'slug': 'new-category',
            'description': 'A new category',
            'icon': 'message-square',
            'color': 'blue'
        })
        assert response.status_code == status.HTTP_403_FORBIDDEN
        
        client.authenticate_user(admin)
        response = client.post('/api/forum/categories/', {
            'name': 'New Category',
            'slug': 'new-category',
            'description': 'A new category',
            'icon': 'message-square',
            'color': 'blue'
        })
        assert response.status_code == status.HTTP_201_CREATED


@pytest.mark.django_db
@pytest.mark.integration
class TestForumTopicViewSet:
    """Test ForumTopicViewSet"""
    
    def test_list_topics(self):
        """Test listing forum topics"""
        category = ForumCategoryFactory(is_active=True)
        ForumTopicFactory.create_batch(5, category=category)
        
        client = APIClient()
        response = client.get('/api/forum/topics/')
        assert response.status_code == status.HTTP_200_OK
        assert 'results' in response.data
    
    def test_list_topics_by_category(self):
        """Test filtering topics by category"""
        category1 = ForumCategoryFactory(slug='cat1', is_active=True)
        category2 = ForumCategoryFactory(slug='cat2', is_active=True)
        ForumTopicFactory.create_batch(3, category=category1)
        ForumTopicFactory.create_batch(2, category=category2)
        
        client = APIClient()
        response = client.get('/api/forum/topics/?category=cat1')
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data['results']) == 3
    
    def test_create_topic(self):
        """Test creating a forum topic"""
        user = UserFactory()
        category = ForumCategoryFactory(is_active=True)
        
        client = AuthenticatedAPIClient()
        client.authenticate_user(user)
        
        response = client.post('/api/forum/topics/', {
            'category': str(category.id),
            'title': 'New Topic',
            'body': 'This is a new topic discussion'
        })
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data['title'] == 'New Topic'
        assert ForumTopic.objects.filter(title='New Topic').exists()
    
    def test_update_topic_author(self):
        """Test topic author can update their topic"""
        author = UserFactory()
        category = ForumCategoryFactory(is_active=True)
        topic = ForumTopicFactory(author=author, category=category)
        
        client = AuthenticatedAPIClient()
        client.authenticate_user(author)
        
        response = client.patch(f'/api/forum/topics/{topic.id}/', {
            'title': 'Updated Title'
        })
        assert response.status_code == status.HTTP_200_OK
        assert response.data['title'] == 'Updated Title'
    
    def test_update_topic_unauthorized(self):
        """Test non-author cannot update topic"""
        author = UserFactory()
        other_user = UserFactory()
        category = ForumCategoryFactory(is_active=True)
        topic = ForumTopicFactory(author=author, category=category)
        
        client = AuthenticatedAPIClient()
        client.authenticate_user(other_user)
        
        response = client.patch(f'/api/forum/topics/{topic.id}/', {
            'title': 'Hacked Title'
        })
        assert response.status_code == status.HTTP_403_FORBIDDEN


@pytest.mark.django_db
@pytest.mark.integration
class TestForumPostViewSet:
    """Test ForumPostViewSet"""
    
    def test_list_posts_for_topic(self):
        """Test listing posts for a topic"""
        topic = ForumTopicFactory()
        ForumPostFactory.create_batch(5, topic=topic)
        
        client = APIClient()
        response = client.get(f'/api/forum/topics/{topic.id}/posts/')
        assert response.status_code == status.HTTP_200_OK
        assert response.data['count'] == 5
        assert len(response.data['results']) == 5
    
    def test_create_post(self):
        """Test creating a forum post"""
        user = UserFactory()
        topic = ForumTopicFactory()
        
        client = AuthenticatedAPIClient()
        client.authenticate_user(user)
        
        response = client.post(f'/api/forum/topics/{topic.id}/posts/', {
            'body': 'This is a reply to the topic'
        })
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data['body'] == 'This is a reply to the topic'
        assert ForumPost.objects.filter(body='This is a reply to the topic').exists()
    
    def test_update_post_author(self):
        """Test post author can update their post"""
        author = UserFactory()
        topic = ForumTopicFactory()
        post = ForumPostFactory(author=author, topic=topic)
        
        client = AuthenticatedAPIClient()
        client.authenticate_user(author)
        
        response = client.patch(f'/api/forum/posts/{post.id}/', {
            'body': 'Updated post content'
        })
        assert response.status_code == status.HTTP_200_OK
        assert response.data['body'] == 'Updated post content'
    
    def test_delete_post_soft_delete(self):
        """Test post deletion is soft delete"""
        author = UserFactory()
        topic = ForumTopicFactory()
        post = ForumPostFactory(author=author, topic=topic)
        
        client = AuthenticatedAPIClient()
        client.authenticate_user(author)

        response = client.delete(f'/api/forum/posts/{post.id}/')
        assert response.status_code == status.HTTP_204_NO_CONTENT

        post.refresh_from_db()
        assert post.is_deleted is True


@pytest.mark.django_db
@pytest.mark.integration
class TestForumTopicSorting:
    """Test sort query parameter on GET /api/forum/topics/"""

    def _make_topics_with_ages(self, category):
        """
        Create 3 topics with controlled timestamps and post activity:
          - topic_old: created 3 days ago, has 1 very recent post (most active)
          - topic_mid: created 2 days ago, no posts
          - topic_new: created 1 day ago, no posts
        Returns them in order: old, mid, new.
        """
        now = timezone.now()

        topic_old = ForumTopicFactory(category=category)
        ForumTopic.objects.filter(pk=topic_old.pk).update(created_at=now - timedelta(days=3))

        topic_mid = ForumTopicFactory(category=category)
        ForumTopic.objects.filter(pk=topic_mid.pk).update(created_at=now - timedelta(days=2))

        topic_new = ForumTopicFactory(category=category)
        ForumTopic.objects.filter(pk=topic_new.pk).update(created_at=now - timedelta(days=1))

        # Add a very recent non-deleted post to topic_old — makes it most active
        post = ForumPostFactory(topic=topic_old)
        ForumPost.objects.filter(pk=post.pk).update(created_at=now - timedelta(hours=1))

        return topic_old, topic_mid, topic_new

    def test_default_sort_is_newest(self):
        """No sort param → newest creation time first (existing behaviour preserved)"""
        category = ForumCategoryFactory(is_active=True)
        topic_old, topic_mid, topic_new = self._make_topics_with_ages(category)

        response = APIClient().get('/api/forum/topics/')
        assert response.status_code == status.HTTP_200_OK
        ids = [t['id'] for t in response.data['results']]
        assert ids.index(str(topic_new.pk)) < ids.index(str(topic_mid.pk))
        assert ids.index(str(topic_mid.pk)) < ids.index(str(topic_old.pk))

    def test_sort_newest_explicit(self):
        """sort=newest → same ordering as the default"""
        category = ForumCategoryFactory(is_active=True)
        topic_old, _mid, topic_new = self._make_topics_with_ages(category)

        response = APIClient().get('/api/forum/topics/?sort=newest')
        assert response.status_code == status.HTTP_200_OK
        ids = [t['id'] for t in response.data['results']]
        assert ids.index(str(topic_new.pk)) < ids.index(str(topic_old.pk))

    def test_sort_most_active(self):
        """sort=most_active → topic with most recent non-deleted post ranks first"""
        category = ForumCategoryFactory(is_active=True)
        topic_old, _mid, _new = self._make_topics_with_ages(category)

        response = APIClient().get('/api/forum/topics/?sort=most_active')
        assert response.status_code == status.HTTP_200_OK
        ids = [t['id'] for t in response.data['results']]
        assert ids[0] == str(topic_old.pk)

    def test_sort_most_active_deleted_posts_excluded(self):
        """Deleted posts do not count toward last_activity"""
        category = ForumCategoryFactory(is_active=True)
        now = timezone.now()

        topic_a = ForumTopicFactory(category=category)
        ForumTopic.objects.filter(pk=topic_a.pk).update(created_at=now - timedelta(days=5))

        topic_b = ForumTopicFactory(category=category)
        ForumTopic.objects.filter(pk=topic_b.pk).update(created_at=now - timedelta(days=1))

        # Add a very recent post to topic_a, but mark it deleted
        deleted_post = ForumPostFactory(topic=topic_a, is_deleted=True)
        ForumPost.objects.filter(pk=deleted_post.pk).update(created_at=now - timedelta(minutes=5))

        response = APIClient().get('/api/forum/topics/?sort=most_active')
        assert response.status_code == status.HTTP_200_OK
        ids = [t['id'] for t in response.data['results']]
        # topic_b was created more recently; topic_a's only post is deleted
        assert ids[0] == str(topic_b.pk)

    def test_sort_most_active_with_category_filter(self):
        """sort=most_active combined with ?category= only returns that category's topics"""
        cat_a = ForumCategoryFactory(slug='sort-cat-a', is_active=True)
        cat_b = ForumCategoryFactory(slug='sort-cat-b', is_active=True)
        now = timezone.now()

        topic_a = ForumTopicFactory(category=cat_a)
        topic_b = ForumTopicFactory(category=cat_b)
        ForumTopic.objects.filter(pk=topic_a.pk).update(created_at=now - timedelta(days=2))
        ForumTopic.objects.filter(pk=topic_b.pk).update(created_at=now - timedelta(days=2))

        # Give topic_b a very recent post — it would rank first without category filter
        post = ForumPostFactory(topic=topic_b)
        ForumPost.objects.filter(pk=post.pk).update(created_at=now - timedelta(hours=1))

        response = APIClient().get('/api/forum/topics/?category=sort-cat-a&sort=most_active')
        assert response.status_code == status.HTTP_200_OK
        result_ids = {t['id'] for t in response.data['results']}
        assert str(topic_a.pk) in result_ids
        assert str(topic_b.pk) not in result_ids

    def test_sort_most_active_pinned_float_first(self):
        """Pinned topics always appear before non-pinned regardless of sort=most_active"""
        category = ForumCategoryFactory(is_active=True)
        now = timezone.now()

        pinned = ForumTopicFactory(category=category, is_pinned=True)
        ForumTopic.objects.filter(pk=pinned.pk).update(created_at=now - timedelta(days=10))

        normal = ForumTopicFactory(category=category, is_pinned=False)
        ForumTopic.objects.filter(pk=normal.pk).update(created_at=now - timedelta(days=9))

        # Give normal a very recent post — it should still rank below pinned
        post = ForumPostFactory(topic=normal)
        ForumPost.objects.filter(pk=post.pk).update(created_at=now - timedelta(minutes=1))

        response = APIClient().get('/api/forum/topics/?sort=most_active')
        assert response.status_code == status.HTTP_200_OK
        ids = [t['id'] for t in response.data['results']]
        assert ids[0] == str(pinned.pk)

    def test_sort_unknown_value_falls_back_to_newest(self):
        """Unrecognised sort value returns 200 and behaves like newest"""
        category = ForumCategoryFactory(is_active=True)
        ForumTopicFactory.create_batch(3, category=category)

        response = APIClient().get('/api/forum/topics/?sort=garbage')
        assert response.status_code == status.HTTP_200_OK


@pytest.mark.django_db
@pytest.mark.integration
class TestForumTopicReport:
    """Integration tests for POST /api/forum/topics/<pk>/report/"""

    def _url(self, topic_id):
        return f'/api/forum/topics/{topic_id}/report/'

    def test_authenticated_user_can_report_another_users_topic(self):
        """Valid report on someone else's topic returns 201 and persists the record."""
        category = ForumCategoryFactory(is_active=True)
        author = UserFactory()
        reporter = UserFactory()
        topic = ForumTopicFactory(category=category, author=author)

        client = AuthenticatedAPIClient()
        client.authenticate_user(reporter)
        response = client.post(self._url(topic.id), {'type': 'spam'})

        assert response.status_code == status.HTTP_201_CREATED
        assert Report.objects.filter(
            reporter=reporter,
            reported_forum_topic=topic,
            type='spam',
        ).exists()

    def test_report_with_explicit_description_persists_it(self):
        """A description provided in the payload is stored on the report."""
        category = ForumCategoryFactory(is_active=True)
        author = UserFactory()
        reporter = UserFactory()
        topic = ForumTopicFactory(category=category, author=author)

        client = AuthenticatedAPIClient()
        client.authenticate_user(reporter)
        response = client.post(self._url(topic.id), {
            'type': 'inappropriate_content',
            'description': 'This topic contains offensive language.',
        })

        assert response.status_code == status.HTTP_201_CREATED
        report = Report.objects.get(reporter=reporter, reported_forum_topic=topic)
        assert report.description == 'This topic contains offensive language.'

    def test_report_without_description_gets_auto_description(self):
        """When description is omitted the backend fills in a default."""
        category = ForumCategoryFactory(is_active=True)
        author = UserFactory()
        reporter = UserFactory()
        topic = ForumTopicFactory(category=category, author=author, title='Test Topic Title')

        client = AuthenticatedAPIClient()
        client.authenticate_user(reporter)
        client.post(self._url(topic.id), {'type': 'inappropriate_content'})

        report = Report.objects.get(reporter=reporter, reported_forum_topic=topic)
        assert 'Test Topic Title' in report.description

    def test_report_response_schema(self):
        """Response body includes expected fields from ReportSerializer."""
        category = ForumCategoryFactory(is_active=True)
        author = UserFactory()
        reporter = UserFactory()
        topic = ForumTopicFactory(category=category, author=author)

        client = AuthenticatedAPIClient()
        client.authenticate_user(reporter)
        response = client.post(self._url(topic.id), {'type': 'harassment'})

        assert response.status_code == status.HTTP_201_CREATED
        data = response.data
        assert 'id' in data
        assert data['type'] == 'harassment'
        assert data['status'] == 'pending'
        assert str(topic.id) == str(data['reported_forum_topic'])

    def test_invalid_report_type_returns_400(self):
        """A report type not in TYPE_CHOICES is rejected with a validation error."""
        category = ForumCategoryFactory(is_active=True)
        author = UserFactory()
        reporter = UserFactory()
        topic = ForumTopicFactory(category=category, author=author)

        client = AuthenticatedAPIClient()
        client.authenticate_user(reporter)
        response = client.post(self._url(topic.id), {'type': 'not_a_valid_type'})

        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_self_report_on_own_topic_is_rejected(self):
        """A user cannot report a topic they authored."""
        category = ForumCategoryFactory(is_active=True)
        author = UserFactory()
        topic = ForumTopicFactory(category=category, author=author)

        client = AuthenticatedAPIClient()
        client.authenticate_user(author)
        response = client.post(self._url(topic.id), {'type': 'spam'})

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert not Report.objects.filter(reported_forum_topic=topic).exists()

    def test_unauthenticated_report_is_blocked(self):
        """Anonymous users receive 401/403 and no report is created."""
        category = ForumCategoryFactory(is_active=True)
        author = UserFactory()
        topic = ForumTopicFactory(category=category, author=author)

        response = APIClient().post(self._url(topic.id), {'type': 'spam'})

        assert response.status_code in (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN)
        assert not Report.objects.filter(reported_forum_topic=topic).exists()

    def test_report_nonexistent_topic_returns_404(self):
        """Reporting a topic UUID that does not exist returns 404."""
        import uuid
        reporter = UserFactory()

        client = AuthenticatedAPIClient()
        client.authenticate_user(reporter)
        response = client.post(self._url(uuid.uuid4()), {'type': 'spam'})

        assert response.status_code == status.HTTP_404_NOT_FOUND


@pytest.mark.django_db
@pytest.mark.integration
class TestForumPostReport:
    """Integration tests for POST /api/forum/posts/<pk>/report/"""

    def _url(self, post_id):
        return f'/api/forum/posts/{post_id}/report/'

    def test_authenticated_user_can_report_another_users_post(self):
        """Valid report on someone else's post returns 201 and persists the record."""
        category = ForumCategoryFactory(is_active=True)
        author = UserFactory()
        reporter = UserFactory()
        topic = ForumTopicFactory(category=category)
        post = ForumPostFactory(topic=topic, author=author)

        client = AuthenticatedAPIClient()
        client.authenticate_user(reporter)
        response = client.post(self._url(post.id), {'type': 'harassment'})

        assert response.status_code == status.HTTP_201_CREATED
        assert Report.objects.filter(
            reporter=reporter,
            reported_forum_post=post,
            type='harassment',
        ).exists()

    def test_report_post_with_optional_description(self):
        """A description supplied alongside the type is stored on the report."""
        category = ForumCategoryFactory(is_active=True)
        author = UserFactory()
        reporter = UserFactory()
        topic = ForumTopicFactory(category=category)
        post = ForumPostFactory(topic=topic, author=author)

        client = AuthenticatedAPIClient()
        client.authenticate_user(reporter)
        response = client.post(self._url(post.id), {
            'type': 'spam',
            'description': 'This reply is promotional content.',
        })

        assert response.status_code == status.HTTP_201_CREATED
        report = Report.objects.get(reporter=reporter, reported_forum_post=post)
        assert report.description == 'This reply is promotional content.'

    def test_report_post_without_description_gets_auto_description(self):
        """Omitting description triggers the backend default referencing the topic title."""
        category = ForumCategoryFactory(is_active=True)
        author = UserFactory()
        reporter = UserFactory()
        topic = ForumTopicFactory(category=category, title='Discussion About X')
        post = ForumPostFactory(topic=topic, author=author)

        client = AuthenticatedAPIClient()
        client.authenticate_user(reporter)
        client.post(self._url(post.id), {'type': 'inappropriate_content'})

        report = Report.objects.get(reporter=reporter, reported_forum_post=post)
        assert 'Discussion About X' in report.description

    def test_post_report_links_both_topic_and_post(self):
        """The persisted report references both the post and its parent topic."""
        category = ForumCategoryFactory(is_active=True)
        author = UserFactory()
        reporter = UserFactory()
        topic = ForumTopicFactory(category=category)
        post = ForumPostFactory(topic=topic, author=author)

        client = AuthenticatedAPIClient()
        client.authenticate_user(reporter)
        client.post(self._url(post.id), {'type': 'spam'})

        report = Report.objects.get(reporter=reporter, reported_forum_post=post)
        assert report.reported_forum_topic == topic
        assert report.reported_forum_post == post

    def test_post_report_response_schema(self):
        """Response body includes expected fields from ReportSerializer."""
        category = ForumCategoryFactory(is_active=True)
        author = UserFactory()
        reporter = UserFactory()
        topic = ForumTopicFactory(category=category)
        post = ForumPostFactory(topic=topic, author=author)

        client = AuthenticatedAPIClient()
        client.authenticate_user(reporter)
        response = client.post(self._url(post.id), {'type': 'scam'})

        assert response.status_code == status.HTTP_201_CREATED
        data = response.data
        assert 'id' in data
        assert data['type'] == 'scam'
        assert data['status'] == 'pending'
        assert str(post.id) == str(data['reported_forum_post'])
        assert str(topic.id) == str(data['reported_forum_topic'])

    def test_invalid_report_type_returns_400(self):
        """A report type not in TYPE_CHOICES is rejected with a validation error."""
        category = ForumCategoryFactory(is_active=True)
        author = UserFactory()
        reporter = UserFactory()
        topic = ForumTopicFactory(category=category)
        post = ForumPostFactory(topic=topic, author=author)

        client = AuthenticatedAPIClient()
        client.authenticate_user(reporter)
        response = client.post(self._url(post.id), {'type': 'gibberish'})

        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_self_report_on_own_post_is_rejected(self):
        """A user cannot report a post they authored."""
        category = ForumCategoryFactory(is_active=True)
        author = UserFactory()
        topic = ForumTopicFactory(category=category)
        post = ForumPostFactory(topic=topic, author=author)

        client = AuthenticatedAPIClient()
        client.authenticate_user(author)
        response = client.post(self._url(post.id), {'type': 'spam'})

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert not Report.objects.filter(reported_forum_post=post).exists()

    def test_unauthenticated_post_report_is_blocked(self):
        """Anonymous users receive 401/403 and no report is created."""
        category = ForumCategoryFactory(is_active=True)
        author = UserFactory()
        topic = ForumTopicFactory(category=category)
        post = ForumPostFactory(topic=topic, author=author)

        response = APIClient().post(self._url(post.id), {'type': 'spam'})

        assert response.status_code in (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN)
        assert not Report.objects.filter(reported_forum_post=post).exists()

    def test_report_nonexistent_post_returns_404(self):
        """Reporting a post UUID that does not exist returns 404."""
        import uuid
        reporter = UserFactory()

        client = AuthenticatedAPIClient()
        client.authenticate_user(reporter)
        response = client.post(self._url(uuid.uuid4()), {'type': 'spam'})

        assert response.status_code == status.HTTP_404_NOT_FOUND


@pytest.mark.django_db
@pytest.mark.integration
class TestForumTopicLockUnlock:
    """Integration tests for POST /api/forum/topics/<pk>/lock/ (admin-only toggle)"""

    def _url(self, topic_id):
        return f'/api/forum/topics/{topic_id}/lock/'

    def test_admin_can_lock_an_unlocked_topic(self):
        """Admin locking an unlocked topic sets is_locked=True and returns updated topic."""
        category = ForumCategoryFactory(is_active=True)
        topic = ForumTopicFactory(category=category, is_locked=False)
        admin = AdminUserFactory()

        client = AuthenticatedAPIClient()
        client.authenticate_user(admin)
        response = client.post(self._url(topic.id))

        assert response.status_code == status.HTTP_200_OK
        assert response.data['is_locked'] is True
        topic.refresh_from_db()
        assert topic.is_locked is True

    def test_admin_can_unlock_a_locked_topic(self):
        """Admin locking an already-locked topic toggles it back to unlocked."""
        category = ForumCategoryFactory(is_active=True)
        topic = ForumTopicFactory(category=category, is_locked=True)
        admin = AdminUserFactory()

        client = AuthenticatedAPIClient()
        client.authenticate_user(admin)
        response = client.post(self._url(topic.id))

        assert response.status_code == status.HTTP_200_OK
        assert response.data['is_locked'] is False
        topic.refresh_from_db()
        assert topic.is_locked is False

    def test_lock_creates_audit_log_entry(self):
        """Locking a topic writes an AdminAuditLog record with action_type=lock_topic."""
        from api.models import AdminAuditLog
        category = ForumCategoryFactory(is_active=True)
        topic = ForumTopicFactory(category=category, is_locked=False)
        admin = AdminUserFactory()

        client = AuthenticatedAPIClient()
        client.authenticate_user(admin)
        client.post(self._url(topic.id))

        assert AdminAuditLog.objects.filter(
            admin=admin,
            action_type='lock_topic',
            target_id=topic.id,
        ).exists()

    def test_unlock_creates_audit_log_entry(self):
        """Unlocking a topic also writes an AdminAuditLog record."""
        from api.models import AdminAuditLog
        category = ForumCategoryFactory(is_active=True)
        topic = ForumTopicFactory(category=category, is_locked=True)
        admin = AdminUserFactory()

        client = AuthenticatedAPIClient()
        client.authenticate_user(admin)
        client.post(self._url(topic.id))

        assert AdminAuditLog.objects.filter(
            admin=admin,
            action_type='lock_topic',
            target_id=topic.id,
        ).exists()

    def test_regular_user_cannot_lock_topic(self):
        """Non-admin authenticated user receives 403."""
        category = ForumCategoryFactory(is_active=True)
        topic = ForumTopicFactory(category=category, is_locked=False)
        user = UserFactory()

        client = AuthenticatedAPIClient()
        client.authenticate_user(user)
        response = client.post(self._url(topic.id))

        assert response.status_code == status.HTTP_403_FORBIDDEN
        topic.refresh_from_db()
        assert topic.is_locked is False

    def test_unauthenticated_user_cannot_lock_topic(self):
        """Anonymous request is rejected."""
        category = ForumCategoryFactory(is_active=True)
        topic = ForumTopicFactory(category=category, is_locked=False)

        response = APIClient().post(self._url(topic.id))

        assert response.status_code in (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN)
        topic.refresh_from_db()
        assert topic.is_locked is False

    def test_lock_nonexistent_topic_returns_404(self):
        """Locking a UUID that does not exist returns 404."""
        import uuid
        admin = AdminUserFactory()

        client = AuthenticatedAPIClient()
        client.authenticate_user(admin)
        response = client.post(f'/api/forum/topics/{uuid.uuid4()}/lock/')

        assert response.status_code == status.HTTP_404_NOT_FOUND


@pytest.mark.django_db
@pytest.mark.integration
class TestPostingToLockedThread:
    """Behavior tests: locked threads block new replies."""

    def test_posting_to_locked_topic_returns_403(self):
        """Creating a reply on a locked topic is rejected with 403."""
        category = ForumCategoryFactory(is_active=True)
        topic = ForumTopicFactory(category=category, is_locked=True)
        user = UserFactory()

        client = AuthenticatedAPIClient()
        client.authenticate_user(user)
        response = client.post(
            f'/api/forum/topics/{topic.id}/posts/',
            {'body': 'This should not be allowed.'},
        )

        assert response.status_code == status.HTTP_403_FORBIDDEN
        assert not ForumPost.objects.filter(topic=topic).exists()

    def test_posting_to_unlocked_topic_succeeds(self):
        """Creating a reply on an unlocked topic is permitted."""
        category = ForumCategoryFactory(is_active=True)
        topic = ForumTopicFactory(category=category, is_locked=False)
        user = UserFactory()

        client = AuthenticatedAPIClient()
        client.authenticate_user(user)
        response = client.post(
            f'/api/forum/topics/{topic.id}/posts/',
            {'body': 'A valid reply.'},
        )

        assert response.status_code == status.HTTP_201_CREATED
        assert ForumPost.objects.filter(topic=topic).exists()

    def test_lock_then_post_is_rejected(self):
        """Admin locks topic; subsequent reply attempt by another user is rejected."""
        category = ForumCategoryFactory(is_active=True)
        topic = ForumTopicFactory(category=category, is_locked=False)
        admin = AdminUserFactory()
        user = UserFactory()

        admin_client = AuthenticatedAPIClient()
        admin_client.authenticate_user(admin)
        admin_client.post(f'/api/forum/topics/{topic.id}/lock/')

        user_client = AuthenticatedAPIClient()
        user_client.authenticate_user(user)
        response = user_client.post(
            f'/api/forum/topics/{topic.id}/posts/',
            {'body': 'Trying to post after lock.'},
        )

        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_unlock_then_post_succeeds(self):
        """Admin unlocks a previously locked topic; reply is then accepted."""
        category = ForumCategoryFactory(is_active=True)
        topic = ForumTopicFactory(category=category, is_locked=True)
        admin = AdminUserFactory()
        user = UserFactory()

        admin_client = AuthenticatedAPIClient()
        admin_client.authenticate_user(admin)
        admin_client.post(f'/api/forum/topics/{topic.id}/lock/')  # toggles to unlocked

        user_client = AuthenticatedAPIClient()
        user_client.authenticate_user(user)
        response = user_client.post(
            f'/api/forum/topics/{topic.id}/posts/',
            {'body': 'Now this should work.'},
        )

        assert response.status_code == status.HTTP_201_CREATED


@pytest.mark.django_db
@pytest.mark.integration
class TestForumPostRestore:
    """Integration tests for POST /api/forum/posts/<pk>/restore/ (admin-only).

    Forum topics are hard-deleted and have no restore path.
    Forum posts use is_deleted soft-delete and are restorable by admins.
    """

    def _url(self, post_id):
        return f'/api/forum/posts/{post_id}/restore/'

    def test_admin_can_restore_soft_deleted_post(self):
        """Admin restoring a soft-deleted post sets is_deleted=False and returns 200."""
        category = ForumCategoryFactory(is_active=True)
        topic = ForumTopicFactory(category=category)
        post = ForumPostFactory(topic=topic, is_deleted=True)
        admin = AdminUserFactory()

        client = AuthenticatedAPIClient()
        client.authenticate_user(admin)
        response = client.post(self._url(post.id))

        assert response.status_code == status.HTTP_200_OK
        post.refresh_from_db()
        assert post.is_deleted is False

    def test_restore_response_schema(self):
        """Restored post response body includes expected fields."""
        category = ForumCategoryFactory(is_active=True)
        topic = ForumTopicFactory(category=category)
        post = ForumPostFactory(topic=topic, is_deleted=True)
        admin = AdminUserFactory()

        client = AuthenticatedAPIClient()
        client.authenticate_user(admin)
        response = client.post(self._url(post.id))

        assert response.status_code == status.HTTP_200_OK
        data = response.data
        assert str(post.id) == str(data['id'])
        assert data['is_deleted'] is False

    def test_restore_post_that_was_soft_deleted_via_destroy(self):
        """End-to-end: soft-delete via DELETE then restore via restore endpoint."""
        category = ForumCategoryFactory(is_active=True)
        topic = ForumTopicFactory(category=category)
        author = UserFactory()
        post = ForumPostFactory(topic=topic, author=author)
        admin = AdminUserFactory()

        admin_client = AuthenticatedAPIClient()
        admin_client.authenticate_user(admin)
        admin_client.delete(f'/api/forum/posts/{post.id}/')
        post.refresh_from_db()
        assert post.is_deleted is True

        response = admin_client.post(self._url(post.id))
        assert response.status_code == status.HTTP_200_OK
        post.refresh_from_db()
        assert post.is_deleted is False

    def test_regular_user_cannot_restore_post(self):
        """Non-admin user is denied with 403."""
        category = ForumCategoryFactory(is_active=True)
        topic = ForumTopicFactory(category=category)
        post = ForumPostFactory(topic=topic, is_deleted=True)
        user = UserFactory()

        client = AuthenticatedAPIClient()
        client.authenticate_user(user)
        response = client.post(self._url(post.id))

        assert response.status_code == status.HTTP_403_FORBIDDEN
        post.refresh_from_db()
        assert post.is_deleted is True

    def test_unauthenticated_user_cannot_restore_post(self):
        """Anonymous request is rejected."""
        category = ForumCategoryFactory(is_active=True)
        topic = ForumTopicFactory(category=category)
        post = ForumPostFactory(topic=topic, is_deleted=True)

        response = APIClient().post(self._url(post.id))

        assert response.status_code in (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN)
        post.refresh_from_db()
        assert post.is_deleted is True

    def test_restore_non_deleted_post_returns_404(self):
        """Restoring a post that is not deleted returns 404 (nothing to restore)."""
        category = ForumCategoryFactory(is_active=True)
        topic = ForumTopicFactory(category=category)
        post = ForumPostFactory(topic=topic, is_deleted=False)
        admin = AdminUserFactory()

        client = AuthenticatedAPIClient()
        client.authenticate_user(admin)
        response = client.post(self._url(post.id))

        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_restore_nonexistent_post_returns_404(self):
        """Restoring a UUID that does not exist returns 404."""
        import uuid
        admin = AdminUserFactory()

        client = AuthenticatedAPIClient()
        client.authenticate_user(admin)
        response = client.post(self._url(uuid.uuid4()))

        assert response.status_code == status.HTTP_404_NOT_FOUND


# ---------------------------------------------------------------------------
# Deleted-author traceability tests (FR-04g)
# ---------------------------------------------------------------------------

@pytest.mark.django_db
@pytest.mark.integration
class TestDeletedAuthorTraceability:
    """
    Verify that deleting a user preserves forum topics/posts and that the API
    returns stable placeholder identity for the deleted author.

    ForumTopic.author and ForumPost.author use SET_NULL so deleting the user
    sets the FK column to NULL without touching the content rows.
    """

    # ── Data survival ────────────────────────────────────────────────────────

    def test_deleting_author_preserves_forum_topic(self):
        """Topic row survives after its author account is deleted."""
        category = ForumCategoryFactory(is_active=True)
        author = UserFactory()
        topic = ForumTopicFactory(category=category, author=author)
        topic_id = topic.id

        author.delete()

        assert ForumTopic.objects.filter(id=topic_id).exists()

    def test_deleting_author_preserves_forum_post(self):
        """Post row survives after its author account is deleted."""
        category = ForumCategoryFactory(is_active=True)
        author = UserFactory()
        topic = ForumTopicFactory(category=category)
        post = ForumPostFactory(topic=topic, author=author)
        post_id = post.id

        author.delete()

        assert ForumPost.objects.filter(id=post_id).exists()

    def test_deleting_author_sets_topic_author_null(self):
        """After deletion the topic's author FK is NULL in the database."""
        category = ForumCategoryFactory(is_active=True)
        author = UserFactory()
        topic = ForumTopicFactory(category=category, author=author)

        author.delete()

        topic.refresh_from_db()
        assert topic.author_id is None

    def test_deleting_author_sets_post_author_null(self):
        """After deletion the post's author FK is NULL in the database."""
        category = ForumCategoryFactory(is_active=True)
        author = UserFactory()
        topic = ForumTopicFactory(category=category)
        post = ForumPostFactory(topic=topic, author=author)

        author.delete()

        post.refresh_from_db()
        assert post.author_id is None

    def test_deleting_one_author_does_not_affect_other_topics(self):
        """Deleting user A does not touch topics authored by user B."""
        category = ForumCategoryFactory(is_active=True)
        author_a = UserFactory()
        author_b = UserFactory()
        topic_a = ForumTopicFactory(category=category, author=author_a)
        topic_b = ForumTopicFactory(category=category, author=author_b)

        author_a.delete()

        topic_b.refresh_from_db()
        assert topic_b.author_id == author_b.id

    # ── API serialization with placeholder ───────────────────────────────────

    def test_topic_list_returns_placeholder_for_deleted_author(self):
        """Topic list endpoint returns '[Deleted User]' for author_name when author is gone."""
        category = ForumCategoryFactory(is_active=True)
        author = UserFactory()
        topic = ForumTopicFactory(category=category, author=author)
        topic_id = str(topic.id)

        author.delete()

        response = APIClient().get('/api/forum/topics/')
        assert response.status_code == status.HTTP_200_OK

        result = next(t for t in response.data['results'] if t['id'] == topic_id)
        assert result['author_name'] == '[Deleted User]'
        assert result['author_id'] is None
        assert result['author_avatar_url'] is None

    def test_topic_detail_returns_placeholder_for_deleted_author(self):
        """Topic detail endpoint returns placeholder identity for deleted author."""
        category = ForumCategoryFactory(is_active=True)
        author = UserFactory()
        topic = ForumTopicFactory(category=category, author=author)

        author.delete()

        response = APIClient().get(f'/api/forum/topics/{topic.id}/')
        assert response.status_code == status.HTTP_200_OK
        assert response.data['author_name'] == '[Deleted User]'
        assert response.data['author_id'] is None
        assert response.data['author_avatar_url'] is None

    def test_post_list_returns_placeholder_for_deleted_author(self):
        """Post list for a topic returns placeholder when that post's author is deleted."""
        category = ForumCategoryFactory(is_active=True)
        topic = ForumTopicFactory(category=category)
        author = UserFactory()
        post = ForumPostFactory(topic=topic, author=author)

        author.delete()

        response = APIClient().get(f'/api/forum/topics/{topic.id}/posts/')
        assert response.status_code == status.HTTP_200_OK

        result = next(p for p in response.data['results'] if str(p['id']) == str(post.id))
        assert result['author_name'] == '[Deleted User]'
        assert result['author_id'] is None
        assert result['author_avatar_url'] is None

    def test_topic_detail_inline_posts_return_placeholder_for_deleted_author(self):
        """Inline posts in topic detail endpoint also return placeholder."""
        category = ForumCategoryFactory(is_active=True)
        post_author = UserFactory()
        topic = ForumTopicFactory(category=category)
        post = ForumPostFactory(topic=topic, author=post_author)

        post_author.delete()

        response = APIClient().get(f'/api/forum/topics/{topic.id}/')
        assert response.status_code == status.HTTP_200_OK

        inline_post = next(p for p in response.data['posts'] if str(p['id']) == str(post.id))
        assert inline_post['author_name'] == '[Deleted User]'
        assert inline_post['author_id'] is None

    # ── Regression: active-author serialization unchanged ────────────────────

    def test_active_author_topic_serialization_unchanged(self):
        """Topics with living authors still return real name and id."""
        category = ForumCategoryFactory(is_active=True)
        author = UserFactory(first_name='Alice', last_name='Smith')
        ForumTopicFactory(category=category, author=author)

        response = APIClient().get('/api/forum/topics/')
        assert response.status_code == status.HTTP_200_OK

        result = next(t for t in response.data['results'] if t['author_id'] == str(author.id))
        assert result['author_name'] == 'Alice Smith'
        assert result['author_id'] == str(author.id)

    def test_active_author_post_serialization_unchanged(self):
        """Posts with living authors still return real name and id."""
        category = ForumCategoryFactory(is_active=True)
        topic = ForumTopicFactory(category=category)
        author = UserFactory(first_name='Bob', last_name='Jones')
        post = ForumPostFactory(topic=topic, author=author)

        response = APIClient().get(f'/api/forum/topics/{topic.id}/posts/')
        assert response.status_code == status.HTTP_200_OK

        result = next(p for p in response.data['results'] if str(p['id']) == str(post.id))
        assert result['author_name'] == 'Bob Jones'
        assert result['author_id'] == str(author.id)

    def test_mixed_topic_list_active_and_deleted_authors(self):
        """Topic list with both active and deleted authors returns correct identity for each."""
        category = ForumCategoryFactory(is_active=True)
        active_author = UserFactory(first_name='Carol', last_name='White')
        deleted_author = UserFactory()

        active_topic = ForumTopicFactory(category=category, author=active_author)
        deleted_topic = ForumTopicFactory(category=category, author=deleted_author)
        deleted_topic_id = str(deleted_topic.id)

        deleted_author.delete()

        response = APIClient().get('/api/forum/topics/')
        assert response.status_code == status.HTTP_200_OK

        results = {t['id']: t for t in response.data['results']}

        assert results[str(active_topic.id)]['author_name'] == 'Carol White'
        assert results[str(active_topic.id)]['author_id'] == str(active_author.id)

        assert results[deleted_topic_id]['author_name'] == '[Deleted User]'
        assert results[deleted_topic_id]['author_id'] is None
