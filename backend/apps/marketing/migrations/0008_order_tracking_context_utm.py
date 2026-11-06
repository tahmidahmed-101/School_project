from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("marketing", "0007_conversion_skipped_status"),
    ]

    operations = [
        migrations.AddField(
            model_name="ordertrackingcontext",
            name="utm_source",
            field=models.CharField(blank=True, max_length=128),
        ),
        migrations.AddField(
            model_name="ordertrackingcontext",
            name="utm_medium",
            field=models.CharField(blank=True, max_length=128),
        ),
        migrations.AddField(
            model_name="ordertrackingcontext",
            name="utm_campaign",
            field=models.CharField(blank=True, max_length=256),
        ),
        migrations.AddField(
            model_name="ordertrackingcontext",
            name="utm_term",
            field=models.CharField(blank=True, max_length=256),
        ),
        migrations.AddField(
            model_name="ordertrackingcontext",
            name="utm_content",
            field=models.CharField(blank=True, max_length=256),
        ),
    ]
