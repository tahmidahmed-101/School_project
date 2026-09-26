from decimal import Decimal

from django.db import migrations
from django.utils import timezone

INSIDE_CHARGE = Decimal("80.00")
OUTSIDE_CHARGE = Decimal("120.00")

# Matched against the customer's typed address, which is now the only location
# text checkout collects. Broad on purpose: a Dhaka address that matches nothing
# falls through to the outside rate and overcharges.
INSIDE_KEYWORDS = [
    "dhaka",
    "dhanmondi",
    "gulshan",
    "banani",
    "baridhara",
    "uttara",
    "mirpur",
    "mohammadpur",
    "mohakhali",
    "badda",
    "tejgaon",
    "motijheel",
    "paltan",
    "bashundhara",
    "khilgaon",
    "rampura",
    "shyamoli",
    "farmgate",
    "jatrabari",
    "wari",
    "lalbagh",
    "savar",
    "keraniganj",
    "narayanganj",
    "gazipur",
    "tongi",
]


def configure(apps, schema_editor):
    ShippingZone = apps.get_model("logistics", "ShippingZone")
    ShippingRate = apps.get_model("logistics", "ShippingRate")
    Carrier = apps.get_model("logistics", "Carrier")

    inside = ShippingZone.objects.filter(name__in=["Inside Area", "Inside Dhaka"]).first()
    outside = ShippingZone.objects.filter(name__in=["Outside Area", "Outside Dhaka"]).first()
    if inside is None or outside is None:
        return

    inside.name = "Inside Dhaka"
    inside.country_codes = INSIDE_KEYWORDS
    inside.save(update_fields=["name", "country_codes"])

    outside.name = "Outside Dhaka"
    outside.country_codes = []
    outside.save(update_fields=["name", "country_codes"])

    # Leftover zones (e.g. "Bangladesh Nationwide" keyed on "BD") match almost
    # every address and would win before the Dhaka rules ever run.
    ShippingZone.objects.exclude(pk__in=[inside.pk, outside.pk]).filter(
        deleted_at__isnull=True
    ).update(deleted_at=timezone.now())

    carrier, _ = Carrier.objects.get_or_create(
        name="Standard Delivery", defaults={"code": "manual", "is_active": True}
    )

    rate_values = {
        "base_weight": Decimal("0"),
        "increment_weight": Decimal("1"),
        "increment_charge": Decimal("0"),
    }
    for zone, charge in ((inside, INSIDE_CHARGE), (outside, OUTSIDE_CHARGE)):
        updated = ShippingRate.objects.filter(zone=zone).update(base_charge=charge, **rate_values)
        if not updated:
            ShippingRate.objects.create(
                zone=zone, carrier=carrier, base_charge=charge, **rate_values
            )


def revert(apps, schema_editor):
    """Ops config, not data — leaving the Dhaka zones in place on reverse."""


class Migration(migrations.Migration):

    dependencies = [
        ("logistics", "0009_configure_default_shipping"),
    ]

    operations = [
        migrations.RunPython(configure, revert),
    ]
