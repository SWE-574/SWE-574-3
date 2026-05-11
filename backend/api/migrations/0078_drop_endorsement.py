"""Remove the Endorsement feature.

Drops the Endorsement table along with the dangling SERVICE_ENDORSED
ActivityEvent.verb choice that was added in 0067 but never had a producer
wired. No live data depends on either: ranking, badges, achievements, and
notifications never integrated with endorsements.
"""
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0077_notification_add_related_user'),
    ]

    operations = [
        migrations.RemoveConstraint(
            model_name='endorsement',
            name='endorsement_unique',
        ),
        migrations.DeleteModel(
            name='Endorsement',
        ),
        migrations.AlterField(
            model_name='activityevent',
            name='verb',
            field=models.CharField(
                choices=[
                    ('service_created', 'service_created'),
                    ('handshake_accepted', 'handshake_accepted'),
                    ('handshake_completed', 'handshake_completed'),
                    ('user_followed', 'user_followed'),
                    ('event_filling_up', 'event_filling_up'),
                    ('new_neighbor', 'new_neighbor'),
                ],
                max_length=32,
            ),
        ),
    ]
