from __future__ import annotations

from decimal import Decimal

import pytest

from apps.accounts.constants import UserRole
from apps.accounts.tests.helpers import create_user
from apps.orders.factories import SalesOrderFactory
from apps.orders.models import SalesOrder

pytestmark = pytest.mark.django_db

USERS = "/api/v1/admin/users/"


@pytest.fixture
def admin_client(api_client):
    api_client.force_authenticate(
        user=create_user(email="customer-kind-admin@example.com", role=UserRole.ADMIN)
    )
    return api_client


def _order(customer, total, status=SalesOrder.Status.CONFIRMED):
    return SalesOrderFactory(customer=customer, status=status, grand_total=Decimal(total))


@pytest.fixture
def customers():
    people = {
        name: create_user(email=f"{name}@example.com")
        for name in ("buyer", "no-order", "cart-only")
    }
    _order(people["buyer"], "250.10")
    _order(people["buyer"], "50.05", status=SalesOrder.Status.CANCELLED)
    _order(people["cart-only"], "75.00", status=SalesOrder.Status.PENDING)
    return people


def _listed(client, **params) -> set[str]:
    response = client.get(USERS, {"role": "customer", "page_size": 100, **params})
    assert response.status_code == 200, response.data
    return {row["email"].split("@")[0] for row in response.data["data"]["results"]}


def test_kind_stock_lists_every_customer(admin_client, customers):
    assert _listed(admin_client, kind="stock") == set(customers)
    assert _listed(admin_client) == set(customers)


@pytest.mark.parametrize("kind", ["mixed", "preorder"])
def test_a_kind_other_than_stock_is_refused(admin_client, kind):
    assert admin_client.get(USERS, {"kind": kind}).status_code == 400


def test_detail_totals_with_kind_stock_count_placed_orders(admin_client, customers):
    url = f"{USERS}{customers['buyer'].id}/"

    summary = admin_client.get(url, {"kind": "stock"}).data["data"]["order_summary"]

    assert summary == {
        "total_orders": 2,
        "completed_orders": 0,
        "cancelled_orders": 1,
        "pending_orders": 1,
        "total_spent": "250.10",
    }


def test_a_cart_is_not_a_placed_order(admin_client, customers):
    url = f"{USERS}{customers['cart-only'].id}/"

    summary = admin_client.get(url, {"kind": "stock"}).data["data"]["order_summary"]

    assert summary["total_orders"] == 0
    assert summary["total_spent"] == "0.00"
