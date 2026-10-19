"""A pre-order variant's minimum quantity is a per-line floor checked when
the order is placed. A cart may sit below it while the shopper builds it up;
every placement route reaches `checkout()`, which refuses a short line."""

from __future__ import annotations

import pytest
from django.db import connection
from django.test.utils import CaptureQueriesContext

from apps.accounts.tests.helpers import create_user
from apps.common.exceptions import BusinessRuleViolationError
from apps.common.params import KIND_PREORDER
from apps.inventory.selectors.warehouse import get_or_create_default_warehouse
from apps.orders.models import SalesOrder
from apps.orders.services.carts import add_line, ensure_preorder_minimums, get_or_create_cart
from apps.orders.services.checkout import checkout

from .test_api import _stocked_variant
from .test_guest_cart_api import CART_URL, LINES_URL, _add, _checkout_payload, _headers
from .test_public_checkout_api import GUEST_CHECKOUT_URL, _configured_delivery, _guest_payload
from .test_unpaid_orders import _preorder_variant

pytestmark = pytest.mark.django_db

CUSTOMER_LINES_URL = "/api/v1/customer/orders/cart/lines/"
CUSTOMER_CHECKOUT_URL = "/api/v1/customer/orders/cart/checkout/"


@pytest.fixture(autouse=True)
def _preorder_warehouse(db):
    return get_or_create_default_warehouse(KIND_PREORDER)


def _cart_with(email: str, variant, quantity: int) -> SalesOrder:
    cart = get_or_create_cart(create_user(email=email))
    add_line(order=cart, variant=variant, quantity=quantity)
    return cart


def _refused(order: SalesOrder) -> BusinessRuleViolationError:
    with pytest.raises(BusinessRuleViolationError) as excinfo:
        checkout(order=order)
    return excinfo.value


# --- checkout service -----------------------------------------------------------


def test_a_line_below_the_minimum_is_refused_at_checkout():
    variant = _preorder_variant(limit=None, preorder_min_quantity=3)
    cart = _cart_with("below-min@example.com", variant, 2)

    error = _refused(cart)

    assert error.code == "preorder_min_quantity_not_met"
    assert "at least 3 units" in error.message
    assert "2 requested" in error.message
    assert variant.sku in error.message
    cart.refresh_from_db()
    assert cart.status == SalesOrder.Status.PENDING


@pytest.mark.parametrize("quantity", [3, 4])
def test_a_line_at_or_above_the_minimum_checks_out(quantity):
    variant = _preorder_variant(limit=None, preorder_min_quantity=3)
    cart = _cart_with(f"at-min-{quantity}@example.com", variant, quantity)

    checkout(order=cart)

    cart.refresh_from_db()
    assert cart.status == SalesOrder.Status.AWAITING_PAYMENT
    assert cart.order_type == SalesOrder.OrderType.PREORDER


def test_the_default_minimum_leaves_a_single_unit_preorder_alone():
    cart = _cart_with("default-min@example.com", _preorder_variant(limit=None), 1)

    checkout(order=cart)

    cart.refresh_from_db()
    assert cart.status == SalesOrder.Status.AWAITING_PAYMENT


def test_a_stock_item_ignores_the_minimum():
    # A legacy stock row may hold a minimum; only the category decides.
    variant = _stocked_variant()
    variant.preorder_min_quantity = 5
    variant.save(update_fields=["preorder_min_quantity"])
    cart = _cart_with("stock-min@example.com", variant, 1)

    checkout(order=cart)

    cart.refresh_from_db()
    assert cart.status == SalesOrder.Status.AWAITING_PAYMENT
    assert cart.order_type == SalesOrder.OrderType.STOCK


def test_the_stock_limit_and_the_minimum_each_hold():
    variant = _preorder_variant(limit=3, preorder_min_quantity=2)

    over_limit = get_or_create_cart(create_user(email="over-limit@example.com"))
    with pytest.raises(BusinessRuleViolationError) as excinfo:
        add_line(order=over_limit, variant=variant, quantity=4)
    assert excinfo.value.code == "preorder_stock_exceeded"

    assert _refused(_cart_with("short@example.com", variant, 1)).code == (
        "preorder_min_quantity_not_met"
    )

    placed = _cart_with("fits@example.com", variant, 2)
    checkout(order=placed)
    assert variant._get_preordered_quantity() == 2

    # One unit of capacity left: below the minimum, and the limit still counts.
    late = _cart_with("late@example.com", variant, 1)
    assert _refused(late).code == "preorder_min_quantity_not_met"
    late.lines.update(quantity=2)
    assert _refused(late).code == "preorder_stock_exceeded"


# --- customer cart API ------------------------------------------------------------


def test_customer_builds_the_quantity_up_then_checks_out(api_client):
    api_client.force_authenticate(user=create_user(email="incremental@example.com"))
    variant = _preorder_variant(limit=None, preorder_min_quantity=3)

    for _ in range(2):
        response = api_client.post(
            CUSTOMER_LINES_URL, {"variant_id": str(variant.id), "quantity": 1}
        )
        assert response.status_code == 201, response.data

    response = api_client.post(CUSTOMER_CHECKOUT_URL)
    assert response.status_code == 400
    assert response.data["error"]["code"] == "preorder_min_quantity_not_met"

    (line,) = SalesOrder.objects.get(customer__email="incremental@example.com").lines.all()
    response = api_client.patch(f"{CUSTOMER_LINES_URL}{line.id}/", {"quantity": 1})
    assert response.status_code == 200, response.data
    response = api_client.patch(f"{CUSTOMER_LINES_URL}{line.id}/", {"quantity": 3})
    assert response.status_code == 200, response.data

    response = api_client.post(CUSTOMER_CHECKOUT_URL)
    assert response.status_code == 200, response.data
    assert response.data["data"]["status"] == SalesOrder.Status.AWAITING_PAYMENT


# --- guest checkout ---------------------------------------------------------------


def test_direct_guest_checkout_combines_duplicates_before_the_minimum(api_client):
    variant = _preorder_variant(limit=None, preorder_min_quantity=5)
    _configured_delivery(kind=KIND_PREORDER)

    def _post(*quantities):
        items = [{"variant_id": str(variant.id), "quantity": q} for q in quantities]
        return api_client.post(
            GUEST_CHECKOUT_URL, _guest_payload(variant, items=items), format="json"
        )

    short = _post(2, 2)
    assert short.status_code == 400
    assert short.data["error"]["code"] == "preorder_min_quantity_not_met"
    assert "4 requested" in short.data["error"]["message"]
    assert not SalesOrder.objects.exists()

    placed = _post(2, 3)
    assert placed.status_code == 201, placed.data
    assert [line["quantity"] for line in placed.data["data"]["lines"]] == [5]


def test_saved_guest_cart_is_held_to_the_minimum(api_client):
    variant = _preorder_variant(limit=None, preorder_min_quantity=3)
    _configured_delivery(keyword=None, kind=KIND_PREORDER)
    response = api_client.post(CART_URL)
    token = response.data["data"]["token"]

    # Below the minimum, the cart still takes and edits lines.
    assert _add(api_client, token, variant, 1).status_code == 201
    added = _add(api_client, token, variant, 1)
    assert added.status_code == 201, added.data
    (line,) = added.data["data"]["lines"]
    assert line["quantity"] == 2

    short = api_client.post(
        GUEST_CHECKOUT_URL, _checkout_payload(), format="json", **_headers(token)
    )
    assert short.status_code == 400
    assert short.data["error"]["code"] == "preorder_min_quantity_not_met"

    updated = api_client.patch(
        f"{LINES_URL}{line['id']}/", {"quantity": 3}, format="json", **_headers(token)
    )
    assert updated.status_code == 200, updated.data

    placed = api_client.post(
        GUEST_CHECKOUT_URL, _checkout_payload(), format="json", **_headers(token)
    )
    assert placed.status_code == 201, placed.data
    order = SalesOrder.objects.get(id=placed.data["data"]["id"])
    assert order.order_type == SalesOrder.OrderType.PREORDER
    assert order.lines.get().quantity == 3


# --- scaling ------------------------------------------------------------------------


def _loaded_lines(order: SalesOrder) -> list:
    return list(order.lines.select_related("variant__product__category"))


def test_minimum_check_runs_no_queries_on_loaded_lines():
    one = _cart_with("one-line@example.com", _preorder_variant(limit=None), 1)
    many = _cart_with("many-lines@example.com", _preorder_variant(limit=None), 1)
    for _ in range(5):
        add_line(order=many, variant=_preorder_variant(limit=None), quantity=1)

    for order in (one, many):
        lines = _loaded_lines(order)
        with CaptureQueriesContext(connection) as queries:
            ensure_preorder_minimums(lines)
        assert len(queries) == 0


def test_checkout_query_count_does_not_grow_with_preorder_lines():
    def _cart(email: str, count: int) -> SalesOrder:
        cart = get_or_create_cart(create_user(email=email))
        for _ in range(count):
            add_line(
                order=cart,
                variant=_preorder_variant(limit=None, preorder_min_quantity=2),
                quantity=2,
            )
        return cart

    # The first checkout of a test warms per-process lookups (tax rate, profile).
    checkout(order=_cart("checkout-warm@example.com", 1))
    one, many = _cart("checkout-one@example.com", 1), _cart("checkout-many@example.com", 5)
    with CaptureQueriesContext(connection) as single:
        checkout(order=one)
    with CaptureQueriesContext(connection) as several:
        checkout(order=many)

    assert len(several) == len(single)
