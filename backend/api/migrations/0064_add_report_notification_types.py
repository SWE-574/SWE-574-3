# Generated for #455 — close the loop on user reports

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0063_service_requires_qr_checkin_eventqrtoken'),
    ]

    operations = [
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
                    ('report_received', 'Report Received'),
                    ('report_resolved', 'Report Resolved'),
                    ('report_dismissed', 'Report Dismissed'),
                ],
                max_length=50,
            ),
        ),
    ]
