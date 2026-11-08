from __future__ import annotations

from decimal import Decimal

import pytest
from django.db import connection
from django.test.utils import CaptureQueriesContext

from apps.accounts.factories import CustomerUserFactory
from apps.orders.factories import PaymentFactory, SalesOrderFactory, SalesOrderLineFactory
from apps.orders.models import SalesOrder

pytestmark = pytest.mark.django_db

HISTORY = "/api/v1/customer/orders/"
TRACK = "/api/v1/public/tracking/orders/track/"


def _order(customer, **fields):
    order = SalesOrderFactory(
        customer=customer,
        status=SalesOrder.Status.CONFIRMED,
        order_type=SalesOrder.OrderType.STOCK,
        grand_total=Decimal("1000.00"),
        **fields,
    )
    SalesOrderLineFactory(order=order)
    return order


def test_history_takes_order_type_stock(api_client, customer_user):
    api_client.force_authenticate(user=customer_user)
    order = _order(customer_user)
    PaymentFactory(order=order, amount=Decimal("300.00"))

    rows = api_client.get(HISTORY, {"order_type": "stock"}).data["data"]["results"]

    assert [row["id"] for row in rows] == [str(order.id)]
    assert rows[0]["order_type"] == "stock"
    assert rows[0]["paid_total"] == "300.00"
    assert rows[0]["balance_due"] == "700.00"


@pytest.mark.parametrize("order_type", ["both", "preorder"])
def test_history_refuses_an_order_type_other_than_stock(api_client, customer_user, order_type):
    api_client.force_authenticate(user=customer_user)

    response = api_client.get(HISTORY, {"order_type": order_type})

    assert response.status_code == 400


def test_history_reads_payments_in_one_query(api_client, customer_user):
    api_client.force_authenticate(user=customer_user)
    for _ in range(3):
        PaymentFactory(order=_order(customer_user))

    with CaptureQueriesContext(connection) as queries:
        api_client.get(HISTORY)

    assert sum('FROM "orders_payment"' in query["sql"] for query in queries) == 1


def test_tracking_shows_what_is_paid(api_client, customer_user):
    order = _order(customer_user, contact_phone="01711223344")
    PaymentFactory(order=order, amount=Decimal("300.00"))

    response = api_client.post(
        TRACK, {"order_number": order.order_number, "phone": "01711223344"}, format="json"
    )

    assert response.status_code == 200, response.data
    data = response.data["data"]
    assert data["order_type"] == "stock"
    assert data["paid_total"] == "300.00"
    assert data["balance_due"] == "700.00"


def test_customer_tracks_their_own_order_without_a_phone(api_client, customer_user):
    api_client.force_authenticate(user=customer_user)
    order = _order(customer_user)

    response = api_client.get(f"{HISTORY}{order.id}/track/")

    assert response.status_code == 200, response.data
    assert response.data["data"]["order_number"] == order.order_number


def test_customer_cannot_track_someone_elses_order(api_client, customer_user):
    api_client.force_authenticate(user=customer_user)
    order = _order(CustomerUserFactory())

    response = api_client.get(f"{HISTORY}{order.id}/track/")

    assert response.status_code == 404
