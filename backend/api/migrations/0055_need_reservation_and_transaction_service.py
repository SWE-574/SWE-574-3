from decimal import Decimal

from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0054_merge_20260406_1113'),
    ]

    operations = [
        migrations.AddField(
            model_name='service',
            name='reserved_timebank_hours',
            field=models.DecimalField(
                decimal_places=2,
                default=Decimal('0.00'),
                help_text='Hours reserved up front for active Need services before completion or cancellation.',
                max_digits=5,
            ),
        ),
        migrations.AddField(
            model_name='transactionhistory',
            name='service',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='transactions',
                to='api.service',
            ),
        ),
        migrations.AddIndex(
            model_name='transactionhistory',
            index=models.Index(fields=['service'], name='api_transac_service_0cfa9c_idx'),
        ),
    ]
