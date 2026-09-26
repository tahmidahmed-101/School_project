from __future__ import annotations

from django.db import migrations


def forwards(apps, schema_editor):
    apps.get_model("business", "ModuleSetting").objects.filter(key="notifications").delete()


def drop_notifications_bookkeeping(apps, schema_editor):
    # The notifications app is gone, so its own migrations can no longer run.
    # Dropping the table and its history here keeps already-migrated databases
    # from carrying an orphaned table and unresolvable migration records.
    schema_editor.execute("DROP TABLE IF EXISTS notifications_notification")
    schema_editor.execute("DELETE FROM django_migrations WHERE app = 'notifications'")


class Migration(migrations.Migration):
    dependencies = [("business", "0005_alter_modulesetting_key")]

    operations = [
        migrations.RunPython(forwards, migrations.RunPython.noop),
        migrations.RunPython(drop_notifications_bookkeeping, migrations.RunPython.noop),
    ]
