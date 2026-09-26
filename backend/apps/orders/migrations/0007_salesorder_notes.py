from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("orders", "0006_returnrma_rma_del_status_idx_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="salesorder",
            name="notes",
            field=models.TextField(blank=True),
        ),
    ]
