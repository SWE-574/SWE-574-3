from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0038_add_service_list_index'),
    ]

    operations = [
        migrations.AddField(
            model_name='handshake',
            name='evaluation_window_starts_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='handshake',
            name='evaluation_window_ends_at',
            field=models.DateTimeField(blank=True, db_index=True, null=True),
        ),
        migrations.AddField(
            model_name='handshake',
            name='evaluation_window_closed_at',
            field=models.DateTimeField(blank=True, db_index=True, null=True),
        ),
    ]
