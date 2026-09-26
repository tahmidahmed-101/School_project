from django.db import migrations

# The coupons and discounts apps were deleted in fe2807b but their tables were
# never dropped, and their FKs into orders/products still block order deletes.
DEAD_TABLES = [
    "discounts_applieddiscount",
    "discounts_discount_products",
    "discounts_discount_categories",
    "discounts_discount",
    "coupons_couponusage",
    "coupons_ordercoupon",
    "coupons_coupon_products",
    "coupons_coupon_categories",
    "coupons_coupon_customers",
    "coupons_coupon",
]


def drop(apps, schema_editor):
    cascade = " CASCADE" if schema_editor.connection.vendor == "postgresql" else ""
    with schema_editor.connection.cursor() as cursor:
        for table in DEAD_TABLES:
            cursor.execute(f'DROP TABLE IF EXISTS "{table}"{cascade}')  # noqa: S608


def noop(apps, schema_editor):
    """Irreversible by design — the models these tables belonged to are gone."""


class Migration(migrations.Migration):

    dependencies = [
        ("logistics", "0011_delete_district"),
    ]

    operations = [
        migrations.RunPython(drop, noop),
    ]
