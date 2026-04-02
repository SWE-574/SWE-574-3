from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion
import uuid


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0050_merge_20260308_1218'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='UserFollow',
            fields=[
                ('id', models.UUIDField(
                    default=uuid.uuid4, editable=False, primary_key=True, serialize=False,
                )),
                ('follower', models.ForeignKey(
                    help_text='User who follows',
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='follows',
                    to=settings.AUTH_USER_MODEL,
                )),
                ('following', models.ForeignKey(
                    help_text='User being followed',
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='followed_by',
                    to=settings.AUTH_USER_MODEL,
                )),
                ('created_at', models.DateTimeField(auto_now_add=True)),
            ],
            options={
                'constraints': [
                    models.UniqueConstraint(
                        fields=['follower', 'following'],
                        name='api_userfollow_follower_following_uniq',
                    ),
                    models.CheckConstraint(
                        condition=~models.Q(follower=models.F('following')),
                        name='api_userfollow_no_self_follow',
                    ),
                ],
            },
        ),
        migrations.CreateModel(
            name='UserFollowEvent',
            fields=[
                ('id', models.UUIDField(
                    default=uuid.uuid4, editable=False, primary_key=True, serialize=False,
                )),
                ('follower', models.ForeignKey(
                    help_text='User who performed the action',
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='follow_events_as_follower',
                    to=settings.AUTH_USER_MODEL,
                )),
                ('following', models.ForeignKey(
                    help_text='User who was followed or unfollowed',
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='follow_events_as_target',
                    to=settings.AUTH_USER_MODEL,
                )),
                ('action', models.CharField(
                    choices=[('follow', 'Follow'), ('unfollow', 'Unfollow')],
                    max_length=16,
                )),
                ('created_at', models.DateTimeField(auto_now_add=True)),
            ],
            options={
                'ordering': ['-created_at'],
                'constraints': [
                    models.CheckConstraint(
                        condition=~models.Q(follower=models.F('following')),
                        name='api_userfollowevent_no_self_action',
                    ),
                ],
            },
        ),
        migrations.AddIndex(
            model_name='userfollow',
            index=models.Index(fields=['follower'], name='api_userfollow_follower_id_idx'),
        ),
        migrations.AddIndex(
            model_name='userfollow',
            index=models.Index(fields=['following'], name='api_userfollow_following_id_idx'),
        ),
    ]
