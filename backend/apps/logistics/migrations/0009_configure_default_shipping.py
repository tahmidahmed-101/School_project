from decimal import Decimal

from django.db import migrations
from django.utils import timezone

# Placeholder flat rates (BDT) so checkout is never blocked after this
# migration — replace via Admin > Logistics > Zones once real pricing is set.
INSIDE_CHARGE = Decimal("70.00")
OUTSIDE_CHARGE = Decimal("110.00")


def configure_shipping(apps, schema_editor):
    ShippingZone = apps.get_model("logistics", "ShippingZone")
    Carrier = apps.get_model("logistics", "Carrier")
    ShippingRate = apps.get_model("logistics", "ShippingRate")

    inside = ShippingZone.objects.filter(name="Inside Area").first()
    outside = ShippingZone.objects.filter(name="Outside Area").first()
    sub_area = ShippingZone.objects.filter(name="Sub Area").first()
    if inside is None or outside is None:
        return

    inside.country_codes = ["khulna"]
    inside.save(update_fields=["country_codes"])
    # Empty keywords make this zone the catch-all match for everything else.
    outside.country_codes = []
    outside.save(update_fields=["country_codes"])
    # Redundant with the two above and not exposed anywhere in the admin UI's
    # matching flow — soft-delete rather than leave it silently unreachable.
    if sub_area is not None and sub_area.deleted_at is None:
        sub_area.deleted_at = timezone.now()
        sub_area.save(update_fields=["deleted_at"])

    carrier, _ = Carrier.objects.get_or_create(
        name="Standard Delivery", defaults={"code": "manual", "is_active": True}
    )

    for zone, charge in ((inside, INSIDE_CHARGE), (outside, OUTSIDE_CHARGE)):
        ShippingRate.objects.get_or_create(
            zone=zone,
            carrier=carrier,
            defaults={
                "base_weight": Decimal("0"),
                "base_charge": charge,
                "increment_weight": Decimal("1"),
                "increment_charge": Decimal("0"),
            },
        )


def revert(apps, schema_editor):
    """Not restoring Sub Area or clearing the rates/keywords: this is default
    ops config, not data anyone would want automatically discarded."""


class Migration(migrations.Migration):

    dependencies = [
        ("logistics", "0008_alter_shippingrate_base_charge_and_more"),
    ]

    operations = [
        migrations.RunPython(configure_shipping, revert),
    ]
