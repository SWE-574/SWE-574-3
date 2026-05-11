"""Optimistic-lock counter on Service (NFR-05d).

`version` starts at 0 for every existing row and is bumped atomically
inside ServiceViewSet.partial_update on every successful write. A PATCH
that arrives with a stale version is rejected with 409 instead of
silently overwriting a concurrent owner edit.
"""
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0079_event_recurrence'),
    ]

    operations = [
        migrations.AddField(
            model_name='service',
            name='version',
            field=models.PositiveIntegerField(
                default=0,
                help_text=(
                    'Optimistic-lock counter (NFR-05d). Incremented atomically '
                    'inside ServiceViewSet.partial_update on every successful '
                    'PATCH. Clients echo the value they read on GET back in '
                    'the PATCH body; a mismatch returns 409 instead of '
                    'silently overwriting a concurrent edit.'
                ),
            ),
        ),
    ]
