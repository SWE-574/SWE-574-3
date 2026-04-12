"""
Unit tests for Search Filter Strategies.

Tests the Strategy Pattern implementation for multi-faceted service search,
including location-based, tag-based, text-based, and type-based filtering.
"""
import pytest
from decimal import Decimal
from datetime import timedelta
from django.test import TestCase
from django.contrib.auth import get_user_model
from django.contrib.gis.geos import Point
from django.utils import timezone

from api.models import Service, Tag
from api.search_filters import (
    SearchStrategy,
    LocationStrategy,
    TagStrategy,
    TextStrategy,
    TypeStrategy,
    SearchEngine,
)

# DateRangeStrategy is not yet implemented. Imported lazily so that an
# ImportError here does not break the rest of this module.
try:
    from api.search_filters import DateRangeStrategy as _DateRangeStrategy
except ImportError:
    _DateRangeStrategy = None

try:
    from api.search_filters import WeightedSearchEngine as _WeightedSearchEngine
    from api.search_filters import TITLE_WEIGHT, TAG_WEIGHT
except ImportError:
    _WeightedSearchEngine = None
    TITLE_WEIGHT = None
    TAG_WEIGHT = None

User = get_user_model()


class LocationStrategyTestCase(TestCase):
    """Test cases for LocationStrategy."""
    
    def setUp(self):
        """Set up test data with services at different locations."""
        self.user = User.objects.create_user(
            email='testuser@test.com',
            password='testpass123',
            first_name='Test',
            last_name='User',
            timebank_balance=Decimal('10.00')
        )
        
        # Service in Besiktas, Istanbul (41.0422, 29.0089)
        self.service_besiktas = Service.objects.create(
            user=self.user,
            title='Besiktas Service',
            description='A service in Besiktas',
            type='Offer',
            duration=Decimal('2.00'),
            location_type='In-Person',
            location_area='Besiktas',
            location_lat=Decimal('41.0422'),
            location_lng=Decimal('29.0089'),
            max_participants=1,
            schedule_type='One-Time'
        )
        
        # Service in Kadikoy, Istanbul (40.9819, 29.0244) - ~7km from Besiktas
        self.service_kadikoy = Service.objects.create(
            user=self.user,
            title='Kadikoy Service',
            description='A service in Kadikoy',
            type='Offer',
            duration=Decimal('1.00'),
            location_type='In-Person',
            location_area='Kadikoy',
            location_lat=Decimal('40.9819'),
            location_lng=Decimal('29.0244'),
            max_participants=1,
            schedule_type='One-Time'
        )
        
        # Service in Ankara (~350km from Istanbul)
        self.service_ankara = Service.objects.create(
            user=self.user,
            title='Ankara Service',
            description='A service in Ankara',
            type='Offer',
            duration=Decimal('2.00'),
            location_type='In-Person',
            location_area='Ankara',
            location_lat=Decimal('39.9334'),
            location_lng=Decimal('32.8597'),
            max_participants=1,
            schedule_type='One-Time'
        )
        
        # Online service (no location)
        self.service_online = Service.objects.create(
            user=self.user,
            title='Online Service',
            description='An online service',
            type='Offer',
            duration=Decimal('1.00'),
            location_type='Online',
            max_participants=1,
            schedule_type='One-Time'
        )
        
        self.strategy = LocationStrategy()
    
    def test_location_strategy_filters_by_distance(self):
        """Test LocationStrategy filters services within specified distance."""
        queryset = Service.objects.filter(status='Active')
        
        # Search from Besiktas center with 10km radius
        params = {
            'lat': 41.0422,
            'lng': 29.0089,
            'distance': 10
        }
        
        result = self.strategy.apply(queryset, params)
        result_list = list(result)
        
        # Should include Besiktas and Kadikoy (within 10km), but not Ankara or online
        self.assertEqual(len(result_list), 2)
        titles = [s.title for s in result_list]
        self.assertIn('Besiktas Service', titles)
        self.assertIn('Kadikoy Service', titles)
        self.assertNotIn('Ankara Service', titles)
        self.assertNotIn('Online Service', titles)
    
    def test_location_strategy_with_small_radius(self):
        """Test LocationStrategy with small radius only returns nearby services."""
        queryset = Service.objects.filter(status='Active')
        
        # Search from Besiktas center with 2km radius
        params = {
            'lat': 41.0422,
            'lng': 29.0089,
            'distance': 2
        }
        
        result = self.strategy.apply(queryset, params)
        result_list = list(result)
        
        # Should only include Besiktas service
        self.assertEqual(len(result_list), 1)
        self.assertEqual(result_list[0].title, 'Besiktas Service')
    
    def test_location_strategy_orders_by_distance(self):
        """Test LocationStrategy orders results by distance (nearest first)."""
        queryset = Service.objects.filter(status='Active')
        
        # Search from Besiktas center with large radius
        params = {
            'lat': 41.0422,
            'lng': 29.0089,
            'distance': 500  # Large radius to include Ankara
        }
        
        result = self.strategy.apply(queryset, params)
        result_list = list(result)
        
        # Besiktas should be first (closest), then Kadikoy, then Ankara
        self.assertGreaterEqual(len(result_list), 3)
        self.assertEqual(result_list[0].title, 'Besiktas Service')
        self.assertEqual(result_list[1].title, 'Kadikoy Service')
        self.assertEqual(result_list[2].title, 'Ankara Service')
    
    def test_location_strategy_no_location_params(self):
        """Test LocationStrategy returns unchanged queryset when no location params."""
        queryset = Service.objects.filter(status='Active')
        original_count = queryset.count()
        
        params = {}
        
        result = self.strategy.apply(queryset, params)
        
        self.assertEqual(result.count(), original_count)
    
    def test_location_strategy_invalid_coords(self):
        """Test LocationStrategy handles invalid coordinates gracefully."""
        queryset = Service.objects.filter(status='Active')
        original_count = queryset.count()
        
        params = {
            'lat': 'invalid',
            'lng': 'invalid',
            'distance': 10
        }
        
        result = self.strategy.apply(queryset, params)
        
        # Should return unchanged queryset
        self.assertEqual(result.count(), original_count)
    
    def test_location_strategy_partial_params(self):
        """Test LocationStrategy handles partial location params."""
        queryset = Service.objects.filter(status='Active')
        original_count = queryset.count()
        
        # Only lat provided
        params = {'lat': 41.0422}
        result = self.strategy.apply(queryset, params)
        self.assertEqual(result.count(), original_count)
        
        # Only lng provided
        params = {'lng': 29.0089}
        result = self.strategy.apply(queryset, params)
        self.assertEqual(result.count(), original_count)


class TagStrategyTestCase(TestCase):
    """Test cases for TagStrategy."""
    
    def setUp(self):
        """Set up test data with services and tags."""
        self.user = User.objects.create_user(
            email='testuser@test.com',
            password='testpass123',
            first_name='Test',
            last_name='User',
            timebank_balance=Decimal('10.00')
        )
        
        # Create tags
        self.tag_programming = Tag.objects.create(id='Q80006', name='Programming')
        self.tag_cooking = Tag.objects.create(id='Q25403900', name='Cooking')
        self.tag_gardening = Tag.objects.create(id='Q14748', name='Gardening')
        
        # Create services with tags
        self.service_programming = Service.objects.create(
            user=self.user,
            title='Programming Help',
            description='Python programming help',
            type='Offer',
            duration=Decimal('2.00'),
            location_type='Online',
            max_participants=1,
            schedule_type='One-Time'
        )
        self.service_programming.tags.add(self.tag_programming)
        
        self.service_cooking = Service.objects.create(
            user=self.user,
            title='Cooking Class',
            description='Learn to cook',
            type='Offer',
            duration=Decimal('3.00'),
            location_type='In-Person',
            max_participants=5,
            schedule_type='Recurrent'
        )
        self.service_cooking.tags.add(self.tag_cooking)
        
        self.service_multi_tag = Service.objects.create(
            user=self.user,
            title='Garden Programming',
            description='Automated garden systems',
            type='Offer',
            duration=Decimal('2.00'),
            location_type='Online',
            max_participants=1,
            schedule_type='One-Time'
        )
        self.service_multi_tag.tags.add(self.tag_programming, self.tag_gardening)
        
        self.service_no_tags = Service.objects.create(
            user=self.user,
            title='No Tags Service',
            description='A service without tags',
            type='Offer',
            duration=Decimal('1.00'),
            location_type='Online',
            max_participants=1,
            schedule_type='One-Time'
        )
        
        self.strategy = TagStrategy()
    
    def test_tag_strategy_filters_by_single_tag(self):
        """Test TagStrategy filters by single tag."""
        queryset = Service.objects.filter(status='Active')
        
        params = {'tag': 'Q80006'}  # Programming
        
        result = self.strategy.apply(queryset, params)
        result_list = list(result)
        
        self.assertEqual(len(result_list), 2)
        titles = [s.title for s in result_list]
        self.assertIn('Programming Help', titles)
        self.assertIn('Garden Programming', titles)
    
    def test_tag_strategy_filters_by_multiple_tags(self):
        """Test TagStrategy filters by multiple tags (OR logic)."""
        queryset = Service.objects.filter(status='Active')
        
        params = {'tags': ['Q80006', 'Q25403900']}  # Programming OR Cooking
        
        result = self.strategy.apply(queryset, params)
        result_list = list(result)
        
        self.assertEqual(len(result_list), 3)
        titles = [s.title for s in result_list]
        self.assertIn('Programming Help', titles)
        self.assertIn('Cooking Class', titles)
        self.assertIn('Garden Programming', titles)
    
    def test_tag_strategy_no_tags_param(self):
        """Test TagStrategy returns unchanged queryset when no tags specified."""
        queryset = Service.objects.filter(status='Active')
        original_count = queryset.count()
        
        params = {}
        
        result = self.strategy.apply(queryset, params)
        
        self.assertEqual(result.count(), original_count)
    
    def test_tag_strategy_empty_tags_list(self):
        """Test TagStrategy with empty tags list."""
        queryset = Service.objects.filter(status='Active')
        original_count = queryset.count()
        
        params = {'tags': []}
        
        result = self.strategy.apply(queryset, params)
        
        self.assertEqual(result.count(), original_count)
    
    def test_tag_strategy_nonexistent_tag(self):
        """Test TagStrategy with non-existent tag returns empty."""
        queryset = Service.objects.filter(status='Active')
        
        params = {'tags': ['Q99999999']}  # Non-existent tag
        
        result = self.strategy.apply(queryset, params)
        
        self.assertEqual(result.count(), 0)


class TextStrategyTestCase(TestCase):
    """Test cases for TextStrategy."""
    
    def setUp(self):
        """Set up test data for text search."""
        self.user = User.objects.create_user(
            email='testuser@test.com',
            password='testpass123',
            first_name='Test',
            last_name='User',
            timebank_balance=Decimal('10.00')
        )
        
        self.tag_python = Tag.objects.create(id='Q28865', name='Python')
        
        self.service1 = Service.objects.create(
            user=self.user,
            title='Web Development Help',
            description='I can help with React and Django',
            type='Offer',
            duration=Decimal('2.00'),
            location_type='Online',
            max_participants=1,
            schedule_type='One-Time'
        )
        self.service1.tags.add(self.tag_python)
        
        self.service2 = Service.objects.create(
            user=self.user,
            title='Piano Lessons',
            description='Learn to play piano',
            type='Offer',
            duration=Decimal('1.00'),
            location_type='In-Person',
            max_participants=1,
            schedule_type='Recurrent'
        )
        
        self.service3 = Service.objects.create(
            user=self.user,
            title='Garden Care',
            description='Help with web of plants',
            type='Need',
            duration=Decimal('3.00'),
            location_type='In-Person',
            max_participants=1,
            schedule_type='One-Time'
        )
        
        self.strategy = TextStrategy()
    
    def test_text_strategy_searches_title(self):
        """Test TextStrategy searches in title."""
        queryset = Service.objects.filter(status='Active')
        
        params = {'search': 'Piano'}
        
        result = self.strategy.apply(queryset, params)
        result_list = list(result)
        
        self.assertEqual(len(result_list), 1)
        self.assertEqual(result_list[0].title, 'Piano Lessons')
    
    def test_text_strategy_searches_description(self):
        """Test TextStrategy searches in description."""
        queryset = Service.objects.filter(status='Active')
        
        params = {'search': 'Django'}
        
        result = self.strategy.apply(queryset, params)
        result_list = list(result)
        
        self.assertEqual(len(result_list), 1)
        self.assertEqual(result_list[0].title, 'Web Development Help')
    
    def test_text_strategy_searches_tags(self):
        """Test TextStrategy searches in tag names."""
        queryset = Service.objects.filter(status='Active')
        
        params = {'search': 'Python'}
        
        result = self.strategy.apply(queryset, params)
        result_list = list(result)
        
        self.assertEqual(len(result_list), 1)
        self.assertEqual(result_list[0].title, 'Web Development Help')
    
    def test_text_strategy_case_insensitive(self):
        """Test TextStrategy search is case insensitive."""
        queryset = Service.objects.filter(status='Active')
        
        params = {'search': 'PIANO'}
        
        result = self.strategy.apply(queryset, params)
        result_list = list(result)
        
        self.assertEqual(len(result_list), 1)
        self.assertEqual(result_list[0].title, 'Piano Lessons')
    
    def test_text_strategy_partial_match(self):
        """Test TextStrategy partial matching."""
        queryset = Service.objects.filter(status='Active')
        
        params = {'search': 'web'}
        
        result = self.strategy.apply(queryset, params)
        result_list = list(result)
        
        # Should match both "Web Development" (title) and "web of plants" (description)
        self.assertEqual(len(result_list), 2)
        titles = [s.title for s in result_list]
        self.assertIn('Web Development Help', titles)
        self.assertIn('Garden Care', titles)
    
    def test_text_strategy_no_search_param(self):
        """Test TextStrategy returns unchanged queryset when no search."""
        queryset = Service.objects.filter(status='Active')
        original_count = queryset.count()
        
        params = {}
        
        result = self.strategy.apply(queryset, params)
        
        self.assertEqual(result.count(), original_count)
    
    def test_text_strategy_empty_search(self):
        """Test TextStrategy with empty search string."""
        queryset = Service.objects.filter(status='Active')
        original_count = queryset.count()
        
        params = {'search': '   '}  # Whitespace only
        
        result = self.strategy.apply(queryset, params)
        
        self.assertEqual(result.count(), original_count)
    
    def test_text_strategy_no_matches(self):
        """Test TextStrategy with search term that matches nothing."""
        queryset = Service.objects.filter(status='Active')
        
        params = {'search': 'xyznonexistent'}
        
        result = self.strategy.apply(queryset, params)
        
        self.assertEqual(result.count(), 0)


class TypeStrategyTestCase(TestCase):
    """Test cases for TypeStrategy."""
    
    def setUp(self):
        """Set up test data with different service types."""
        self.user = User.objects.create_user(
            email='testuser@test.com',
            password='testpass123',
            first_name='Test',
            last_name='User',
            timebank_balance=Decimal('10.00')
        )
        
        self.service_offer = Service.objects.create(
            user=self.user,
            title='Offer Service',
            description='An offer service',
            type='Offer',
            duration=Decimal('2.00'),
            location_type='Online',
            max_participants=1,
            schedule_type='One-Time'
        )
        
        self.service_need = Service.objects.create(
            user=self.user,
            title='Need Service',
            description='A need service',
            type='Need',
            duration=Decimal('1.00'),
            location_type='Online',
            max_participants=1,
            schedule_type='One-Time'
        )
        
        self.strategy = TypeStrategy()
    
    def test_type_strategy_filters_offers(self):
        """Test TypeStrategy filters for Offer type."""
        queryset = Service.objects.filter(status='Active')
        
        params = {'type': 'Offer'}
        
        result = self.strategy.apply(queryset, params)
        result_list = list(result)
        
        self.assertEqual(len(result_list), 1)
        self.assertEqual(result_list[0].title, 'Offer Service')
    
    def test_type_strategy_filters_needs(self):
        """Test TypeStrategy filters for Need type."""
        queryset = Service.objects.filter(status='Active')
        
        params = {'type': 'Need'}
        
        result = self.strategy.apply(queryset, params)
        result_list = list(result)
        
        self.assertEqual(len(result_list), 1)
        self.assertEqual(result_list[0].title, 'Need Service')
    
    def test_type_strategy_no_type_param(self):
        """Test TypeStrategy returns all when no type specified."""
        queryset = Service.objects.filter(status='Active')
        
        params = {}
        
        result = self.strategy.apply(queryset, params)
        
        self.assertEqual(result.count(), 2)
    
    def test_type_strategy_invalid_type(self):
        """Test TypeStrategy ignores invalid type."""
        queryset = Service.objects.filter(status='Active')
        
        params = {'type': 'Invalid'}
        
        result = self.strategy.apply(queryset, params)
        
        # Invalid type is ignored, all services returned
        self.assertEqual(result.count(), 2)


class SearchEngineTestCase(TestCase):
    """Test cases for SearchEngine (composite strategy)."""
    
    def setUp(self):
        """Set up test data for search engine tests."""
        self.user = User.objects.create_user(
            email='testuser@test.com',
            password='testpass123',
            first_name='Test',
            last_name='User',
            timebank_balance=Decimal('10.00')
        )
        
        self.tag_programming = Tag.objects.create(id='Q80006', name='Programming')
        self.tag_cooking = Tag.objects.create(id='Q25403900', name='Cooking')
        
        # Programming service in Besiktas
        self.service1 = Service.objects.create(
            user=self.user,
            title='Python Programming',
            description='Learn Python programming',
            type='Offer',
            duration=Decimal('2.00'),
            location_type='In-Person',
            location_area='Besiktas',
            location_lat=Decimal('41.0422'),
            location_lng=Decimal('29.0089'),
            max_participants=1,
            schedule_type='One-Time'
        )
        self.service1.tags.add(self.tag_programming)
        
        # Cooking service in Kadikoy
        self.service2 = Service.objects.create(
            user=self.user,
            title='Cooking Class',
            description='Learn Italian cooking',
            type='Offer',
            duration=Decimal('3.00'),
            location_type='In-Person',
            location_area='Kadikoy',
            location_lat=Decimal('40.9819'),
            location_lng=Decimal('29.0244'),
            max_participants=5,
            schedule_type='Recurrent'
        )
        self.service2.tags.add(self.tag_cooking)
        
        # Need service (no location)
        self.service3 = Service.objects.create(
            user=self.user,
            title='Need Help with Python',
            description='Looking for Python help',
            type='Need',
            duration=Decimal('1.00'),
            location_type='Online',
            max_participants=1,
            schedule_type='One-Time'
        )
        self.service3.tags.add(self.tag_programming)
        
        self.search_engine = SearchEngine()
    
    def test_search_engine_combines_strategies(self):
        """Test SearchEngine applies multiple filters."""
        queryset = Service.objects.filter(status='Active')
        
        # Search for "Python" type "Offer" - should exclude service3 (Need)
        params = {
            'search': 'Python',
            'type': 'Offer'
        }
        
        result = self.search_engine.search(queryset, params)
        result_list = list(result)
        
        self.assertEqual(len(result_list), 1)
        self.assertEqual(result_list[0].title, 'Python Programming')
    
    def test_search_engine_text_and_tags(self):
        """Test SearchEngine with text and tag filters."""
        queryset = Service.objects.filter(status='Active')
        
        params = {
            'search': 'Python',
            'tags': ['Q80006']  # Programming tag
        }
        
        result = self.search_engine.search(queryset, params)
        result_list = list(result)
        
        # Both Python services have programming tag
        self.assertEqual(len(result_list), 2)
    
    def test_search_engine_with_location(self):
        """Test SearchEngine with location filter."""
        queryset = Service.objects.filter(status='Active')
        
        # Search near Besiktas with small radius
        params = {
            'lat': 41.0422,
            'lng': 29.0089,
            'distance': 2
        }
        
        result = self.search_engine.search(queryset, params)
        result_list = list(result)
        
        # Only Besiktas service should be in 2km radius
        self.assertEqual(len(result_list), 1)
        self.assertEqual(result_list[0].title, 'Python Programming')
    
    def test_search_engine_all_filters(self):
        """Test SearchEngine with all filters combined."""
        queryset = Service.objects.filter(status='Active')
        
        params = {
            'type': 'Offer',
            'tags': ['Q80006'],
            'search': 'Python',
            'lat': 41.0422,
            'lng': 29.0089,
            'distance': 50  # Include both Istanbul services
        }
        
        result = self.search_engine.search(queryset, params)
        result_list = list(result)
        
        # Only Python Programming matches: Offer, has programming tag, has "Python" in title, has location
        self.assertEqual(len(result_list), 1)
        self.assertEqual(result_list[0].title, 'Python Programming')
    
    def test_search_engine_no_params(self):
        """Test SearchEngine with no params returns all services."""
        queryset = Service.objects.filter(status='Active')
        original_count = queryset.count()
        
        params = {}
        
        result = self.search_engine.search(queryset, params)
        
        self.assertEqual(result.count(), original_count)


class ServiceLocationFieldTestCase(TestCase):
    """Test cases for Service model location field auto-population."""
    
    def setUp(self):
        """Set up test user."""
        self.user = User.objects.create_user(
            email='testuser@test.com',
            password='testpass123',
            first_name='Test',
            last_name='User',
            timebank_balance=Decimal('10.00')
        )
    
    def test_location_auto_populated_on_create(self):
        """Test location field is auto-populated from lat/lng on create."""
        service = Service.objects.create(
            user=self.user,
            title='Test Service',
            description='A test service',
            type='Offer',
            duration=Decimal('2.00'),
            location_type='In-Person',
            location_lat=Decimal('41.0422'),
            location_lng=Decimal('29.0089'),
            max_participants=1,
            schedule_type='One-Time'
        )
        
        self.assertIsNotNone(service.location)
        self.assertEqual(service.location.x, 29.0089)  # lng
        self.assertEqual(service.location.y, 41.0422)  # lat
    
    def test_location_auto_populated_on_update(self):
        """Test location field is updated when lat/lng changes."""
        service = Service.objects.create(
            user=self.user,
            title='Test Service',
            description='A test service',
            type='Offer',
            duration=Decimal('2.00'),
            location_type='In-Person',
            max_participants=1,
            schedule_type='One-Time'
        )
        
        # Initially no location
        self.assertIsNone(service.location)
        
        # Update with lat/lng
        service.location_lat = Decimal('41.0422')
        service.location_lng = Decimal('29.0089')
        service.save()
        
        service.refresh_from_db()
        self.assertIsNotNone(service.location)
        self.assertEqual(service.location.x, 29.0089)
        self.assertEqual(service.location.y, 41.0422)
    
    def test_location_null_when_no_coords(self):
        """Test location field is null when no coordinates provided."""
        service = Service.objects.create(
            user=self.user,
            title='Online Service',
            description='An online service',
            type='Offer',
            duration=Decimal('1.00'),
            location_type='Online',
            max_participants=1,
            schedule_type='One-Time'
        )
        
        self.assertIsNone(service.location)
    
    def test_location_cleared_when_coords_removed(self):
        """Test location field is cleared when coordinates are removed."""
        service = Service.objects.create(
            user=self.user,
            title='Test Service',
            description='A test service',
            type='Offer',
            duration=Decimal('2.00'),
            location_type='In-Person',
            location_lat=Decimal('41.0422'),
            location_lng=Decimal('29.0089'),
            max_participants=1,
            schedule_type='One-Time'
        )
        
        self.assertIsNotNone(service.location)
        
        # Remove coordinates
        service.location_lat = None
        service.location_lng = None
        service.save()
        
        service.refresh_from_db()
        self.assertIsNone(service.location)
    
    def test_location_updated_with_update_fields(self):
        """Test location field is updated when save() is called with update_fields."""
        service = Service.objects.create(
            user=self.user,
            title='Test Service',
            description='A test service',
            type='Offer',
            duration=Decimal('2.00'),
            location_type='In-Person',
            location_lat=Decimal('41.0422'),
            location_lng=Decimal('29.0089'),
            max_participants=1,
            schedule_type='One-Time'
        )
        
        original_location = service.location
        self.assertIsNotNone(original_location)
        
        # Update only location_lat with update_fields
        service.location_lat = Decimal('40.0000')
        service.save(update_fields=['location_lat'])
        
        service.refresh_from_db()
        # Verify location was also updated (not just location_lat)
        self.assertIsNotNone(service.location)
        self.assertEqual(service.location.y, 40.0)  # lat changed
        self.assertEqual(service.location.x, 29.0089)  # lng unchanged
    
    def test_location_updated_with_update_fields_lng_only(self):
        """Test location field is updated when only location_lng is in update_fields."""
        service = Service.objects.create(
            user=self.user,
            title='Test Service',
            description='A test service',
            type='Offer',
            duration=Decimal('2.00'),
            location_type='In-Person',
            location_lat=Decimal('41.0422'),
            location_lng=Decimal('29.0089'),
            max_participants=1,
            schedule_type='One-Time'
        )
        
        # Update only location_lng with update_fields
        service.location_lng = Decimal('30.0000')
        service.save(update_fields=['location_lng'])
        
        service.refresh_from_db()
        # Verify location was also updated
        self.assertIsNotNone(service.location)
        self.assertEqual(service.location.y, 41.0422)  # lat unchanged
        self.assertEqual(service.location.x, 30.0)  # lng changed
    
    def test_location_not_added_when_unrelated_update_fields(self):
        """Test location field is not added to update_fields when lat/lng not included."""
        service = Service.objects.create(
            user=self.user,
            title='Test Service',
            description='A test service',
            type='Offer',
            duration=Decimal('2.00'),
            location_type='In-Person',
            location_lat=Decimal('41.0422'),
            location_lng=Decimal('29.0089'),
            max_participants=1,
            schedule_type='One-Time'
        )
        
        original_location = service.location
        
        # Update only title with update_fields (no lat/lng)
        service.title = 'Updated Title'
        service.save(update_fields=['title'])
        
        service.refresh_from_db()
        self.assertEqual(service.title, 'Updated Title')
        # Location should remain unchanged
        self.assertEqual(service.location.x, original_location.x)
        self.assertEqual(service.location.y, original_location.y)


class ServiceViewSetOrderingTestCase(TestCase):
    """
    API-level tests for ServiceViewSet ordering behavior.
    
    Verifies that fallback ordering is correctly applied when:
    - Invalid lat/lng params are provided
    - No lat/lng params are provided
    """
    
    def setUp(self):
        """Set up test data with services at different times."""
        from rest_framework.test import APIClient
        from django.utils import timezone
        import time
        
        self.client = APIClient()
        
        self.user = User.objects.create_user(
            email='testuser@test.com',
            password='testpass123',
            first_name='Test',
            last_name='User',
            timebank_balance=Decimal('10.00')
        )
        
        # Create services with different creation times
        self.service_older = Service.objects.create(
            user=self.user,
            title='Older Service',
            description='Created first',
            type='Offer',
            duration=Decimal('1.00'),
            location_type='In-Person',
            location_area='Besiktas',
            location_lat=Decimal('41.0422'),
            location_lng=Decimal('29.0089'),
            max_participants=1,
            schedule_type='One-Time'
        )
        
        # Small delay to ensure different created_at timestamps
        time.sleep(0.01)
        
        self.service_newer = Service.objects.create(
            user=self.user,
            title='Newer Service',
            description='Created second',
            type='Offer',
            duration=Decimal('2.00'),
            location_type='In-Person',
            location_area='Kadikoy',
            location_lat=Decimal('40.9900'),
            location_lng=Decimal('29.0200'),
            max_participants=1,
            schedule_type='One-Time'
        )
        
        self.client.force_authenticate(user=self.user)
    
    def _get_results(self, response):
        """Extract results from paginated or non-paginated response."""
        data = response.json()
        # Handle both paginated (dict with 'results') and non-paginated (list) responses
        if isinstance(data, dict) and 'results' in data:
            return data['results']
        return data
    
    def test_invalid_lat_lng_applies_created_at_ordering(self):
        """
        Test that invalid lat/lng params result in -created_at ordering.
        
        This is a regression test for the bug where invalid lat/lng strings
        (being truthy) would skip the fallback ordering, causing unordered results.
        """
        response = self.client.get('/api/services/', {
            'lat': 'invalid',
            'lng': '29.0089'
        })
        
        self.assertEqual(response.status_code, 200)
        results = self._get_results(response)
        
        # Should be ordered by -created_at (newer first)
        self.assertGreaterEqual(len(results), 2)
        self.assertEqual(results[0]['title'], 'Newer Service')
        self.assertEqual(results[1]['title'], 'Older Service')
    
    def test_no_lat_lng_applies_created_at_ordering(self):
        """Test that missing lat/lng params result in -created_at ordering."""
        response = self.client.get('/api/services/')
        
        self.assertEqual(response.status_code, 200)
        results = self._get_results(response)
        
        # Should be ordered by -created_at (newer first)
        self.assertGreaterEqual(len(results), 2)
        self.assertEqual(results[0]['title'], 'Newer Service')
        self.assertEqual(results[1]['title'], 'Older Service')
    
    def test_valid_lat_lng_applies_distance_ordering(self):
        """Test that valid lat/lng params result in distance ordering."""
        # Query from Besiktas location (closer to service_older)
        response = self.client.get('/api/services/', {
            'lat': '41.0422',
            'lng': '29.0089',
            'distance': '50'  # Wide enough to include both services
        })
        
        self.assertEqual(response.status_code, 200)
        results = self._get_results(response)
        
        # Should be ordered by distance (Besiktas service closer)
        self.assertGreaterEqual(len(results), 2)
        self.assertEqual(results[0]['title'], 'Older Service')  # In Besiktas, closer
        self.assertEqual(results[1]['title'], 'Newer Service')  # In Kadikoy, farther


# ---------------------------------------------------------------------------
# FR-12c: DateRangeStrategy — TDD tests (will fail until DateRangeStrategy
# is added to search_filters.py and wired into SearchEngine)
# ---------------------------------------------------------------------------

@pytest.mark.xfail(reason="FR-12c: DateRangeStrategy not yet implemented", strict=False)
class DateRangeStrategyTestCase(TestCase):
    """
    TDD tests for DateRangeStrategy.

    These tests are marked xfail because DateRangeStrategy does not yet exist
    in search_filters.py. They define the expected behaviour for FR-12c
    (filter events by scheduled date window).
    """

    def setUp(self):
        if _DateRangeStrategy is None:
            pytest.xfail("DateRangeStrategy not yet implemented — FR-12c")

        self.user = User.objects.create_user(
            email='daterange@test.com',
            password='testpass123',
            first_name='Date',
            last_name='Range',
            timebank_balance=Decimal('10.00'),
        )
        now = timezone.now()
        base = dict(
            user=self.user,
            type='Event',
            duration=Decimal('2.00'),
            location_type='In-Person',
            location_area='Istanbul',
            location_lat=Decimal('41.01'),
            location_lng=Decimal('28.97'),
            max_participants=20,
            schedule_type='One-Time',
        )
        self.past_event = Service.objects.create(
            title='Past Event', description='d',
            scheduled_time=now - timedelta(days=10), **base,
        )
        self.near_event = Service.objects.create(
            title='Near Future Event', description='d',
            scheduled_time=now + timedelta(days=3), **base,
        )
        self.far_event = Service.objects.create(
            title='Far Future Event', description='d',
            scheduled_time=now + timedelta(days=30), **base,
        )
        self.strategy = _DateRangeStrategy()
        self.qs = Service.objects.all()

    def test_date_from_excludes_events_before_window(self):
        """date_from should filter out events scheduled before that date."""
        tomorrow = timezone.now() + timedelta(days=1)
        result = self.strategy.apply(self.qs, {'date_from': tomorrow.date().isoformat()})
        titles = list(result.values_list('title', flat=True))
        self.assertNotIn('Past Event', titles)
        self.assertIn('Near Future Event', titles)

    def test_date_to_excludes_events_after_window(self):
        """date_to should filter out events scheduled after that date."""
        cutoff = timezone.now() + timedelta(days=7)
        result = self.strategy.apply(self.qs, {'date_to': cutoff.date().isoformat()})
        titles = list(result.values_list('title', flat=True))
        self.assertNotIn('Far Future Event', titles)
        self.assertIn('Near Future Event', titles)

    def test_combined_date_window(self):
        """date_from + date_to should return only events inside the window."""
        date_from = (timezone.now() + timedelta(days=1)).date().isoformat()
        date_to = (timezone.now() + timedelta(days=7)).date().isoformat()
        result = self.strategy.apply(self.qs, {'date_from': date_from, 'date_to': date_to})
        titles = list(result.values_list('title', flat=True))
        self.assertIn('Near Future Event', titles)
        self.assertNotIn('Past Event', titles)
        self.assertNotIn('Far Future Event', titles)

    def test_events_without_scheduled_time_excluded(self):
        """Events with no scheduled_time should be excluded when a date filter is active."""
        Service.objects.create(
            title='No Schedule Event', description='d',
            scheduled_time=None,
            user=self.user, type='Event', duration=Decimal('1.00'),
            location_type='Online', location_area='',
            location_lat=Decimal('0'), location_lng=Decimal('0'),
            max_participants=5, schedule_type='One-Time',
        )
        date_from = timezone.now().date().isoformat()
        result = self.strategy.apply(self.qs, {'date_from': date_from})
        titles = list(result.values_list('title', flat=True))
        self.assertNotIn('No Schedule Event', titles)

    def test_no_params_is_noop(self):
        """Passing no date params should return the original queryset unchanged."""
        result = self.strategy.apply(self.qs, {})
        self.assertEqual(result.count(), self.qs.count())

    def test_invalid_date_from_raises_value_error(self):
        """An unparseable date_from string should raise ValueError."""
        with self.assertRaises(ValueError):
            self.strategy.apply(self.qs, {'date_from': 'not-a-date'})

    def test_invalid_date_to_raises_value_error(self):
        """An unparseable date_to string should raise ValueError."""
        with self.assertRaises(ValueError):
            self.strategy.apply(self.qs, {'date_to': 'not-a-date'})

    def test_single_day_window(self):
        """date_from == date_to should return events on exactly that day."""
        target_date = (timezone.now() + timedelta(days=3)).date()
        params = {
            'date_from': target_date.isoformat(),
            'date_to': target_date.isoformat(),
        }
        result = self.strategy.apply(self.qs, params)
        for svc in result:
            self.assertEqual(svc.scheduled_time.date(), target_date)


# ---------------------------------------------------------------------------
# FR-17g — Weighted Search (TDD / xfail until implemented)
# ---------------------------------------------------------------------------

@pytest.mark.xfail(reason="FR-17g: WeightedSearchEngine not yet implemented", strict=False)
class TestSearchWeighting(TestCase):
    """
    TDD tests for weighted search result ordering (FR-17g, FR-SEA-01).

    Weighted hierarchy: title match (1.0) > tag match (0.8) > description-only (lower).
    These tests are xfail because search_filters.py currently uses a flat filter
    with no scored ordering — WeightedSearchEngine and weight constants do not exist.
    """

    def setUp(self):
        if _WeightedSearchEngine is None:
            pytest.xfail("WeightedSearchEngine not yet implemented — FR-17g")

        self.user = User.objects.create_user(
            email='weighted@test.com',
            password='testpass123',
            first_name='Weight',
            last_name='Test',
            timebank_balance=Decimal('10.00'),
        )
        python_tag = Tag.objects.create(id='Q28865', name='Python')

        self.title_match = Service.objects.create(
            user=self.user,
            title='Python programming lessons',
            description='Learn to code efficiently',
            type='Offer', duration=Decimal('1.00'),
            location_type='Online', location_area='',
            location_lat=Decimal('0'), location_lng=Decimal('0'),
            max_participants=1, schedule_type='One-Time', status='Active',
        )

        self.tag_match = Service.objects.create(
            user=self.user,
            title='Programming tutoring',
            description='Learn software development',
            type='Offer', duration=Decimal('1.00'),
            location_type='Online', location_area='',
            location_lat=Decimal('0'), location_lng=Decimal('0'),
            max_participants=1, schedule_type='One-Time', status='Active',
        )
        self.tag_match.tags.add(python_tag)

        self.description_match = Service.objects.create(
            user=self.user,
            title='Coding help',
            description='I can help with Python scripts and automation',
            type='Offer', duration=Decimal('1.00'),
            location_type='Online', location_area='',
            location_lat=Decimal('0'), location_lng=Decimal('0'),
            max_participants=1, schedule_type='One-Time', status='Active',
        )

        self.engine = _WeightedSearchEngine()

    def test_title_match_ranks_above_tag_match(self):
        """A service whose title contains the query should outrank one whose tag matches."""
        results = list(self.engine.search(Service.objects.filter(status='Active'), 'Python'))
        title_idx = next(i for i, s in enumerate(results) if s.pk == self.title_match.pk)
        tag_idx = next(i for i, s in enumerate(results) if s.pk == self.tag_match.pk)
        self.assertLess(title_idx, tag_idx, "Title match should appear before tag match")

    def test_tag_match_ranks_above_description_only_match(self):
        """A service tagged with the query term should outrank a description-only match."""
        results = list(self.engine.search(Service.objects.filter(status='Active'), 'Python'))
        tag_idx = next(i for i, s in enumerate(results) if s.pk == self.tag_match.pk)
        desc_idx = next(i for i, s in enumerate(results) if s.pk == self.description_match.pk)
        self.assertLess(tag_idx, desc_idx, "Tag match should appear before description-only match")

    def test_weighted_search_returns_ordered_results(self):
        """Full ordering: title → tag → description-only."""
        results = list(self.engine.search(Service.objects.filter(status='Active'), 'Python'))
        pks = [s.pk for s in results]
        title_idx = pks.index(self.title_match.pk)
        tag_idx = pks.index(self.tag_match.pk)
        desc_idx = pks.index(self.description_match.pk)
        self.assertLess(title_idx, tag_idx)
        self.assertLess(tag_idx, desc_idx)

    def test_weight_constants_are_defined(self):
        """TITLE_WEIGHT and TAG_WEIGHT constants must be defined in search_filters."""
        self.assertIsNotNone(TITLE_WEIGHT)
        self.assertIsNotNone(TAG_WEIGHT)
        self.assertGreater(TITLE_WEIGHT, TAG_WEIGHT, "Title weight must exceed tag weight")


@pytest.mark.xfail(reason="FR-12c: DateRangeStrategy not yet implemented", strict=False)
class DateRangeStrategyTestCase(TestCase):
    """
    Unit tests for DateRangeStrategy (FR-12c).

    DateRangeStrategy filters services by their scheduled_time using optional
    date_from and date_to ISO-8601 date parameters. It is intended to be used
    together with TypeStrategy so that only Event services are date-filtered,
    but the strategy itself is type-agnostic.
    """

    def setUp(self):
        self.user = User.objects.create_user(
            email='daterange@test.com',
            password='testpass123',
            first_name='Test',
            last_name='User',
            timebank_balance=Decimal('10.00'),
        )
        now = timezone.now()

        # Event happening yesterday
        self.event_past = Service.objects.create(
            user=self.user,
            title='Past Event',
            description='An event that already happened',
            type='Event',
            duration=Decimal('2.00'),
            location_type='Online',
            max_participants=10,
            schedule_type='One-Time',
            scheduled_time=now - timedelta(days=1),
        )

        # Event happening today
        self.event_today = Service.objects.create(
            user=self.user,
            title='Today Event',
            description='An event happening today',
            type='Event',
            duration=Decimal('1.00'),
            location_type='Online',
            max_participants=10,
            schedule_type='One-Time',
            scheduled_time=now,
        )

        # Event happening in 3 days
        self.event_near_future = Service.objects.create(
            user=self.user,
            title='Near Future Event',
            description='An event coming up in a few days',
            type='Event',
            duration=Decimal('2.00'),
            location_type='Online',
            max_participants=10,
            schedule_type='One-Time',
            scheduled_time=now + timedelta(days=3),
        )

        # Event happening in 10 days
        self.event_far_future = Service.objects.create(
            user=self.user,
            title='Far Future Event',
            description='An event further out',
            type='Event',
            duration=Decimal('2.00'),
            location_type='Online',
            max_participants=10,
            schedule_type='One-Time',
            scheduled_time=now + timedelta(days=10),
        )

        # Regular offer service (no scheduled_time) — must never be excluded by date filter
        self.offer_no_date = Service.objects.create(
            user=self.user,
            title='Regular Offer',
            description='A non-event offer with no scheduled time',
            type='Offer',
            duration=Decimal('1.00'),
            location_type='Online',
            max_participants=1,
            schedule_type='Recurrent',
        )

        if _DateRangeStrategy is None:
            pytest.xfail("DateRangeStrategy not yet implemented — FR-12c")
        self.strategy = _DateRangeStrategy()

    def _event_titles(self, queryset):
        return {s.title for s in queryset}

    def test_date_from_excludes_events_before_that_date(self):
        """FR-12c: date_from filters out events scheduled before the given date."""
        future_date = (timezone.now() + timedelta(days=2)).date().isoformat()
        qs = Service.objects.filter(status='Active')

        result = self.strategy.apply(qs, {'date_from': future_date})
        titles = self._event_titles(result)

        self.assertIn('Near Future Event', titles)
        self.assertIn('Far Future Event', titles)
        self.assertNotIn('Past Event', titles)
        self.assertNotIn('Today Event', titles)

    def test_date_to_excludes_events_after_that_date(self):
        """FR-12c: date_to filters out events scheduled after the given date."""
        cutoff_date = (timezone.now() + timedelta(days=5)).date().isoformat()
        qs = Service.objects.filter(status='Active')

        result = self.strategy.apply(qs, {'date_to': cutoff_date})
        titles = self._event_titles(result)

        self.assertIn('Past Event', titles)
        self.assertIn('Today Event', titles)
        self.assertIn('Near Future Event', titles)
        self.assertNotIn('Far Future Event', titles)

    def test_date_from_and_date_to_together_form_window(self):
        """FR-12c: date_from + date_to combined returns only events in the window."""
        date_from = (timezone.now() + timedelta(days=2)).date().isoformat()
        date_to = (timezone.now() + timedelta(days=5)).date().isoformat()
        qs = Service.objects.filter(status='Active')

        result = self.strategy.apply(qs, {'date_from': date_from, 'date_to': date_to})
        titles = self._event_titles(result)

        self.assertIn('Near Future Event', titles)
        self.assertNotIn('Past Event', titles)
        self.assertNotIn('Today Event', titles)
        self.assertNotIn('Far Future Event', titles)

    def test_services_without_scheduled_time_excluded_when_date_filter_active(self):
        """FR-12c: services with no scheduled_time are excluded when date filter is set."""
        date_from = (timezone.now() - timedelta(days=2)).date().isoformat()
        qs = Service.objects.filter(status='Active')

        result = self.strategy.apply(qs, {'date_from': date_from})

        self.assertNotIn(self.offer_no_date, list(result))

    def test_no_params_returns_queryset_unchanged(self):
        """FR-12c: empty params — DateRangeStrategy is a no-op."""
        qs = Service.objects.filter(status='Active')
        original_count = qs.count()

        result = self.strategy.apply(qs, {})

        self.assertEqual(result.count(), original_count)

    def test_invalid_date_from_raises_400_compatible_error(self):
        """FR-12c: invalid date string should raise ValueError (caller converts to 400)."""
        qs = Service.objects.filter(status='Active')

        with self.assertRaises(ValueError):
            self.strategy.apply(qs, {'date_from': 'not-a-date'})

    def test_invalid_date_to_raises_400_compatible_error(self):
        """FR-12c: invalid date_to should raise ValueError (caller converts to 400)."""
        qs = Service.objects.filter(status='Active')

        with self.assertRaises(ValueError):
            self.strategy.apply(qs, {'date_to': 'not-a-date'})

    def test_date_from_equal_to_date_to_returns_single_day_window(self):
        """FR-12c: date_from == date_to should return events on that exact day."""
        today = timezone.now().date().isoformat()
        qs = Service.objects.filter(status='Active')

        result = self.strategy.apply(qs, {'date_from': today, 'date_to': today})
        titles = self._event_titles(result)

        self.assertIn('Today Event', titles)
        self.assertNotIn('Near Future Event', titles)
        self.assertNotIn('Far Future Event', titles)
