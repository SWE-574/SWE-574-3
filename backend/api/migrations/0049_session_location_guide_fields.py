from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0048_service_session_exact_location_coords'),
    ]

    operations = [
        migrations.AddField(
            model_name='handshake',
            name='exact_location_guide',
            field=models.CharField(
                blank=True,
                help_text='Optional landmark or building note shared alongside the exact session location',
                max_length=255,
                null=True,
            ),
        ),
        migrations.AddField(
            model_name='service',
            name='session_location_guide',
            field=models.CharField(
                blank=True,
                help_text='Optional landmark or building note shared alongside fixed group-offer session details',
                max_length=255,
                null=True,
            ),
        ),
    ]
