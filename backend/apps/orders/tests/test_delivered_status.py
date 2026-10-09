"""An order reaches `delivered` through its consignments. The admin override
may record delivery only once the shared completion rule already holds, so it
can never leave stock reserved, skip the stock-out, or post it twice."""

from __future__ import annotations

from decimal import Decimal

import pytest
from django.db import connection
from django.test.utils import CaptureQueriesContext

from apps.accounts.factories import CustomerUserFactory
from apps.catalog.factories import ProductVariantFactory
from apps.common.exceptions import BusinessRuleViolationError
from apps.inventory.constants import MovementType
from apps.inventory.models import StockLedgerEntry
from apps.inventory.selectors.stock import get_stock_item
from apps.inventory.services.stock import record_movement
from apps.orders.models import SalesOrder, Shipment, StockReservation
from apps.orders.selectors.shipments import order_shipments_complete
from apps.orders.services.carts import add_line, get_or_create_cart
from apps.orders.services.checkout import checkout
from apps.orders.services.orders import set_order_status
from apps.orders.services.payments import capture_payment
from apps.orders.services.shipments import create_shipment, update_shipment_status

pytestmark = pytest.mark.django_db


def _variant(stock: int = 20):
    variant = ProductVariantFactory()
    record_movement(
        variant=variant,
        movement_type=MovementType.PURCHASE_IN,
        quantity=stock,
        unit_cost=Decimal("5"),
    )
    return variant


def _checked_out(*quantities: int):
    order = get_or_create_cart(CustomerUserFactory())
    variants = []
    for quantity in quantities:
        variant = _variant()
        add_line(order=order, variant=variant, quantity=quantity)
        variants.append(variant)
    checkout(order=order)
    order.refresh_from_db()
    return order, variants


def _confirmed(*quantities: int):
    order, variants = _checked_out(*quantities)
    capture_payment(order=order, amount=order.grand_total)
    order.refresh_from_db()
    return order, variants


def _ship(order, quantities_by_line: dict) -> Shipment:
    return create_shipment(
        order=order,
        lines=[{"order_line": line, "quantity": qty} for line, qty in quantities_by_line.items()],
    )


def _ship_all(order) -> Shipment:
    return _ship(order, {line: line.quantity for line in order.lines.all()})


def _refuse_delivered(order) -> None:
    previous = SalesOrder.objects.get(pk=order.pk).status
    with pytest.raises(BusinessRuleViolationError) as exc:
        set_order_status(order=order, new_status=SalesOrder.Status.DELIVERED)
    assert exc.value.code == "shipments_incomplete"
    assert SalesOrder.objects.get(pk=order.pk).status == previous


def _status(order) -> str:
    order.refresh_from_db()
    return order.status


def _sales_out_total(variant) -> int:
    return sum(
        abs(entry.quantity)
        for entry in StockLedgerEntry.objects.filter(
            variant=variant, movement_type=MovementType.SALES_OUT
        )
    )


def _active_reservations(order) -> int:
    return StockReservation.objects.filter(
        order_line__order=order, status=StockReservation.Status.ACTIVE
    ).count()


# 1. CONFIRMED -> DELIVERED with no shipment ---------------------------------


def test_confirmed_order_without_shipment_cannot_be_marked_delivered():
    order, _ = _confirmed(2)

    _refuse_delivered(order)

    assert _active_reservations(order) == 1


# 2. Intermediate statuses -> DELIVERED with requirements unmet ---------------


def test_awaiting_payment_order_cannot_be_marked_delivered():
    order, _ = _checked_out(2)
    assert order.status == SalesOrder.Status.AWAITING_PAYMENT

    _refuse_delivered(order)


def test_order_overridden_to_shipped_without_shipments_cannot_be_marked_delivered():
    order, _ = _confirmed(2)
    # The override no longer allows this jump; older orders can still be in it.
    SalesOrder.objects.filter(pk=order.pk).update(status=SalesOrder.Status.SHIPPED)

    _refuse_delivered(order)


def test_marking_a_shipped_order_delivered_delivers_its_consignment_in_transit():
    order, (variant,) = _confirmed(2)
    shipment = _ship_all(order)
    update_shipment_status(shipment=shipment, status=Shipment.Status.OUT_FOR_DELIVERY)
    assert _status(order) == SalesOrder.Status.SHIPPED

    set_order_status(order=order, new_status=SalesOrder.Status.DELIVERED)

    shipment.refresh_from_db()
    assert shipment.status == Shipment.Status.DELIVERED
    assert shipment.delivered_at is not None
    assert _status(order) == SalesOrder.Status.DELIVERED
    assert _sales_out_total(variant) == 2  # stock left once, at shipment


# 3. Normal flow ----------------------------------------------------------------


def test_create_ship_deliver_flow_delivers_the_order():
    order, _ = _confirmed(2)
    shipment = _ship_all(order)

    update_shipment_status(shipment=shipment, status=Shipment.Status.SHIPPED)
    assert _status(order) == SalesOrder.Status.SHIPPED
    update_shipment_status(shipment=shipment, status=Shipment.Status.DELIVERED)

    assert _status(order) == SalesOrder.Status.DELIVERED


# 4. Multiple / partial shipments -------------------------------------------------


def test_partial_shipments_deliver_only_once_everything_is_shipped_and_delivered():
    order, _ = _confirmed(3)
    line = order.lines.get()

    first = _ship(order, {line: 1})
    update_shipment_status(shipment=first, status=Shipment.Status.DELIVERED)
    assert _status(order) == SalesOrder.Status.CONFIRMED  # 2 units never shipped
    _refuse_delivered(order)

    second = _ship(order, {line: 2})
    assert _status(order) == SalesOrder.Status.SHIPPED

    update_shipment_status(shipment=second, status=Shipment.Status.DELIVERED)
    assert _status(order) == SalesOrder.Status.DELIVERED


def test_partially_shipped_multi_line_order_cannot_be_marked_delivered():
    order, _ = _confirmed(1, 2)
    first_line, second_line = order.lines.order_by("created_at")
    shipment = _ship(order, {first_line: 1, second_line: 1})
    update_shipment_status(shipment=shipment, status=Shipment.Status.DELIVERED)

    _refuse_delivered(order)


def test_delivered_plus_cancelled_consignment_does_not_count_the_cancelled_units():
    order, _ = _confirmed(2)
    line = order.lines.get()
    delivered = _ship(order, {line: 1})
    update_shipment_status(shipment=delivered, status=Shipment.Status.DELIVERED)
    cancelled = _ship(order, {line: 1})
    update_shipment_status(shipment=cancelled, status=Shipment.Status.CANCELLED)

    assert _status(order) == SalesOrder.Status.SHIPPED
    _refuse_delivered(order)


def test_all_consignments_cancelled_can_never_be_delivered():
    order, _ = _confirmed(2)
    shipment = _ship_all(order)
    update_shipment_status(shipment=shipment, status=Shipment.Status.CANCELLED)

    assert _status(order) == SalesOrder.Status.SHIPPED
    _refuse_delivered(order)


@pytest.mark.parametrize("outcome", [Shipment.Status.FAILED, Shipment.Status.RETURNED])
def test_failed_or_returned_units_do_not_count_as_delivered(outcome):
    order, _ = _confirmed(2)
    line = order.lines.get()
    delivered = _ship(order, {line: 1})
    other = _ship(order, {line: 1})
    update_shipment_status(shipment=other, status=outcome)

    update_shipment_status(shipment=delivered, status=Shipment.Status.DELIVERED)

    assert _status(order) == SalesOrder.Status.SHIPPED
    _refuse_delivered(order)


def test_partial_delivery_across_several_lines_stays_undelivered():
    order, _ = _confirmed(2, 3)
    first_line, second_line = order.lines.order_by("created_at")
    complete_first = _ship(order, {first_line: 2, second_line: 2})
    rest_of_second = _ship(order, {second_line: 1})
    update_shipment_status(shipment=complete_first, status=Shipment.Status.DELIVERED)
    update_shipment_status(shipment=rest_of_second, status=Shipment.Status.CANCELLED)

    assert _status(order) == SalesOrder.Status.SHIPPED
    _refuse_delivered(order)


def test_override_is_accepted_once_delivered_consignments_cover_every_line():
    """The override can still record delivery the lifecycle did not, e.g. an
    order an operator previously overrode to `confirmed` after shipping."""
    order, _ = _confirmed(1, 2)
    shipment = _ship_all(order)
    SalesOrder.objects.filter(pk=order.pk).update(status=SalesOrder.Status.CONFIRMED)
    update_shipment_status(shipment=shipment, status=Shipment.Status.DELIVERED)
    assert _status(order) == SalesOrder.Status.CONFIRMED  # lifecycle only advances `shipped`

    set_order_status(order=order, new_status=SalesOrder.Status.DELIVERED)

    assert _status(order) == SalesOrder.Status.DELIVERED


# 7. Repeated / interleaved shipment updates ---------------------------------


def test_repeated_delivery_of_one_consignment_does_not_deliver_the_order_early():
    order, _ = _confirmed(2)
    line = order.lines.get()
    first = _ship(order, {line: 1})
    second = _ship(order, {line: 1})

    update_shipment_status(shipment=first, status=Shipment.Status.DELIVERED)
    with pytest.raises(BusinessRuleViolationError) as exc:
        update_shipment_status(shipment=first, status=Shipment.Status.DELIVERED)
    assert exc.value.code == "terminal_status"
    update_shipment_status(shipment=second, status=Shipment.Status.OUT_FOR_DELIVERY)
    update_shipment_status(shipment=second, status=Shipment.Status.OUT_FOR_DELIVERY)
    assert _status(order) == SalesOrder.Status.SHIPPED

    update_shipment_status(shipment=second, status=Shipment.Status.DELIVERED)
    assert _status(order) == SalesOrder.Status.DELIVERED


def test_stale_shipment_instance_cannot_deliver_the_order_early():
    """A second caller holding an outdated copy of the order still goes through
    the locked, freshly-read completion check."""
    order, _ = _confirmed(2)
    line = order.lines.get()
    first = _ship(order, {line: 1})
    second = _ship(order, {line: 1})
    stale_first = Shipment.objects.get(pk=first.pk)
    stale_second = Shipment.objects.get(pk=second.pk)

    update_shipment_status(shipment=stale_first, status=Shipment.Status.DELIVERED)
    assert _status(order) == SalesOrder.Status.SHIPPED
    update_shipment_status(shipment=stale_second, status=Shipment.Status.DELIVERED)
    assert _status(order) == SalesOrder.Status.DELIVERED


# 5. Cancellation -------------------------------------------------------------------


def test_cancellation_still_releases_reservations():
    order, (variant,) = _confirmed(4)
    assert get_stock_item(variant=variant).quantity_reserved == 4

    set_order_status(order=order, new_status=SalesOrder.Status.CANCELLED)

    assert _status(order) == SalesOrder.Status.CANCELLED
    assert get_stock_item(variant=variant).quantity_reserved == 0
    assert _active_reservations(order) == 0


def test_a_cancelled_order_cannot_be_reopened_as_delivered():
    order, _ = _confirmed(1)
    set_order_status(order=order, new_status=SalesOrder.Status.CANCELLED)

    with pytest.raises(BusinessRuleViolationError) as exc:
        set_order_status(order=order, new_status=SalesOrder.Status.DELIVERED)

    assert exc.value.code == "order_cancelled"


# 6. Reservations and stock-out on a delivered order ----------------------------


def test_delivered_order_has_no_active_reservations_and_stock_left_exactly_once():
    order, (variant,) = _confirmed(3)
    line = order.lines.get()
    first = _ship(order, {line: 1})
    second = _ship(order, {line: 2})

    update_shipment_status(shipment=first, status=Shipment.Status.DELIVERED)
    update_shipment_status(shipment=second, status=Shipment.Status.DELIVERED)

    assert _status(order) == SalesOrder.Status.DELIVERED
    assert _active_reservations(order) == 0
    assert _sales_out_total(variant) == 3
    stock = get_stock_item(variant=variant)
    assert (stock.quantity_on_hand, stock.quantity_reserved) == (17, 0)


def test_status_changes_after_shipping_never_post_another_stock_out():
    order, (variant,) = _confirmed(2)
    line = order.lines.get()
    delivered = _ship(order, {line: 1})
    cancelled = _ship(order, {line: 1})
    update_shipment_status(shipment=delivered, status=Shipment.Status.DELIVERED)
    update_shipment_status(shipment=cancelled, status=Shipment.Status.CANCELLED)
    entries_before = StockLedgerEntry.objects.filter(variant=variant).count()

    _refuse_delivered(order)

    # Cancelling a consignment moves no stock: the units stay posted out.
    assert StockLedgerEntry.objects.filter(variant=variant).count() == entries_before
    assert _sales_out_total(variant) == 2
    assert _active_reservations(order) == 0


def test_repeating_delivered_on_a_delivered_order_posts_nothing():
    order, (variant,) = _confirmed(2)
    update_shipment_status(shipment=_ship_all(order), status=Shipment.Status.DELIVERED)
    entries_before = StockLedgerEntry.objects.filter(variant=variant).count()

    set_order_status(order=order, new_status=SalesOrder.Status.DELIVERED)  # no-op

    assert _status(order) == SalesOrder.Status.DELIVERED
    assert StockLedgerEntry.objects.filter(variant=variant).count() == entries_before
    assert _sales_out_total(variant) == 2


def test_completion_check_query_count_does_not_grow_with_lines():
    small, _ = _confirmed(1)
    update_shipment_status(shipment=_ship_all(small), status=Shipment.Status.DELIVERED)
    large, _ = _confirmed(1, 2, 3, 1, 2, 3)
    update_shipment_status(shipment=_ship_all(large), status=Shipment.Status.DELIVERED)

    with CaptureQueriesContext(connection) as one_line:
        assert order_shipments_complete(small)
    with CaptureQueriesContext(connection) as six_lines:
        assert order_shipments_complete(large)

    assert len(six_lines) == len(one_line)
