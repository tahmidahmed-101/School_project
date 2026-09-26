from __future__ import annotations

from django.db import migrations


class Migration(migrations.Migration):
    dependencies = [
        ("catalog", "0013_delete_bundleconfig"),
    ]

    operations = [
        migrations.RemoveField(
            model_name="product",
            name="badge",
        ),
        migrations.RemoveField(
            model_name="product",
            name="tagline",
        ),
    ]
