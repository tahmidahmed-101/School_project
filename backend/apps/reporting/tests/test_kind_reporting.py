from __future__ import annotations

from decimal import Decimal

import pytest
from django.core.cache import cache
from django.utils import timezone

from apps.accounts.constants import UserRole
from apps.accounts.tests.helpers import create_user
from apps.catalog.factories import ProductVariantFactory
from apps.inventory.factories import StockItemFactory
from apps.orders.factories import PaymentFactory, SalesOrderFactory, SalesOrderLineFactory
from apps.orders.models import Payment, SalesOrder

pytestmark = pytest.mark.django_db

BASE = "/api/v1/admin/reporting/"
STOCK = SalesOrder.OrderType.STOCK
PREORDER = SalesOrder.OrderType.PREORDER


@pytest.fixture(autouse=True)
def _fresh_cache():
    cache.clear()


@pytest.fixture
def admin_client(api_client):
    api_client.force_authenticate(
        user=create_user(email="report-kind-admin@example.com", role=UserRole.ADMIN)
    )
    return api_client


def _sale(kind, *, category_name, quantity, unit_price, paid):
    variant = ProductVariantFactory(
        product__category__category_type=kind, product__category__name=category_name
    )
    StockItemFactory(variant=variant, quantity_on_hand=2, reorder_point=5)
    order = SalesOrderFactory(status=SalesOrder.Status.CONFIRMED, order_type=kind)
    SalesOrderLineFactory(
        order=order,
        variant=variant,
        quantity=quantity,
        unit_price=Decimal(unit_price),
        is_preorder=kind == PREORDER,
    )
    order.recalculate_totals()
    PaymentFactory(order=order, amount=Decimal(paid), status=Payment.Status.CAPTURED)
    return variant, order


@pytest.fixture
def sales():
    stock_variant, stock_order = _sale(
        STOCK, category_name="Shirts", quantity=2, unit_price="100.00", paid="200.00"
    )
    preorder_variant, preorder_order = _sale(
        PREORDER, category_name="Imports", quantity=1, unit_price="1000.00", paid="300.00"
    )
    return {
        STOCK: (stock_variant, stock_order),
        PREORDER: (preorder_variant, preorder_order),
    }


def _get(client, path, **params):
    today = timezone.now().date().isoformat()
    response = client.get(f"{BASE}{path}", {"start": today, "end": today, **params})
    assert response.status_code == 200, response.data
    return response.data["data"]


def _kpi(data, label):
    return next(kpi["value"] for kpi in data["kpis"] if kpi["label"] == label)


def test_dashboard_without_kind_covers_both_and_carries_the_preorder_book(admin_client, sales):
    data = _get(admin_client, "dashboard/")

    assert _kpi(data, "Orders") == 2
    assert {row["name"] for row in data["categories"]} == {"Shirts", "Imports"}
    preorder_total = sales[PREORDER][1].grand_total
    assert data["preorder"] == {
        "open_orders": 1,
        "deposits_held": "300.00",
        "balances_outstanding": f"{preorder_total - Decimal('300.00'):.2f}",
    }


@pytest.mark.parametrize(("kind", "category"), [(STOCK, "Shirts"), (PREORDER, "Imports")])
def test_dashboard_for_one_kind_shows_only_that_kind(admin_client, sales, kind, category):
    variant, order = sales[kind]

    data = _get(admin_client, "dashboard/", kind=kind)

    assert ("preorder" in data) == (kind == PREORDER)
    assert _kpi(data, "Orders") == 1
    assert _kpi(data, "Revenue") == float(order.grand_total)
    assert _kpi(data, "Low Stock") == 1
    assert [row["name"] for row in data["categories"]] == [category]
    assert [row["sku"] for row in data["top_products"]] == [variant.sku]
    assert [row["sku"] for row in data["inventory"]] == [variant.sku]
    assert [row["id"] for row in data["orders"]] == [order.order_number]
    assert data["low_stock"]["total"] == 1


def test_sales_trend_by_kind(admin_client, sales):
    def total(**params):
        [point] = _get(admin_client, "sales-trend/", **params)
        return Decimal(point["total"])

    stock_total = sales[STOCK][1].grand_total
    preorder_total = sales[PREORDER][1].grand_total
    assert total() == stock_total + preorder_total
    assert total(kind="stock") == stock_total
    assert total(kind="preorder") == preorder_total


def test_low_stock_by_kind(admin_client, sales):
    assert len(_get(admin_client, "low-stock/")) == 2
    for kind in (STOCK, PREORDER):
        rows = _get(admin_client, "low-stock/", kind=kind)
        assert [row["variant_sku"] for row in rows] == [sales[kind][0].sku]
    assert _get(admin_client, "low-stock/", kind="preorder", count_only="1") == {"count": 1}


def test_stock_turnover_takes_kind(admin_client, sales):
    for params in ({}, {"kind": "stock"}, {"kind": "preorder"}):
        assert "turnover_ratio" in _get(admin_client, "stock-turnover/", **params)


@pytest.mark.parametrize("path", ["dashboard/", "sales-trend/", "stock-turnover/", "low-stock/"])
def test_unknown_kind_is_a_400(admin_client, path):
    today = timezone.now().date().isoformat()

    response = admin_client.get(f"{BASE}{path}", {"start": today, "end": today, "kind": "mixed"})

    assert response.status_code == 400


def test_inventory_valuation_report_by_kind(admin_client):
    url = "/api/v1/admin/accounting/reports/inventory-valuation/"
    for kind, cost in ((STOCK, "10.00"), (PREORDER, "40.00")):
        StockItemFactory(
            variant=ProductVariantFactory(product__category__category_type=kind),
            quantity_on_hand=3,
            avg_cost=Decimal(cost),
        )

    def value(**params):
        response = admin_client.get(url, params)
        assert response.status_code == 200, response.data
        return Decimal(str(response.data["data"]["inventory_value"]))

    assert value() == Decimal("150")
    assert value(kind="stock") == Decimal("30")
    assert value(kind="preorder") == Decimal("120")
    assert admin_client.get(url, {"kind": "mixed"}).status_code == 400
