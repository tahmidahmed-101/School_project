"""Order history serializes each order's coupon and shipments (with carrier
name); the selector used to prefetch only lines, so every order added queries."""

from __future__ import annotations

import pytest
from django.db import connection
from django.test.utils import CaptureQueriesContext

from apps.orders.factories import (
    CouponFactory,
    SalesOrderFactory,
    SalesOrderLineFactory,
    ShipmentFactory,
)
from apps.orders.models import SalesOrder

pytestmark = pytest.mark.django_db


def _orders(customer, count: int) -> None:
    for _ in range(count):
        order = SalesOrderFactory(
            customer=customer, status=SalesOrder.Status.SHIPPED, coupon=CouponFactory()
        )
        SalesOrderLineFactory(order=order)
        ShipmentFactory(order=order)


def test_order_history_query_count_does_not_grow_with_orders(api_client, customer_user):
    api_client.force_authenticate(user=customer_user)
    _orders(customer_user, 1)
    with CaptureQueriesContext(connection) as small:
        response = api_client.get("/api/v1/customer/orders/")
        assert response.status_code == 200

    _orders(customer_user, 5)
    with CaptureQueriesContext(connection) as large:
        response = api_client.get("/api/v1/customer/orders/")
        assert response.status_code == 200

    assert len(large) == len(small)
    first = response.data["data"]["results"][0]
    assert first["coupon_code"]
    assert first["shipments"][0]["carrier_name"]
    # The history names each line's product (for the storefront's "My orders"),
    # which must come from the prefetch too, not a query per line.
    assert first["created_at"]
    line = first["lines"][0]
    assert line["product_name"]
    assert line["product_slug"]
    assert line["product_id"]
    assert line["sku"]
