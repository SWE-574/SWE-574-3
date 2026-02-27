# Generated migration for profile media fields

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0017_add_comments_ranking_negative_rep'),
    ]

    operations = [
        migrations.AddField(
            model_name='user',
            name='video_intro_url',
            field=models.TextField(
                blank=True,
                null=True,
                help_text='External video URL (YouTube, Vimeo, etc.)'
            ),
        ),
        migrations.AddField(
            model_name='user',
            name='video_intro_file',
            field=models.FileField(
                upload_to='videos/intros/',
                blank=True,
                null=True,
                help_text='Uploaded video intro file'
            ),
        ),
        migrations.AddField(
            model_name='user',
            name='portfolio_images',
            field=models.JSONField(
                default=list,
                blank=True,
                help_text='Array of portfolio image URLs/paths (max 5)'
            ),
        ),
        migrations.AddField(
            model_name='user',
            name='show_history',
            field=models.BooleanField(
                default=True,
                help_text='Whether to show transaction history publicly'
            ),
        ),
    ]
