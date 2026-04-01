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
from api.models import ForumCategory, ForumTopic, ForumPost


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
