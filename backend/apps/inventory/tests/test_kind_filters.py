from __future__ import annotations

from decimal import Decimal

import pytest

from apps.accounts.constants import UserRole
from apps.accounts.tests.helpers import create_user
from apps.catalog.factories import ProductVariantFactory
from apps.catalog.models import Category
from apps.common.exceptions import BusinessRuleViolationError
from apps.inventory.constants import MovementType
from apps.inventory.models import StockItem
from apps.inventory.services.stock import (
    materialize_stock_items,
    record_movement,
    set_stock_levels,
)

pytestmark = pytest.mark.django_db

BASE = "/api/v1/admin/inventory/"


@pytest.fixture
def admin_client(api_client):
    api_client.force_authenticate(
        user=create_user(email="stock-kind-admin@example.com", role=UserRole.ADMIN)
    )
    return api_client


def _variant(kind, quantity):
    variant = ProductVariantFactory(product__category__category_type=kind)
    record_movement(
        variant=variant,
        movement_type=MovementType.PURCHASE_IN,
        quantity=quantity,
        unit_cost=Decimal("5.00"),
    )
    return variant


@pytest.fixture
def variants():
    return {
        "stock": _variant(Category.CategoryType.STOCK, 7),
        "preorder": _variant(Category.CategoryType.PREORDER, 3),
    }


def _rows(client, path, **params):
    response = client.get(f"{BASE}{path}", params)
    assert response.status_code == 200, response.data
    return response.data["data"]["results"]


@pytest.mark.parametrize("path", ["stock-items/", "ledger-entries/"])
def test_stock_lists_filter_by_the_variants_category_kind(admin_client, variants, path):
    assert len(_rows(admin_client, path)) == 2
    for kind, variant in variants.items():
        rows = _rows(admin_client, path, kind=kind)
        assert [row["variant_id"] for row in rows] == [str(variant.id)]


def test_stock_list_for_one_kind_still_shows_a_variant_with_no_stock_yet(admin_client):
    unstocked = ProductVariantFactory(
        product__category__category_type=Category.CategoryType.PREORDER
    )
    ProductVariantFactory()

    rows = _rows(admin_client, "stock-items/", kind="preorder")

    assert [(row["variant_id"], row["quantity_on_hand"]) for row in rows] == [
        (str(unstocked.id), 0)
    ]


def test_ledger_export_honours_kind(admin_client, variants):
    response = admin_client.get(f"{BASE}ledger-entries/export/", {"kind": "preorder"})

    assert response.status_code == 200
    body = response.content.decode()
    assert variants["preorder"].sku in body
    assert variants["stock"].sku not in body


def test_stock_status_counts_one_kind(admin_client, variants):
    def sellable(**params):
        response = admin_client.get(f"{BASE}stock-status/", params)
        assert response.status_code == 200, response.data
        return response.data["data"]["sellable"]

    assert sellable() == 10
    assert sellable(kind="stock") == 7
    assert sellable(kind="preorder") == 3


@pytest.mark.parametrize(
    "path", ["stock-items/", "ledger-entries/", "ledger-entries/export/", "stock-status/"]
)
def test_unknown_kind_is_a_400(admin_client, path):
    assert admin_client.get(f"{BASE}{path}", {"kind": "mixed"}).status_code == 400


def test_a_preorder_variants_stock_row_starts_without_reorder_levels(variants):
    preorder_item = StockItem.objects.get(variant=variants["preorder"])
    stock_item = StockItem.objects.get(variant=variants["stock"])

    assert (preorder_item.reorder_point, preorder_item.target_stock_level) == (0, 0)
    assert stock_item.reorder_point == 10


def test_materialized_preorder_rows_have_no_reorder_levels():
    variant = ProductVariantFactory(product__category__category_type=Category.CategoryType.PREORDER)

    materialize_stock_items(variant=variant)

    item = StockItem.objects.get(variant=variant)
    assert (item.reorder_point, item.target_stock_level) == (0, 0)


def test_reorder_levels_are_refused_on_a_preorder_stock_row(variants):
    item = StockItem.objects.get(variant=variants["preorder"])

    with pytest.raises(BusinessRuleViolationError) as excinfo:
        set_stock_levels(stock_item=item, reorder_point=5, target_stock_level=20)

    assert excinfo.value.code == "stock_field_on_preorder"
    item.refresh_from_db()
    assert (item.reorder_point, item.target_stock_level) == (0, 0)


def test_reorder_levels_are_saved_on_a_stock_row(variants):
    item = StockItem.objects.get(variant=variants["stock"])

    set_stock_levels(stock_item=item, reorder_point=5, target_stock_level=20)

    item.refresh_from_db()
    assert (item.reorder_point, item.target_stock_level) == (5, 20)
