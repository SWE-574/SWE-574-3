from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0052_user_follow_event'),
    ]

    operations = [
        migrations.AddIndex(
            model_name='userfollow',
            index=models.Index(fields=['follower'], name='api_userfollow_follower_idx'),
        ),
        migrations.AddIndex(
            model_name='userfollow',
            index=models.Index(fields=['following'], name='api_userfollow_following_idx'),
        ),
    ]
