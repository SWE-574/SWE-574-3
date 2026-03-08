from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0033_add_user_event_hot_score'),
    ]

    operations = [
        migrations.AddField(
            model_name='service',
            name='event_completed_at',
            field=models.DateTimeField(blank=True, db_index=True, help_text='Timestamp when organizer marked an event as completed', null=True),
        ),
    ]
