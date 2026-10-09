from __future__ import annotations

import csv
from datetime import timedelta
from decimal import Decimal
from io import StringIO

import pytest
from django.utils import timezone

from apps.accounts.constants import UserRole
from apps.accounts.tests.helpers import create_user
from apps.catalog.factories import CategoryFactory, ProductFactory, ProductVariantFactory
from apps.catalog.models import Category, Product
from apps.catalog.selectors.products import products_list, variants_list
from apps.catalog.services.products import delete_product, update_product
from apps.catalog.services.variant_import_export import (
    EXPORT_COLUMNS,
    PREORDER_EXPORT_COLUMNS,
    export_variants,
)
from apps.common.exceptions import BusinessRuleViolationError
from apps.inventory.factories import StockItemFactory

pytestmark = pytest.mark.django_db

BASE = "/api/v1/admin/catalog/"
STOCK = Category.CategoryType.STOCK
PREORDER = Category.CategoryType.PREORDER


@pytest.fixture
def admin_client(api_client):
    api_client.force_authenticate(
        user=create_user(email="catalog-separation-admin@example.com", role=UserRole.ADMIN)
    )
    return api_client


def _window(*, opens_in_days=-1, closes_in_days=10) -> dict:
    now = timezone.now()
    return {
        "is_preorder_enabled": True,
        "preorder_start_date": now + timedelta(days=opens_in_days),
        "preorder_end_date": now + timedelta(days=closes_in_days),
    }


def _variant(kind, **fields):
    return ProductVariantFactory(
        product=ProductFactory(category__category_type=kind), price=Decimal("100.00"), **fields
    )


def _refused(code, call, **kwargs):
    with pytest.raises(BusinessRuleViolationError) as excinfo:
        call(**kwargs)
    assert excinfo.value.code == code


def test_product_wide_discount_is_refused_on_a_preorder_product():
    variant = _variant(PREORDER, **_window())

    _refused(
        "stock_field_on_preorder",
        update_product,
        product=variant.product,
        data={"discount_price": Decimal("50.00")},
    )

    variant.refresh_from_db()
    assert variant.discount_price is None


def test_product_wide_discount_still_fans_out_on_a_stock_product():
    variant = _variant(STOCK)

    update_product(product=variant.product, data={"discount_price": Decimal("50.00")})

    variant.refresh_from_db()
    assert variant.discount_price == Decimal("50.00")


@pytest.mark.parametrize(("from_kind", "to_kind"), [(STOCK, PREORDER), (PREORDER, STOCK)])
@pytest.mark.parametrize("with_variant", [True, False])
def test_a_product_never_moves_to_a_category_of_the_other_kind(from_kind, to_kind, with_variant):
    product = ProductFactory(category__category_type=from_kind)
    if with_variant:
        ProductVariantFactory(product=product)
    original = product.category_id

    _refused(
        "category_kind_mismatch",
        update_product,
        product=product,
        data={"category": CategoryFactory(category_type=to_kind)},
    )

    product.refresh_from_db()
    assert product.category_id == original


def test_a_product_can_move_within_its_kind():
    product = ProductFactory(category__category_type=PREORDER)
    target = CategoryFactory(category_type=PREORDER)

    update_product(product=product, data={"category": target})

    product.refresh_from_db()
    assert product.category_id == target.id


def test_bulk_status_is_scoped_to_one_kind(admin_client):
    stock = ProductFactory(category__category_type=STOCK, is_active=True)
    preorder = ProductFactory(category__category_type=PREORDER, is_active=True)

    response = admin_client.post(
        f"{BASE}products/bulk-status/",
        {"ids": [str(stock.id), str(preorder.id)], "is_active": False, "category_type": "stock"},
        format="json",
    )

    assert response.status_code == 200, response.data
    assert response.data["data"] == {"affected": 1}
    assert Product.objects.get(id=stock.id).is_active is False
    assert Product.objects.get(id=preorder.id).is_active is True


def test_bulk_status_refuses_an_unknown_kind(admin_client):
    product = ProductFactory()

    response = admin_client.post(
        f"{BASE}products/bulk-status/",
        {"ids": [str(product.id)], "is_active": False, "category_type": "mixed"},
        format="json",
    )

    assert response.status_code == 400


def test_preorder_filters_never_return_a_stock_product():
    legacy_stock = _variant(STOCK, **_window())
    open_preorder = _variant(PREORDER, **_window())
    closed_preorder = _variant(PREORDER, **_window(opens_in_days=-30, closes_in_days=-1))

    def product_ids(**filters):
        return {p.id for p in products_list(is_active=None, **filters)}

    def variant_ids(**filters):
        return {v.id for v in variants_list(**filters)}

    assert product_ids(preorder_only=True, preorder_active_only=False) == {
        open_preorder.product_id,
        closed_preorder.product_id,
    }
    assert product_ids(preorder_status="active") == {open_preorder.product_id}
    assert product_ids(preorder_status="inactive") == {closed_preorder.product_id}
    assert product_ids(preorder_only=True, category_type=STOCK) == set()
    assert variant_ids(preorder_only=True, preorder_active_only=False) == {
        open_preorder.id,
        closed_preorder.id,
    }
    assert variant_ids(preorder_status="active") == {open_preorder.id}
    assert variant_ids(preorder_status="inactive") == {closed_preorder.id}
    assert legacy_stock.id not in variant_ids(preorder_only=True)


def _export(kind=None):
    from apps.catalog.models import ProductVariant

    content = export_variants(ProductVariant.objects.all(), fmt="csv", kind=kind)
    return list(csv.reader(StringIO(content.decode("utf-8-sig"))))


def test_variant_export_has_one_column_set_per_kind():
    stock = _variant(STOCK, barcode="111", discount_price=Decimal("90.00"))
    release = timezone.now() + timedelta(days=20)
    preorder = _variant(
        PREORDER,
        **_window(),
        preorder_price=Decimal("80.00"),
        release_date=release,
        preorder_stock_limit=7,
    )

    stock_rows = _export(STOCK)
    preorder_rows = _export(PREORDER)

    assert stock_rows[0] == EXPORT_COLUMNS
    assert [row[1] for row in stock_rows[1:]] == [stock.sku]
    assert preorder_rows[0] == PREORDER_EXPORT_COLUMNS
    assert not {"barcode", "discount_price", "wholesale_price", "stock"} & set(preorder_rows[0])
    row = dict(zip(preorder_rows[0], preorder_rows[1], strict=True))
    assert row["sku"] == preorder.sku
    assert row["preorder_price"] == "80.00"
    assert row["preorder_start_date"] == preorder.preorder_start_date.isoformat()
    assert row["preorder_end_date"] == preorder.preorder_end_date.isoformat()
    assert row["release_date"] == release.isoformat()
    assert row["preorder_stock_limit"] == "7"
    assert _export() == stock_rows


def _variant_row(client, variant):
    response = client.get(f"{BASE}variants/", {"product_id": str(variant.product_id)})
    assert response.status_code == 200, response.data
    (row,) = response.data["data"]["results"]
    return row


def test_a_stock_variant_row_carries_no_preorder_values(admin_client):
    variant = _variant(STOCK, **_window(), preorder_price=Decimal("80.00"), preorder_stock_limit=5)

    row = _variant_row(admin_client, variant)

    assert row["category_type"] == STOCK
    assert row["is_preorder_enabled"] is False
    assert row["is_preorder_active"] is False
    assert row["can_preorder"] is False
    assert row["is_preorder_price_applied"] is False
    for field in (
        "preorder_price",
        "preorder_start_date",
        "preorder_end_date",
        "release_date",
        "preorder_stock_limit",
    ):
        assert row[field] is None
    assert row["effective_price"] == "100.00"


def test_a_preorder_variant_row_carries_no_stock_only_values(admin_client):
    variant = _variant(
        PREORDER,
        **_window(),
        barcode="999",
        discount_price=Decimal("90.00"),
        wholesale_price=Decimal("70.00"),
        show_wholesale_price=True,
    )
    StockItemFactory(variant=variant, quantity_on_hand=0, reorder_point=5)

    row = _variant_row(admin_client, variant)

    assert row["category_type"] == PREORDER
    assert row["is_preorder_enabled"] is True
    assert row["barcode"] == ""
    assert row["discount_price"] is None
    assert row["wholesale_price"] is None
    assert row["show_wholesale_price"] is False
    assert row["is_low_stock"] is False


def test_low_stock_filter_never_returns_a_preorder_variant(admin_client):
    stock = _variant(STOCK)
    preorder = _variant(PREORDER, **_window())
    StockItemFactory(variant=stock, quantity_on_hand=1, reorder_point=5)
    StockItemFactory(variant=preorder, quantity_on_hand=1, reorder_point=5)

    response = admin_client.get(f"{BASE}variants/", {"stock_status": "low"})

    assert [row["id"] for row in response.data["data"]["results"]] == [str(stock.id)]


def test_product_rows_carry_category_type_and_no_discount_for_a_preorder(admin_client):
    stock = _variant(STOCK, discount_price=Decimal("90.00"))
    preorder = _variant(PREORDER, **_window(), discount_price=Decimal("90.00"))

    stock_row = admin_client.get(f"{BASE}products/{stock.product_id}/").data["data"]
    preorder_row = admin_client.get(f"{BASE}products/{preorder.product_id}/").data["data"]

    assert (stock_row["category_type"], stock_row["discount_price"]) == (STOCK, "90.00")
    assert (preorder_row["category_type"], preorder_row["discount_price"]) == (PREORDER, None)


def test_a_preorder_product_row_carries_no_stock_total(admin_client):
    stock = _variant(STOCK)
    preorder = _variant(PREORDER, **_window())
    StockItemFactory(variant=stock, quantity_on_hand=4)
    StockItemFactory(variant=preorder, quantity_on_hand=4)

    stock_row = admin_client.get(f"{BASE}products/{stock.product_id}/").data["data"]
    preorder_row = admin_client.get(f"{BASE}products/{preorder.product_id}/").data["data"]
    listed = admin_client.get(f"{BASE}products/", {"category_type": PREORDER}).data["data"]

    assert stock_row["total_stock"] == 4
    assert preorder_row["total_stock"] is None
    assert [row["total_stock"] for row in listed["results"]] == [None]
    assert preorder_row["variants"][0]["stock"] == 4


def test_deleting_a_preorder_product_with_goods_does_not_talk_about_stock_screens():
    variant = _variant(PREORDER, **_window())
    StockItemFactory(variant=variant, quantity_on_hand=2)

    with pytest.raises(BusinessRuleViolationError) as excinfo:
        delete_product(product=variant.product)

    assert excinfo.value.code == "product_stock_in_use"
    assert "Inventory" not in excinfo.value.message
    assert "received goods" in excinfo.value.message


def test_public_variant_tells_the_storefront_a_closed_preorder_is_not_in_stock(api_client):
    closed = _variant(PREORDER, **_window(opens_in_days=-30, closes_in_days=-1))
    StockItemFactory(variant=closed, quantity_on_hand=4)

    response = api_client.get(f"/api/v1/public/catalog/products/{closed.product.slug}/")

    assert response.status_code == 200, response.data
    (row,) = response.data["data"]["variants"]
    assert row["is_preorder_closed"] is True
    assert row["is_preorder_active"] is False
    assert row["in_stock"] is False


def test_a_leftover_discount_price_is_not_charged_on_a_preorder_item():
    variant = ProductVariantFactory(
        product__category__category_type="preorder", price=Decimal("100.00")
    )
    type(variant).objects.filter(pk=variant.pk).update(discount_price=Decimal("60.00"))
    variant.refresh_from_db()

    assert variant.effective_price == Decimal("100.00")
