"""Bring databases that already ran 0010 onto the 70 / 110 Dhaka charges.

0010 was edited from 80 / 120 to 70 / 110 after it had shipped, which only
affects fresh installs. This moves existing installs the same way, but only
for a rate still exactly as 0010 seeded it — a charge staff have changed
since is theirs, and is left alone.
"""

from decimal import Decimal

from django.db import migrations

# zone name -> (charge 0010 originally seeded, charge it seeds now)
CHANGES = {
    "Inside Dhaka": (Decimal("80.00"), Decimal("70.00")),
    "Outside Dhaka": (Decimal("120.00"), Decimal("110.00")),
}


def _move(apps, *, forward: bool) -> None:
    ShippingRate = apps.get_model("logistics", "ShippingRate")
    for zone_name, (old, new) in CHANGES.items():
        source, target = (old, new) if forward else (new, old)
        ShippingRate.objects.filter(
            zone__name=zone_name,
            zone__deleted_at__isnull=True,
            base_charge=source,
            # The flat shape 0010 seeded; a weight-based rate was configured by hand.
            base_weight=Decimal("0"),
            increment_charge=Decimal("0"),
        ).update(base_charge=target)


def lower_charges(apps, schema_editor):
    _move(apps, forward=True)


def restore_charges(apps, schema_editor):
    _move(apps, forward=False)


class Migration(migrations.Migration):

    dependencies = [
        ("logistics", "0013_courierwebhookevent"),
    ]

    operations = [
        migrations.RunPython(lower_charges, restore_charges),
    ]
