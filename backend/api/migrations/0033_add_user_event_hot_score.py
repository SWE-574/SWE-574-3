from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0032_event_evaluation_summary'),
    ]

    operations = [
        migrations.AddField(
            model_name='user',
            name='event_hot_score',
            field=models.FloatField(default=0.0, help_text='Organizer-level hot score based only on event evaluations from verified attendees'),
        ),
    ]
