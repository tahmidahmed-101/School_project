from __future__ import annotations

from django.db import migrations, models

# Seeded variants encode their axis in the SKU suffix; nothing else records it.
COLORS = {"BLA": "Black", "BRO": "Brown", "NAV": "Navy", "TAN": "Tan"}
SIZES = {"S", "M", "L", "XL", "XXL"}


def backfill(apps, schema_editor):
    ProductVariant = apps.get_model("catalog", "ProductVariant")
    updates = []
    for variant in ProductVariant.objects.filter(product__variants__isnull=False).distinct():
        if variant.product.variants.count() < 2:
            continue
        suffix = variant.sku.rsplit("-", 1)[-1].upper()
        if suffix in COLORS:
            variant.color = COLORS[suffix]
        elif suffix in SIZES or suffix.isdigit():
            variant.size = suffix
        else:
            continue
        updates.append(variant)
    ProductVariant.objects.bulk_update(updates, ["color", "size"])


class Migration(migrations.Migration):
    dependencies = [
        ("catalog", "0008_remove_category_catalog_cat_parent__5307be_idx_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="productvariant",
            name="color",
            field=models.CharField(blank=True, max_length=50),
        ),
        migrations.AddField(
            model_name="productvariant",
            name="size",
            field=models.CharField(blank=True, max_length=50),
        ),
        migrations.RunPython(backfill, migrations.RunPython.noop),
        migrations.AddConstraint(
            model_name="productvariant",
            constraint=models.UniqueConstraint(
                condition=models.Q(deleted_at__isnull=True),
                fields=("product", "color", "size"),
                name="unique_live_variant_combo",
            ),
        ),
        migrations.RemoveField(model_name="productvariant", name="attribute_values"),
        migrations.RemoveConstraint(
            model_name="productattributevalue", name="unique_attribute_value"
        ),
        migrations.RemoveField(model_name="product", name="tax_class"),
        migrations.RemoveField(model_name="productattributevalue", name="attribute"),
        migrations.DeleteModel(name="ProductAttributeValue"),
        migrations.DeleteModel(name="ProductAttribute"),
    ]
