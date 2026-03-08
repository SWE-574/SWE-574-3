# Generated migration for adding UNIQUE constraint to ReputationRep model

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0011_add_check_constraints'),
    ]

    operations = [
        migrations.AddConstraint(
            model_name='reputationrep',
            constraint=models.UniqueConstraint(
                fields=['handshake', 'giver'],
                name='unique_reputation_per_handshake_giver',
            ),
        ),
    ]
