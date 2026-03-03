from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion
import uuid


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0028_add_agreed_service_status'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='ServiceGroupChatMessage',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('body', models.TextField()),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('sender', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='group_chat_messages',
                    to=settings.AUTH_USER_MODEL,
                )),
                ('service', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='group_chat_messages',
                    to='api.service',
                )),
            ],
            options={
                'ordering': ['created_at'],
            },
        ),
        migrations.AddIndex(
            model_name='servicegroupchatmessage',
            index=models.Index(fields=['service', 'created_at'], name='api_sgcm_service_created_idx'),
        ),
        migrations.AddIndex(
            model_name='servicegroupchatmessage',
            index=models.Index(fields=['sender'], name='api_sgcm_sender_idx'),
        ),
    ]
