from __future__ import annotations

from decimal import Decimal

import pytest
from django.db import connection
from django.test.utils import CaptureQueriesContext

from apps.business.models import BusinessProfile
from apps.business.selectors.business_profile import get_business_profile
from apps.orders.factories import PaymentFactory, SalesOrderFactory, SalesOrderLineFactory
from apps.orders.models import SalesOrder

pytestmark = pytest.mark.django_db

HISTORY = "/api/v1/customer/orders/"
TRACK = "/api/v1/public/tracking/orders/track/"


def _order(customer, order_type, **fields):
    order = SalesOrderFactory(
        customer=customer,
        status=SalesOrder.Status.CONFIRMED,
        order_type=order_type,
        grand_total=Decimal("1000.00"),
        **fields,
    )
    SalesOrderLineFactory(order=order)
    return order


def test_history_lists_one_kind_when_asked(api_client, customer_user):
    api_client.force_authenticate(user=customer_user)
    stock = _order(customer_user, SalesOrder.OrderType.STOCK)
    preorder = _order(customer_user, SalesOrder.OrderType.PREORDER, preorder_stage="purchasing")
    PaymentFactory(order=preorder, amount=Decimal("300.00"))

    stock_rows = api_client.get(HISTORY, {"order_type": "stock"}).data["data"]["results"]
    preorder_rows = api_client.get(HISTORY, {"order_type": "preorder"}).data["data"]["results"]

    assert [row["id"] for row in stock_rows] == [str(stock.id)]
    assert [row["id"] for row in preorder_rows] == [str(preorder.id)]
    row = preorder_rows[0]
    assert row["order_type"] == "preorder"
    assert row["preorder_stage"] == "purchasing"
    assert row["paid_total"] == "300.00"
    assert row["balance_due"] == "700.00"


def test_history_refuses_an_unknown_order_type(api_client, customer_user):
    api_client.force_authenticate(user=customer_user)

    response = api_client.get(HISTORY, {"order_type": "both"})

    assert response.status_code == 400


def test_history_reads_payments_in_one_query(api_client, customer_user):
    api_client.force_authenticate(user=customer_user)
    for _ in range(3):
        PaymentFactory(order=_order(customer_user, SalesOrder.OrderType.PREORDER))

    with CaptureQueriesContext(connection) as queries:
        api_client.get(HISTORY, {"order_type": "preorder"})

    assert sum('FROM "orders_payment"' in query["sql"] for query in queries) == 1


def test_history_reads_the_deposit_percent_once(api_client, customer_user):
    api_client.force_authenticate(user=customer_user)
    profile = get_business_profile()
    profile.preorder_deposit_percent = Decimal("30.00")
    profile.save(update_fields=["preorder_deposit_percent"])
    for _ in range(3):
        _order(customer_user, SalesOrder.OrderType.PREORDER)

    with CaptureQueriesContext(connection) as queries:
        rows = api_client.get(HISTORY, {"order_type": "preorder"}).data["data"]["results"]

    assert sum(BusinessProfile._meta.db_table in query["sql"] for query in queries) == 1
    assert [row["deposit_due"] for row in rows] == ["300.00"] * 3


def test_tracking_tells_a_preorder_apart_and_shows_what_is_paid(api_client, customer_user):
    order = _order(customer_user, SalesOrder.OrderType.PREORDER, contact_phone="01711223344")
    PaymentFactory(order=order, amount=Decimal("300.00"))

    response = api_client.post(
        TRACK, {"order_number": order.order_number, "phone": "01711223344"}, format="json"
    )

    assert response.status_code == 200, response.data
    data = response.data["data"]
    assert data["order_type"] == "preorder"
    assert data["paid_total"] == "300.00"
    assert data["balance_due"] == "700.00"
