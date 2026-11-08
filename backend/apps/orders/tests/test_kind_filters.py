from __future__ import annotations

from decimal import Decimal

import pytest

from apps.accounts.constants import UserRole
from apps.accounts.factories import CustomerUserFactory
from apps.accounts.tests.helpers import create_user
from apps.catalog.factories import ProductVariantFactory
from apps.orders.factories import (
    CouponFactory,
    PaymentFactory,
    ReturnRMAFactory,
    SalesOrderFactory,
    SalesOrderLineFactory,
    ShipmentFactory,
    StockReservationFactory,
)
from apps.orders.models import SalesOrder
from apps.orders.services.carts import add_line, get_or_create_cart
from apps.orders.services.coupons import apply_coupon

pytestmark = pytest.mark.django_db

BASE = "/api/v1/admin/orders/"
STOCK = SalesOrder.OrderType.STOCK


@pytest.fixture
def admin_client(api_client):
    api_client.force_authenticate(
        user=create_user(email="kind-admin@example.com", role=UserRole.ADMIN)
    )
    return api_client


def _order():
    return SalesOrderFactory(status=SalesOrder.Status.CONFIRMED, order_type=STOCK)


def _stock_variant():
    return ProductVariantFactory(price=Decimal("100.00"))


def _cart(variant):
    cart = get_or_create_cart(CustomerUserFactory())
    add_line(order=cart, variant=variant, quantity=1)
    return cart


def _rows(client, path, **params):
    response = client.get(f"{BASE}{path}", params)
    assert response.status_code == 200, response.data
    return response.data["data"]["results"]


ORDER_SIDE = [
    ("payments/", PaymentFactory),
    ("shipments/", ShipmentFactory),
    ("returns/", ReturnRMAFactory),
]


@pytest.mark.parametrize(("path", "factory"), ORDER_SIDE)
def test_order_side_lists_take_kind_stock(admin_client, path, factory):
    row = factory(order=_order())

    assert [r["id"] for r in _rows(admin_client, path)] == [str(row.id)]
    assert [(r["id"], r["order_type"]) for r in _rows(admin_client, path, kind="stock")] == [
        (str(row.id), STOCK)
    ]


@pytest.mark.parametrize(("path", "factory"), ORDER_SIDE)
def test_order_side_detail_carries_order_type(admin_client, path, factory):
    row = factory(order=_order())

    response = admin_client.get(f"{BASE}{path}{row.id}/")

    assert response.status_code == 200, response.data
    assert response.data["data"]["order_type"] == STOCK


@pytest.mark.parametrize(
    ("path", "param"),
    [
        ("", "order_type"),
        ("payments/", "kind"),
        ("shipments/", "kind"),
        ("returns/", "kind"),
        ("carts/", "kind"),
        ("reservations/", "kind"),
    ],
)
@pytest.mark.parametrize("value", ["mixed", "preorder"])
def test_a_kind_other_than_stock_is_a_400(admin_client, path, param, value):
    response = admin_client.get(f"{BASE}{path}", {param: value})

    assert response.status_code == 400


def test_orders_list_takes_order_type_stock(admin_client):
    cart = _cart(_stock_variant())
    placed = _order()

    ids = {row["id"] for row in _rows(admin_client, "", order_type="stock")}

    assert ids == {str(cart.id), str(placed.id)}


def test_carts_take_kind_stock(admin_client):
    cart = _cart(_stock_variant())

    rows = _rows(admin_client, "carts/", kind="stock")

    assert [(row["id"], row["order_type"]) for row in rows] == [(str(cart.id), STOCK)]


def test_reservations_take_kind_stock(admin_client):
    variant = _stock_variant()
    row = StockReservationFactory(
        variant=variant, order_line=SalesOrderLineFactory(variant=variant)
    )

    rows = _rows(admin_client, "reservations/", kind="stock")

    assert [r["id"] for r in rows] == [str(row.id)]


def test_coupon_applies_to_a_stock_basket():
    cart = _cart(_stock_variant())
    coupon = CouponFactory()

    order = apply_coupon(order=cart, code=coupon.code)

    assert order.coupon_id == coupon.id
    assert order.discount_total == Decimal("10.00")
