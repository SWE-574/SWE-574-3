# Generated migration for adding CHECK constraints to Service and Handshake models

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0010_alter_userbadge_id_and_more'),
    ]

    operations = [
        migrations.AddConstraint(
            model_name='service',
            constraint=models.CheckConstraint(
                check=models.Q(duration__gt=0),
                name='service_duration_positive',
            ),
        ),
        migrations.AddConstraint(
            model_name='service',
            constraint=models.CheckConstraint(
                check=models.Q(max_participants__gt=0),
                name='service_max_participants_positive',
            ),
        ),
        migrations.AddConstraint(
            model_name='handshake',
            constraint=models.CheckConstraint(
                check=models.Q(provisioned_hours__gt=0),
                name='handshake_provisioned_hours_positive',
            ),
        ),
    ]
