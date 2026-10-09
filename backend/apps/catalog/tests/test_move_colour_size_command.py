from __future__ import annotations

import io

import pytest
from django.core.management import call_command

from apps.catalog.factories import ProductFactory, ProductVariantFactory
from apps.catalog.models import Product, ProductOption, ProductOptionValue, ProductVariant
from apps.catalog.selectors.options import product_options, variant_option_values
from apps.orders.factories import SalesOrderLineFactory
from apps.orders.models import SalesOrderLine

pytestmark = pytest.mark.django_db


def _run(*args) -> str:
    out = io.StringIO()
    call_command("move_colour_size_to_options", *args, stdout=out)
    return out.getvalue()


def _shirt():
    """Colour and size text with casing and spacing duplicates, one deleted variant."""
    product = ProductFactory(name="Shirt")
    rows = [("SH-1", "Red", "M"), ("SH-2", " red", "L"), ("SH-3", "Navy  Blue", "m")]
    variants = [
        ProductVariantFactory(product=product, sku=sku, color=color, size=size)
        for sku, color, size in rows
    ]
    gone = ProductVariantFactory(product=product, sku="SH-GONE", color="RED", size="M")
    gone.soft_delete()
    return product, variants


def _state() -> tuple:
    return (
        ProductOption.objects.count(),
        ProductOptionValue.objects.count(),
        sorted(ProductVariant.objects.values_list("sku", "title")),
        sorted(SalesOrderLine.objects.values_list("id", "variant_title")),
        sorted(Product.objects.values_list("id", "product_type")),
        ProductVariant.option_values.through.objects.count(),
    )


def test_dry_run_reports_and_changes_nothing():
    _product, variants = _shirt()
    SalesOrderLineFactory(variant=variants[0])
    before = _state()

    output = _run()

    assert _state() == before
    assert "Would move 1 products: 2 options, 4 values, 4 variants linked, 1 order lines" in output
    assert "Dry run: nothing was written" in output


def test_apply_builds_options_links_variants_and_titles_order_lines():
    product, variants = _shirt()
    line = SalesOrderLineFactory(variant=variants[1])
    kept = SalesOrderLineFactory(variant=variants[2], variant_title="Sold as this")

    output = _run("--apply")

    product.refresh_from_db()
    assert product.product_type == Product.ProductType.VARIANT
    assert [
        (option["name"], [value["value"] for value in option["values"]])
        for option in product_options(product)
    ] == [("Colour", ["Red", "Navy Blue"]), ("Size", ["M", "L"])]
    assert sorted(ProductVariant.objects.filter(product=product).values_list("sku", "title")) == [
        ("SH-1", "Red / M"),
        ("SH-2", "Red / L"),
        ("SH-3", "Navy Blue / M"),
        ("SH-GONE", "Red / M"),
    ]
    moved = ProductVariant.objects.get(sku="SH-2")
    assert [pair["value"] for pair in variant_option_values(moved)] == ["Red", "L"]
    line.refresh_from_db()
    kept.refresh_from_db()
    assert line.variant_title == "Red / L"
    assert kept.variant_title == "Sold as this"
    assert ProductVariant.objects.get(sku="SH-2").color == " red"
    assert "Moved 1 products" in output
    assert "Dry run" not in output


def test_apply_twice_changes_nothing_the_second_time():
    _shirt()
    _run("--apply")
    after_first = _state()

    output = _run("--apply")

    assert _state() == after_first
    assert "Moved 0 products" in output


def test_a_product_with_colour_only_gets_one_option():
    product = ProductFactory()
    ProductVariantFactory(product=product, color="Black")
    ProductVariantFactory(product=product, color="Tan")

    _run("--apply")

    assert [option["name"] for option in product_options(product)] == ["Colour"]
    assert sorted(product.variants.values_list("title", flat=True)) == ["Black", "Tan"]


def test_conflicting_products_are_left_alone_and_listed_with_their_skus():
    uneven = ProductFactory(name="Uneven")
    ProductVariantFactory(product=uneven, sku="UN-1", color="Red", size="M")
    ProductVariantFactory(product=uneven, sku="UN-2", color="Red")
    twins = ProductFactory(name="Twins")
    ProductVariantFactory(product=twins, sku="TW-1", color="Red", size="M")
    ProductVariantFactory(product=twins, sku="TW-2", color="red ", size="m")
    line = SalesOrderLineFactory(variant=twins.variants.get(sku="TW-1"))
    fine, _variants = _shirt()

    output = _run("--apply")

    assert not ProductOption.objects.filter(product__in=[uneven, twins]).exists()
    assert set(ProductVariant.objects.filter(product__in=[uneven, twins]).values_list("title")) == {
        ("",)
    }
    line.refresh_from_db()
    assert line.variant_title == ""
    assert ProductOption.objects.filter(product=fine).count() == 2
    assert "Left alone for a person to fix: 2 products." in output
    assert "one variant has a colour or size that another lacks. SKUs: UN-1, UN-2" in output
    assert "two live variants would be the same combination. SKUs: TW-1, TW-2" in output


def test_products_already_on_options_or_without_text_are_not_touched():
    plain = ProductVariantFactory()
    moved, _variants = _shirt()
    _run("--apply")
    before = _state()

    output = _run("--apply")

    assert _state() == before
    assert not ProductOption.objects.filter(product=plain.product).exists()
    assert "Left alone for a person to fix: 0 products." in output
    assert ProductOption.objects.filter(product=moved).count() == 2
