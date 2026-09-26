from __future__ import annotations

from decimal import ROUND_HALF_UP, Decimal

from django.db import migrations

CENTS = Decimal("0.01")


def percent_to_discount_price(apps, schema_editor):
    BundleConfig = apps.get_model("catalog", "BundleConfig")
    for config in BundleConfig.objects.filter(discount_percent__gt=0).select_related("variant"):
        variant = config.variant
        net = variant.price * (Decimal("100") - config.discount_percent) / Decimal("100")
        variant.discount_price = net.quantize(CENTS, rounding=ROUND_HALF_UP)
        variant.save(update_fields=["discount_price", "updated_at"])


def discount_price_to_percent(apps, schema_editor):
    BundleConfig = apps.get_model("catalog", "BundleConfig")
    ProductVariant = apps.get_model("catalog", "ProductVariant")
    bundles = ProductVariant.objects.filter(
        product__product_type="bundle", discount_price__isnull=False
    )
    for variant in bundles:
        if not variant.price:
            continue
        percent = (
            (variant.price - variant.discount_price) / variant.price * Decimal("100")
        ).quantize(CENTS, rounding=ROUND_HALF_UP)
        BundleConfig.objects.update_or_create(
            variant=variant, defaults={"discount_percent": max(percent, Decimal("0"))}
        )


class Migration(migrations.Migration):
    dependencies = [
        ("catalog", "0011_remove_bundleconfig_catalog_bun_price_m_b07546_idx_and_more"),
    ]

    operations = [
        migrations.RunPython(percent_to_discount_price, discount_price_to_percent),
    ]
