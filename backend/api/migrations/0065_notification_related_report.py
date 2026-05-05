# Generated for PR 467 review — deep-link admin and reporter notifications to the report itself

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0064_add_report_notification_types'),
    ]

    operations = [
        migrations.AddField(
            model_name='notification',
            name='related_report',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=models.deletion.CASCADE,
                related_name='notifications',
                to='api.report',
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
                    ('new_report', 'New Report'),
                    ('report_received', 'Report Received'),
                    ('report_resolved', 'Report Resolved'),
                    ('report_dismissed', 'Report Dismissed'),
                ],
                max_length=50,
            ),
        ),
        migrations.AddIndex(
            model_name='notification',
            index=models.Index(fields=['related_report'], name='api_notific_related_8e5c5e_idx'),
        ),
    ]
