"""A pre-order is its own kind of order: it never shares a basket with stock
items, it is confirmed by a deposit rather than the full amount, and it ships
only from stock that has arrived and been set aside for it.
"""

from __future__ import annotations

from decimal import Decimal

import pytest

from apps.accounts.constants import UserRole
from apps.accounts.tests.helpers import create_user
from apps.business.selectors.business_profile import get_business_profile
from apps.common.exceptions import BusinessRuleViolationError
from apps.inventory.constants import MovementType
from apps.inventory.models import StockItem
from apps.inventory.services.stock import record_movement
from apps.orders.constants import PaymentMethodKey
from apps.orders.models import Payment, SalesOrder
from apps.orders.selectors.payments import order_balance_due, order_deposit_due
from apps.orders.selectors.preorder_demand import preorder_book_summary, preorder_demand
from apps.orders.services.carts import add_line, get_or_create_cart
from apps.orders.services.checkout import checkout
from apps.orders.services.orders import cancel_order
from apps.orders.services.payments import capture_payment, record_payment_due
from apps.orders.services.preorder_allocation import allocate_preorder_stock
from apps.orders.services.shipments import create_shipment

from .test_api import _stocked_variant
from .test_unpaid_orders import _preorder_variant

pytestmark = pytest.mark.django_db


def _set_deposit(percent: str) -> None:
    profile = get_business_profile()
    profile.preorder_deposit_percent = Decimal(percent)
    profile.save(update_fields=["preorder_deposit_percent"])


def _placed_preorder(email: str, variant, quantity: int = 2) -> SalesOrder:
    cart = get_or_create_cart(create_user(email=email))
    add_line(order=cart, variant=variant, quantity=quantity)
    checkout(order=cart)
    cart.refresh_from_db()
    return cart


def _confirmed_preorder(email: str, variant, quantity: int = 2) -> SalesOrder:
    order = _placed_preorder(email, variant, quantity)
    record_payment_due(order=order, method=PaymentMethodKey.BKASH)
    capture_payment(
        order=order,
        amount=order_deposit_due(order),
        method=PaymentMethodKey.BKASH,
        reference=f"TRX-{order.order_number}",
    )
    order.refresh_from_db()
    return order


def _receive(variant, quantity: int) -> None:
    record_movement(
        variant=variant,
        movement_type=MovementType.PURCHASE_IN,
        quantity=quantity,
        unit_cost=Decimal("5.00"),
    )


def test_a_basket_cannot_hold_both_kinds():
    cart = get_or_create_cart(create_user(email="mixed@example.com"))
    add_line(order=cart, variant=_stocked_variant(), quantity=1)

    with pytest.raises(BusinessRuleViolationError) as exc:
        add_line(order=cart, variant=_preorder_variant(), quantity=1)

    assert exc.value.code == "mixed_basket"


def test_checkout_records_the_kind_of_order():
    preorder = _placed_preorder("kind-preorder@example.com", _preorder_variant())
    stock = get_or_create_cart(create_user(email="kind-stock@example.com"))
    add_line(order=stock, variant=_stocked_variant(), quantity=1)
    checkout(order=stock)
    stock.refresh_from_db()

    assert preorder.order_type == SalesOrder.OrderType.PREORDER
    assert stock.order_type == SalesOrder.OrderType.STOCK


def test_deposit_confirms_a_preorder_and_the_rest_is_taken_later():
    _set_deposit("30")
    order = _placed_preorder("deposit@example.com", _preorder_variant(price=Decimal("1000.00")))
    record_payment_due(order=order, method=PaymentMethodKey.BKASH)
    deposit = order_deposit_due(order)
    assert deposit == (order.grand_total * Decimal("0.30")).quantize(Decimal("0.01"))

    capture_payment(
        order=order, amount=deposit, method=PaymentMethodKey.BKASH, reference="TRX-1"
    )

    order.refresh_from_db()
    assert order.status == SalesOrder.Status.CONFIRMED
    assert order_balance_due(order) == order.grand_total - deposit

    capture_payment(
        order=order,
        amount=order.grand_total - deposit,
        method=PaymentMethodKey.BKASH,
        reference="TRX-2",
    )
    assert order_balance_due(order) == Decimal("0.00")
    assert not Payment.objects.filter(order=order, status=Payment.Status.PENDING).exists()


def test_less_than_the_deposit_does_not_confirm_a_preorder():
    _set_deposit("50")
    order = _placed_preorder("short@example.com", _preorder_variant(price=Decimal("1000.00")))
    record_payment_due(order=order, method=PaymentMethodKey.BKASH)

    capture_payment(
        order=order, amount=Decimal("10.00"), method=PaymentMethodKey.BKASH, reference="TRX-1"
    )

    order.refresh_from_db()
    assert order.status == SalesOrder.Status.AWAITING_PAYMENT


def test_cash_on_delivery_does_not_confirm_a_preorder_that_needs_a_deposit():
    order = _placed_preorder("cod-preorder@example.com", _preorder_variant())

    record_payment_due(order=order, method=PaymentMethodKey.COD)

    order.refresh_from_db()
    assert order.status == SalesOrder.Status.AWAITING_PAYMENT


def test_a_preorder_cannot_ship_before_stock_is_set_aside():
    variant = _preorder_variant()
    order = _confirmed_preorder("no-stock@example.com", variant)
    line = order.lines.get()

    with pytest.raises(BusinessRuleViolationError) as exc:
        create_shipment(order=order, lines=[{"order_line": line, "quantity": 1}])

    assert exc.value.code == "preorder_not_allocated"


def test_arrived_stock_goes_to_the_oldest_waiting_order_first():
    variant = _preorder_variant(limit=None)
    first = _confirmed_preorder("alloc-first@example.com", variant, quantity=2)
    second = _confirmed_preorder("alloc-second@example.com", variant, quantity=2)
    unpaid = _placed_preorder("alloc-unpaid@example.com", variant, quantity=2)
    _receive(variant, 3)

    allocated = allocate_preorder_stock()

    assert [(row["order_id"], row["quantity"]) for row in allocated] == [
        (first.id, 2),
        (second.id, 1),
    ]
    assert unpaid.lines.get().allocated_quantity == 0
    assert StockItem.objects.get(variant=variant).available == 0
    assert allocate_preorder_stock() == []


def test_an_allocated_preorder_ships_from_stock():
    variant = _preorder_variant()
    order = _confirmed_preorder("ships@example.com", variant, quantity=2)
    _receive(variant, 2)
    allocate_preorder_stock()
    line = order.lines.get()

    create_shipment(order=order, lines=[{"order_line": line, "quantity": 2}])

    order.refresh_from_db()
    stock = StockItem.objects.get(variant=variant)
    assert order.status == SalesOrder.Status.SHIPPED
    assert (stock.quantity_on_hand, stock.quantity_reserved) == (0, 0)


def test_cancelling_a_preorder_hands_its_allocated_stock_back():
    variant = _preorder_variant()
    order = _confirmed_preorder("cancel-alloc@example.com", variant, quantity=2)
    _receive(variant, 2)
    allocate_preorder_stock()

    cancel_order(order=order)

    assert StockItem.objects.get(variant=variant).available == 2


def test_demand_and_book_show_what_is_owed():
    _set_deposit("50")
    variant = _preorder_variant(limit=None, price=Decimal("100.00"))
    order = _confirmed_preorder("book@example.com", variant, quantity=4)
    _receive(variant, 1)

    (row,) = preorder_demand()
    summary = preorder_book_summary()

    assert (row["waiting"], row["available"], row["to_buy"]) == (4, 1, 3)
    assert summary["open_orders"] == 1
    assert Decimal(summary["deposits_held"]) == order_deposit_due(order)
    assert Decimal(summary["balances_outstanding"]) == order_balance_due(order)


def test_staff_endpoints_report_and_allocate(api_client):
    api_client.force_authenticate(
        user=create_user(email="preorder-admin@example.com", role=UserRole.ADMIN)
    )
    variant = _preorder_variant()
    order = _confirmed_preorder("endpoint@example.com", variant, quantity=1)
    _receive(variant, 1)

    report = api_client.get("/api/v1/admin/orders/preorder-report/")
    allocation = api_client.post("/api/v1/admin/orders/preorder-allocation/")
    listing = api_client.get("/api/v1/admin/orders/", {"order_type": "preorder"})

    assert report.data["data"]["demand"][0]["waiting"] == 1
    assert allocation.data["data"]["allocated"][0]["order_number"] == order.order_number
    assert [row["id"] for row in listing.data["data"]["results"]] == [str(order.id)]


def test_a_customer_cannot_cancel_a_placed_preorder_alone(api_client):
    customer = create_user(email="self-cancel@example.com")
    cart = get_or_create_cart(customer)
    add_line(order=cart, variant=_preorder_variant(), quantity=1)
    checkout(order=cart)
    api_client.force_authenticate(user=customer)

    response = api_client.post(f"/api/v1/customer/orders/{cart.id}/cancel/")

    assert response.status_code == 409
    assert response.data["error"]["code"] == "preorder_cancel_staff_only"
