"""Recurrence becomes Event-only.

Adds Service.recurrence_interval_days for Events that should auto-repost
when completed. Migrates any existing Offer/Need rows whose
schedule_type='Recurrent' down to 'One-Time' so the data layer matches
the new product rule (Offers and Needs are not recurring).
"""
from django.db import migrations, models


def force_offer_need_to_one_time(apps, schema_editor):
    Service = apps.get_model('api', 'Service')
    Service.objects.filter(
        type__in=('Offer', 'Need'),
        schedule_type='Recurrent',
    ).update(schedule_type='One-Time')


def noop_reverse(apps, schema_editor):
    # No reliable reverse: we cannot tell which One-Time rows used to be
    # Recurrent. The forward migration is intentionally lossy.
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0078_drop_endorsement'),
    ]

    operations = [
        migrations.AddField(
            model_name='service',
            name='recurrence_interval_days',
            field=models.PositiveSmallIntegerField(
                blank=True,
                null=True,
                help_text=(
                    'For recurring Events only. When the organizer marks a '
                    'recurring Event as completed, a fresh copy is '
                    'auto-created with scheduled_time shifted forward by '
                    'this many days.'
                ),
            ),
        ),
        migrations.RunPython(force_offer_need_to_one_time, noop_reverse),
    ]
