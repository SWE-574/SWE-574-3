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
    invalidate_on_service_change, invalidate_on_user_change,
    register_calendar_cache_key,
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


@pytest.mark.unit
class TestRegisterCalendarCacheKey:
    """Cover the read-modify-write retry loop in register_calendar_cache_key.

    Regression: the original implementation had an unconditional `return`
    inside the `for _ in range(3)` loop, so the retry never kicked in and
    a racing writer could clobber the tracking set with a single-key set.

    Each test mints its own user_id via uuid because pytest-xdist runs
    these in parallel against a shared Redis on CI — a literal 'user-1'
    would let workers trample each other's tracking sets, and a setup-
    level `cache.clear()` would wreck other workers' in-flight state.
    """

    @pytest.fixture(autouse=True)
    def clear_django_cache(self):
        # Override the conftest-level autouse fixture for this class only.
        # CI runs pytest-xdist against a shared Redis DB, where a parallel
        # worker's `cache.clear()` would nuke this class's tracking set
        # mid-read-modify-write and surface as a flaky empty-set assertion.
        # uuid-prefixed user_ids already isolate this class's keys from
        # other workers, so skipping the global clear is safe.
        yield

    def test_register_two_keys_for_same_user_keeps_both(self):
        import uuid
        from django.core.cache import cache as django_cache
        user_id = f'cache-test-{uuid.uuid4().hex[:8]}'
        register_calendar_cache_key(user_id, 'cal_key_a')
        register_calendar_cache_key(user_id, 'cal_key_b')
        tracked = django_cache.get(f'user_calendar_keys:{user_id}', set())
        assert tracked == {'cal_key_a', 'cal_key_b'}

    def test_register_idempotent_for_same_key(self):
        import uuid
        from django.core.cache import cache as django_cache
        user_id = f'cache-test-{uuid.uuid4().hex[:8]}'
        register_calendar_cache_key(user_id, 'cal_key_a')
        register_calendar_cache_key(user_id, 'cal_key_a')
        tracked = django_cache.get(f'user_calendar_keys:{user_id}', set())
        assert tracked == {'cal_key_a'}

    def test_register_recovers_when_first_set_was_clobbered(self, monkeypatch):
        """If a racing caller landed between our get and set, the verify-then-
        retry loop must re-read and merge instead of leaving the new key out."""
        import uuid
        from django.core import cache as cache_mod
        cache = cache_mod.cache
        user_id = f'cache-test-{uuid.uuid4().hex[:8]}'

        register_calendar_cache_key(user_id, 'a')

        original_set = cache.set
        call_count = {'n': 0}
        tracking_key = f'user_calendar_keys:{user_id}'

        def racy_set(key, value, timeout=None, **kwargs):
            # On the first set for our user's tracking key, simulate a racing
            # writer that overwrote the value AFTER we read but BEFORE we
            # write — i.e. our write lands first, then the racer's write
            # immediately clobbers it. The retry must detect that and merge.
            if key == tracking_key and call_count['n'] == 0:
                call_count['n'] += 1
                result = original_set(key, value, timeout=timeout, **kwargs)
                # Simulate the racing clobber:
                original_set(key, {'racer_only'}, timeout=timeout, **kwargs)
                return result
            return original_set(key, value, timeout=timeout, **kwargs)

        monkeypatch.setattr(cache, 'set', racy_set)

        register_calendar_cache_key(user_id, 'b')

        tracked = cache.get(tracking_key, set())
        assert 'b' in tracked, (
            'After a racing clobber, the retry loop must re-add our key'
        )
