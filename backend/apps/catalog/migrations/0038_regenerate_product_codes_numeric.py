# Regenerate all product codes as 4-digit numeric codes.

from django.db import migrations

from apps.common.utils.text import unique_product_code_for


def regenerate_product_codes_numeric(apps, schema_editor):
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
        ("catalog", "0037_product_code_four_chars"),
    ]

    operations = [
        migrations.RunPython(regenerate_product_codes_numeric, migrations.RunPython.noop),
    ]
