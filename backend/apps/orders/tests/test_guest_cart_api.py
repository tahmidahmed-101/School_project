"""Server-side carts for anonymous visitors: a pending SalesOrder with no
customer, addressed by a bearer token in the X-Guest-Cart-Token header."""

from __future__ import annotations

from decimal import Decimal

import pytest
from django.db import IntegrityError, connection, transaction
from django.test.utils import CaptureQueriesContext

from apps.accounts.factories import AddressFactory, AdminUserFactory, CustomerUserFactory
from apps.accounts.models import Address
from apps.accounts.services.users import get_or_create_guest_customer
from apps.common.utils.codes import hash_code
from apps.orders.models import SalesOrder, SalesOrderLine
from apps.orders.services.carts import add_line, create_guest_cart, create_order
from apps.orders.tests.test_public_checkout_api import (
    GUEST_CHECKOUT_URL,
    _dhaka_delivery,
    _minimal_payload,
    _stocked_variant,
)

pytestmark = pytest.mark.django_db

CART_URL = "/api/v1/public/cart/"
LINES_URL = "/api/v1/public/cart/lines/"


def _headers(token):
    return {"HTTP_X_GUEST_CART_TOKEN": token}


def _new_cart(api_client):
    response = api_client.post(CART_URL)
    assert response.status_code == 201, response.data
    return response.data["data"]["token"], response.data["data"]["cart"]


def _add(api_client, token, variant, quantity=1):
    return api_client.post(
        LINES_URL,
        {"variant_id": str(variant.id), "quantity": quantity},
        format="json",
        **_headers(token),
    )


def _checkout_payload(**overrides):
    payload = _minimal_payload(_stocked_variant(), city="Chattogram")
    payload.pop("items")  # the saved cart supplies them
    payload.update(overrides)
    return payload


# --- creation, retrieval and the stored token --------------------------------


def test_create_returns_the_token_once_and_stores_only_its_hash(api_client):
    token, cart = _new_cart(api_client)

    assert len(token) >= 40
    assert cart["lines"] == []
    order = SalesOrder.objects.get(id=cart["id"])
    assert order.customer_id is None
    assert order.status == SalesOrder.Status.PENDING
    assert order.guest_token_hash == hash_code(token)
    assert token not in str(order.__dict__)
    # Never handed out again.
    assert "token" not in api_client.get(CART_URL, **_headers(token)).data["data"]


def test_retrieve_returns_the_tokens_own_cart(api_client):
    token, cart = _new_cart(api_client)

    response = api_client.get(CART_URL, **_headers(token))

    assert response.status_code == 200
    assert response.data["data"]["id"] == cart["id"]


# --- line editing --------------------------------------------------------------


def test_add_update_and_remove_items_through_the_cart_services(api_client):
    token, _ = _new_cart(api_client)
    shirt = _stocked_variant(price=Decimal("250.00"))
    shoes = _stocked_variant(price=Decimal("1000.00"))

    added = _add(api_client, token, shirt, 1)
    assert added.status_code == 201, added.data
    again = _add(api_client, token, shirt, 2)  # same variant merges, as in the customer cart
    _add(api_client, token, shoes, 1)
    lines = {line["variant_id"]: line for line in again.data["data"]["lines"]}
    assert lines[str(shirt.id)]["quantity"] == 3

    cart = api_client.get(CART_URL, **_headers(token)).data["data"]
    shirt_line = next(line for line in cart["lines"] if line["variant_id"] == str(shirt.id))
    shoes_line = next(line for line in cart["lines"] if line["variant_id"] == str(shoes.id))

    updated = api_client.patch(
        f"{LINES_URL}{shirt_line['id']}/", {"quantity": 5}, format="json", **_headers(token)
    )
    assert updated.status_code == 200, updated.data
    assert Decimal(updated.data["data"]["subtotal"]) == Decimal("2250.00")

    removed = api_client.delete(f"{LINES_URL}{shoes_line['id']}/", **_headers(token))
    assert removed.status_code == 200
    assert [line["variant_id"] for line in removed.data["data"]["lines"]] == [str(shirt.id)]


def test_adding_an_unknown_variant_is_rejected(api_client):
    token, _ = _new_cart(api_client)

    response = api_client.post(
        LINES_URL,
        {"variant_id": "00000000-0000-0000-0000-000000000000", "quantity": 1},
        format="json",
        **_headers(token),
    )

    assert response.status_code == 400
    assert response.data["error"]["code"] == "variant_not_found"


# --- token handling and isolation ---------------------------------------------


def test_one_guest_cannot_read_or_edit_another_guests_cart(api_client):
    alice_token, alice_cart = _new_cart(api_client)
    bob_token, _ = _new_cart(api_client)
    _add(api_client, alice_token, _stocked_variant(), 2)
    alice_line = api_client.get(CART_URL, **_headers(alice_token)).data["data"]["lines"][0]

    bob_view = api_client.get(CART_URL, **_headers(bob_token)).data["data"]
    edit = api_client.patch(
        f"{LINES_URL}{alice_line['id']}/", {"quantity": 9}, format="json", **_headers(bob_token)
    )
    delete = api_client.delete(f"{LINES_URL}{alice_line['id']}/", **_headers(bob_token))

    assert bob_view["id"] != alice_cart["id"]
    assert bob_view["lines"] == []
    assert edit.status_code == 404
    assert delete.status_code == 404
    alice_after = api_client.get(CART_URL, **_headers(alice_token)).data["data"]
    assert alice_after["lines"][0]["quantity"] == 2


def test_missing_and_unknown_tokens(api_client):
    token, _ = _new_cart(api_client)

    missing = api_client.get(CART_URL)
    unknown = api_client.get(CART_URL, **_headers("not-a-real-token"))
    in_query_string = api_client.get(CART_URL, {"token": token})  # header only

    assert missing.status_code == 400
    assert missing.data["error"]["code"] == "guest_cart_token_required"
    assert unknown.status_code == 404
    assert unknown.data["error"]["code"] == "guest_cart_not_found"
    assert in_query_string.status_code == 400


def test_each_create_is_a_distinct_cart_and_the_database_enforces_identity():
    (first, first_token), (second, second_token) = create_guest_cart(), create_guest_cart()
    assert first.id != second.id
    assert first_token != second_token

    # One token addresses one cart: a second row with the same hash is refused.
    with pytest.raises(IntegrityError), transaction.atomic():
        create_order(customer=None, guest_token_hash=first.guest_token_hash)
    # And an order can't lack both a customer and a guest token.
    with pytest.raises(IntegrityError), transaction.atomic():
        create_order(customer=None)


# --- checkout of the saved cart --------------------------------------------------


def test_guest_checks_out_the_saved_cart(api_client):
    _dhaka_delivery()
    token, cart = _new_cart(api_client)
    variant = _stocked_variant(price=Decimal("300.00"))
    _add(api_client, token, variant, 2)

    response = api_client.post(
        GUEST_CHECKOUT_URL, _checkout_payload(), format="json", **_headers(token)
    )

    assert response.status_code == 201, response.data
    data = response.data["data"]
    assert data["id"] == cart["id"]  # the cart itself became the order
    assert data["status"] == SalesOrder.Status.CONFIRMED
    assert [(line["variant_id"], line["quantity"]) for line in data["lines"]] == [
        (str(variant.id), 2)
    ]
    assert Decimal(data["subtotal"]) == Decimal("600.00")
    assert Decimal(data["shipping_total"]) == Decimal("110.00")  # Outside Dhaka
    order = SalesOrder.objects.select_related("customer").get(id=cart["id"])
    assert order.customer.is_guest
    assert order.contact_phone == "+8801711111111"


def test_checked_out_cart_is_no_longer_a_cart(api_client):
    _dhaka_delivery()
    token, _ = _new_cart(api_client)
    _add(api_client, token, _stocked_variant(), 1)
    api_client.post(GUEST_CHECKOUT_URL, _checkout_payload(), format="json", **_headers(token))

    assert api_client.get(CART_URL, **_headers(token)).status_code == 404
    assert _add(api_client, token, _stocked_variant(), 1).status_code == 404
    again = api_client.post(
        GUEST_CHECKOUT_URL, _checkout_payload(), format="json", **_headers(token)
    )
    assert again.status_code == 404


def test_checking_out_an_empty_saved_cart_is_refused(api_client):
    _dhaka_delivery()
    token, cart = _new_cart(api_client)

    response = api_client.post(
        GUEST_CHECKOUT_URL, _checkout_payload(), format="json", **_headers(token)
    )

    assert response.status_code == 400
    assert response.data["error"]["code"] == "empty_order"
    assert SalesOrder.objects.get(id=cart["id"]).status == SalesOrder.Status.PENDING


def test_saved_cart_checkout_never_attaches_to_a_registered_account(api_client):
    _dhaka_delivery()
    customer = CustomerUserFactory(email="registered@example.com", phone="01733333333")
    default = AddressFactory(user=customer, is_default=True)
    token, cart = _new_cart(api_client)
    _add(api_client, token, _stocked_variant(), 1)

    response = api_client.post(
        GUEST_CHECKOUT_URL,
        _checkout_payload(email="registered@example.com", phone="01733333333"),
        format="json",
        **_headers(token),
    )

    assert response.status_code == 201, response.data
    order = SalesOrder.objects.get(id=cart["id"])
    assert order.customer_id != customer.id
    assert order.customer.is_guest
    customer.refresh_from_db()
    assert (customer.email, customer.phone) == ("registered@example.com", "01733333333")
    assert list(Address.objects.filter(user=customer)) == [default]
    default.refresh_from_db()
    assert default.is_default


def test_checkout_without_a_token_still_needs_its_own_items(api_client):
    _dhaka_delivery()
    payload = _checkout_payload()  # no items, no token

    response = api_client.post(GUEST_CHECKOUT_URL, payload, format="json")

    assert response.status_code == 400
    assert "items" in str(response.data)


# --- screens that meet a customer-less cart ------------------------------------------


def test_screens_that_can_show_a_guest_cart_still_work(api_client):
    cart, _ = create_guest_cart()
    add_line(order=cart, variant=_stocked_variant(), quantity=1)
    api_client.force_authenticate(user=AdminUserFactory())
    for url in (
        "/api/v1/admin/orders/?status=pending",
        f"/api/v1/admin/orders/{cart.id}/",
        f"/api/v1/admin/orders/{cart.id}/invoice/",
        "/api/v1/admin/orders/export/",
        "/api/v1/admin/reporting/dashboard/?start=2020-01-01&end=2035-01-01",
    ):
        assert api_client.get(url).status_code == 200, url
    assessed = api_client.post(f"/api/v1/admin/risk/orders/{cart.id}/assess/")
    assert assessed.status_code == 201
    assert assessed.data["data"]["risk_level"] == "low"  # no other cart counted as "history"
    api_client.force_authenticate(user=None)
    tracked = api_client.post(
        "/api/v1/public/tracking/orders/track/",
        {"order_number": cart.order_number, "phone": "01711111111"},
        format="json",
    )
    assert tracked.status_code == 404  # no phone matches a cart; and no crash


# --- concurrent edits ------------------------------------------------------------------
#
# The test database (in-memory SQLite) can't run two real requests at once, and
# ignores row locks. So these tests reproduce the one moment the lock exists
# for: while this request waits on the cart's lock, another request — which
# held it first — commits. The hook makes that happen, then takes the real
# lock. If a view read or wrote lines before locking, the other request's
# change would land too late and the assertions below would fail.


def _while_waiting_for_the_lock(monkeypatch, other_request):
    from api.v1.public.cart import views
    from apps.orders.services.orders import lock_order

    def lock_after_other_request(order):
        other_request(SalesOrder.objects.get(pk=order.pk))
        return lock_order(order)

    monkeypatch.setattr(views, "lock_order", lock_after_other_request)


def test_concurrent_adds_of_the_same_variant_merge_into_one_line(api_client, monkeypatch):
    token, cart = _new_cart(api_client)
    variant = _stocked_variant()
    _while_waiting_for_the_lock(
        monkeypatch, lambda order: add_line(order=order, variant=variant, quantity=2)
    )

    response = _add(api_client, token, variant, 3)

    assert response.status_code == 201, response.data
    assert [(line["variant_id"], line["quantity"]) for line in response.data["data"]["lines"]] == [
        (str(variant.id), 5)
    ]
    assert SalesOrderLine.objects.filter(order_id=cart["id"]).count() == 1


def _claim(order):
    """What a guest checkout does to the cart while holding its lock."""
    SalesOrder.objects.filter(pk=order.pk).update(
        customer=get_or_create_guest_customer(phone="01788888888"),
        status=SalesOrder.Status.AWAITING_PAYMENT,
    )


def test_add_refused_if_a_checkout_claimed_the_cart_meanwhile(api_client, monkeypatch):
    token, cart = _new_cart(api_client)
    _while_waiting_for_the_lock(monkeypatch, _claim)

    response = _add(api_client, token, _stocked_variant(), 1)

    assert response.status_code == 404
    assert response.data["error"]["code"] == "guest_cart_not_found"
    assert not SalesOrderLine.objects.filter(order_id=cart["id"]).exists()


@pytest.mark.parametrize("method", ["patch", "delete"])
def test_line_edit_refused_if_a_checkout_claimed_the_cart_meanwhile(
    api_client, monkeypatch, method
):
    token, cart = _new_cart(api_client)
    _add(api_client, token, _stocked_variant(), 2)
    line = SalesOrderLine.objects.get(order_id=cart["id"])
    _while_waiting_for_the_lock(monkeypatch, _claim)

    url = f"{LINES_URL}{line.id}/"
    response = (
        api_client.patch(url, {"quantity": 9}, format="json", **_headers(token))
        if method == "patch"
        else api_client.delete(url, **_headers(token))
    )

    assert response.status_code == 404
    line.refresh_from_db()  # still there, unchanged
    assert line.quantity == 2


def test_line_is_refetched_under_the_lock(api_client, monkeypatch):
    """A line removed by the request that held the lock is gone by the time
    this one reads it — not updated from a stale copy."""
    token, cart = _new_cart(api_client)
    _add(api_client, token, _stocked_variant(), 2)
    line = SalesOrderLine.objects.get(order_id=cart["id"])
    _while_waiting_for_the_lock(
        monkeypatch, lambda order: SalesOrderLine.objects.filter(pk=line.pk).delete()
    )

    response = api_client.patch(
        f"{LINES_URL}{line.id}/", {"quantity": 9}, format="json", **_headers(token)
    )

    assert response.status_code == 404
    assert response.data["error"]["code"] == "order_line_not_found"
    assert not SalesOrderLine.objects.filter(order_id=cart["id"]).exists()


def test_guest_cannot_edit_lines_after_checkout(api_client):
    _dhaka_delivery()
    token, cart = _new_cart(api_client)
    _add(api_client, token, _stocked_variant(), 2)
    line = SalesOrderLine.objects.get(order_id=cart["id"])
    checked_out = api_client.post(
        GUEST_CHECKOUT_URL, _checkout_payload(), format="json", **_headers(token)
    )
    assert checked_out.status_code == 201, checked_out.data

    url = f"{LINES_URL}{line.id}/"
    assert (
        api_client.patch(url, {"quantity": 9}, format="json", **_headers(token)).status_code == 404
    )
    assert api_client.delete(url, **_headers(token)).status_code == 404
    line.refresh_from_db()
    assert line.quantity == 2


# --- scaling -----------------------------------------------------------------------


def test_reading_a_guest_cart_does_not_query_per_line(api_client):
    token, _ = _new_cart(api_client)
    _add(api_client, token, _stocked_variant(), 1)
    with CaptureQueriesContext(connection) as one:
        api_client.get(CART_URL, **_headers(token))
    for _ in range(5):
        _add(api_client, token, _stocked_variant(), 1)
    with CaptureQueriesContext(connection) as six:
        assert len(api_client.get(CART_URL, **_headers(token)).data["data"]["lines"]) == 6

    assert len(six) == len(one)
