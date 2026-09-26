from django.db import migrations

ZONE_NAMES = ["Inside Area", "Sub Area", "Outside Area"]


def seed_zones(apps, schema_editor):
    ShippingZone = apps.get_model("logistics", "ShippingZone")
    for name in ZONE_NAMES:
        ShippingZone.objects.get_or_create(name=name)


def unseed_zones(apps, schema_editor):
    ShippingZone = apps.get_model("logistics", "ShippingZone")
    ShippingZone.objects.filter(name__in=ZONE_NAMES, districts__isnull=True, rates__isnull=True).delete()


class Migration(migrations.Migration):

    dependencies = [
        ("logistics", "0005_district"),
    ]

    operations = [
        migrations.RunPython(seed_zones, unseed_zones),
    ]
