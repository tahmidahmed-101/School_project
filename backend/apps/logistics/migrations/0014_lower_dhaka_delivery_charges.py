"""Set the Dhaka delivery charges to 70 (inside) and 110 (outside) on every
install, matching what 0010 seeds: one flat rate per zone, regardless of
weight. Databases that ran 0010 before its charges changed get the same
values a fresh install has.
"""

from decimal import Decimal

from django.db import migrations

CHARGES = {
    "Inside Dhaka": Decimal("70.00"),
    "Outside Dhaka": Decimal("110.00"),
}


def set_charges(apps, schema_editor):
    ShippingRate = apps.get_model("logistics", "ShippingRate")
    for zone_name, charge in CHARGES.items():
        ShippingRate.objects.filter(zone__name=zone_name, zone__deleted_at__isnull=True).update(
            base_charge=charge,
            base_weight=Decimal("0"),
            increment_weight=Decimal("1"),
            increment_charge=Decimal("0"),
        )


def revert(apps, schema_editor):
    """Ops config, not data: leaving the charges in place on reverse, as 0010 does."""


class Migration(migrations.Migration):

    dependencies = [
        ("logistics", "0013_courierwebhookevent"),
    ]

    operations = [
        migrations.RunPython(set_charges, revert),
    ]
