"""Order and return events that leave the customer an in-app notification."""

from __future__ import annotations

from decimal import Decimal

import pytest

from apps.accounts.factories import CustomerUserFactory
from apps.accounts.models import Notification
from apps.catalog.factories import ProductVariantFactory
from apps.inventory.constants import MovementType
from apps.inventory.services.stock import record_movement
from apps.orders.models import SalesOrder, Shipment
from apps.orders.services.carts import add_line, get_or_create_cart
from apps.orders.services.checkout import checkout
from apps.orders.services.orders import cancel_order, set_order_status
from apps.orders.services.payments import capture_payment
from apps.orders.services.returns import approve_rma, create_rma, reject_rma
from apps.orders.services.shipments import create_shipment, update_shipment_status

pytestmark = pytest.mark.django_db


def _confirmed_order(customer):
    variant = ProductVariantFactory()
    record_movement(
        variant=variant, movement_type=MovementType.PURCHASE_IN, quantity=20, unit_cost=Decimal("5")
    )
    order = get_or_create_cart(customer)
    add_line(order=order, variant=variant, quantity=2)
    checkout(order=order)
    capture_payment(order=order, amount=order.grand_total)
    order.refresh_from_db()
    return order


def _shipped_order(customer):
    order = _confirmed_order(customer)
    shipment = create_shipment(
        order=order, lines=[{"order_line": order.lines.get(), "quantity": 2}]
    )
    order.refresh_from_db()
    return order, shipment


def _titles(customer) -> list[str]:
    return list(
        Notification.objects.filter(user=customer)
        .order_by("created_at")
        .values_list("title", flat=True)
    )


def test_cancelling_an_order_notifies_the_customer():
    customer = CustomerUserFactory()
    order = _confirmed_order(customer)

    cancel_order(order=order)

    notification = Notification.objects.get(user=customer)
    assert notification.title == f"Order {order.order_number} was cancelled."
    assert notification.object_id == order.id
    assert notification.kind == Notification.Kind.ORDER


def test_status_override_notifies_the_customer():
    customer = CustomerUserFactory()
    order = _confirmed_order(customer)

    set_order_status(order=order, new_status=SalesOrder.Status.CLOSED)

    assert _titles(customer) == [f"Order {order.order_number} is now closed."]


def test_shipping_and_delivery_notify_but_in_transit_does_not():
    customer = CustomerUserFactory()
    order, shipment = _shipped_order(customer)

    update_shipment_status(shipment=shipment, status=Shipment.Status.IN_TRANSIT)
    update_shipment_status(shipment=shipment, status=Shipment.Status.DELIVERED)

    assert _titles(customer) == [
        f"Order {order.order_number}: shipped.",
        f"Order {order.order_number}: delivered.",
    ]


def test_return_decisions_notify_the_customer():
    customer = CustomerUserFactory()
    order, _ = _shipped_order(customer)
    line = order.lines.get()
    approved = create_rma(order=order, lines=[{"order_line": line, "quantity": 1}])
    rejected = create_rma(order=order, lines=[{"order_line": line, "quantity": 1}])

    approve_rma(rma=approved)
    reject_rma(rma=rejected)

    returns = Notification.objects.filter(user=customer, kind=Notification.Kind.RETURN)
    assert sorted(returns.values_list("title", flat=True)) == sorted(
        [
            f"Return {approved.rma_number} was approved.",
            f"Return {rejected.rma_number} was rejected.",
        ]
    )
    assert set(returns.values_list("object_id", flat=True)) == {approved.id, rejected.id}


@pytest.mark.parametrize(
    "status",
    [Shipment.Status.SHIPPED, Shipment.Status.OUT_FOR_DELIVERY, Shipment.Status.FAILED],
)
def test_repeating_a_status_saves_courier_details_without_a_second_alert(status):
    customer = CustomerUserFactory()
    _, shipment = _shipped_order(customer)
    if status != Shipment.Status.SHIPPED:
        update_shipment_status(shipment=shipment, status=status)
    before = Notification.objects.filter(user=customer).count()

    update_shipment_status(shipment=shipment, status=status, courier_status="Re-sent by courier")

    shipment.refresh_from_db()
    assert shipment.courier_status == "Re-sent by courier"
    assert Notification.objects.filter(user=customer).count() == before
