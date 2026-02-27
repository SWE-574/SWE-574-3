# Generated manually for PostGIS PointField addition

import django.contrib.gis.db.models.fields
from django.db import migrations


def populate_location_from_latlng(apps, schema_editor):
    """
    Data migration to populate the location PointField from existing lat/lng values.
    This runs after the field is added to ensure existing services have proper location data.
    """
    from django.contrib.gis.geos import Point
    
    Service = apps.get_model('api', 'Service')
    
    # Get all services with lat/lng but no location
    services_to_update = Service.objects.filter(
        location_lat__isnull=False,
        location_lng__isnull=False,
    )
    
    updated_count = 0
    for service in services_to_update:
        try:
            # Create Point with lng, lat order (GeoJSON/PostGIS standard)
            service.location = Point(
                float(service.location_lng),
                float(service.location_lat),
                srid=4326
            )
            service.save(update_fields=['location'])
            updated_count += 1
        except (ValueError, TypeError) as e:
            # Skip services with invalid coordinates
            print(f"Skipping service {service.id}: invalid coordinates - {e}")
    
    print(f"Updated {updated_count} services with location data")


def reverse_populate_location(apps, schema_editor):
    """
    Reverse migration - clear location field.
    The lat/lng fields are preserved so no data is lost.
    """
    Service = apps.get_model('api', 'Service')
    Service.objects.update(location=None)


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0014_change_url_fields_to_text'),
    ]

    operations = [
        # Add the PointField to Service model
        migrations.AddField(
            model_name='service',
            name='location',
            field=django.contrib.gis.db.models.fields.PointField(
                blank=True,
                geography=True,
                help_text='PostGIS point for geospatial queries',
                null=True,
                srid=4326
            ),
        ),
        # Populate location from existing lat/lng values
        migrations.RunPython(
            populate_location_from_latlng,
            reverse_populate_location
        ),
    ]

