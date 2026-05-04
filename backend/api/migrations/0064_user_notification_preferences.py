# Generated for #370 — notification preferences UI + persistence

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0063_service_requires_qr_checkin_eventqrtoken'),
    ]

    operations = [
        migrations.AddField(
            model_name='user',
            name='notification_preferences',
            field=models.JSONField(
                blank=True,
                default=dict,
                help_text='Per-category notification opt-outs; {"push": false} disables all push notifications.',
            ),
        ),
    ]
