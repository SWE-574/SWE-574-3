"""
Unit tests for Service.save() location field synchronization.

Tests for race condition prevention when using update_fields with location coordinates.
"""
from decimal import Decimal
from django.test import TestCase
from django.contrib.auth import get_user_model
from django.contrib.gis.geos import Point

from api.models import Service

User = get_user_model()


class ServiceLocationSaveTestCase(TestCase):
    """Test cases for Service location field synchronization during save."""
    
    def setUp(self):
        """Set up test data."""
        self.user = User.objects.create_user(
            email='test@test.com',
            password='testpass123',
            first_name='Test',
            last_name='User',
            timebank_balance=Decimal('10.00')
        )
    
    def test_full_save_computes_location(self):
        """Test that full save correctly computes location from lat/lng."""
        service = Service.objects.create(
            user=self.user,
            title='Test Service',
            description='A test service',
            type='Offer',
            duration=Decimal('2.00'),
            location_type='In-Person',
            location_lat=Decimal('41.015137'),
            location_lng=Decimal('28.979530'),
            max_participants=1,
            schedule_type='One-Time'
        )
        
        # Verify location was computed
        self.assertIsNotNone(service.location)
        self.assertAlmostEqual(service.location.x, 28.979530, places=5)
        self.assertAlmostEqual(service.location.y, 41.015137, places=5)
    
    def test_partial_save_with_both_coords_computes_location(self):
        """Test that partial save with both lat/lng updates location correctly."""
        service = Service.objects.create(
            user=self.user,
            title='Test Service',
            description='A test service',
            type='Offer',
            duration=Decimal('2.00'),
            location_type='In-Person',
            location_lat=Decimal('41.015137'),
            location_lng=Decimal('28.979530'),
            max_participants=1,
            schedule_type='One-Time'
        )
        
        # Update both coordinates
        service.location_lat = Decimal('40.000000')
        service.location_lng = Decimal('29.000000')
        service.save(update_fields=['location_lat', 'location_lng'])
        
        # Refresh and verify
        service.refresh_from_db()
        self.assertIsNotNone(service.location)
        self.assertAlmostEqual(service.location.x, 29.000000, places=5)
        self.assertAlmostEqual(service.location.y, 40.000000, places=5)
    
    def test_partial_save_single_coord_refreshes_from_db(self):
        """
        Test that partial save with single coord refreshes the other from DB.
        
        This is the race condition test: simulates another process updating
        location_lng while we only update location_lat.
        """
        service = Service.objects.create(
            user=self.user,
            title='Test Service',
            description='A test service',
            type='Offer',
            duration=Decimal('2.00'),
            location_type='In-Person',
            location_lat=Decimal('41.015137'),
            location_lng=Decimal('28.979530'),
            max_participants=1,
            schedule_type='One-Time'
        )
        
        # Simulate another process updating location_lng in the database
        # This bypasses the save() method to simulate a concurrent update
        Service.objects.filter(pk=service.pk).update(
            location_lng=Decimal('30.000000')
        )
        
        # Our in-memory service still has the old location_lng
        self.assertEqual(service.location_lng, Decimal('28.979530'))
        
        # Now update only location_lat using update_fields
        service.location_lat = Decimal('42.000000')
        service.save(update_fields=['location_lat'])
        
        # Refresh from DB and verify location is consistent with BOTH DB values
        service.refresh_from_db()
        
        # location_lat should be our new value
        self.assertEqual(service.location_lat, Decimal('42.000000'))
        
        # location_lng should be the DB value (from "other process")
        self.assertEqual(service.location_lng, Decimal('30.000000'))
        
        # CRITICAL: location PointField should use the FRESH DB values
        # NOT the stale in-memory location_lng (28.979530)
        self.assertIsNotNone(service.location)
        self.assertAlmostEqual(service.location.x, 30.000000, places=5)  # Fresh DB lng
        self.assertAlmostEqual(service.location.y, 42.000000, places=5)  # Our updated lat
    
    def test_partial_save_single_coord_lng_refreshes_lat(self):
        """
        Test that partial save with only lng refreshes lat from DB.
        
        Mirror test for updating only longitude.
        """
        service = Service.objects.create(
            user=self.user,
            title='Test Service',
            description='A test service',
            type='Offer',
            duration=Decimal('2.00'),
            location_type='In-Person',
            location_lat=Decimal('41.015137'),
            location_lng=Decimal('28.979530'),
            max_participants=1,
            schedule_type='One-Time'
        )
        
        # Simulate another process updating location_lat in the database
        Service.objects.filter(pk=service.pk).update(
            location_lat=Decimal('43.000000')
        )
        
        # Our in-memory service still has the old location_lat
        self.assertEqual(service.location_lat, Decimal('41.015137'))
        
        # Now update only location_lng using update_fields
        service.location_lng = Decimal('31.000000')
        service.save(update_fields=['location_lng'])
        
        # Refresh from DB and verify location is consistent with BOTH DB values
        service.refresh_from_db()
        
        # location_lat should be the DB value (from "other process")
        self.assertEqual(service.location_lat, Decimal('43.000000'))
        
        # location_lng should be our new value
        self.assertEqual(service.location_lng, Decimal('31.000000'))
        
        # CRITICAL: location PointField should use the FRESH DB values
        self.assertIsNotNone(service.location)
        self.assertAlmostEqual(service.location.x, 31.000000, places=5)  # Our updated lng
        self.assertAlmostEqual(service.location.y, 43.000000, places=5)  # Fresh DB lat
    
    def test_partial_save_no_coords_does_not_update_location(self):
        """Test that partial save without coords doesn't touch location."""
        service = Service.objects.create(
            user=self.user,
            title='Test Service',
            description='A test service',
            type='Offer',
            duration=Decimal('2.00'),
            location_type='In-Person',
            location_lat=Decimal('41.015137'),
            location_lng=Decimal('28.979530'),
            max_participants=1,
            schedule_type='One-Time'
        )
        
        original_location = service.location
        
        # Update unrelated field
        service.title = 'Updated Title'
        service.save(update_fields=['title'])
        
        # Verify location wasn't touched
        service.refresh_from_db()
        self.assertEqual(service.title, 'Updated Title')
        self.assertEqual(service.location, original_location)
    
    def test_new_object_with_coords_computes_location(self):
        """Test that new objects with coords get location computed."""
        service = Service(
            user=self.user,
            title='New Service',
            description='A new service',
            type='Offer',
            duration=Decimal('2.00'),
            location_type='In-Person',
            location_lat=Decimal('41.000000'),
            location_lng=Decimal('29.000000'),
            max_participants=1,
            schedule_type='One-Time'
        )
        service.save()
        
        self.assertIsNotNone(service.location)
        self.assertAlmostEqual(service.location.x, 29.000000, places=5)
        self.assertAlmostEqual(service.location.y, 41.000000, places=5)
    
    def test_null_coords_results_in_null_location(self):
        """Test that null coordinates result in null location."""
        service = Service.objects.create(
            user=self.user,
            title='Online Service',
            description='An online service',
            type='Offer',
            duration=Decimal('2.00'),
            location_type='Online',
            location_lat=None,
            location_lng=None,
            max_participants=1,
            schedule_type='One-Time'
        )
        
        self.assertIsNone(service.location)
    
    def test_partial_null_coords_results_in_null_location(self):
        """Test that having only one coordinate results in null location."""
        service = Service.objects.create(
            user=self.user,
            title='Partial Service',
            description='A service with partial coords',
            type='Offer',
            duration=Decimal('2.00'),
            location_type='In-Person',
            location_lat=Decimal('41.000000'),
            location_lng=None,
            max_participants=1,
            schedule_type='One-Time'
        )
        
        self.assertIsNone(service.location)
