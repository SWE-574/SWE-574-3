"""Soft-delete support for ForumTopic.

Adds `is_deleted` and `deleted_at` so that topic removal preserves any
Report rows referencing the topic (Report.reported_forum_topic uses
on_delete=CASCADE). Hard-deleting a topic previously wiped its entire
moderation history; the soft-delete flag keeps reports intact while
hiding the topic from public listings.

Mirrors the existing ForumPost.is_deleted pattern.
"""
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0079_event_recurrence'),
    ]

    operations = [
        migrations.AddField(
            model_name='forumtopic',
            name='is_deleted',
            field=models.BooleanField(
                default=False,
                help_text=(
                    'Soft delete flag. Hides topic from public views while '
                    'preserving moderation history (reports).'
                ),
            ),
        ),
        migrations.AddField(
            model_name='forumtopic',
            name='deleted_at',
            field=models.DateTimeField(
                null=True,
                blank=True,
                help_text='When the topic was soft-deleted',
            ),
        ),
        migrations.AddIndex(
            model_name='forumtopic',
            index=models.Index(
                fields=['category', 'is_deleted', '-created_at'],
                name='api_forumto_categor_be09f6_idx',
            ),
        ),
    ]
