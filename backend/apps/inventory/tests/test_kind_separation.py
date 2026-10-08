from __future__ import annotations

from decimal import Decimal

import pytest

from apps.accounting.tests.helpers import seed_chart_of_accounts
from apps.accounts.constants import UserRole
from apps.accounts.tests.helpers import create_user
from apps.catalog.factories import CategoryFactory, ProductVariantFactory
from apps.catalog.models import Category, Product
from apps.common.exceptions import BusinessRuleViolationError
from apps.inventory.constants import MovementType
from apps.inventory.models import StockLedgerEntry
from apps.inventory.selectors.stock import stock_items_list
from apps.inventory.services.stock import (
    post_adjustment,
    post_bulk_adjustments,
    record_movement,
    stock_intake,
    write_off_stock,
)

pytestmark = pytest.mark.django_db

BASE = "/api/v1/admin/inventory/"
STOCK = Category.CategoryType.STOCK
PREORDER = Category.CategoryType.PREORDER


@pytest.fixture(autouse=True)
def _chart_of_accounts(db):
    seed_chart_of_accounts()


@pytest.fixture
def admin_client(api_client):
    api_client.force_authenticate(
        user=create_user(email="stock-separation-admin@example.com", role=UserRole.ADMIN)
    )
    return api_client


def _variant(kind, quantity=5):
    variant = ProductVariantFactory(product__category__category_type=kind)
    if quantity:
        record_movement(
            variant=variant,
            movement_type=MovementType.PURCHASE_IN,
            quantity=quantity,
            unit_cost=Decimal("5.00"),
        )
    return variant


WRITES = {
    "adjustment": lambda variant, kind: post_adjustment(
        variant=variant, quantity_delta=1, unit_cost=Decimal("5.00"), kind=kind
    ),
    "bulk": lambda variant, kind: post_bulk_adjustments(
        items=[{"variant_id": variant.id, "quantity_delta": 1, "unit_cost": Decimal("5.00")}],
        kind=kind,
    ),
    "write_off": lambda variant, kind: write_off_stock(variant=variant, quantity=1, kind=kind),
    "intake": lambda variant, kind: stock_intake(
        variant=variant, quantity=1, unit_cost=Decimal("5.00"), kind=kind
    ),
}


@pytest.mark.parametrize("write", WRITES)
@pytest.mark.parametrize(("variant_kind", "asked"), [(PREORDER, STOCK), (STOCK, PREORDER)])
def test_stock_writes_refuse_a_variant_of_the_other_kind(write, variant_kind, asked):
    variant = _variant(variant_kind)
    before = StockLedgerEntry.objects.count()

    with pytest.raises(BusinessRuleViolationError) as exc:
        WRITES[write](variant, asked)

    assert exc.value.code == "stock_kind_mismatch"
    assert StockLedgerEntry.objects.count() == before


@pytest.mark.parametrize("write", WRITES)
@pytest.mark.parametrize("asked", [PREORDER, None])
def test_stock_writes_accept_the_same_kind_or_no_kind(write, asked):
    variant = _variant(PREORDER)
    before = StockLedgerEntry.objects.count()

    WRITES[write](variant, asked)

    assert StockLedgerEntry.objects.count() == before + 1


@pytest.mark.parametrize(
    ("path", "body"),
    [
        ("adjustments/", {"quantity_delta": 1}),
        ("write-offs/", {"quantity": 1}),
        ("intake/", {"quantity": 1}),
    ],
)
def test_write_endpoints_pass_kind_to_the_service(admin_client, path, body):
    variant = _variant(PREORDER)

    response = admin_client.post(
        f"{BASE}{path}", {**body, "variant_id": str(variant.id), "kind": "stock"}, format="json"
    )

    assert response.status_code == 400, response.data
    assert response.data["error"]["code"] == "stock_kind_mismatch"


def test_bulk_adjustment_endpoint_takes_one_kind_for_the_batch(admin_client):
    variant = _variant(PREORDER)

    response = admin_client.post(
        f"{BASE}adjustments/bulk/",
        {"kind": "stock", "adjustments": [{"variant_id": str(variant.id), "quantity_delta": 1}]},
        format="json",
    )

    assert response.status_code == 400, response.data
    assert response.data["error"]["code"] == "stock_kind_mismatch"


def test_lookup_answers_not_found_for_the_other_kind(admin_client):
    variant = _variant(PREORDER)

    other = admin_client.get(f"{BASE}lookup/", {"q": variant.sku, "kind": "stock"})
    same = admin_client.get(f"{BASE}lookup/", {"q": variant.sku, "kind": "preorder"})
    unsaid = admin_client.get(f"{BASE}lookup/", {"q": variant.sku})

    assert other.data["data"]["found"] is False
    assert same.data["data"]["found"] is True
    assert unsaid.data["data"]["found"] is True
    assert admin_client.get(f"{BASE}lookup/", {"q": "x", "kind": "mixed"}).status_code == 400


def test_quick_product_refuses_a_preorder_category(admin_client):
    category = CategoryFactory(category_type=PREORDER)

    response = admin_client.post(
        f"{BASE}quick-products/",
        {"category_id": str(category.id), "name": "Quick", "sku": "QUICK-1", "price": "10.00"},
        format="json",
    )

    assert response.status_code == 400, response.data
    assert response.data["error"]["code"] == "stock_kind_mismatch"
    assert not Product.objects.filter(name="Quick").exists()


def test_low_stock_is_a_stock_only_idea():
    stock = _variant(STOCK, quantity=1)
    preorder = _variant(PREORDER, quantity=1)
    write_off_stock(variant=stock, quantity=1)
    write_off_stock(variant=preorder, quantity=1)

    def low(kind=None):
        return {item.variant_id for item in stock_items_list(low_stock_only=True, kind=kind)}

    assert low() == {stock.id}
    assert low(STOCK) == {stock.id}
    assert low(PREORDER) == set()
