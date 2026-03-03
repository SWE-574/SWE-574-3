"""
Migration: Add Event System Fields

Schema changes:
- User: +is_event_banned_until, +is_organizer_banned_until, +no_show_count
- Service: +scheduled_time, choices update for type
- Handshake: status max_length 10→15, choices update,
             drop provisioned_hours_positive / add provisioned_hours_non_negative
"""
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0029_add_service_group_chat_message'),
    ]

    operations = [
        # ----------------------------------------------------------------
        # User: event ban / no-show tracking fields
        # ----------------------------------------------------------------
        migrations.AddField(
            model_name='user',
            name='is_event_banned_until',
            field=models.DateTimeField(
                blank=True,
                null=True,
                help_text='User cannot join events until this time (set after 3 no-shows)',
            ),
        ),
        migrations.AddField(
            model_name='user',
            name='is_organizer_banned_until',
            field=models.DateTimeField(
                blank=True,
                null=True,
                help_text=(
                    'User cannot create events until this time '
                    '(set after late cancellation with participants)'
                ),
            ),
        ),
        migrations.AddField(
            model_name='user',
            name='no_show_count',
            field=models.IntegerField(
                default=0,
                help_text='Cumulative number of event no-shows',
            ),
        ),

        # ----------------------------------------------------------------
        # Service: scheduled_time + TYPE_CHOICES metadata update
        # ----------------------------------------------------------------
        migrations.AddField(
            model_name='service',
            name='scheduled_time',
            field=models.DateTimeField(
                blank=True,
                null=True,
                db_index=True,
                help_text='Event start time (required for Events)',
            ),
        ),
        migrations.AlterField(
            model_name='service',
            name='type',
            field=models.CharField(
                choices=[
                    ('Offer', 'Offer'),
                    ('Need', 'Need'),
                    ('Event', 'Event'),
                ],
                max_length=10,
            ),
        ),

        # ----------------------------------------------------------------
        # Handshake: status max_length + choices + constraint swap
        # ----------------------------------------------------------------
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
                    ('no_show', 'No Show'),
                ],
                default='pending',
                max_length=15,
            ),
        ),
        migrations.RemoveConstraint(
            model_name='handshake',
            name='handshake_provisioned_hours_positive',
        ),
        migrations.AddConstraint(
            model_name='handshake',
            constraint=models.CheckConstraint(
                # >=0: Event handshakes are credit-free (provisioned_hours=0).
                # Offer/Need handshakes structurally cannot reach 0 because
                # service.duration has its own >0 constraint.
                condition=models.Q(provisioned_hours__gte=0),
                name='handshake_provisioned_hours_non_negative',
            ),
        ),
    ]
