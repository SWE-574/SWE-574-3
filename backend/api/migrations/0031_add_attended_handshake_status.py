from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0030_add_event_system_fields'),
    ]

    operations = [
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
                    ('checked_in', 'Checked In'),
                    ('attended', 'Attended'),
                    ('no_show', 'No Show'),
                ],
                default='pending',
                max_length=15,
            ),
        ),
    ]
