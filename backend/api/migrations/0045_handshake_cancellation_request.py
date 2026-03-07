from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0044_merge_20260307_1309'),
    ]

    operations = [
        migrations.AddField(
            model_name='handshake',
            name='cancellation_reason',
            field=models.TextField(blank=True, default=''),
        ),
        migrations.AddField(
            model_name='handshake',
            name='cancellation_requested_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='handshake',
            name='cancellation_requested_by',
            field=models.ForeignKey(
                blank=True,
                help_text='Which participant requested cancellation of an accepted handshake.',
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='requested_handshake_cancellations',
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.AlterField(
            model_name='notification',
            name='type',
            field=models.CharField(
                choices=[
                    ('handshake_request', 'Handshake Request'),
                    ('handshake_accepted', 'Handshake Accepted'),
                    ('handshake_denied', 'Handshake Denied'),
                    ('handshake_cancellation_requested', 'Handshake Cancellation Requested'),
                    ('handshake_cancellation_rejected', 'Handshake Cancellation Rejected'),
                    ('handshake_cancelled', 'Handshake Cancelled'),
                    ('service_updated', 'Service Updated'),
                    ('chat_message', 'Chat Message'),
                    ('service_reminder', 'Service Reminder'),
                    ('service_confirmation', 'Service Confirmation'),
                    ('positive_rep', 'Positive Reputation'),
                    ('admin_warning', 'Admin Warning'),
                    ('dispute_resolved', 'Dispute Resolved'),
                ],
                max_length=50,
            ),
        ),
    ]
