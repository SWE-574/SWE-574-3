from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0045_handshake_cancellation_request'),
    ]

    operations = [
        migrations.AddField(
            model_name='handshake',
            name='exact_location_maps_url',
            field=models.URLField(
                blank=True,
                max_length=512,
                null=True,
                help_text='Google Maps URL for the exact location (built from coordinates or address when session details are set).',
            ),
        ),
    ]
