"""Saving the phone typed at checkout on a still-open cart, before the order
is placed: guests by their cart token, customers on their own cart."""

from __future__ import annotations

import pytest
from django.utils import timezone

from apps.accounts.factories import CustomerUserFactory
from apps.common.exceptions import BusinessRuleViolationError
from apps.orders.models import SalesOrder
from apps.orders.services.carts import (
    add_line,
    create_guest_cart,
    get_or_create_cart,
    set_cart_contact_phone,
)
from apps.orders.services.checkout import checkout
from apps.orders.tests.test_guest_cart_api import (
    _checkout_payload,
    _claim,
    _headers,
    _while_waiting_for_the_lock,
)
from apps.orders.tests.test_public_checkout_api import (
    GUEST_CHECKOUT_URL,
    _dhaka_delivery,
    _stocked_variant,
)

pytestmark = pytest.mark.django_db

GUEST_CONTACT_URL = "/api/v1/public/cart/contact/"
CUSTOMER_CONTACT_URL = "/api/v1/customer/orders/cart/contact/"


def _guest_cart(phone=""):
    cart, token = create_guest_cart()
    add_line(order=cart, variant=_stocked_variant(), quantity=1)
    if phone:
        set_cart_contact_phone(cart=cart, phone=phone)
    return cart, token


def _customer_cart(customer):
    cart = get_or_create_cart(customer)
    add_line(order=cart, variant=_stocked_variant(), quantity=1)
    return cart


def _save_guest(api_client, token, phone):
    return api_client.patch(GUEST_CONTACT_URL, {"phone": phone}, format="json", **_headers(token))


def _contact_phone(cart):
    return SalesOrder.objects.get(pk=cart.pk).contact_phone


# --- guest carts -------------------------------------------------------------------


def test_guest_saves_and_replaces_the_phone_before_checkout(api_client):
    cart, token = _guest_cart()

    saved = _save_guest(api_client, token, " 01711223344 ")

    assert saved.status_code == 200, saved.data
    assert saved.data["data"] == {"contact_phone": "01711223344", "contact_name": ""}
    cart.refresh_from_db()
    assert cart.contact_phone == "01711223344"
    assert cart.status == SalesOrder.Status.PENDING
    assert cart.customer_id is None  # still an anonymous cart; no guest identity yet

    replaced = _save_guest(api_client, token, "+8801811223344")
    assert replaced.status_code == 200
    assert _contact_phone(cart) == "+8801811223344"


@pytest.mark.parametrize("phone", ["12345", "01211223344", "not a phone", "017112233445"])
def test_guest_invalid_phone_is_rejected_and_nothing_is_saved(api_client, phone):
    cart, token = _guest_cart(phone="01711223344")

    response = _save_guest(api_client, token, phone)

    assert response.status_code == 400
    assert response.data["error"]["code"] == "invalid_phone"
    assert _contact_phone(cart) == "01711223344"


@pytest.mark.parametrize("payload", [{}, {"phone": ""}, {"phone": "0" * 33}])
def test_guest_missing_blank_or_overlong_phone_is_rejected(api_client, payload):
    cart, token = _guest_cart(phone="01711223344")

    response = api_client.patch(GUEST_CONTACT_URL, payload, format="json", **_headers(token))

    assert response.status_code == 400
    assert _contact_phone(cart) == "01711223344"


def test_missing_and_unknown_tokens_cannot_save_a_phone(api_client):
    cart, token = _guest_cart()

    missing = api_client.patch(GUEST_CONTACT_URL, {"phone": "01711223344"}, format="json")
    unknown = _save_guest(api_client, "not-a-real-token", "01711223344")
    in_query_string = api_client.patch(
        f"{GUEST_CONTACT_URL}?token={token}", {"phone": "01711223344"}, format="json"
    )
    # The stored hash is not a credential either.
    by_hash = _save_guest(api_client, cart.guest_token_hash, "01711223344")

    assert missing.status_code == 400
    assert missing.data["error"]["code"] == "guest_cart_token_required"
    assert unknown.status_code == 404
    assert unknown.data["error"]["code"] == "guest_cart_not_found"
    assert in_query_string.status_code == 400
    assert by_hash.status_code == 404
    assert _contact_phone(cart) == ""


def test_a_guest_token_only_ever_changes_its_own_cart(api_client):
    alice_cart, _ = _guest_cart(phone="01711223344")
    bob_cart, bob_token = _guest_cart()

    response = _save_guest(api_client, bob_token, "01899887766")

    assert response.status_code == 200
    assert _contact_phone(bob_cart) == "01899887766"
    assert _contact_phone(alice_cart) == "01711223344"


def test_guest_token_cannot_reach_a_customers_cart(api_client):
    # A token only ever addresses a customer-less cart, so a registered cart is
    # out of reach of the public endpoint whatever is sent.
    customer = CustomerUserFactory(phone="01733333333")
    cart = _customer_cart(customer)
    _, token = _guest_cart()
    api_client.force_authenticate(user=None)

    response = _save_guest(api_client, token, "01899887766")

    assert response.status_code == 200
    assert _contact_phone(cart) == ""


def test_deleted_guest_cart_cannot_be_updated(api_client):
    cart, token = _guest_cart()
    cart.deleted_at = timezone.now()
    cart.save(update_fields=["deleted_at"])

    response = _save_guest(api_client, token, "01711223344")

    assert response.status_code == 404
    assert response.data["error"]["code"] == "guest_cart_not_found"
    assert _contact_phone(cart) == ""


def test_checked_out_guest_cart_cannot_be_updated(api_client):
    _dhaka_delivery()
    cart, token = _guest_cart()
    placed = api_client.post(
        GUEST_CHECKOUT_URL, _checkout_payload(), format="json", **_headers(token)
    )
    assert placed.status_code == 201, placed.data

    response = _save_guest(api_client, token, "01899887766")

    assert response.status_code == 404
    assert _contact_phone(cart) == "+8801711111111"  # what checkout submitted


def test_guest_phone_refused_if_a_checkout_claimed_the_cart_meanwhile(api_client, monkeypatch):
    cart, token = _guest_cart()
    _while_waiting_for_the_lock(monkeypatch, _claim)

    response = _save_guest(api_client, token, "01711223344")

    assert response.status_code == 404
    assert response.data["error"]["code"] == "guest_cart_not_found"
    assert _contact_phone(cart) == ""


def test_checkout_replaces_the_captured_phone_with_the_one_submitted(api_client):
    _dhaka_delivery()
    cart, token = _guest_cart(phone="01899887766")

    placed = api_client.post(
        GUEST_CHECKOUT_URL, _checkout_payload(), format="json", **_headers(token)
    )

    assert placed.status_code == 201, placed.data
    assert _contact_phone(cart) == "+8801711111111"


# --- customer carts ----------------------------------------------------------------


def test_customer_saves_a_cart_phone_without_changing_their_profile(api_client):
    customer = CustomerUserFactory(phone="01733333333")
    cart = _customer_cart(customer)
    api_client.force_authenticate(user=customer)

    response = api_client.patch(CUSTOMER_CONTACT_URL, {"phone": "01899887766"}, format="json")

    assert response.status_code == 200, response.data
    assert response.data["data"] == {"contact_phone": "01899887766", "contact_name": ""}
    assert _contact_phone(cart) == "01899887766"
    customer.refresh_from_db()
    assert customer.phone == "01733333333"


def test_customer_only_ever_changes_their_own_cart(api_client):
    other_cart = _customer_cart(CustomerUserFactory())
    guest_cart, guest_token = _guest_cart()
    customer = CustomerUserFactory()
    cart = _customer_cart(customer)
    api_client.force_authenticate(user=customer)

    # A guest token sent along is ignored here: the session decides the cart.
    response = api_client.patch(
        CUSTOMER_CONTACT_URL, {"phone": "01899887766"}, format="json", **_headers(guest_token)
    )

    assert response.status_code == 200
    assert _contact_phone(cart) == "01899887766"
    assert _contact_phone(other_cart) == ""
    assert _contact_phone(guest_cart) == ""


def test_customer_invalid_phone_is_rejected(api_client):
    customer = CustomerUserFactory()
    cart = _customer_cart(customer)
    api_client.force_authenticate(user=customer)

    response = api_client.patch(CUSTOMER_CONTACT_URL, {"phone": "12345"}, format="json")

    assert response.status_code == 400
    assert response.data["error"]["code"] == "invalid_phone"
    assert _contact_phone(cart) == ""


def test_customer_without_an_open_cart_gets_not_found(api_client):
    customer = CustomerUserFactory()
    placed = _customer_cart(customer)
    checkout(order=placed)  # no longer a cart
    deleted = _customer_cart(customer)
    deleted.deleted_at = timezone.now()
    deleted.save(update_fields=["deleted_at"])
    api_client.force_authenticate(user=customer)

    response = api_client.patch(CUSTOMER_CONTACT_URL, {"phone": "01899887766"}, format="json")

    assert response.status_code == 404
    assert response.data["error"]["code"] == "cart_not_found"
    assert _contact_phone(placed) == ""
    assert _contact_phone(deleted) == ""


def test_anonymous_caller_cannot_use_the_customer_endpoint(api_client):
    _, token = _guest_cart()

    response = api_client.patch(
        CUSTOMER_CONTACT_URL, {"phone": "01899887766"}, format="json", **_headers(token)
    )

    assert response.status_code == 401


# --- the shared service ------------------------------------------------------------


def test_service_refuses_an_order_that_is_past_pending():
    order = _customer_cart(CustomerUserFactory())
    checkout(order=order)

    with pytest.raises(BusinessRuleViolationError) as raised:
        set_cart_contact_phone(cart=order, phone="01899887766")

    assert raised.value.code == "not_pending"
    assert _contact_phone(order) == ""


def test_guest_name_is_saved_with_the_phone_and_a_blank_name_keeps_it(api_client):
    cart, token = _guest_cart()

    saved = api_client.patch(
        GUEST_CONTACT_URL,
        {"phone": "01711223344", "name": "  Rahim   Uddin "},
        format="json",
        **_headers(token),
    )
    again = _save_guest(api_client, token, "01811223344")

    assert saved.status_code == 200, saved.data
    assert saved.data["data"] == {"contact_phone": "01711223344", "contact_name": "Rahim Uddin"}
    assert again.data["data"] == {"contact_phone": "01811223344", "contact_name": "Rahim Uddin"}
    cart.refresh_from_db()
    assert cart.contact_name == "Rahim Uddin"
