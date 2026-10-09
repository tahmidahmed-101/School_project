from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("accounting", "0009_expensecategory_expense_category_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="journalentry",
            name="kind",
            field=models.CharField(
                blank=True,
                choices=[("stock", "Stock"), ("preorder", "Pre-order")],
                default="",
                max_length=10,
            ),
        ),
        migrations.AddIndex(
            model_name="journalentry",
            index=models.Index(fields=["kind", "entry_date"], name="je_kind_date_idx"),
        ),
    ]
