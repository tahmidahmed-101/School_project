# Regenerate product codes to fit max_length=4 and remove the redundant prod_code_idx index.

from django.db import migrations, models

from apps.common.utils.text import unique_product_code_for


def regenerate_product_codes(apps, schema_editor):
    Product = apps.get_model("catalog", "Product")
    for product in Product.objects.all():
        code = unique_product_code_for(
            model=Product, text=product.name, instance=product
        )
        if code != product.product_code:
            product.product_code = code
            product.save(update_fields=["product_code"])


class Migration(migrations.Migration):

    dependencies = [
        ("catalog", "0036_backfill_product_code"),
    ]

    operations = [
        migrations.RunPython(regenerate_product_codes, migrations.RunPython.noop),
        migrations.AlterField(
            model_name="product",
            name="product_code",
            field=models.CharField(
                blank=True, editable=False, max_length=4, unique=True
            ),
        ),
        # The unique constraint (added in 0036) already provides a lookup index,
        # so the manually added prod_code_idx index from the old 0035 is redundant.
        migrations.RunSQL(
            "DROP INDEX IF EXISTS catalog_product_prod_code_idx;",
            reverse_sql=migrations.RunSQL.noop,
        ),
    ]
