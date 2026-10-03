"""Admin "Customer Carts": customers' open, non-empty carts that haven't been
checked out. Built with the real cart services, so a cart here is exactly
what a customer's cart API produces."""

from __future__ import annotations

from decimal import Decimal

import pytest
from django.db import connection
from django.test.utils import CaptureQueriesContext
from django.utils import timezone

from apps.accounts.constants import StaffPermissionCode, UserRole
from apps.accounts.factories import CustomerUserFactory
from apps.accounts.services.staff_permissions import set_staff_permission
from apps.accounts.tests.helpers import create_user
from apps.catalog.factories import ProductVariantFactory
from apps.inventory.constants import MovementType
from apps.inventory.services.stock import record_movement
from apps.orders.services.carts import add_line, create_guest_cart, get_or_create_cart
from apps.orders.services.checkout import checkout
from apps.orders.services.payments import capture_payment

pytestmark = pytest.mark.django_db

CARTS_URL = "/api/v1/admin/orders/carts/"


def _variant(price="100.00"):
    variant = ProductVariantFactory(price=Decimal(price))
    record_movement(
        variant=variant,
        movement_type=MovementType.PURCHASE_IN,
        quantity=50,
        unit_cost=Decimal("5.00"),
    )
    return variant


def _cart(customer, *items):
    cart = get_or_create_cart(customer)
    for variant, quantity in items:
        add_line(order=cart, variant=variant, quantity=quantity)
    cart.refresh_from_db()
    return cart


def _admin(api_client):
    admin = create_user(email="carts-admin@example.com", role=UserRole.ADMIN)
    api_client.force_authenticate(user=admin)


def _listed(api_client, **params):
    response = api_client.get(CARTS_URL, params)
    assert response.status_code == 200, response.data
    return response.data["data"]["results"]


def test_lists_a_customers_non_empty_cart_with_its_items(api_client):
    customer = CustomerUserFactory(
        email="cart.owner@example.com", phone="01711223344", first_name="Rahim", last_name="Uddin"
    )
    variant = _variant("250.00")
    cart = _cart(customer, (variant, 2))
    _admin(api_client)

    [row] = _listed(api_client)

    assert row["id"] == str(cart.id)
    assert row["is_guest_cart"] is False
    assert row["customer_id"] == str(customer.id)
    assert row["customer_email"] == "cart.owner@example.com"
    assert row["customer_phone"] == "01711223344"
    assert row["customer_name"] == "Rahim Uddin"
    assert row["item_count"] == 2
    assert Decimal(row["subtotal"]) == Decimal("500.00")
    assert row["updated_at"]
    [item] = row["items"]
    assert item["variant_id"] == str(variant.id)
    assert item["sku"] == variant.sku
    assert item["quantity"] == 2
    assert Decimal(item["unit_price"]) == Decimal("250.00")


def test_empty_cart_is_excluded(api_client):
    _cart(CustomerUserFactory())  # created, nothing added
    _admin(api_client)

    assert _listed(api_client) == []


def test_cart_with_several_variants_lists_every_item(api_client):
    first, second, third = _variant(), _variant(), _variant()
    _cart(CustomerUserFactory(), (first, 1), (second, 3), (third, 2))
    _admin(api_client)

    [row] = _listed(api_client)

    assert row["item_count"] == 6
    assert {(i["variant_id"], i["quantity"]) for i in row["items"]} == {
        (str(first.id), 1),
        (str(second.id), 3),
        (str(third.id), 2),
    }


def test_checked_out_orders_are_not_carts(api_client):
    # Paid order, then a fresh cart: only the fresh cart is listed.
    returning = CustomerUserFactory()
    paid = _cart(returning, (_variant(), 1))
    checkout(order=paid)
    capture_payment(order=paid, amount=paid.grand_total)
    new_cart = _cart(returning, (_variant(), 1))
    # Checked out but not yet paid: no longer a cart either.
    awaiting = _cart(CustomerUserFactory(), (_variant(), 1))
    checkout(order=awaiting)
    _admin(api_client)

    rows = _listed(api_client)

    assert [row["id"] for row in rows] == [str(new_cart.id)]
    assert new_cart.id != paid.id


def test_search_finds_a_cart_by_customer_email(api_client):
    _cart(CustomerUserFactory(email="needle@example.com"), (_variant(), 1))
    _cart(CustomerUserFactory(email="haystack@example.com"), (_variant(), 1))
    _admin(api_client)

    rows = _listed(api_client, search="NEEDLE@")

    assert [row["customer_email"] for row in rows] == ["needle@example.com"]


@pytest.mark.parametrize(
    ("who", "expected"),
    [("anonymous", 401), ("customer", 403), ("staff_without_orders", 403), ("orders_viewer", 200)],
)
def test_only_staff_who_can_view_orders_see_carts(api_client, who, expected):
    _cart(CustomerUserFactory(), (_variant(), 1))
    if who == "customer":
        api_client.force_authenticate(user=CustomerUserFactory())
    elif who in {"staff_without_orders", "orders_viewer"}:
        staff = create_user(email=f"carts-{who}@example.com", role=UserRole.STAFF)
        if who == "orders_viewer":
            admin = create_user(email="carts-granter@example.com", role=UserRole.ADMIN)
            set_staff_permission(
                staff_user=staff,
                permission_code=StaffPermissionCode.ORDERS_VIEW,
                is_enabled=True,
                granted_by=admin,
            )
        api_client.force_authenticate(user=staff)

    assert api_client.get(CARTS_URL).status_code == expected


def _guest_cart(*items):
    cart, token = create_guest_cart()
    for variant, quantity in items:
        add_line(order=cart, variant=variant, quantity=quantity)
    cart.refresh_from_db()
    return cart, token


def test_guest_carts_are_listed_and_marked_without_customer_details_or_token(api_client):
    guest_cart, token = _guest_cart((_variant("40.00"), 3))
    registered = _cart(CustomerUserFactory(), (_variant(), 1))
    _admin(api_client)

    response = api_client.get(CARTS_URL)
    rows = {row["id"]: row for row in response.data["data"]["results"]}

    guest_row = rows[str(guest_cart.id)]
    assert guest_row["is_guest_cart"] is True
    assert guest_row["customer_id"] is None
    assert guest_row["customer_email"] is None
    assert guest_row["customer_name"] is None
    assert guest_row["customer_phone"] is None
    assert guest_row["item_count"] == 3
    assert rows[str(registered.id)]["is_guest_cart"] is False
    assert token not in response.content.decode()
    assert guest_cart.guest_token_hash not in response.content.decode()


def test_empty_and_deleted_carts_are_excluded(api_client):
    _guest_cart()  # empty guest cart
    deleted, _ = _guest_cart((_variant(), 1))
    deleted.deleted_at = timezone.now()
    deleted.save(update_fields=["deleted_at"])
    deleted_registered = _cart(CustomerUserFactory(), (_variant(), 1))
    deleted_registered.deleted_at = timezone.now()
    deleted_registered.save(update_fields=["deleted_at"])
    live, _ = _guest_cart((_variant(), 1))
    _admin(api_client)

    assert [row["id"] for row in _listed(api_client)] == [str(live.id)]


def test_query_count_does_not_grow_with_carts_or_items(api_client):
    _admin(api_client)
    _cart(CustomerUserFactory(), (_variant(), 1))
    with CaptureQueriesContext(connection) as one:
        assert len(_listed(api_client)) == 1

    for _ in range(5):
        _cart(CustomerUserFactory(), (_variant(), 1), (_variant(), 2), (_variant(), 3))
        _guest_cart((_variant(), 1), (_variant(), 2))
    with CaptureQueriesContext(connection) as many:
        assert len(_listed(api_client)) == 11

    assert len(many) == len(one)
