"""Add the user_followed Notification type so the followed user gets a
real-time notification when a new follow edge is created."""
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0067_activity_event_extra_verbs'),
    ]

    operations = [
        migrations.AlterField(
            model_name='notification',
            name='type',
            field=models.CharField(
                max_length=50,
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
                    ('user_followed', 'New Follower'),
                ],
            ),
        ),
    ]
