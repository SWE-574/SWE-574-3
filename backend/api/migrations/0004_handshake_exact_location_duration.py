# Generated migration for handshake exact location and duration
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0003_service_location_area'),
    ]

    operations = [
        migrations.AddField(
            model_name='handshake',
            name='exact_location',
            field=models.CharField(blank=True, max_length=255, null=True, help_text='Exact location agreed upon by both parties'),
        ),
        migrations.AddField(
            model_name='handshake',
            name='exact_duration',
            field=models.DecimalField(blank=True, decimal_places=2, max_digits=5, null=True, help_text='Exact duration agreed upon by both parties'),
        ),
        migrations.AddField(
            model_name='handshake',
            name='scheduled_time',
            field=models.DateTimeField(blank=True, null=True, help_text='Scheduled time for the service'),
        ),
        migrations.AddField(
            model_name='handshake',
            name='provider_initiated',
            field=models.BooleanField(default=False, help_text='Whether provider has initiated the handshake'),
        ),
        migrations.AddField(
            model_name='handshake',
            name='requester_initiated',
            field=models.BooleanField(default=False, help_text='Whether requester has initiated the handshake'),
        ),
    ]

