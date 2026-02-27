"""
Unit tests for Search Filter Strategies.

Tests the Strategy Pattern implementation for multi-faceted service search,
including location-based, tag-based, text-based, and type-based filtering.
"""
from decimal import Decimal
from django.test import TestCase
from django.contrib.auth import get_user_model
from django.contrib.gis.geos import Point

from api.models import Service, Tag
from api.search_filters import (
    SearchStrategy,
    LocationStrategy,
    TagStrategy,
    TextStrategy,
    TypeStrategy,
    SearchEngine,
)

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
            duration=Decimal('1.50'),
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
