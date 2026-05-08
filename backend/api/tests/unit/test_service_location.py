"""
Unit tests for Service.save() location field synchronization.

Tests for race condition prevention when using update_fields with location coordinates.
"""
from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model

from api.models import Service

User = get_user_model()


@pytest.fixture
def user(db):
    return User.objects.create_user(
        email='test@test.com',
        password='testpass123',
        first_name='Test',
        last_name='User',
        timebank_balance=Decimal('10.00'),
    )


@pytest.mark.django_db
def test_full_save_computes_location(user):
    service = Service.objects.create(
        user=user,
        title='Test Service',
        description='A test service',
        type='Offer',
        duration=Decimal('2.00'),
        location_type='In-Person',
        location_lat=Decimal('41.015137'),
        location_lng=Decimal('28.979530'),
        max_participants=1,
        schedule_type='One-Time',
    )

    assert service.location is not None
    assert service.location.x == pytest.approx(28.979530, abs=1e-5)
    assert service.location.y == pytest.approx(41.015137, abs=1e-5)


@pytest.mark.django_db
def test_partial_save_with_both_coords_computes_location(user):
    service = Service.objects.create(
        user=user,
        title='Test Service',
        description='A test service',
        type='Offer',
        duration=Decimal('2.00'),
        location_type='In-Person',
        location_lat=Decimal('41.015137'),
        location_lng=Decimal('28.979530'),
        max_participants=1,
        schedule_type='One-Time',
    )

    service.location_lat = Decimal('40.000000')
    service.location_lng = Decimal('29.000000')
    service.save(update_fields=['location_lat', 'location_lng'])

    service.refresh_from_db()
    assert service.location is not None
    assert service.location.x == pytest.approx(29.000000, abs=1e-5)
    assert service.location.y == pytest.approx(40.000000, abs=1e-5)


@pytest.mark.django_db
def test_partial_save_single_coord_refreshes_from_db(user):
    """Race condition test: simulates another process updating location_lng
    while we only update location_lat."""
    service = Service.objects.create(
        user=user,
        title='Test Service',
        description='A test service',
        type='Offer',
        duration=Decimal('2.00'),
        location_type='In-Person',
        location_lat=Decimal('41.015137'),
        location_lng=Decimal('28.979530'),
        max_participants=1,
        schedule_type='One-Time',
    )

    Service.objects.filter(pk=service.pk).update(location_lng=Decimal('30.000000'))

    assert service.location_lng == Decimal('28.979530')

    service.location_lat = Decimal('42.000000')
    service.save(update_fields=['location_lat'])

    service.refresh_from_db()

    assert service.location_lat == Decimal('42.000000')
    assert service.location_lng == Decimal('30.000000')

    assert service.location is not None
    assert service.location.x == pytest.approx(30.000000, abs=1e-5)
    assert service.location.y == pytest.approx(42.000000, abs=1e-5)


@pytest.mark.django_db
def test_partial_save_single_coord_lng_refreshes_lat(user):
    """Mirror test for updating only longitude."""
    service = Service.objects.create(
        user=user,
        title='Test Service',
        description='A test service',
        type='Offer',
        duration=Decimal('2.00'),
        location_type='In-Person',
        location_lat=Decimal('41.015137'),
        location_lng=Decimal('28.979530'),
        max_participants=1,
        schedule_type='One-Time',
    )

    Service.objects.filter(pk=service.pk).update(location_lat=Decimal('43.000000'))

    assert service.location_lat == Decimal('41.015137')

    service.location_lng = Decimal('31.000000')
    service.save(update_fields=['location_lng'])

    service.refresh_from_db()

    assert service.location_lat == Decimal('43.000000')
    assert service.location_lng == Decimal('31.000000')

    assert service.location is not None
    assert service.location.x == pytest.approx(31.000000, abs=1e-5)
    assert service.location.y == pytest.approx(43.000000, abs=1e-5)


@pytest.mark.django_db
def test_partial_save_no_coords_does_not_update_location(user):
    service = Service.objects.create(
        user=user,
        title='Test Service',
        description='A test service',
        type='Offer',
        duration=Decimal('2.00'),
        location_type='In-Person',
        location_lat=Decimal('41.015137'),
        location_lng=Decimal('28.979530'),
        max_participants=1,
        schedule_type='One-Time',
    )

    original_location = service.location

    service.title = 'Updated Title'
    service.save(update_fields=['title'])

    service.refresh_from_db()
    assert service.title == 'Updated Title'
    assert service.location == original_location


@pytest.mark.django_db
def test_new_object_with_coords_computes_location(user):
    service = Service(
        user=user,
        title='New Service',
        description='A new service',
        type='Offer',
        duration=Decimal('2.00'),
        location_type='In-Person',
        location_lat=Decimal('41.000000'),
        location_lng=Decimal('29.000000'),
        max_participants=1,
        schedule_type='One-Time',
    )
    service.save()

    assert service.location is not None
    assert service.location.x == pytest.approx(29.000000, abs=1e-5)
    assert service.location.y == pytest.approx(41.000000, abs=1e-5)


@pytest.mark.django_db
def test_null_coords_results_in_null_location(user):
    service = Service.objects.create(
        user=user,
        title='Online Service',
        description='An online service',
        type='Offer',
        duration=Decimal('2.00'),
        location_type='Online',
        location_lat=None,
        location_lng=None,
        max_participants=1,
        schedule_type='One-Time',
    )

    assert service.location is None


@pytest.mark.django_db
def test_partial_null_coords_results_in_null_location(user):
    service = Service.objects.create(
        user=user,
        title='Partial Service',
        description='A service with partial coords',
        type='Offer',
        duration=Decimal('2.00'),
        location_type='In-Person',
        location_lat=Decimal('41.000000'),
        location_lng=None,
        max_participants=1,
        schedule_type='One-Time',
    )

    assert service.location is None
