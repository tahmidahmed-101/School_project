from __future__ import annotations

from decimal import Decimal

import pytest

from apps.accounts.constants import UserRole
from apps.accounts.tests.helpers import create_user
from apps.orders.factories import SalesOrderFactory
from apps.orders.models import SalesOrder

pytestmark = pytest.mark.django_db

USERS = "/api/v1/admin/users/"
STOCK = SalesOrder.OrderType.STOCK
PREORDER = SalesOrder.OrderType.PREORDER


@pytest.fixture
def admin_client(api_client):
    api_client.force_authenticate(
        user=create_user(email="customer-kind-admin@example.com", role=UserRole.ADMIN)
    )
    return api_client


def _order(customer, kind, total, status=SalesOrder.Status.CONFIRMED):
    return SalesOrderFactory(
        customer=customer, order_type=kind, status=status, grand_total=Decimal(total)
    )


@pytest.fixture
def customers():
    people = {
        name: create_user(email=f"{name}@example.com")
        for name in ("stock-only", "preorder-only", "both", "no-order", "cart-only")
    }
    _order(people["stock-only"], STOCK, "100.00")
    _order(people["preorder-only"], PREORDER, "900.00")
    _order(people["both"], STOCK, "250.10")
    _order(people["both"], STOCK, "50.05", status=SalesOrder.Status.CANCELLED)
    _order(people["both"], PREORDER, "1000.00")
    _order(people["both"], PREORDER, "500.25", status=SalesOrder.Status.DELIVERED)
    _order(people["cart-only"], STOCK, "75.00", status=SalesOrder.Status.PENDING)
    return people


def _listed(client, **params) -> set[str]:
    response = client.get(USERS, {"role": "customer", "page_size": 100, **params})
    assert response.status_code == 200, response.data
    return {row["email"].split("@")[0] for row in response.data["data"]["results"]}


def test_each_half_lists_its_own_customers(admin_client, customers):
    assert _listed(admin_client, kind="stock") == {"stock-only", "both", "no-order", "cart-only"}
    assert _listed(admin_client, kind="preorder") == {"preorder-only", "both"}
    assert _listed(admin_client) == set(customers)


def test_an_unknown_kind_is_refused(admin_client):
    assert admin_client.get(USERS, {"kind": "mixed"}).status_code == 400


def test_detail_totals_cover_one_half_only(admin_client, customers):
    url = f"{USERS}{customers['both'].id}/"

    stock = admin_client.get(url, {"kind": "stock"}).data["data"]["order_summary"]
    preorder = admin_client.get(url, {"kind": "preorder"}).data["data"]["order_summary"]

    assert stock == {
        "total_orders": 2,
        "completed_orders": 0,
        "cancelled_orders": 1,
        "pending_orders": 1,
        "total_spent": "250.10",
    }
    assert preorder == {
        "total_orders": 2,
        "completed_orders": 1,
        "cancelled_orders": 0,
        "pending_orders": 1,
        "total_spent": "1500.25",
    }


def test_a_cart_is_not_an_order_of_either_half(admin_client, customers):
    url = f"{USERS}{customers['cart-only'].id}/"

    for kind in (STOCK, PREORDER):
        summary = admin_client.get(url, {"kind": kind}).data["data"]["order_summary"]
        assert summary["total_orders"] == 0
        assert summary["total_spent"] == "0.00"
