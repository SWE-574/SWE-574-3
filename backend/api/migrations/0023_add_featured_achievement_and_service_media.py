# Generated migration for featured_achievement_id and ServiceMedia model

from django.db import migrations, models
import django.db.models.deletion
import uuid


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0022_add_forum_models'),
    ]

    operations = [
        migrations.AddField(
            model_name='user',
            name='featured_achievement_id',
            field=models.CharField(blank=True, help_text='Featured achievement badge ID to display on profile', max_length=200, null=True),
        ),
        migrations.CreateModel(
            name='ServiceMedia',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('media_type', models.CharField(choices=[('image', 'Image'), ('video', 'Video')], default='image', max_length=10)),
                ('file_url', models.TextField(blank=True, help_text='URL to the media file (data URL or external URL)', null=True)),
                ('file', models.FileField(blank=True, help_text='Uploaded media file', null=True, upload_to='service_media/')),
                ('display_order', models.IntegerField(default=0, help_text='Order for displaying media (lower numbers first)')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('service', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='media', to='api.service')),
            ],
            options={
                'ordering': ['display_order', 'created_at'],
            },
        ),
        migrations.AddIndex(
            model_name='servicemedia',
            index=models.Index(fields=['service', 'display_order'], name='api_servic_service_display_idx'),
        ),
        migrations.AddIndex(
            model_name='servicemedia',
            index=models.Index(fields=['service', 'media_type'], name='api_servic_service_media_t_idx'),
        ),
    ]




