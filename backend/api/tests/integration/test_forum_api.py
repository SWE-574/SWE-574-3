"""
Integration tests for forum API endpoints
"""
import pytest
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
