from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("accounting", "0010_journalentry_kind"),
    ]

    operations = [
        migrations.AddField(
            model_name="expense",
            name="kind",
            field=models.CharField(
                blank=True,
                choices=[("stock", "Stock"), ("preorder", "Pre-order")],
                default="",
                max_length=10,
            ),
        ),
    ]
