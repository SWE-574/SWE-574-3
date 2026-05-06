"""Extend ActivityEvent.verb with the four new verbs introduced in the
activity-feed redesign: handshake_completed, service_endorsed,
event_filling_up, new_neighbor.

No data migration: existing handshakes already in `completed` status do
NOT get retroactive events. Live transitions from this point forward will
emit normally.
"""
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0066_activity_event'),
    ]

    operations = [
        migrations.AlterField(
            model_name='activityevent',
            name='verb',
            field=models.CharField(
                choices=[
                    ('service_created', 'service_created'),
                    ('handshake_accepted', 'handshake_accepted'),
                    ('handshake_completed', 'handshake_completed'),
                    ('user_followed', 'user_followed'),
                    ('service_endorsed', 'service_endorsed'),
                    ('event_filling_up', 'event_filling_up'),
                    ('new_neighbor', 'new_neighbor'),
                ],
                max_length=32,
            ),
        ),
    ]
