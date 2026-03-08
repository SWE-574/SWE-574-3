from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0047_service_session_exact_location'),
    ]

    operations = [
        migrations.AddField(
            model_name='service',
            name='session_exact_location_lat',
            field=models.DecimalField(
                blank=True,
                decimal_places=6,
                help_text='Latitude for the exact session address used by approved fixed group offers',
                max_digits=9,
                null=True,
            ),
        ),
        migrations.AddField(
            model_name='service',
            name='session_exact_location_lng',
            field=models.DecimalField(
                blank=True,
                decimal_places=6,
                help_text='Longitude for the exact session address used by approved fixed group offers',
                max_digits=9,
                null=True,
            ),
        ),
    ]
