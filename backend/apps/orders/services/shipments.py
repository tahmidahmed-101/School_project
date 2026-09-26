from __future__ import annotations

from django.db import transaction
from django.utils import timezone

from apps.accounting.services.postings import post_sales_shipment
from apps.catalog.selectors.bundles import expand_variant
from apps.common.exceptions import BusinessRuleViolationError
from apps.inventory.constants import MovementType
from apps.inventory.services.stock import record_movement, release_reservation
from apps.logistics.services.couriers.registry import get_gateway_for_carrier
from apps.orders.models import SalesOrder, SalesOrderLine, Shipment, ShipmentLine
from apps.orders.services.orders import lock_order
from apps.orders.services.reservations import release_line_reservations


@transaction.atomic
def create_shipment(
    *,
    order: SalesOrder,
    lines: list[dict],
    carrier=None,
    tracking_number: str = "",
    shipping_charge=0,
    cod_amount=0,
) -> Shipment:
    """Ship some or all of a confirmed order. Quantities are validated against
    each line's remaining unshipped balance under a row lock, so an order can
    be shipped in several partial consignments but never over-shipped. The
    order only reaches "shipped" once every line is fully dispatched."""
    lock_order(order)
    if order.status != SalesOrder.Status.CONFIRMED:
        raise BusinessRuleViolationError(
            "Only a confirmed order can be shipped.", code="not_confirmed"
        )
    if not lines:
        raise BusinessRuleViolationError("A shipment needs at least one line.", code="no_lines")

    # Collapse repeated references to the same order line so a payload of
    # [{line A: 1}, {line A: 1}] is validated as a single request for 2 units
    # rather than two independent requests that each pass on their own.
    requested: dict[str, int] = {}
    for line in lines:
        order_line = line["order_line"]
        quantity = int(line["quantity"])
        if quantity <= 0:
            raise BusinessRuleViolationError(
                "Shipment quantity must be positive.", code="invalid_quantity"
            )
        if order_line.order_id != order.id:
            raise BusinessRuleViolationError(
                "Order line does not belong to this order.", code="line_order_mismatch"
            )
        requested[str(order_line.id)] = requested.get(str(order_line.id), 0) + quantity

    locked_lines = {
        str(line.id): line
        for line in SalesOrderLine.objects.select_for_update()
        .select_related("variant")
        .filter(id__in=requested.keys())
    }
    for line_id, quantity in requested.items():
        order_line = locked_lines[line_id]
        if quantity > order_line.shippable_quantity:
            raise BusinessRuleViolationError(
                f"Cannot ship {quantity} units of line {order_line.id}: only "
                f"{order_line.shippable_quantity} of {order_line.quantity} remain unshipped.",
                code="over_shipment",
            )

    shipment = Shipment.objects.create(
        order=order,
        carrier=carrier,
        tracking_number=tracking_number,
        shipping_charge=shipping_charge,
        cod_amount=cod_amount,
        status=Shipment.Status.SHIPPED,
        shipped_at=timezone.now(),
    )
    for line_id, quantity in requested.items():
        order_line = locked_lines[line_id]
        ShipmentLine.objects.create(shipment=shipment, order_line=order_line, quantity=quantity)
        for component, component_qty in expand_variant(order_line.variant, quantity):
            # Release before the stock-out: the reverse order dips through a
            # state where reserved exceeds on-hand, which the CHECK rejects.
            release_reservation(variant=component, quantity=component_qty)
            record_movement(
                variant=component,
                movement_type=MovementType.SALES_OUT,
                quantity=component_qty,
                reference_type="shipment",
                reference_id=shipment.id,
            )
        order_line.shipped_quantity += quantity
        order_line.save(update_fields=["shipped_quantity", "updated_at"])
        if order_line.shippable_quantity == 0:
            release_line_reservations(order_line=order_line)

    # Only a fully dispatched order is "shipped" — a partial consignment
    # leaves it confirmed so the remaining lines stay shippable.
    if all(line.shipped_quantity >= line.quantity for line in order.lines.all()):
        order.status = SalesOrder.Status.SHIPPED
        order.save(update_fields=["status", "updated_at"])
    post_sales_shipment(shipment)
    return shipment


def _mark_order_delivered_if_complete(order: SalesOrder) -> None:
    """Delivery is per-consignment, so the order only follows once every line has
    shipped and no consignment is still in flight."""
    if order.status != SalesOrder.Status.SHIPPED:
        return
    in_flight = order.shipments.exclude(
        status__in=(Shipment.Status.DELIVERED, Shipment.Status.CANCELLED)
    )
    if in_flight.exists():
        return
    order.status = SalesOrder.Status.DELIVERED
    order.save(update_fields=["status", "updated_at"])


@transaction.atomic
def update_shipment_status(*, shipment: Shipment, status: str, actor=None) -> Shipment:
    if shipment.status in Shipment.TERMINAL_STATUSES:
        raise BusinessRuleViolationError(
            f"Shipment is already {shipment.get_status_display()} and cannot change status.",
            code="terminal_status",
        )
    if status not in Shipment.Status.values:
        raise BusinessRuleViolationError("Unknown shipment status.", code="invalid_status")

    shipment.status = status
    update_fields = ["status", "updated_at"]
    if actor is not None:
        shipment.updated_by = actor
        update_fields.append("updated_by")
    if status == Shipment.Status.DELIVERED:
        shipment.delivered_at = timezone.now()
        update_fields.append("delivered_at")
    shipment.save(update_fields=update_fields)
    if status == Shipment.Status.DELIVERED:
        _mark_order_delivered_if_complete(shipment.order)
    return shipment


@transaction.atomic
def dispatch_to_courier(*, shipment: Shipment) -> Shipment:
    if shipment.carrier is None:
        raise BusinessRuleViolationError("Shipment has no carrier assigned.", code="no_carrier")

    gateway = get_gateway_for_carrier(shipment.carrier)
    result = gateway.create_consignment(shipment)

    shipment.tracking_number = result.get("consignment_id") or shipment.tracking_number
    shipment.courier_status = result.get("status", "")
    shipment.save(update_fields=["tracking_number", "courier_status", "updated_at"])
    return shipment
