import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):
    """Change related_report FK on Notification from CASCADE to SET_NULL.

    The field was added in 0065_notification_related_report with CASCADE.
    Deleting a report should not cascade-delete notification history.
    """

    dependencies = [
        ('api', '0068_rename_api_notific_related_8e5c5e_idx_api_notific_related_1e59c8_idx'),
    ]

    operations = [
        migrations.AlterField(
            model_name='notification',
            name='related_report',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='notifications',
                to='api.report',
            ),
        ),
    ]
