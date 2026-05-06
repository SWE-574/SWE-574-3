from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0066_for_you_models'),
    ]

    operations = [
        migrations.AddField(
            model_name='foryoudailymetric',
            name='unique_viewers',
            field=models.PositiveIntegerField(default=0),
        ),
    ]
