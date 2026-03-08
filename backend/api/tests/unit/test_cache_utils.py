"""
Unit tests for cache utilities
"""
import pytest
from unittest.mock import patch, MagicMock

from api.cache_utils import (
    cache_tag_list, get_cached_tag_list, invalidate_tag_list,
    cache_user_profile, get_cached_user_profile, invalidate_user_profile,
    cache_service_list, get_cached_service_list, invalidate_service_lists,
    cache_service_detail, get_cached_service_detail, invalidate_service_detail,
    cache_hot_services, get_cached_hot_services, invalidate_hot_services,
    invalidate_on_service_change, invalidate_on_user_change
)
from api.tests.helpers.factories import UserFactory, ServiceFactory


@pytest.mark.unit
class TestCacheTagList:
    """Test tag list caching"""
    
    @patch('api.cache_utils.CacheManager')
    def test_cache_tag_list(self, mock_cache):
        """Test caching tag list"""
        tags = [{'id': 'Q1', 'name': 'Tag1'}]
        cache_tag_list(tags)
        mock_cache.set.assert_called_once()
    
    @patch('api.cache_utils.CacheManager')
    def test_get_cached_tag_list(self, mock_cache):
        """Test retrieving cached tag list"""
        mock_cache.get.return_value = [{'id': 'Q1', 'name': 'Tag1'}]
        result = get_cached_tag_list()
        assert result is not None
        mock_cache.get.assert_called_once()
    
    @patch('api.cache_utils.CacheManager')
    def test_invalidate_tag_list(self, mock_cache):
        """Test invalidating tag list cache"""
        invalidate_tag_list()
        mock_cache.delete.assert_called_once()


@pytest.mark.unit
class TestCacheUserProfile:
    """Test user profile caching"""
    
    @patch('api.cache_utils.CacheManager')
    def test_cache_user_profile(self, mock_cache):
        """Test caching user profile"""
        user_data = {'id': 'user-1', 'email': 'test@example.com'}
        cache_user_profile('user-1', user_data)
        mock_cache.set.assert_called_once()
    
    @patch('api.cache_utils.CacheManager')
    def test_get_cached_user_profile(self, mock_cache):
        """Test retrieving cached user profile"""
        mock_cache.get.return_value = {'id': 'user-1', 'email': 'test@example.com'}
        result = get_cached_user_profile('user-1')
        assert result is not None
        mock_cache.get.assert_called_once()
    
    @patch('api.cache_utils.CacheManager')
    def test_invalidate_user_profile(self, mock_cache):
        """Test invalidating user profile cache"""
        invalidate_user_profile('user-1')
        mock_cache.delete.assert_called_once()


@pytest.mark.unit
class TestCacheServiceList:
    """Test service list caching"""
    
    @patch('api.cache_utils.CacheManager')
    def test_cache_service_list(self, mock_cache):
        """Test caching service list"""
        services = [{'id': 'service-1', 'title': 'Test Service'}]
        cache_service_list({}, services)
        mock_cache.set.assert_called_once()
    
    @patch('api.cache_utils.CacheManager')
    def test_get_cached_service_list(self, mock_cache):
        """Test retrieving cached service list"""
        mock_cache.get.return_value = [{'id': 'service-1', 'title': 'Test Service'}]
        result = get_cached_service_list({})
        assert result is not None
        mock_cache.get.assert_called_once()
    
    @patch('api.cache_utils.CacheManager')
    def test_invalidate_service_lists(self, mock_cache):
        """Test invalidating service list cache"""
        invalidate_service_lists()
        mock_cache.delete_pattern.assert_called_once_with("service_list")


@pytest.mark.unit
class TestCacheServiceDetail:
    """Test service detail caching"""
    
    @patch('api.cache_utils.CacheManager')
    def test_cache_service_detail(self, mock_cache):
        """Test caching service detail"""
        service_data = {'id': 'service-1', 'title': 'Test Service'}
        cache_service_detail('service-1', service_data)
        mock_cache.set.assert_called_once()
    
    @patch('api.cache_utils.CacheManager')
    def test_get_cached_service_detail(self, mock_cache):
        """Test retrieving cached service detail"""
        mock_cache.get.return_value = {'id': 'service-1', 'title': 'Test Service'}
        result = get_cached_service_detail('service-1')
        assert result is not None
        mock_cache.get.assert_called_once()
    
    @patch('api.cache_utils.CacheManager')
    def test_invalidate_service_detail(self, mock_cache):
        """Test invalidating service detail cache"""
        invalidate_service_detail('service-1')
        mock_cache.delete.assert_called_once()


@pytest.mark.unit
class TestCacheHotServices:
    """Test hot services caching"""
    
    @patch('api.cache_utils.CacheManager')
    def test_cache_hot_services(self, mock_cache):
        """Test caching hot services"""
        services = [{'id': 'service-1', 'hot_score': 100}]
        cache_hot_services(services)
        mock_cache.set.assert_called_once()
    
    @patch('api.cache_utils.CacheManager')
    def test_get_cached_hot_services(self, mock_cache):
        """Test retrieving cached hot services"""
        mock_cache.get.return_value = [{'id': 'service-1', 'hot_score': 100}]
        result = get_cached_hot_services()
        assert result is not None
        mock_cache.get.assert_called_once()


@pytest.mark.django_db
@pytest.mark.unit
class TestInvalidateOnChange:
    """Test cache invalidation on model changes"""
    
    @patch('api.cache_utils.invalidate_service_lists')
    @patch('api.cache_utils.invalidate_hot_services')
    @patch('api.cache_utils.invalidate_service_detail')
    def test_invalidate_on_service_change(self, mock_detail, mock_hot, mock_lists):
        """Test cache invalidation on service change"""
        service = MagicMock()
        service.id = 'service-1'
        service.user = MagicMock()
        service.user.id = 'user-1'
        invalidate_on_service_change(service)
        mock_lists.assert_called_once()
        mock_hot.assert_called_once()
        mock_detail.assert_called_once()
    
    @patch('api.cache_utils.invalidate_user_profile')
    def test_invalidate_on_user_change(self, mock_invalidate):
        """Test cache invalidation on user change"""
        user = MagicMock()
        user.id = 'user-1'
        invalidate_on_user_change(user)
        mock_invalidate.assert_called_once_with(str(user.id))
