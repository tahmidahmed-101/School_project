from decimal import Decimal

from django.db import migrations, models


def dedupe_rates_per_zone_carrier(apps, schema_editor):
    """Old brackets allowed several rows per (zone, carrier); the new model
    allows one. Keep the lowest-weight bracket's numbers as the new base
    tier and drop the rest — there is no lossless mapping from a bracket
    ladder to a single base/increment row."""
    ShippingRate = apps.get_model("logistics", "ShippingRate")
    seen = set()
    for rate in ShippingRate.objects.order_by("zone_id", "carrier_id", "min_weight", "pk"):
        key = (rate.zone_id, rate.carrier_id)
        if key in seen:
            rate.delete()
            continue
        seen.add(key)
        rate.base_weight = rate.min_weight
        rate.base_charge = rate.rate
        rate.save(update_fields=["base_weight", "base_charge"])


class Migration(migrations.Migration):

    dependencies = [
        ("logistics", "0006_seed_shipping_zones"),
    ]

    operations = [
        migrations.AlterModelOptions(
            name="shippingrate",
            options={"ordering": ["zone__name", "carrier__name"]},
        ),
        migrations.AddField(
            model_name="shippingrate",
            name="base_weight",
            field=models.DecimalField(decimal_places=3, default=Decimal("0"), max_digits=10),
        ),
        migrations.AddField(
            model_name="shippingrate",
            name="base_charge",
            field=models.DecimalField(decimal_places=2, default=Decimal("0"), max_digits=10),
        ),
        migrations.AddField(
            model_name="shippingrate",
            name="increment_weight",
            field=models.DecimalField(decimal_places=3, default=Decimal("1"), max_digits=10),
        ),
        migrations.AddField(
            model_name="shippingrate",
            name="increment_charge",
            field=models.DecimalField(decimal_places=2, default=Decimal("0"), max_digits=10),
        ),
        migrations.RunPython(dedupe_rates_per_zone_carrier, migrations.RunPython.noop),
        migrations.RemoveIndex(
            model_name="shippingrate",
            name="logistics_s_zone_id_8380f2_idx",
        ),
        migrations.RemoveField(model_name="shippingrate", name="min_weight"),
        migrations.RemoveField(model_name="shippingrate", name="max_weight"),
        migrations.RemoveField(model_name="shippingrate", name="rate"),
        migrations.AddConstraint(
            model_name="shippingrate",
            constraint=models.UniqueConstraint(
                fields=["zone", "carrier"], name="uniq_rate_per_zone_carrier"
            ),
        ),
    ]
