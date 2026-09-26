from __future__ import annotations

from datetime import timedelta
from decimal import Decimal

import pytest

from apps.accounts.constants import UserRole
from apps.accounts.tests.helpers import create_address, create_user
from apps.catalog.factories import CategoryFactory, ProductFactory, ProductVariantFactory
from apps.inventory.factories import StockItemFactory
from apps.orders.factories import PaymentFactory, SalesOrderFactory, SalesOrderLineFactory
from apps.orders.models import Payment, SalesOrder

pytestmark = pytest.mark.django_db


def _seeded_dashboard_data() -> dict:
    category = CategoryFactory(name="Audio")
    product = ProductFactory(name="Headphones", category=category)
    variant = ProductVariantFactory(product=product, sku="SKU-ALPHA")
    StockItemFactory(variant=variant, quantity_on_hand=3, reorder_point=10)

    customer = create_user(email="dash-customer@example.com")
    address = create_address(user=customer)
    order = SalesOrderFactory(
        customer=customer,
        status=SalesOrder.Status.DELIVERED,
        shipping_address=address,
    )
    SalesOrderLineFactory(
        order=order,
        variant=variant,
        quantity=2,
        unit_price=Decimal("25.00"),
    )
    order.recalculate_totals()
    PaymentFactory(
        order=order,
        amount=Decimal("50.00"),
        method="card",
        status=Payment.Status.CAPTURED,
    )

    return {"order": order, "variant": variant}


def test_customer_cannot_access_dashboard(api_client):
    customer = create_user(email="dash-customer@example.com")
    api_client.force_authenticate(user=customer)

    response = api_client.get(
        "/api/v1/admin/reporting/dashboard/", {"start": "2026-01-01", "end": "2026-12-31"}
    )

    assert response.status_code == 403


def test_dashboard_endpoint_returns_all_datasets(api_client):
    seeded = _seeded_dashboard_data()
    admin = create_user(email="dash-admin@example.com", role=UserRole.ADMIN)
    api_client.force_authenticate(user=admin)

    from django.utils import timezone

    end = timezone.now().date()
    start = end - timedelta(days=29)

    response = api_client.get(
        "/api/v1/admin/reporting/dashboard/", {"start": start.isoformat(), "end": end.isoformat()}
    )

    assert response.status_code == 200
    data = response.data["data"]
    assert data["kpis"]
    assert data["revenue"]
    assert data["categories"]
    assert data["orders"]
    assert data["top_products"]
    assert data["inventory"]
    assert data["segments"]
    assert data["fulfillment"]
    assert data["ticker"]

    revenue_kpi = next(kpi for kpi in data["kpis"] if kpi["label"] == "Revenue")
    assert revenue_kpi["value"] == 50.0
    assert revenue_kpi["unit"] == "currency"
    assert revenue_kpi["delta_pct"] is None
    assert revenue_kpi["sign"] == "flat"

    orders_kpi = next(kpi for kpi in data["kpis"] if kpi["label"] == "Orders")
    assert orders_kpi["unit"] == "count"
    assert orders_kpi["value"] == 1

    turnover_kpi = next(kpi for kpi in data["kpis"] if kpi["label"] == "Stock Turnover")
    assert turnover_kpi["unit"] == "ratio"

    assert not any("$" in str(kpi["value"]) for kpi in data["kpis"])

    category = next(cat for cat in data["categories"] if cat["name"] == "Audio")
    assert category["pct"] == 100.0

    order_row = data["orders"][0]
    assert order_row["id"] == seeded["order"].order_number
    assert str(order_row["order_id"]) == str(seeded["order"].id)
    assert order_row["status"] == "Fulfilled"
    assert order_row["payment_method"] == "card"
    assert order_row["region"] == "San Francisco"
    assert order_row["customer"]["name"]
    assert order_row["items"][0]["sku"] == "SKU-ALPHA"

    top_product = data["top_products"][0]
    assert top_product["sku"] == "SKU-ALPHA"
    assert top_product["units"] == 2
    assert top_product["stock"] == 3

    alert = data["inventory"][0]
    assert alert["sku"] == "SKU-ALPHA"
    assert alert["level"] == "critical"

    assert data["low_stock"] == {"total": 1, "critical": 1}
    low_stock_kpi = next(kpi for kpi in data["kpis"] if kpi["label"] == "Low Stock")
    assert low_stock_kpi["value"] == data["low_stock"]["total"]

    segment = next(seg for seg in data["segments"] if seg["name"] == "Active")
    assert segment["count"] == 1

    delivered_metric = next(
        metric for metric in data["fulfillment"] if metric["label"] == "Delivered"
    )
    assert delivered_metric["value"] == 1
    assert delivered_metric["delta_pct"] is None

    revenue_ticker = data["ticker"][0]
    assert revenue_ticker["label"] == "Revenue"
    assert revenue_ticker["value"] == 50.0
    assert revenue_ticker["unit"] == "currency"
    assert revenue_ticker["dir"] in {"up", "down", "flat"}


def test_dashboard_deltas_are_numeric_against_a_prior_window(api_client):
    from django.utils import timezone

    admin = create_user(email="dash-delta-admin@example.com", role=UserRole.ADMIN)
    api_client.force_authenticate(user=admin)

    customer = create_user(email="dash-delta-customer@example.com")
    variant = ProductVariantFactory(sku="SKU-DELTA")
    today = timezone.now()
    for offset, quantity in ((0, 4), (7, 2)):
        order = SalesOrderFactory(customer=customer, status=SalesOrder.Status.DELIVERED)
        SalesOrderLineFactory(
            order=order,
            variant=variant,
            quantity=quantity,
            unit_price=Decimal("25.00"),
        )
        order.recalculate_totals()
        SalesOrder.objects.filter(pk=order.pk).update(created_at=today - timedelta(days=offset))

    end = today.date()
    start = end - timedelta(days=4)
    response = api_client.get(
        "/api/v1/admin/reporting/dashboard/", {"start": start.isoformat(), "end": end.isoformat()}
    )

    assert response.status_code == 200
    revenue_kpi = next(kpi for kpi in response.data["data"]["kpis"] if kpi["label"] == "Revenue")
    assert revenue_kpi["delta_pct"] == pytest.approx(100.0)
    assert revenue_kpi["sign"] == "up"
    assert revenue_kpi["good"] is True

    ticker = {item["label"]: item["dir"] for item in response.data["data"]["ticker"]}
    assert ticker["Revenue"] == "up"
    assert ticker["Low stock"] == "flat"
    assert ticker["Delivered"] == "flat"


def test_ticker_directions_are_flat_without_a_prior_window(api_client):
    from django.utils import timezone

    admin = create_user(email="dash-flat-admin@example.com", role=UserRole.ADMIN)
    api_client.force_authenticate(user=admin)

    customer = create_user(email="dash-flat-customer@example.com")
    variant = ProductVariantFactory(sku="SKU-FLAT")
    StockItemFactory(variant=variant, quantity_on_hand=0, reorder_point=10)
    order = SalesOrderFactory(customer=customer, status=SalesOrder.Status.DELIVERED)
    SalesOrderLineFactory(
        order=order,
        variant=variant,
        quantity=3,
        unit_price=Decimal("25.00"),
    )
    order.recalculate_totals()

    end = timezone.now().date()
    start = end - timedelta(days=6)
    response = api_client.get(
        "/api/v1/admin/reporting/dashboard/", {"start": start.isoformat(), "end": end.isoformat()}
    )

    assert response.status_code == 200
    ticker = response.data["data"]["ticker"]
    assert [item["dir"] for item in ticker] == ["flat"] * 5
    assert next(item for item in ticker if item["label"] == "Low stock")["value"] == 1
    assert all(kpi["delta_pct"] is None for kpi in response.data["data"]["kpis"])
