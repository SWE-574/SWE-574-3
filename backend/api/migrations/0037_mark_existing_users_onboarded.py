from django.db import migrations


def mark_existing_users_onboarded(apps, schema_editor):
    """Mark all existing users as onboarded and verified so demo/existing users aren't stuck."""
    User = apps.get_model('api', 'User')
    User.objects.all().update(is_onboarded=True, is_verified=True)


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0036_add_auth_fields'),
    ]

    operations = [
        migrations.RunPython(
            mark_existing_users_onboarded,
            reverse_code=migrations.RunPython.noop,
        ),
    ]
