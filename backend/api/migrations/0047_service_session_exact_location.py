from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0046_handshake_exact_location_maps_url'),
    ]

    operations = [
        migrations.AddField(
            model_name='service',
            name='session_exact_location',
            field=models.CharField(
                blank=True,
                help_text='Exact address shown in session details for approved fixed group offers',
                max_length=255,
                null=True,
            ),
        ),
    ]
