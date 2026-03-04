from django.db import migrations, models
import django.db.models.deletion
import uuid


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0031_add_attended_handshake_status'),
    ]

    operations = [
        migrations.CreateModel(
            name='EventEvaluationSummary',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('total_attended', models.IntegerField(default=0)),
                ('positive_feedback_count', models.IntegerField(default=0)),
                ('negative_feedback_count', models.IntegerField(default=0)),
                ('unique_evaluator_count', models.IntegerField(default=0)),
                ('punctual_count', models.IntegerField(default=0)),
                ('helpful_count', models.IntegerField(default=0)),
                ('kind_count', models.IntegerField(default=0)),
                ('late_count', models.IntegerField(default=0)),
                ('unhelpful_count', models.IntegerField(default=0)),
                ('rude_count', models.IntegerField(default=0)),
                ('positive_score_total', models.IntegerField(default=0, help_text='Sum of positive trait ticks across all positive evaluations')),
                ('negative_score_total', models.IntegerField(default=0, help_text='Sum of negative trait ticks across all negative evaluations')),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('service', models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name='event_evaluation_summary', to='api.service')),
            ],
        ),
        migrations.AddIndex(
            model_name='eventevaluationsummary',
            index=models.Index(fields=['service'], name='api_eventev_service_935f7d_idx'),
        ),
        migrations.AddIndex(
            model_name='eventevaluationsummary',
            index=models.Index(fields=['updated_at'], name='api_eventev_updated_8297a4_idx'),
        ),
    ]
