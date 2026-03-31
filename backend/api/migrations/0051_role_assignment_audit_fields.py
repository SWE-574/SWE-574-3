"""
Migration: expand User.role choices, add assign_role audit action, and add
role-change tracking fields (previous_role, new_role, ip_address) to AdminAuditLog.
"""

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0050_merge_20260308_1218'),
    ]

    operations = [
        # ── User.role: add moderator + super_admin choices ──────────────────
        migrations.AlterField(
            model_name='user',
            name='role',
            field=models.CharField(
                choices=[
                    ('member', 'Member'),
                    ('moderator', 'Moderator'),
                    ('admin', 'Admin'),
                    ('super_admin', 'Super Admin'),
                ],
                default='member',
                max_length=20,
            ),
        ),

        # ── AdminAuditLog: add role-assignment audit columns ─────────────────
        migrations.AddField(
            model_name='adminauditlog',
            name='previous_role',
            field=models.CharField(blank=True, max_length=20, null=True),
        ),
        migrations.AddField(
            model_name='adminauditlog',
            name='new_role',
            field=models.CharField(blank=True, max_length=20, null=True),
        ),
        migrations.AddField(
            model_name='adminauditlog',
            name='ip_address',
            field=models.GenericIPAddressField(blank=True, null=True),
        ),

        # ── AdminAuditLog.action_type: allow assign_role ─────────────────────
        migrations.AlterField(
            model_name='adminauditlog',
            name='action_type',
            field=models.CharField(
                choices=[
                    ('warn_user', 'Warn User'),
                    ('ban_user', 'Ban User'),
                    ('unban_user', 'Unban User'),
                    ('adjust_karma', 'Adjust Karma'),
                    ('resolve_report', 'Resolve Report'),
                    ('pause_handshake', 'Pause Handshake'),
                    ('remove_comment', 'Remove Comment'),
                    ('restore_comment', 'Restore Comment'),
                    ('lock_topic', 'Lock Topic'),
                    ('pin_topic', 'Pin Topic'),
                    ('assign_role', 'Assign Role'),
                ],
                max_length=32,
            ),
        ),
    ]
