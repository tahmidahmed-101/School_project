from __future__ import annotations

import io
from decimal import Decimal

import pytest
from django.db import connection
from django.test.utils import CaptureQueriesContext

from apps.accounts.constants import UserRole
from apps.accounts.tests.helpers import create_user
from apps.catalog.factories import (
    CategoryFactory,
    ProductFactory,
    ProductVariantFactory,
    make_options,
    make_variant,
)
from apps.catalog.models import Category, ProductVariant
from apps.catalog.services.categories import create_category, delete_category
from apps.catalog.services.products import (
    create_product,
    create_variant,
)
from apps.catalog.services.variant_import_export import export_variants, import_variants
from apps.common.exceptions import BusinessRuleViolationError
from apps.inventory.constants import MovementType
from apps.inventory.services.stock import record_movement
from apps.orders.models import SalesOrder
from apps.orders.services.carts import add_line, get_or_create_cart
from apps.orders.services.checkout import checkout

pytestmark = pytest.mark.django_db


def test_create_category_generates_unique_slug():
    first = create_category(name="Shoes")
    second = create_category(name="Shoes")

    assert first.slug == "shoes"
    assert second.slug == "shoes-2"


def test_delete_category_rejects_when_children_exist():
    parent = CategoryFactory()
    CategoryFactory(parent=parent)

    with pytest.raises(BusinessRuleViolationError):
        delete_category(category=parent)


def test_create_category_defaults_to_stock_type():
    category = create_category(name="Shoes Root")

    assert category.category_type == Category.CategoryType.STOCK


def test_create_product_and_variant_duplicate_sku_rejected():
    category = CategoryFactory()
    product = create_product(category=category, name="T-Shirt")

    create_variant(product=product, sku="TSHIRT-BLU-L", price=Decimal("19.99"))

    with pytest.raises(BusinessRuleViolationError):
        create_variant(product=product, sku="TSHIRT-BLU-L", price=Decimal("19.99"))


def test_create_variant_generates_a_sku_from_the_product_slug_and_combo():
    product = ProductFactory(name="Panjabi Classic", slug="panjabi-classic")
    values = make_options(product, {"Colour": ["Navy"], "Size": ["L"]})

    variant = create_variant(
        product=product, price=Decimal("1200"), option_value_ids=[v.id for v in values.values()]
    )

    assert variant.sku == "PANJABI-CLASSIC-NAVY-L"


def test_create_variant_suffixes_a_generated_sku_that_is_already_taken():
    ProductVariantFactory(sku="PANJABI-CLASSIC-NAVY-L")
    product = ProductFactory(name="Panjabi Classic", slug="panjabi-classic")
    values = make_options(product, {"Colour": ["Navy"], "Size": ["L"]})

    variant = create_variant(
        product=product, price=Decimal("1200"), option_value_ids=[v.id for v in values.values()]
    )

    assert variant.sku == "PANJABI-CLASSIC-NAVY-L-2"


def test_export_then_import_variants_round_trip():
    product = ProductFactory(name="Roundtrip Product")
    variant = ProductVariantFactory(
        product=product, sku="ROUNDTRIP-1", price=Decimal("12.50"), cost_price=Decimal("5.00")
    )

    csv_bytes = export_variants(ProductVariant.objects.filter(id=variant.id), fmt="csv")

    variant.price = Decimal("99.99")
    variant.save(update_fields=["price"])

    result = import_variants(file=io.BytesIO(csv_bytes), fmt="csv")

    assert result.errors == []
    assert result.updated == 1
    variant.refresh_from_db()
    assert variant.price == Decimal("12.50")


def test_export_variants_carries_the_option_columns():
    product = ProductFactory(name="Muffler Product")
    values = make_options(product, {"Colour": ["Navy"], "Size": ["Free"]})
    variant = make_variant(product, list(values.values()), sku="MUF-1")

    csv_text = export_variants(ProductVariant.objects.filter(id=variant.id), fmt="csv").decode(
        "utf-8"
    )

    header, row = csv_text.splitlines()[:2]
    assert header.split(",")[8:14] == [
        "option1_name",
        "option1_value",
        "option2_name",
        "option2_value",
        "option3_name",
        "option3_value",
    ]
    assert "color" not in header.split(",")
    assert row.split(",")[8:14] == ["Colour", "Navy", "Size", "Free", "", ""]


def test_import_variants_reports_row_errors_without_aborting():
    good_product = ProductFactory(name="Good Product")
    csv_content = (
        "product_name,sku,barcode,price,cost_price,discount_price,stock,weight,"
        "color,size,is_active\n"
        "Nonexistent Product,BAD-SKU,,10,5,,0,,,,1\n"
        f"{good_product.name},GOOD-SKU,,10,5,,0,,Black,M,1\n"
    )

    result = import_variants(file=io.BytesIO(csv_content.encode("utf-8")), fmt="csv")

    assert result.created == 1
    assert len(result.errors) == 1
    assert result.errors[0]["sku"] == "BAD-SKU"


def _import_csv(rows: list[str]):
    """Counts the importer's own lookups (product by name, SKUs of the file).
    Each row then goes through the variant service, which reads per row."""
    header = (
        "product_name,sku,barcode,price,cost_price,discount_price,stock,weight,color,size,"
        "is_active\n"
    )
    content = header + "".join(f"{row}\n" for row in rows)
    with CaptureQueriesContext(connection) as captured:
        result = import_variants(file=io.BytesIO(content.encode("utf-8")), fmt="csv")
    lookups = sum(
        1
        for q in captured
        if q["sql"].startswith("SELECT")
        and (
            '"catalog_product"."name" LIKE' in q["sql"]
            or '"catalog_productvariant"."sku" IN' in q["sql"]
        )
    )
    return result, lookups


def test_import_variants_looks_products_and_skus_up_once_not_per_row():
    product = ProductFactory(name="Import Scale Product")
    # Variants of one product must differ by an option value, hence the size column.
    _, one_row = _import_csv([f"{product.name},SCALE-0,,10,5,,0,,,S0,1"])
    result, many_rows = _import_csv(
        [f"{product.name},SCALE-{n},,10,5,,0,,,S{n},1" for n in range(1, 9)]
    )

    assert result.created == 8
    assert many_rows == one_row


def test_import_variants_repeated_sku_in_one_file_updates_rather_than_duplicates():
    product = ProductFactory(name="Repeat Sku Product")

    result, _ = _import_csv(
        [f"{product.name},REPEAT-1,,10,5,,0,,,,1", f"{product.name},REPEAT-1,,12,5,,0,,,,1"]
    )

    assert (result.created, result.updated, result.errors) == (1, 1, [])
    assert ProductVariant.objects.get(sku="REPEAT-1").price == Decimal("12")


def test_normal_product_order_still_works():
    product = ProductFactory()
    variant = ProductVariantFactory(product=product, price=Decimal("1000"))

    # Add stock so checkout can reserve it
    record_movement(
        variant=variant,
        movement_type=MovementType.PURCHASE_IN,
        quantity=10,
        unit_cost=Decimal("5.00"),
    )

    customer = create_user(email="test3@example.com", role=UserRole.CUSTOMER)
    cart = get_or_create_cart(customer)
    add_line(order=cart, variant=variant, quantity=2)

    assert cart.lines.first().unit_price == Decimal("1000")

    # Checkout should work
    order = checkout(order=cart)
    assert order.status == SalesOrder.Status.AWAITING_PAYMENT
