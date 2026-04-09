"""
Replace CASCADE deletion on forum author FK with SET_NULL so that deleting a user
preserves historical forum topics and posts with a null author reference, satisfying
FR-04g (legacy content traceability via placeholder identity).
"""
import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0052_user_follow_event'),
    ]

    operations = [
        migrations.AlterField(
            model_name='forumtopic',
            name='author',
            field=models.ForeignKey(
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='forum_topics',
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.AlterField(
            model_name='forumpost',
            name='author',
            field=models.ForeignKey(
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='forum_posts',
                to=settings.AUTH_USER_MODEL,
            ),
        ),
    ]
