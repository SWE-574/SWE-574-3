from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


TRIGGER_FUNCTION_SQL = """
CREATE OR REPLACE FUNCTION api_adminauditlog_immutable()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION
        'AdminAuditLog records are immutable: % on row % is not permitted.',
        TG_OP, OLD.id
        USING ERRCODE = 'restrict_violation';
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;
"""

TRIGGER_SQL = """
CREATE TRIGGER audit_log_immutability_trigger
BEFORE UPDATE OR DELETE ON api_adminauditlog
FOR EACH ROW EXECUTE FUNCTION api_adminauditlog_immutable();
"""

DROP_TRIGGER_SQL = "DROP TRIGGER IF EXISTS audit_log_immutability_trigger ON api_adminauditlog;"
DROP_FUNCTION_SQL = "DROP FUNCTION IF EXISTS api_adminauditlog_immutable();"


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0053_merge_20260401_0938'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        # Change on_delete from CASCADE to PROTECT so that deleting an admin
        # User is blocked while any audit record references them.
        migrations.AlterField(
            model_name='adminauditlog',
            name='admin',
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.PROTECT,
                related_name='admin_audit_logs',
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        # Install the PostgreSQL immutability trigger.
        # state_operations=[] tells Django's migration state that this
        # operation produces no model-state changes.
        migrations.RunSQL(
            sql=[TRIGGER_FUNCTION_SQL, TRIGGER_SQL],
            reverse_sql=[DROP_TRIGGER_SQL, DROP_FUNCTION_SQL],
            state_operations=[],
        ),
    ]
