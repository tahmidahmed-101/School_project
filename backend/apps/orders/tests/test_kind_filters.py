from __future__ import annotations

from datetime import timedelta
from decimal import Decimal

import pytest
from django.utils import timezone

from apps.accounts.constants import UserRole
from apps.accounts.factories import CustomerUserFactory
from apps.accounts.tests.helpers import create_user
from apps.catalog.factories import ProductVariantFactory
from apps.catalog.models import Category
from apps.common.exceptions import BusinessRuleViolationError
from apps.orders.factories import (
    CouponFactory,
    PaymentFactory,
    ReturnRMAFactory,
    SalesOrderFactory,
    SalesOrderLineFactory,
    ShipmentFactory,
    StockReservationFactory,
)
from apps.orders.models import Coupon, SalesOrder
from apps.orders.services.carts import add_line, get_or_create_cart
from apps.orders.services.checkout import checkout
from apps.orders.services.coupons import apply_coupon

pytestmark = pytest.mark.django_db

BASE = "/api/v1/admin/orders/"
STOCK = SalesOrder.OrderType.STOCK
PREORDER = SalesOrder.OrderType.PREORDER


@pytest.fixture
def admin_client(api_client):
    api_client.force_authenticate(
        user=create_user(email="kind-admin@example.com", role=UserRole.ADMIN)
    )
    return api_client


def _order(kind):
    return SalesOrderFactory(status=SalesOrder.Status.CONFIRMED, order_type=kind)


def _stock_variant():
    return ProductVariantFactory(price=Decimal("100.00"))


def _preorder_variant():
    now = timezone.now()
    return ProductVariantFactory(
        product__category__category_type=Category.CategoryType.PREORDER,
        price=Decimal("100.00"),
        is_preorder_enabled=True,
        preorder_start_date=now - timedelta(days=1),
        preorder_end_date=now + timedelta(days=10),
    )


def _cart(variant):
    cart = get_or_create_cart(CustomerUserFactory())
    add_line(order=cart, variant=variant, quantity=1)
    return cart


def _rows(client, path, **params):
    response = client.get(f"{BASE}{path}", params)
    assert response.status_code == 200, response.data
    return response.data["data"]["results"]


@pytest.mark.parametrize(
    ("path", "factory"),
    [
        ("payments/", PaymentFactory),
        ("shipments/", ShipmentFactory),
        ("returns/", ReturnRMAFactory),
    ],
)
def test_order_side_lists_filter_by_the_orders_kind(admin_client, path, factory):
    stock_row = factory(order=_order(STOCK))
    preorder_row = factory(order=_order(PREORDER))

    both = _rows(admin_client, path)
    stock_only = _rows(admin_client, path, kind="stock")
    preorder_only = _rows(admin_client, path, kind="preorder")

    assert {row["id"] for row in both} == {str(stock_row.id), str(preorder_row.id)}
    assert [(row["id"], row["order_type"]) for row in stock_only] == [(str(stock_row.id), STOCK)]
    assert [(row["id"], row["order_type"]) for row in preorder_only] == [
        (str(preorder_row.id), PREORDER)
    ]


@pytest.mark.parametrize(
    ("path", "factory"),
    [
        ("payments/", PaymentFactory),
        ("shipments/", ShipmentFactory),
        ("returns/", ReturnRMAFactory),
    ],
)
def test_order_side_detail_carries_order_type(admin_client, path, factory):
    row = factory(order=_order(PREORDER))

    response = admin_client.get(f"{BASE}{path}{row.id}/")

    assert response.status_code == 200, response.data
    assert response.data["data"]["order_type"] == PREORDER


@pytest.mark.parametrize("path", ["payments/", "shipments/", "returns/", "carts/", "reservations/"])
def test_unknown_kind_is_a_400(admin_client, path):
    response = admin_client.get(f"{BASE}{path}", {"kind": "mixed"})

    assert response.status_code == 400


def test_carts_filter_by_whether_they_hold_a_preorder_line(admin_client):
    stock_cart = _cart(_stock_variant())
    preorder_cart = _cart(_preorder_variant())

    both = _rows(admin_client, "carts/")
    stock_only = _rows(admin_client, "carts/", kind="stock")
    preorder_only = _rows(admin_client, "carts/", kind="preorder")

    assert len(both) == 2
    assert [(row["id"], row["order_type"]) for row in stock_only] == [(str(stock_cart.id), STOCK)]
    assert [(row["id"], row["order_type"]) for row in preorder_only] == [
        (str(preorder_cart.id), PREORDER)
    ]


def test_reservations_filter_by_the_variants_category_kind(admin_client):
    stock_variant = _stock_variant()
    preorder_variant = _preorder_variant()
    stock_row = StockReservationFactory(
        variant=stock_variant, order_line=SalesOrderLineFactory(variant=stock_variant)
    )
    preorder_row = StockReservationFactory(
        variant=preorder_variant, order_line=SalesOrderLineFactory(variant=preorder_variant)
    )

    assert len(_rows(admin_client, "reservations/")) == 2
    assert [row["id"] for row in _rows(admin_client, "reservations/", kind="stock")] == [
        str(stock_row.id)
    ]
    assert [row["id"] for row in _rows(admin_client, "reservations/", kind="preorder")] == [
        str(preorder_row.id)
    ]


def test_coupon_is_refused_on_a_basket_with_a_preorder_line():
    cart = _cart(_preorder_variant())
    coupon = CouponFactory()

    with pytest.raises(BusinessRuleViolationError) as excinfo:
        apply_coupon(order=cart, code=coupon.code)

    assert excinfo.value.code == "coupon_stock_only"
    coupon.refresh_from_db()
    assert coupon.times_used == 0


def test_coupon_still_applies_to_a_stock_basket():
    cart = _cart(_stock_variant())
    coupon = CouponFactory()

    order = apply_coupon(order=cart, code=coupon.code)

    assert order.coupon_id == coupon.id
    assert order.discount_total == Decimal("10.00")


def _attach_coupon(order) -> Coupon:
    coupon = CouponFactory(times_used=1)
    order.coupon = coupon
    order.discount_total = Decimal("10.00")
    order.save(update_fields=["coupon", "discount_total"])
    return coupon


def test_adding_a_preorder_line_takes_the_coupon_off_the_basket():
    cart = get_or_create_cart(CustomerUserFactory())
    coupon = _attach_coupon(cart)

    add_line(order=cart, variant=_preorder_variant(), quantity=1)

    cart.refresh_from_db()
    coupon.refresh_from_db()
    assert cart.coupon_id is None
    assert cart.discount_total == Decimal("0")
    assert coupon.times_used == 0


def test_preorder_checkout_refuses_a_coupon_left_on_the_order():
    cart = _cart(_preorder_variant())
    coupon = _attach_coupon(cart)

    with pytest.raises(BusinessRuleViolationError) as excinfo:
        checkout(order=cart)

    assert excinfo.value.code == "coupon_stock_only"
    cart.refresh_from_db()
    coupon.refresh_from_db()
    assert cart.status == SalesOrder.Status.PENDING
    assert cart.coupon_id == coupon.id
    assert coupon.times_used == 1
