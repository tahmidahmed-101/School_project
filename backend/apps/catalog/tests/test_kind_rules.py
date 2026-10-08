from __future__ import annotations

from datetime import timedelta
from decimal import Decimal
from io import BytesIO, StringIO

import pytest
from django.core.management import call_command
from django.utils import timezone

from apps.accounts.constants import UserRole
from apps.accounts.tests.helpers import create_user
from apps.catalog.factories import (
    CategoryFactory,
    PriceIssueReportFactory,
    ProductFactory,
    ProductQuestionFactory,
    ProductReviewFactory,
    ProductVariantFactory,
)
from apps.catalog.models import Category, ProductVariant
from apps.catalog.services.bundles import create_bundle
from apps.catalog.services.categories import update_category
from apps.catalog.services.products import create_variant, update_variant
from apps.catalog.services.variant_import_export import import_variants
from apps.common.exceptions import BusinessRuleViolationError
from apps.inventory.factories import StockItemFactory

pytestmark = pytest.mark.django_db

BASE = "/api/v1/admin/catalog/"
STOCK = Category.CategoryType.STOCK
PREORDER = Category.CategoryType.PREORDER


@pytest.fixture
def admin_client(api_client):
    api_client.force_authenticate(
        user=create_user(email="catalog-kind-admin@example.com", role=UserRole.ADMIN)
    )
    return api_client


def _product(kind):
    return ProductFactory(category__category_type=kind)


def _window() -> dict:
    now = timezone.now()
    return {
        "preorder_start_date": now - timedelta(days=1),
        "preorder_end_date": now + timedelta(days=10),
    }


def _refused(code, call, **kwargs):
    with pytest.raises(BusinessRuleViolationError) as excinfo:
        call(**kwargs)
    assert excinfo.value.code == code


@pytest.mark.parametrize(
    ("path", "factory"),
    [
        ("reviews/", ProductReviewFactory),
        ("questions/", ProductQuestionFactory),
        ("price-reports/", PriceIssueReportFactory),
    ],
)
def test_catalog_lists_filter_by_the_products_category_kind(admin_client, path, factory):
    rows = {kind: factory(product=_product(kind)) for kind in (STOCK, PREORDER)}

    response = admin_client.get(f"{BASE}{path}")
    assert len(response.data["data"]["results"]) == 2
    for kind, row in rows.items():
        response = admin_client.get(f"{BASE}{path}", {"kind": kind})
        assert response.status_code == 200, response.data
        assert [item["id"] for item in response.data["data"]["results"]] == [str(row.id)]
    assert admin_client.get(f"{BASE}{path}", {"kind": "mixed"}).status_code == 400


@pytest.mark.parametrize(
    "fields",
    [
        {"preorder_price": Decimal("90.00")},
        {"release_date": timezone.now() + timedelta(days=30)},
        {"preorder_stock_limit": 0},
        {"preorder_start_date": timezone.now()},
    ],
)
def test_stock_variant_cannot_be_created_with_a_preorder_field(fields):
    _refused(
        "preorder_category_required",
        create_variant,
        product=_product(STOCK),
        price=Decimal("100.00"),
        **fields,
    )


def test_stock_variant_cannot_be_switched_to_preorder():
    variant = ProductVariantFactory(product=_product(STOCK))

    _refused(
        "preorder_category_required",
        update_variant,
        variant=variant,
        data={"is_preorder_enabled": True, **_window()},
    )
    _refused(
        "preorder_category_required",
        update_variant,
        variant=variant,
        data={"preorder_stock_limit": 5},
    )


@pytest.mark.parametrize("field", ["discount_price", "wholesale_price"])
def test_preorder_variant_cannot_carry_a_stock_only_price(field):
    product = _product(PREORDER)

    _refused(
        "stock_field_on_preorder",
        create_variant,
        product=product,
        price=Decimal("100.00"),
        is_preorder_enabled=True,
        **_window(),
        **{field: Decimal("80.00")},
    )

    variant = create_variant(
        product=product, price=Decimal("100.00"), is_preorder_enabled=True, **_window()
    )
    _refused(
        "stock_field_on_preorder",
        update_variant,
        variant=variant,
        data={field: Decimal("80.00")},
    )


def test_each_kind_keeps_its_own_fields():
    stock = create_variant(
        product=_product(STOCK),
        price=Decimal("100.00"),
        discount_price=Decimal("80.00"),
        wholesale_price=Decimal("70.00"),
    )
    preorder = create_variant(
        product=_product(PREORDER),
        price=Decimal("100.00"),
        is_preorder_enabled=True,
        preorder_price=Decimal("90.00"),
        preorder_stock_limit=20,
        **_window(),
    )

    assert stock.discount_price == Decimal("80.00")
    assert preorder.preorder_price == Decimal("90.00")


def test_a_legacy_mixed_variant_can_still_be_cleaned_by_hand():
    variant = ProductVariantFactory(
        product=_product(STOCK), is_preorder_enabled=True, preorder_stock_limit=5, **_window()
    )

    update_variant(
        variant=variant,
        data={
            "is_preorder_enabled": False,
            "preorder_stock_limit": None,
            "preorder_start_date": None,
            "preorder_end_date": None,
        },
    )

    variant.refresh_from_db()
    assert variant.is_preorder_enabled is False
    assert variant.preorder_stock_limit is None


def test_bundle_refuses_a_preorder_component():
    stock = ProductVariantFactory(product=_product(STOCK))
    preorder = ProductVariantFactory(product=_product(PREORDER))

    _refused(
        "bundle_stock_only",
        create_bundle,
        category=stock.product.category,
        name="Mixed pack",
        components=[
            {"component_variant_id": str(stock.id), "quantity": 1},
            {"component_variant_id": str(preorder.id), "quantity": 1},
        ],
    )


def test_bundle_refuses_a_preorder_category():
    stock = ProductVariantFactory(product=_product(STOCK))

    _refused(
        "bundle_stock_only",
        create_bundle,
        category=CategoryFactory(category_type=PREORDER),
        name="Pre-order pack",
        components=[{"component_variant_id": str(stock.id), "quantity": 1}],
    )


def test_category_kind_cannot_change_while_it_has_products():
    category = _product(STOCK).category

    _refused(
        "category_kind_in_use",
        update_category,
        category=category,
        data={"category_type": PREORDER},
    )

    category.refresh_from_db()
    assert category.category_type == STOCK


def test_empty_category_can_change_kind():
    category = CategoryFactory(category_type=STOCK)

    update_category(category=category, data={"category_type": PREORDER})

    category.refresh_from_db()
    assert category.category_type == PREORDER


def _mixed_rows():
    stock = ProductVariantFactory(
        product=_product(STOCK),
        discount_price=Decimal("15.00"),
        is_preorder_enabled=True,
        preorder_price=Decimal("12.00"),
        preorder_stock_limit=5,
        release_date=timezone.now() + timedelta(days=40),
        **_window(),
    )
    preorder = ProductVariantFactory(
        product=_product(PREORDER),
        discount_price=Decimal("15.00"),
        wholesale_price=Decimal("11.00"),
        is_preorder_enabled=True,
        **_window(),
    )
    item = StockItemFactory(variant=preorder, reorder_point=10, target_stock_level=30)
    return stock, preorder, item


def test_fix_command_dry_run_reports_and_writes_nothing():
    stock, preorder, item = _mixed_rows()
    out = StringIO()

    call_command("fix_product_kind_mismatches", stdout=out)

    output = out.getvalue()
    assert stock.sku in output
    assert preorder.sku in output
    assert "2 variant(s) would change" in output
    for row in (stock, preorder, item):
        row.refresh_from_db()
    assert stock.is_preorder_enabled is True
    assert preorder.discount_price == Decimal("15.00")
    assert item.reorder_point == 10


def test_fix_command_apply_clears_the_other_kinds_fields():
    stock, preorder, item = _mixed_rows()
    clean = ProductVariantFactory(product=_product(STOCK), discount_price=Decimal("9.00"))

    call_command("fix_product_kind_mismatches", "--apply", stdout=StringIO())

    for row in (stock, preorder, item, clean):
        row.refresh_from_db()
    assert stock.is_preorder_enabled is False
    assert stock.preorder_price is None
    assert stock.preorder_start_date is None
    assert stock.preorder_end_date is None
    assert stock.release_date is None
    assert stock.preorder_stock_limit is None
    assert stock.discount_price == Decimal("15.00")
    assert preorder.discount_price is None
    assert preorder.wholesale_price is None
    assert preorder.is_preorder_enabled is True
    assert preorder.preorder_start_date is not None
    assert (item.reorder_point, item.target_stock_level) == (0, 0)
    assert clean.discount_price == Decimal("9.00")


def _import(text):
    return import_variants(file=BytesIO(text.encode("utf-8")), fmt="csv")


def test_import_refuses_a_preorder_product_and_keeps_the_stock_rows():
    ProductFactory(name="Import Stock Tee", category__category_type=STOCK)
    ProductFactory(name="Import Preorder Tee", category__category_type=PREORDER)

    result = _import(
        "sku,product_name,price\n"
        "IMP-STOCK-1,Import Stock Tee,10.00\n"
        "IMP-PRE-1,Import Preorder Tee,10.00\n"
    )

    assert result.created == 1
    assert [(error["row"], error["sku"]) for error in result.errors] == [(3, "IMP-PRE-1")]
    assert not ProductVariant.objects.filter(sku="IMP-PRE-1").exists()


def test_import_refuses_to_update_a_preorder_sku():
    ProductFactory(name="Import Target Tee", category__category_type=STOCK)
    variant = ProductVariantFactory(
        product=_product(PREORDER), sku="IMP-PRE-2", price=Decimal("50.00")
    )

    result = _import("sku,product_name,price\nIMP-PRE-2,Import Target Tee,10.00\n")

    assert result.updated == 0
    assert len(result.errors) == 1
    variant.refresh_from_db()
    assert variant.price == Decimal("50.00")
    assert variant.product.category.category_type == PREORDER


def test_import_refuses_preorder_fields():
    ProductFactory(name="Import Field Tee", category__category_type=STOCK)

    result = _import(
        "sku,product_name,price,is_preorder_enabled,preorder_price\n"
        "IMP-F-1,Import Field Tee,10.00,1,\n"
        "IMP-F-2,Import Field Tee,10.00,0,9.00\n"
        "IMP-F-3,Import Field Tee,10.00,0,\n"
    )

    assert result.created == 1
    assert [error["sku"] for error in result.errors] == ["IMP-F-1", "IMP-F-2"]
    assert "is_preorder_enabled" in result.errors[0]["message"]


def test_variant_export_honours_category_type(admin_client):
    stock = ProductVariantFactory(product=_product(STOCK), sku="EXP-STOCK-1")
    preorder = ProductVariantFactory(product=_product(PREORDER), sku="EXP-PRE-1")

    def exported(**params):
        response = admin_client.get(f"{BASE}variants/export/", {"file_format": "csv", **params})
        assert response.status_code == 200
        return response.content.decode("utf-8")

    assert stock.sku in exported() and preorder.sku not in exported()
    assert preorder.sku not in exported(category_type="stock")
    assert stock.sku not in exported(category_type="preorder")
    response = admin_client.get(f"{BASE}variants/export/", {"category_type": "mixed"})
    assert response.status_code == 400
