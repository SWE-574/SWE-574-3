from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0042_notification_type_choices'),
    ]

    operations = [
        migrations.AddField(
            model_name='service',
            name='is_pinned',
            field=models.BooleanField(default=False, help_text='Admin can pin events to the top of the feed'),
        ),
    ]
