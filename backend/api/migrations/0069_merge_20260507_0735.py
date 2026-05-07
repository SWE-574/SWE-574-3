from django.db import migrations


class Migration(migrations.Migration):
    """Merge migration: ties the index-rename (0068) into the main graph.

    related_report FK on Notification keeps CASCADE (matches models.py);
    no schema change is needed here.
    """

    dependencies = [
        ('api', '0068_rename_api_notific_related_8e5c5e_idx_api_notific_related_1e59c8_idx'),
    ]

    operations = []
