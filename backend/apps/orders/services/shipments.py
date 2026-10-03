from __future__ import annotations

import logging

from django.db import transaction
from django.utils import timezone

from apps.accounting.services.postings import post_sales_shipment
from apps.catalog.selectors.bundles import expand_variant
from apps.common.exceptions import BusinessRuleViolationError
from apps.common.utils.phone import local_bd_mobile
from apps.inventory.constants import MovementType
from apps.inventory.services.stock import record_movement, release_reservation
from apps.logistics.services.couriers.registry import get_gateway_for_carrier
from apps.orders.models import SalesOrder, SalesOrderLine, Shipment, ShipmentLine
from apps.orders.services.orders import lock_order
from apps.orders.services.reservations import release_line_reservations

logger = logging.getLogger(__name__)


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
    _ensure_not_held_for_fraud_review(order)
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

    recipient_phone = ""
    if order.contact_phone:
        recipient_phone = local_bd_mobile(order.contact_phone)
    elif order.shipping_address is not None:
        recipient_phone = local_bd_mobile(order.shipping_address.phone)

    shipment = Shipment.objects.create(
        order=order,
        carrier=carrier,
        tracking_number=tracking_number,
        shipping_charge=shipping_charge,
        cod_amount=cod_amount,
        status=Shipment.Status.SHIPPED,
        shipped_at=timezone.now(),
        recipient_phone=recipient_phone,
    )
    for line_id, quantity in requested.items():
        order_line = locked_lines[line_id]
        ShipmentLine.objects.create(shipment=shipment, order_line=order_line, quantity=quantity)
        # Pre-order lines never reserved stock at checkout (see checkout.py),
        # so there is nothing to release and no on-hand stock to post out.
        if not order_line.is_preorder:
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


# Forward-only progression for the states a parcel passes through en route.
# DELIVERED/RETURNED/CANCELLED are handled by the terminal-status guard above;
# FAILED is intentionally excluded, since a failed attempt can be retried and
# move back into IN_TRANSIT.
_PROGRESSION_RANK: dict[str, int] = {
    Shipment.Status.PENDING: 0,
    Shipment.Status.SHIPPED: 1,
    Shipment.Status.IN_TRANSIT: 2,
    Shipment.Status.OUT_FOR_DELIVERY: 3,
}


def can_advance_shipment_status(current: str, new: str) -> bool:
    """Whether a status change is safe to apply given redelivery and
    out-of-order arrival are both normal. The single transition rule for
    every caller — admin updates and courier webhooks alike — enforced by
    `update_shipment_status` itself, not left to each caller to remember."""
    current_rank = _PROGRESSION_RANK.get(current)
    new_rank = _PROGRESSION_RANK.get(new)
    if current_rank is None or new_rank is None:
        return True
    return new_rank >= current_rank


@transaction.atomic
def update_shipment_status(
    *, shipment: Shipment, status: str, actor=None, courier_status: str | None = None
) -> Shipment:
    # Locks the row for the rest of the transaction — two different webhook
    # events for the same shipment (or a webhook racing an admin update)
    # could otherwise both read the same pre-update status, both pass the
    # transition check below, and both write, applying conflicting updates.
    # Refreshed in place rather than re-bound to a new instance, so the
    # caller's object (and what it serializes afterward) stays in sync.
    Shipment.objects.select_for_update().filter(pk=shipment.pk).exists()
    shipment.refresh_from_db()

    if shipment.status in Shipment.TERMINAL_STATUSES:
        raise BusinessRuleViolationError(
            f"Shipment is already {shipment.get_status_display()} and cannot change status.",
            code="terminal_status",
        )
    if status not in Shipment.Status.values:
        raise BusinessRuleViolationError("Unknown shipment status.", code="invalid_status")
    if not can_advance_shipment_status(shipment.status, status):
        raise BusinessRuleViolationError(
            f"Cannot move a shipment from {shipment.get_status_display()} back to "
            f"{Shipment.Status(status).label}.",
            code="invalid_status_transition",
        )

    shipment.status = status
    update_fields = ["status", "updated_at"]
    if actor is not None:
        shipment.updated_by = actor
        update_fields.append("updated_by")
    if courier_status is not None:
        shipment.courier_status = courier_status
        update_fields.append("courier_status")
    if status == Shipment.Status.DELIVERED:
        shipment.delivered_at = timezone.now()
        update_fields.append("delivered_at")
    shipment.save(update_fields=update_fields)
    if status == Shipment.Status.DELIVERED:
        _mark_order_delivered_if_complete(shipment.order)
    if status in Shipment.TERMINAL_STATUSES:
        _refresh_phone_risk_profile(shipment)
    return shipment


def _refresh_phone_risk_profile(shipment: Shipment) -> None:
    """Keep the per-phone delivery history current as outcomes settle. Never
    let a profile rebuild fail the status update that produced it."""
    if not shipment.recipient_phone:
        return
    try:
        from apps.risk.services.phone_profile import rebuild_phone_profile

        rebuild_phone_profile(shipment.recipient_phone)
    except Exception:
        logger.exception(
            "Phone risk profile rebuild failed for shipment %s", shipment.id
        )


def _ensure_not_held_for_fraud_review(order: SalesOrder) -> None:
    """An unresolved high-risk fraud case holds every shipment of its order.
    Resolving the case only lifts the hold: the order and payment rules
    around it still apply."""
    from apps.risk.selectors.fraud_cases import unresolved_high_risk_case

    case = unresolved_high_risk_case(order)
    if case is not None:
        raise BusinessRuleViolationError(
            f"Order is on hold for fraud review (case {case.case_number}). "
            "Resolve the case before shipping.",
            code="fraud_review_hold",
        )


@transaction.atomic
def dispatch_to_courier(*, shipment: Shipment) -> Shipment:
    # A shipment created before a case was opened must not reach a courier
    # while the case is under review.
    _ensure_not_held_for_fraud_review(shipment.order)
    carrier = shipment.carrier
    if carrier is None:
        carrier = _auto_select_carrier(shipment)
        shipment.carrier = carrier
        shipment.save(update_fields=["carrier", "updated_at"])

    gateway = get_gateway_for_carrier(carrier)
    result = gateway.create_consignment(shipment)

    shipment.tracking_number = result.get("consignment_id") or shipment.tracking_number
    shipment.courier_status = result.get("status", "")
    shipment.save(update_fields=["tracking_number", "courier_status", "updated_at"])
    return shipment


def _auto_select_carrier(shipment: Shipment):
    """No carrier was picked by hand at checkout — route to the cheapest one
    still quoting a live rate for this destination and weight."""
    from apps.logistics.selectors.rates import address_zone_text, find_zone_by_address_text
    from apps.logistics.services.courier_selection import select_courier
    from apps.logistics.services.couriers.recipient import total_weight

    address = shipment.order.shipping_address
    zone = find_zone_by_address_text(address_zone_text(address)) if address else None
    if zone is None:
        raise BusinessRuleViolationError(
            "Cannot auto-select a carrier: no shipping zone for this order's address.",
            code="no_shipping_zone",
        )
    selection = select_courier(zone=zone, weight=total_weight(shipment))
    return selection.carrier
