from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0058_merge_20260410_0100'),
    ]

    operations = [
        migrations.CreateModel(
            name='PlatformSetting',
            fields=[
                ('id', models.PositiveSmallIntegerField(default=1, editable=False, primary_key=True, serialize=False)),
                ('ranking_debug_enabled', models.BooleanField(default=False, help_text='Whether the dashboard ranking debug panel is globally available.')),
                ('updated_at', models.DateTimeField(auto_now=True)),
            ],
        ),
    ]
