from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0063_service_requires_qr_checkin_eventqrtoken'),
    ]

    operations = [
        migrations.AddField(
            model_name='user',
            name='featured_badges',
            field=models.JSONField(default=list, blank=True),
        ),
    ]
