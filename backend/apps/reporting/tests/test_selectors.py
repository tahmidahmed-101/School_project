from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal

import pytest
from django.db import connection
from django.test.utils import CaptureQueriesContext

from apps.accounts.factories import CustomerUserFactory
from apps.catalog.factories import ProductVariantFactory
from apps.inventory.constants import MovementType
from apps.inventory.factories import StockItemFactory
from apps.inventory.services.stock import record_movement
from apps.orders.factories import PaymentFactory, SalesOrderFactory, SalesOrderLineFactory
from apps.orders.models import SalesOrder
from apps.orders.services.carts import add_line, get_or_create_cart
from apps.orders.services.checkout import checkout
from apps.orders.services.payments import capture_payment
from apps.orders.services.shipments import create_shipment
from apps.reporting.selectors.dashboards import (
    inventory_alerts,
    kpis,
    low_stock_counts,
    low_stock_summary,
    recent_orders,
    revenue_series,
    sales_trend,
    stock_turnover,
)

pytestmark = pytest.mark.django_db


def test_sales_trend_sums_confirmed_orders_by_day():
    customer = CustomerUserFactory()
    variant = ProductVariantFactory(price=Decimal("20.00"))
    record_movement(
        variant=variant,
        movement_type=MovementType.PURCHASE_IN,
        quantity=10,
        unit_cost=Decimal("5.00"),
    )

    cart = get_or_create_cart(customer)
    add_line(order=cart, variant=variant, quantity=2)
    checkout(order=cart)
    capture_payment(order=cart, amount=cart.grand_total)

    today = date.today()
    trend = sales_trend(start=today - timedelta(days=1), end=today + timedelta(days=1))

    assert any(point["total"] == Decimal("40.00") for point in trend)


def test_sales_trend_excludes_an_order_still_awaiting_payment():
    """Checkout reserves stock and moves the order out of PENDING, but the
    customer hasn't paid yet — grand_total must not show up as revenue until
    capture_payment actually confirms the order."""
    customer = CustomerUserFactory()
    variant = ProductVariantFactory(price=Decimal("20.00"))
    record_movement(
        variant=variant,
        movement_type=MovementType.PURCHASE_IN,
        quantity=10,
        unit_cost=Decimal("5.00"),
    )

    cart = get_or_create_cart(customer)
    add_line(order=cart, variant=variant, quantity=2)
    checkout(order=cart)
    assert cart.status == SalesOrder.Status.AWAITING_PAYMENT

    today = date.today()
    trend = sales_trend(start=today - timedelta(days=1), end=today + timedelta(days=1))

    assert all(point["total"] == Decimal("0") for point in trend)


def test_sales_trend_zero_fills_days_without_orders():
    today = date.today()
    start = today - timedelta(days=3)

    trend = sales_trend(start=start, end=today)

    assert [point["date"] for point in trend] == [start + timedelta(days=i) for i in range(4)]
    assert all(point["total"] == Decimal("0") for point in trend)


def test_stock_turnover_uses_posted_cogs_over_inventory_value():
    customer = CustomerUserFactory()
    variant = ProductVariantFactory(price=Decimal("20.00"))
    record_movement(
        variant=variant,
        movement_type=MovementType.PURCHASE_IN,
        quantity=10,
        unit_cost=Decimal("5.00"),
    )

    cart = get_or_create_cart(customer)
    add_line(order=cart, variant=variant, quantity=4)
    checkout(order=cart)
    capture_payment(order=cart, amount=cart.grand_total)
    order_line = cart.lines.get()
    create_shipment(order=cart, lines=[{"order_line": order_line, "quantity": 4}])

    today = date.today()
    turnover = stock_turnover(start=today - timedelta(days=1), end=today + timedelta(days=1))

    assert turnover > 0


def test_low_stock_summary_only_returns_items_below_reorder_point():
    below = StockItemFactory(quantity_on_hand=2, quantity_reserved=0, reorder_point=5)
    StockItemFactory(quantity_on_hand=50, quantity_reserved=0, reorder_point=5)

    results = list(low_stock_summary())

    assert below in results
    assert len(results) == 1


def _seed_dashboard_orders(count: int) -> None:
    customer = CustomerUserFactory()
    for _ in range(count):
        variant = ProductVariantFactory(price=Decimal("20.00"))
        order = SalesOrderFactory(customer=customer, status=SalesOrder.Status.DELIVERED)
        SalesOrderLineFactory(order=order, variant=variant, quantity=1, unit_price=Decimal("20"))
        PaymentFactory(order=order, amount=Decimal("20.00"), method="card")


def test_recent_orders_query_count_does_not_grow_with_the_number_of_orders():
    today = date.today()
    window = {"start": today - timedelta(days=1), "end": today + timedelta(days=1)}

    _seed_dashboard_orders(2)
    with CaptureQueriesContext(connection) as small:
        rows = recent_orders(**window)
    assert len(rows) == 2

    _seed_dashboard_orders(4)
    with CaptureQueriesContext(connection) as large:
        rows = recent_orders(**window)
    assert len(rows) == 6

    assert len(large.captured_queries) == len(small.captured_queries)


def test_recent_orders_exposes_both_the_order_number_and_the_uuid():
    _seed_dashboard_orders(1)
    today = date.today()

    row = recent_orders(start=today - timedelta(days=1), end=today + timedelta(days=1))[0]
    order = SalesOrder.objects.get(order_number=row["id"])

    assert row["order_id"] == str(order.id)
    assert row["id"] != row["order_id"]


def test_recent_orders_does_not_invent_a_payment_method_for_an_awaiting_payment_order():
    """An order that cleared checkout but has no captured payment must not
    be shown with a fabricated payment method — there is nothing to report."""
    customer = CustomerUserFactory()
    variant = ProductVariantFactory(price=Decimal("20.00"))
    order = SalesOrderFactory(customer=customer, status=SalesOrder.Status.AWAITING_PAYMENT)
    SalesOrderLineFactory(order=order, variant=variant, quantity=1, unit_price=Decimal("20"))
    today = date.today()

    row = recent_orders(start=today - timedelta(days=1), end=today + timedelta(days=1))[0]

    assert row["payment_method"] == "—"
    assert row["status"] == "Awaiting payment"


def test_recent_orders_shows_the_real_payment_method_for_a_paid_order():
    customer = CustomerUserFactory()
    variant = ProductVariantFactory(price=Decimal("20.00"))
    order = SalesOrderFactory(customer=customer, status=SalesOrder.Status.CONFIRMED)
    SalesOrderLineFactory(order=order, variant=variant, quantity=1, unit_price=Decimal("20"))
    PaymentFactory(order=order, amount=Decimal("20.00"), method="bkash")
    today = date.today()

    row = recent_orders(start=today - timedelta(days=1), end=today + timedelta(days=1))[0]

    assert row["payment_method"] == "bkash"
    assert row["status"] == "Processing"


def test_low_stock_counts_are_authoritative_beyond_the_inventory_alert_limit():
    for _ in range(9):
        StockItemFactory(quantity_on_hand=0, quantity_reserved=0, reorder_point=10)
    for _ in range(2):
        StockItemFactory(quantity_on_hand=9, quantity_reserved=0, reorder_point=10)

    assert len(inventory_alerts()) == 8
    assert low_stock_counts() == {"total": 11, "critical": 9}


def test_low_stock_level_is_critical_at_or_below_half_the_reorder_point():
    StockItemFactory(quantity_on_hand=5, quantity_reserved=0, reorder_point=10)
    StockItemFactory(quantity_on_hand=6, quantity_reserved=0, reorder_point=10)

    levels = {row["stock"]: row["level"] for row in inventory_alerts()}

    assert levels == {5: "critical", 6: "low"}


def test_order_count_and_revenue_share_one_order_population():
    today = date.today()
    window = {"start": today - timedelta(days=1), "end": today + timedelta(days=1)}

    real = [
        SalesOrderFactory(status=SalesOrder.Status.CONFIRMED, grand_total=Decimal("300.00")),
        SalesOrderFactory(status=SalesOrder.Status.DELIVERED, grand_total=Decimal("200.00")),
    ]
    SalesOrderFactory(status=SalesOrder.Status.PENDING, grand_total=Decimal("999.00"))
    SalesOrderFactory(status=SalesOrder.Status.PENDING, grand_total=Decimal("999.00"))
    SalesOrderFactory(status=SalesOrder.Status.CANCELLED, grand_total=Decimal("999.00"))

    expected_revenue = sum((order.grand_total for order in real), Decimal("0"))
    revenue = sum((row["total"] for row in sales_trend(**window)), Decimal("0"))
    orders_kpi = next(kpi for kpi in kpis(**window) if kpi["label"] == "Orders")

    assert revenue == expected_revenue
    assert orders_kpi["value"] == len(real)
    assert sum(orders_kpi["spark"]) == float(len(real))
    # The frontend divides one by the other for AOV, so a mismatched population
    # would silently produce an average nobody can reconcile.
    assert revenue / orders_kpi["value"] == Decimal("250.00")


def test_revenue_series_previous_matches_the_previous_window_the_kpi_compares_with():
    today = date.today()
    start, end = today - timedelta(days=6), today
    inside_previous = SalesOrderFactory(
        status=SalesOrder.Status.CONFIRMED, grand_total=Decimal("400.00")
    )
    SalesOrder.objects.filter(pk=inside_previous.pk).update(
        created_at=inside_previous.created_at - timedelta(days=10)
    )
    SalesOrderFactory(status=SalesOrder.Status.CONFIRMED, grand_total=Decimal("100.00"))

    series = revenue_series(start=start, end=end)
    revenue_kpi = next(kpi for kpi in kpis(start=start, end=end) if kpi["label"] == "Revenue")

    assert sum(point["previous"] for point in series) == 400.0
    assert revenue_kpi["delta_pct"] == -75.0
