"""Regression tests for the order/shipment/return invariants.

Each test here pins a specific way stock or money could previously be created
out of thin air: re-entrant checkout double-reserving, over-shipping a line,
over-returning it, returning units that never shipped, refunding more than was
captured, and returns that moved stock without moving the ledger.
"""

from __future__ import annotations

from datetime import timedelta
from decimal import Decimal

import pytest
from django.utils import timezone

from apps.accounting.constants import ACCOUNT_CODES
from apps.accounting.models import JournalEntry, JournalEntryLine
from apps.accounts.factories import CustomerUserFactory
from apps.catalog.factories import BundleItemFactory, ProductVariantFactory
from apps.common.exceptions import BusinessRuleViolationError
from apps.inventory.constants import MovementType
from apps.inventory.selectors.stock import get_stock_item
from apps.inventory.services.stock import record_movement
from apps.orders.models import (
    Payment,
    ReturnRMA,
    ReturnRMALine,
    SalesOrder,
    Shipment,
    StockReservation,
)
from apps.orders.services.carts import add_line, create_order, get_or_create_cart
from apps.orders.services.checkout import checkout
from apps.orders.services.payments import capture_payment, refund_payment
from apps.orders.services.reservations import release_expired_reservations
from apps.orders.services.returns import (
    approve_rma,
    create_rma,
    grade_rma_line,
    receive_rma,
    reject_rma,
)
from apps.orders.services.shipments import create_shipment, update_shipment_status

pytestmark = pytest.mark.django_db


def _stocked_variant(quantity: int = 20, unit_cost: Decimal = Decimal("5.00")):
    variant = ProductVariantFactory()
    record_movement(
        variant=variant,
        movement_type=MovementType.PURCHASE_IN,
        quantity=quantity,
        unit_cost=unit_cost,
    )
    return variant


def _confirmed_order(quantity: int = 5, stock: int = 20):
    customer = CustomerUserFactory()
    variant = _stocked_variant(quantity=stock)
    order = get_or_create_cart(customer)
    add_line(order=order, variant=variant, quantity=quantity)
    checkout(order=order)
    capture_payment(order=order, amount=order.grand_total)
    order.refresh_from_db()
    return order, variant


def _shipped_order(quantity: int = 5, stock: int = 20):
    order, variant = _confirmed_order(quantity=quantity, stock=stock)
    create_shipment(order=order, lines=[{"order_line": order.lines.get(), "quantity": quantity}])
    order.refresh_from_db()
    return order, variant


# --------------------------------------------------------------------------
# Checkout is not re-entrant
# --------------------------------------------------------------------------


def test_checkout_twice_does_not_reserve_stock_twice():
    customer = CustomerUserFactory()
    variant = _stocked_variant(quantity=20)
    cart = get_or_create_cart(customer)
    add_line(order=cart, variant=variant, quantity=5)

    checkout(order=cart)
    with pytest.raises(BusinessRuleViolationError) as exc:
        checkout(order=cart)
    assert exc.value.code == "not_pending"

    stock_item = get_stock_item(variant=variant)
    assert stock_item.quantity_reserved == 5


def test_checkout_moves_order_out_of_the_cart_state():
    customer = CustomerUserFactory()
    variant = _stocked_variant()
    cart = get_or_create_cart(customer)
    add_line(order=cart, variant=variant, quantity=1)

    checkout(order=cart)

    assert cart.status == SalesOrder.Status.AWAITING_PAYMENT
    # A fresh cart lookup must not hand back the checked-out order.
    assert get_or_create_cart(customer).id != cart.id


def test_lines_cannot_be_added_after_checkout():
    """Lines added post-checkout would have no stock reservation behind them."""
    customer = CustomerUserFactory()
    variant = _stocked_variant()
    cart = get_or_create_cart(customer)
    add_line(order=cart, variant=variant, quantity=1)
    checkout(order=cart)

    with pytest.raises(BusinessRuleViolationError) as exc:
        add_line(order=cart, variant=variant, quantity=3)
    assert exc.value.code == "not_pending"


def test_payment_cannot_be_captured_before_checkout():
    customer = CustomerUserFactory()
    variant = _stocked_variant()
    cart = get_or_create_cart(customer)
    add_line(order=cart, variant=variant, quantity=1)

    with pytest.raises(BusinessRuleViolationError) as exc:
        capture_payment(order=cart, amount=cart.grand_total)
    assert exc.value.code == "invalid_order_status"


def test_admin_created_order_is_separate_from_the_customers_cart():
    customer = CustomerUserFactory()
    variant = _stocked_variant()
    own_cart = get_or_create_cart(customer)
    add_line(order=own_cart, variant=variant, quantity=2)

    staff_order = create_order(customer=customer)

    assert staff_order.id != own_cart.id
    assert staff_order.lines.count() == 0


# --------------------------------------------------------------------------
# Shipment quantities
# --------------------------------------------------------------------------


def test_cannot_ship_more_than_ordered():
    order, _variant = _confirmed_order(quantity=2, stock=50)

    with pytest.raises(BusinessRuleViolationError) as exc:
        create_shipment(order=order, lines=[{"order_line": order.lines.get(), "quantity": 3}])
    assert exc.value.code == "over_shipment"


def test_cannot_ship_the_remainder_twice():
    order, _ = _confirmed_order(quantity=4, stock=50)
    order_line = order.lines.get()

    create_shipment(order=order, lines=[{"order_line": order_line, "quantity": 3}])
    order_line.refresh_from_db()
    assert order_line.shipped_quantity == 3

    with pytest.raises(BusinessRuleViolationError) as exc:
        create_shipment(order=order, lines=[{"order_line": order_line, "quantity": 2}])
    assert exc.value.code == "over_shipment"


def test_duplicate_lines_in_one_payload_are_combined_before_validation():
    """Two entries of 2 against a 3-unit line is a request for 4 — not two
    independent requests that each pass on their own."""
    order, _ = _confirmed_order(quantity=3, stock=50)
    order_line = order.lines.get()

    with pytest.raises(BusinessRuleViolationError) as exc:
        create_shipment(
            order=order,
            lines=[
                {"order_line": order_line, "quantity": 2},
                {"order_line": order_line, "quantity": 2},
            ],
        )
    assert exc.value.code == "over_shipment"


def test_partial_shipment_leaves_the_order_confirmed_and_shippable():
    order, variant = _confirmed_order(quantity=5, stock=50)
    order_line = order.lines.get()

    create_shipment(order=order, lines=[{"order_line": order_line, "quantity": 2}])
    order.refresh_from_db()
    assert order.status == SalesOrder.Status.CONFIRMED

    create_shipment(order=order, lines=[{"order_line": order_line, "quantity": 3}])
    order.refresh_from_db()
    assert order.status == SalesOrder.Status.SHIPPED

    order_line.refresh_from_db()
    assert order_line.shipped_quantity == 5
    stock_item = get_stock_item(variant=variant)
    assert stock_item.quantity_on_hand == 45
    assert stock_item.quantity_reserved == 0


def test_shipment_rejects_a_line_from_another_order():
    order, _ = _confirmed_order(quantity=2, stock=50)
    other_order, _ = _confirmed_order(quantity=2, stock=50)

    with pytest.raises(BusinessRuleViolationError) as exc:
        create_shipment(order=order, lines=[{"order_line": other_order.lines.get(), "quantity": 1}])
    assert exc.value.code == "line_order_mismatch"


# --------------------------------------------------------------------------
# Return quantities
# --------------------------------------------------------------------------


def test_cannot_return_more_than_was_shipped():
    order, _ = _shipped_order(quantity=2, stock=50)

    with pytest.raises(BusinessRuleViolationError) as exc:
        create_rma(order=order, lines=[{"order_line": order.lines.get(), "quantity": 3}])
    assert exc.value.code == "over_return"


def test_cannot_return_units_that_have_not_shipped():
    order, _ = _confirmed_order(quantity=2, stock=50)

    with pytest.raises(BusinessRuleViolationError) as exc:
        create_rma(order=order, lines=[{"order_line": order.lines.get(), "quantity": 1}])
    assert exc.value.code == "line_not_shipped"


def test_cannot_return_against_an_unpaid_order():
    customer = CustomerUserFactory()
    variant = _stocked_variant()
    cart = get_or_create_cart(customer)
    add_line(order=cart, variant=variant, quantity=1)

    with pytest.raises(BusinessRuleViolationError) as exc:
        create_rma(order=cart, lines=[{"order_line": cart.lines.get(), "quantity": 1}])
    assert exc.value.code == "order_not_returnable"


def test_a_second_rma_cannot_claim_units_already_claimed():
    order, _ = _shipped_order(quantity=3, stock=50)
    order_line = order.lines.get()

    create_rma(order=order, lines=[{"order_line": order_line, "quantity": 2}])
    order_line.refresh_from_db()
    assert order_line.returned_quantity == 2

    with pytest.raises(BusinessRuleViolationError) as exc:
        create_rma(order=order, lines=[{"order_line": order_line, "quantity": 2}])
    assert exc.value.code == "over_return"

    # The single remaining unit is still returnable.
    create_rma(order=order, lines=[{"order_line": order_line, "quantity": 1}])


def test_rejecting_an_rma_releases_its_claim():
    order, _ = _shipped_order(quantity=2, stock=50)
    order_line = order.lines.get()

    rma = create_rma(order=order, lines=[{"order_line": order_line, "quantity": 2}])
    reject_rma(rma=rma)

    order_line.refresh_from_db()
    assert order_line.returned_quantity == 0
    # Units are claimable again under a new request.
    create_rma(order=order, lines=[{"order_line": order_line, "quantity": 2}])


def test_receiving_requires_every_line_to_be_graded():
    order, _ = _shipped_order(quantity=2, stock=50)
    rma = create_rma(order=order, lines=[{"order_line": order.lines.get(), "quantity": 2}])
    approve_rma(rma=rma)

    with pytest.raises(BusinessRuleViolationError) as exc:
        receive_rma(rma=rma)
    assert exc.value.code == "ungraded_lines"


def test_returning_a_bundle_restocks_its_components():
    """The shipment consumed components, so the return must give components
    back — not stock of the bundle SKU, which is never held."""
    customer = CustomerUserFactory()
    component_a = ProductVariantFactory()
    component_b = ProductVariantFactory()
    bundle = ProductVariantFactory()
    BundleItemFactory(bundle_variant=bundle, component_variant=component_a, quantity=2)
    BundleItemFactory(bundle_variant=bundle, component_variant=component_b, quantity=1)
    for component in (component_a, component_b):
        record_movement(
            variant=component,
            movement_type=MovementType.PURCHASE_IN,
            quantity=10,
            unit_cost=Decimal("3.00"),
        )

    order = get_or_create_cart(customer)
    add_line(order=order, variant=bundle, quantity=1)
    checkout(order=order)
    capture_payment(order=order, amount=order.grand_total)
    order.refresh_from_db()
    create_shipment(order=order, lines=[{"order_line": order.lines.get(), "quantity": 1}])

    assert get_stock_item(variant=component_a).quantity_on_hand == 8
    assert get_stock_item(variant=component_b).quantity_on_hand == 9

    rma = create_rma(order=order, lines=[{"order_line": order.lines.get(), "quantity": 1}])
    approve_rma(rma=rma)
    grade_rma_line(line=rma.lines.get(), condition=ReturnRMALine.Condition.SELLABLE)
    receive_rma(rma=rma)

    assert get_stock_item(variant=component_a).quantity_on_hand == 10
    assert get_stock_item(variant=component_b).quantity_on_hand == 9 + 1
    # The bundle SKU itself must never have gained phantom stock.
    assert get_stock_item(variant=bundle) is None


# --------------------------------------------------------------------------
# Returns move the ledger, not just the shelf
# --------------------------------------------------------------------------


def _account_balance(code_key: str) -> tuple[Decimal, Decimal]:
    rows = JournalEntryLine.objects.filter(account__code=ACCOUNT_CODES[code_key])
    debit = sum((row.debit for row in rows), Decimal("0"))
    credit = sum((row.credit for row in rows), Decimal("0"))
    return debit, credit


def test_receiving_a_sellable_return_reverses_revenue_and_cogs():
    order, _variant = _shipped_order(quantity=2, stock=50)
    rma = create_rma(order=order, lines=[{"order_line": order.lines.get(), "quantity": 2}])
    approve_rma(rma=rma)
    grade_rma_line(line=rma.lines.get(), condition=ReturnRMALine.Condition.SELLABLE)

    receive_rma(rma=rma)

    # Contra-revenue booked for the returned goods.
    returns_debit, _ = _account_balance("sales_returns")
    assert returns_debit == order.lines.get().unit_price * 2
    # Cost taken back out of COGS and returned to the inventory asset.
    _, cogs_credit = _account_balance("cogs")
    assert cogs_credit == Decimal("5.00") * 2


def test_receiving_a_damaged_return_books_the_cost_as_shrinkage():
    order, _ = _shipped_order(quantity=2, stock=50)
    rma = create_rma(order=order, lines=[{"order_line": order.lines.get(), "quantity": 2}])
    approve_rma(rma=rma)
    grade_rma_line(line=rma.lines.get(), condition=ReturnRMALine.Condition.DAMAGED)

    receive_rma(rma=rma)

    shrinkage_debit, _ = _account_balance("inventory_shrinkage")
    assert shrinkage_debit == Decimal("5.00") * 2


def _discounted_shipped_order(
    quantity: int = 4, stock: int = 50, price: Decimal = Decimal("50.00")
):
    """A shipped order with a 10% order-level coupon applied, so its lines'
    unit_price stays the pre-discount price — discount_total is the only
    place the discount lives, matching how apply_coupon actually works."""
    from apps.orders.factories import CouponFactory
    from apps.orders.services.coupons import apply_coupon

    customer = CustomerUserFactory()
    variant = ProductVariantFactory(price=price)
    record_movement(
        variant=variant, movement_type=MovementType.PURCHASE_IN, quantity=stock,
        unit_cost=Decimal("5.00"),
    )
    order = get_or_create_cart(customer)
    add_line(order=order, variant=variant, quantity=quantity)
    coupon = CouponFactory()
    apply_coupon(order=order, code=coupon.code)
    order.refresh_from_db()
    checkout(order=order)
    capture_payment(order=order, amount=order.grand_total)
    order.refresh_from_db()
    create_shipment(order=order, lines=[{"order_line": order.lines.get(), "quantity": quantity}])
    order.refresh_from_db()
    return order


def test_full_return_on_a_discounted_order_reverses_the_discounted_amount():
    """An order-level coupon discounts the whole order, not any one line —
    unit_price on the line is still the pre-discount price. A return must
    reverse revenue at the same discounted rate the customer actually paid,
    not the full pre-discount line amount."""
    order = _discounted_shipped_order(quantity=4)
    line = order.lines.get()
    assert order.discount_total == Decimal("20.00")  # 10% of 200.00

    rma = create_rma(order=order, lines=[{"order_line": line, "quantity": 4}])
    approve_rma(rma=rma)
    grade_rma_line(line=rma.lines.get(), condition=ReturnRMALine.Condition.SELLABLE)
    receive_rma(rma=rma)

    returns_debit, _ = _account_balance("sales_returns")
    assert returns_debit == Decimal("180.00")  # 200.00 line revenue less 10%
    # A full return must not credit back more than the order's own discounted
    # subtotal — reversing the undiscounted amount would exceed it.
    assert returns_debit <= order.subtotal - order.discount_total


def test_partial_return_on_a_discounted_order_reverses_only_its_share():
    order = _discounted_shipped_order(quantity=4)
    line = order.lines.get()

    rma = create_rma(order=order, lines=[{"order_line": line, "quantity": 2}])
    approve_rma(rma=rma)
    grade_rma_line(line=rma.lines.get(), condition=ReturnRMALine.Condition.SELLABLE)
    receive_rma(rma=rma)

    returns_debit, _ = _account_balance("sales_returns")
    # Half the units, at the same 10% discount rate: 100.00 less 10%.
    assert returns_debit == Decimal("90.00")
    assert returns_debit <= order.subtotal - order.discount_total


def test_every_posted_journal_entry_balances_after_a_full_return_cycle():
    """The end-to-end guard: whatever the individual postings do, no entry
    may end up with debits != credits once stored at 2dp."""
    order, _ = _shipped_order(quantity=3, stock=50)
    rma = create_rma(order=order, lines=[{"order_line": order.lines.get(), "quantity": 3}])
    approve_rma(rma=rma)
    grade_rma_line(line=rma.lines.get(), condition=ReturnRMALine.Condition.SELLABLE)
    receive_rma(rma=rma)

    entries = JournalEntry.objects.filter(status=JournalEntry.Status.POSTED)
    assert entries.exists()
    for entry in entries:
        debit = sum((line.debit for line in entry.lines.all()), Decimal("0"))
        credit = sum((line.credit for line in entry.lines.all()), Decimal("0"))
        assert debit == credit, f"{entry.reference_type} is out of balance: {debit} != {credit}"


def test_journal_entries_balance_when_costs_carry_four_decimal_places():
    """avg_cost is stored at 4dp but journal columns are 2dp. Rounding each
    line independently on write used to leave entries a cent out."""
    customer = CustomerUserFactory()
    variant = _stocked_variant(quantity=3, unit_cost=Decimal("3.3333"))
    order = get_or_create_cart(customer)
    add_line(order=order, variant=variant, quantity=3)
    checkout(order=order)
    capture_payment(order=order, amount=order.grand_total)
    order.refresh_from_db()

    create_shipment(order=order, lines=[{"order_line": order.lines.get(), "quantity": 3}])

    for entry in JournalEntry.objects.filter(status=JournalEntry.Status.POSTED):
        debit = sum((line.debit for line in entry.lines.all()), Decimal("0"))
        credit = sum((line.credit for line in entry.lines.all()), Decimal("0"))
        assert debit == credit, f"{entry.reference_type} is out of balance: {debit} != {credit}"


# --------------------------------------------------------------------------
# Refunds
# --------------------------------------------------------------------------


def test_partial_refunds_accumulate_and_cannot_exceed_the_capture():
    order, _ = _shipped_order(quantity=2, stock=50)
    payment = order.payments.get()
    total = payment.amount

    refund_payment(payment=payment, amount=Decimal("1.00"))
    payment.refresh_from_db()
    assert payment.refunded_amount == Decimal("1.00")
    # Still partly outstanding, so the payment is not yet fully refunded.
    assert payment.status == Payment.Status.CAPTURED

    with pytest.raises(BusinessRuleViolationError) as exc:
        refund_payment(payment=payment, amount=total)
    assert exc.value.code == "refund_exceeds_payment"


def test_refunding_the_remaining_balance_closes_the_payment():
    order, _ = _shipped_order(quantity=2, stock=50)
    payment = order.payments.get()

    refund_payment(payment=payment, amount=Decimal("1.00"))
    refund_payment(payment=payment)  # no amount == whatever is left

    payment.refresh_from_db()
    assert payment.refunded_amount == payment.amount
    assert payment.status == Payment.Status.REFUNDED

    with pytest.raises(BusinessRuleViolationError) as exc:
        refund_payment(payment=payment, amount=Decimal("1.00"))
    assert exc.value.code == "not_captured"


def test_refund_rejects_a_non_positive_amount():
    order, _ = _shipped_order(quantity=2, stock=50)

    with pytest.raises(BusinessRuleViolationError) as exc:
        refund_payment(payment=order.payments.get(), amount=Decimal("0"))
    assert exc.value.code == "invalid_amount"


def test_cancelling_a_checked_out_order_releases_its_reservations():
    from apps.orders.services.orders import cancel_order

    customer = CustomerUserFactory()
    variant = _stocked_variant(quantity=20)
    order = get_or_create_cart(customer)
    add_line(order=order, variant=variant, quantity=4)
    checkout(order=order)
    assert get_stock_item(variant=variant).quantity_reserved == 4

    cancel_order(order=order)

    order.refresh_from_db()
    assert order.status == SalesOrder.Status.CANCELLED
    stock_item = get_stock_item(variant=variant)
    assert stock_item.quantity_reserved == 0
    assert stock_item.quantity_on_hand == 20


def test_rma_status_flow_is_enforced():
    order, _ = _shipped_order(quantity=1, stock=50)
    rma = create_rma(order=order, lines=[{"order_line": order.lines.get(), "quantity": 1}])

    # Cannot receive before approval.
    with pytest.raises(BusinessRuleViolationError) as exc:
        receive_rma(rma=rma)
    assert exc.value.code == "invalid_rma_status"

    approve_rma(rma=rma)
    # Cannot approve twice.
    with pytest.raises(BusinessRuleViolationError):
        approve_rma(rma=rma)

    grade_rma_line(line=rma.lines.get(), condition=ReturnRMALine.Condition.SELLABLE)
    receive_rma(rma=rma)
    rma.refresh_from_db()
    assert rma.status == ReturnRMA.Status.RECEIVED


def test_order_becomes_delivered_once_every_shipment_is_delivered():
    order, _ = _confirmed_order(quantity=2, stock=50)
    order_line = order.lines.get()

    first = create_shipment(order=order, lines=[{"order_line": order_line, "quantity": 1}])
    second = create_shipment(order=order, lines=[{"order_line": order_line, "quantity": 1}])
    order.refresh_from_db()
    assert order.status == SalesOrder.Status.SHIPPED

    update_shipment_status(shipment=first, status=Shipment.Status.DELIVERED)
    order.refresh_from_db()
    assert order.status == SalesOrder.Status.SHIPPED

    update_shipment_status(shipment=second, status=Shipment.Status.DELIVERED)
    order.refresh_from_db()
    assert order.status == SalesOrder.Status.DELIVERED


def test_shipping_a_line_closes_its_stock_reservations():
    order, variant = _confirmed_order(quantity=5, stock=20)
    reservation = StockReservation.objects.get(order_line__order=order)
    assert reservation.status == StockReservation.Status.ACTIVE

    create_shipment(order=order, lines=[{"order_line": order.lines.get(), "quantity": 5}])

    order.refresh_from_db()
    reservation.refresh_from_db()
    assert order.status == SalesOrder.Status.SHIPPED
    assert reservation.status == StockReservation.Status.RELEASED
    stock_item = get_stock_item(variant=variant)
    assert stock_item.quantity_reserved == 0
    assert stock_item.quantity_on_hand == 15


def test_a_partly_shipped_line_keeps_its_reservation_until_the_last_consignment():
    order, _ = _confirmed_order(quantity=4, stock=20)
    order_line = order.lines.get()
    reservation = StockReservation.objects.get(order_line=order_line)

    create_shipment(order=order, lines=[{"order_line": order_line, "quantity": 1}])
    reservation.refresh_from_db()
    assert reservation.status == StockReservation.Status.ACTIVE

    order.refresh_from_db()
    create_shipment(order=order, lines=[{"order_line": order.lines.get(), "quantity": 3}])
    reservation.refresh_from_db()
    assert reservation.status == StockReservation.Status.RELEASED


def test_shipping_a_bundle_closes_every_component_reservation():
    customer = CustomerUserFactory()
    bundle = ProductVariantFactory()
    for _ in range(2):
        component = ProductVariantFactory()
        record_movement(
            variant=component,
            movement_type=MovementType.PURCHASE_IN,
            quantity=20,
            unit_cost=Decimal("5.00"),
        )
        BundleItemFactory(bundle_variant=bundle, component_variant=component, quantity=1)
    order = get_or_create_cart(customer)
    add_line(order=order, variant=bundle, quantity=2)
    checkout(order=order)
    capture_payment(order=order, amount=order.grand_total)
    order.refresh_from_db()
    assert StockReservation.objects.filter(order_line__order=order).count() == 2

    create_shipment(order=order, lines=[{"order_line": order.lines.get(), "quantity": 2}])

    assert not StockReservation.objects.filter(
        order_line__order=order, status=StockReservation.Status.ACTIVE
    ).exists()


def test_the_expiry_sweeper_cannot_double_release_a_shipped_order():
    """The sweeper releases a row's full quantity against the Reserved counter,
    so a hold left open by a shipment would be handed back twice."""
    order, variant = _shipped_order(quantity=5, stock=20)
    StockReservation.objects.filter(order_line__order=order).update(
        expires_at=timezone.now() - timedelta(minutes=1)
    )

    assert release_expired_reservations() == 0

    stock_item = get_stock_item(variant=variant)
    assert stock_item.quantity_reserved == 0
    assert stock_item.quantity_on_hand == 15
