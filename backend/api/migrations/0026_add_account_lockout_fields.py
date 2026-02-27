# Migration to add account lockout fields

from django.db import migrations, models
from django.utils import timezone


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0025_fix_timebank_default_balance'),
    ]

    operations = [
        migrations.AddField(
            model_name='user',
            name='failed_login_attempts',
            field=models.IntegerField(default=0, help_text='Number of consecutive failed login attempts'),
        ),
        migrations.AddField(
            model_name='user',
            name='locked_until',
            field=models.DateTimeField(blank=True, null=True, help_text='Account locked until this time (null if not locked)'),
        ),
    ]
