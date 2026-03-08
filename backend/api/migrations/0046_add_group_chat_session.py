# Generated manually for recurrent group chat sessions

from django.db import migrations, models
import django.db.models.deletion
import uuid


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0045_handshake_cancellation_request'),
    ]

    operations = [
        migrations.CreateModel(
            name='GroupChatSession',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('scheduled_time', models.DateTimeField(db_index=True, help_text='Scheduled time for this occurrence; identifies the session with the service.')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('service', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='group_chat_sessions', to='api.service')),
            ],
            options={
                'ordering': ['scheduled_time'],
            },
        ),
        migrations.AddConstraint(
            model_name='groupchatsession',
            constraint=models.UniqueConstraint(fields=('service', 'scheduled_time'), name='api_groupchatsession_service_scheduled_uniq'),
        ),
        migrations.AddIndex(
            model_name='groupchatsession',
            index=models.Index(fields=['service', 'scheduled_time'], name='api_gcs_service_scheduled_idx'),
        ),
        migrations.AddField(
            model_name='servicegroupchatmessage',
            name='group_chat_session',
            field=models.ForeignKey(
                blank=True,
                help_text='When set (recurrent offers), message belongs to this session thread; when null, legacy service-level thread (One-Time/Event).',
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name='messages',
                to='api.groupchatsession',
            ),
        ),
        migrations.AddIndex(
            model_name='servicegroupchatmessage',
            index=models.Index(fields=['group_chat_session', 'created_at'], name='api_sgcm_session_created_idx'),
        ),
    ]
