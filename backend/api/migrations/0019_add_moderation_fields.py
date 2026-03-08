# Generated migration for moderation fields

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0018_add_profile_media_fields'),
    ]

    operations = [
        migrations.AddField(
            model_name='service',
            name='is_visible',
            field=models.BooleanField(
                default=True,
                help_text='Admin can hide inappropriate services'
            ),
        ),
        migrations.AlterField(
            model_name='handshake',
            name='status',
            field=models.CharField(
                choices=[
                    ('pending', 'Pending'),
                    ('accepted', 'Accepted'),
                    ('denied', 'Denied'),
                    ('cancelled', 'Cancelled'),
                    ('completed', 'Completed'),
                    ('reported', 'Reported'),
                    ('paused', 'Paused'),
                ],
                default='pending',
                max_length=10
            ),
        ),
    ]
