from __future__ import annotations

import logging

from django.db import transaction
from django.utils import timezone

from apps.accounting.services.postings import post_sales_shipment, reverse_sales_shipment
from apps.audit.services.audit import log_action
from apps.catalog.selectors.bundles import expand_variant
from apps.common.exceptions import BusinessRuleViolationError
from apps.common.utils.phone import local_bd_mobile
from apps.inventory.constants import MovementType
from apps.inventory.services.stock import record_movement, write_off_stock
from apps.logistics.services.couriers.registry import get_gateway_for_carrier
from apps.orders.models import SalesOrder, SalesOrderLine, Shipment, ShipmentLine
from apps.orders.selectors.shipments import (
    order_shipments_complete,
    shipped_from_warehouses,
    shipped_unit_cost,
)
from apps.orders.services.notifications import notify_order, order_label
from apps.orders.services.orders import lock_order
from apps.orders.services.referrals import reward_referral
from apps.orders.services.reservations import (
    hold_line_stock,
    hold_returned_stock,
    release_line_reservations,
    ship_held_stock,
)

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
        if order_line.is_preorder and quantity > order_line.shippable_quantity:
            raise BusinessRuleViolationError(
                f"Only {order_line.shippable_quantity} unit(s) of {order_line.variant.sku} have "
                "arrived stock set aside for this order. Allocate arrived stock first.",
                code="preorder_not_allocated",
            )
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
        for component, component_qty in expand_variant(order_line.variant, quantity):
            # Each unit leaves the warehouse that holds it for the order.
            ship_held_stock(
                order_line=order_line, variant=component, quantity=component_qty, shipment=shipment
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
    _notify_shipment_status(shipment)
    return shipment


def _mark_order_delivered_if_complete(order: SalesOrder) -> None:
    """Delivery is per-consignment, so the order only follows once every line has
    shipped and no consignment is still in flight. The order lock serialises
    sibling consignments delivered at the same moment, so the last one to
    commit sees the others settled instead of each seeing the other in flight."""
    lock_order(order)
    if order.status != SalesOrder.Status.SHIPPED:
        return
    if not order_shipments_complete(order):
        return
    order.status = SalesOrder.Status.DELIVERED
    order.save(update_fields=["status", "updated_at"])
    reward_referral(order)


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


# The steps a customer hears about. In-transit hops and courier-side
# bookkeeping states would only add noise.
CUSTOMER_NOTIFIED_SHIPMENT_STATUSES = (
    Shipment.Status.SHIPPED,
    Shipment.Status.OUT_FOR_DELIVERY,
    Shipment.Status.DELIVERED,
    Shipment.Status.FAILED,
)


def _notify_shipment_status(shipment: Shipment) -> None:
    order = shipment.order
    notify_order(order, f"{order_label(order)}: {shipment.get_status_display().lower()}.")


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

    previous_status = shipment.status
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
    # A repeated status (a courier re-sending the same event) still saves its
    # courier details above, but must not alert the customer a second time.
    if status != previous_status and status in CUSTOMER_NOTIFIED_SHIPMENT_STATUSES:
        _notify_shipment_status(shipment)
    return shipment


RECEIVABLE_BACK_STATUSES = (Shipment.Status.CANCELLED, Shipment.Status.RETURNED)


def _validated_dispositions(shipment_lines: list, dispositions: dict) -> dict:
    """Every line of the consignment needs an explicit sellable/damaged split
    that adds up to what it carried: nothing is assumed sellable by default."""
    by_id = {str(line.id): line for line in shipment_lines}
    given = {str(line_id): split for line_id, split in dispositions.items()}
    if set(given) != set(by_id):
        raise BusinessRuleViolationError(
            "State the sellable and damaged quantity for every line of the consignment.",
            code="dispositions_mismatch",
        )
    result = {}
    for line_id, split in given.items():
        sellable, damaged = int(split["sellable"]), int(split["damaged"])
        if sellable < 0 or damaged < 0 or sellable + damaged != by_id[line_id].quantity:
            raise BusinessRuleViolationError(
                f"Sellable and damaged units must add up to the {by_id[line_id].quantity} "
                f"shipped on line {line_id}.",
                code="invalid_disposition",
            )
        result[by_id[line_id].id] = (sellable, damaged)
    return result


def _ensure_receivable(shipment: Shipment, order: SalesOrder) -> None:
    if shipment.status not in RECEIVABLE_BACK_STATUSES:
        raise BusinessRuleViolationError(
            "Only a cancelled or returned consignment can be received back.",
            code="shipment_not_returned",
        )
    if shipment.received_back_at is not None:
        raise BusinessRuleViolationError(
            "This consignment has already been received back.", code="already_received_back"
        )
    if order.status not in (SalesOrder.Status.CONFIRMED, SalesOrder.Status.SHIPPED):
        raise BusinessRuleViolationError(
            f"A consignment of a {order.get_status_display().lower()} order cannot be "
            "received back.",
            code="order_not_open",
        )


def _restock_returned_line(
    order_line: SalesOrderLine, shipment: Shipment, sellable: int, damaged: int, *, actor=None
) -> None:
    """Every returned unit comes back in (RETURN_IN) to the warehouse it left
    from, at the cost it left at: receiving back reverses the COGS the
    shipment charged, so stock must gain exactly that value. Damaged ones then
    go out of it through the normal write-off, so the shelf only gains sellable
    stock, and only sellable stock is held again for the order (in that same
    warehouse first, so it can ship from there)."""
    damaged_by_component = dict(expand_variant(order_line.variant, damaged)) if damaged else {}
    for component, component_qty in expand_variant(order_line.variant, sellable + damaged):
        to_write_off = damaged_by_component.get(component, 0)
        for warehouse, part in shipped_from_warehouses(
            shipment_ids=[shipment.id], variant=component, quantity=component_qty
        ):
            record_movement(
                variant=component,
                warehouse=warehouse,
                movement_type=MovementType.RETURN_IN,
                quantity=part,
                unit_cost=shipped_unit_cost(
                    shipment_ids=[shipment.id], variant=component, warehouse=warehouse
                ),
                reference_type="shipment",
                reference_id=shipment.id,
                actor=actor,
            )
            scrapped = min(to_write_off, part)
            if scrapped:
                write_off_stock(
                    variant=component,
                    warehouse=warehouse,
                    quantity=scrapped,
                    reason=f"Damaged in returned consignment {shipment.id}",
                    actor=actor,
                )
                to_write_off -= scrapped
            if part > scrapped:
                hold_returned_stock(
                    order_line=order_line,
                    variant=component,
                    quantity=part - scrapped,
                    warehouse=warehouse,
                )


@transaction.atomic
def receive_back_shipment(*, shipment: Shipment, dispositions: dict, actor=None) -> Shipment:
    """Book a cancelled or returned consignment as physically back.

    `dispositions` maps each shipment line id to `{"sellable": n, "damaged": m}`.
    The consignment's revenue and COGS postings are reversed once. Every unit
    rejoins stock (RETURN_IN); damaged units are then written off to shrinkage
    through `write_off_stock` and never reserved. Sellable units are held again
    for the order and can be reshipped. Damaged units stay counted as shipped
    but undelivered, so the order is neither reshippable nor deliverable for
    them until staff decide how to resolve it. No refund is made. Allowed once
    per consignment.
    """
    Shipment.objects.select_for_update().filter(pk=shipment.pk).exists()
    shipment.refresh_from_db()
    order = lock_order(shipment.order)
    _ensure_receivable(shipment, order)

    shipment_lines = list(shipment.lines.all())
    splits = _validated_dispositions(shipment_lines, dispositions)
    locked_lines = {
        line.id: line
        for line in SalesOrderLine.objects.select_for_update()
        .select_related("variant")
        # expand_variant runs up to three times per line (returned, damaged,
        # sellable); prefetching keeps a bundle line from re-querying each time.
        .prefetch_related("variant__bundle_components__component_variant")
        .filter(id__in=[shipment_line.order_line_id for shipment_line in shipment_lines])
    }
    for shipment_line in shipment_lines:
        order_line = locked_lines[shipment_line.order_line_id]
        sellable, _ = splits[shipment_line.id]
        if order_line.shipped_quantity - sellable < order_line.returned_quantity:
            raise BusinessRuleViolationError(
                f"Units of line {order_line.id} are claimed by a return; resolve it first.",
                code="units_claimed_by_return",
            )

    reverse_sales_shipment(shipment)

    for shipment_line in shipment_lines:
        order_line = locked_lines[shipment_line.order_line_id]
        sellable, damaged = splits[shipment_line.id]
        # Only sellable units become shippable again; damaged ones stay shipped.
        order_line.shipped_quantity -= sellable
        if not shipment_line.stock_posted:
            order_line.allocated_quantity -= sellable
        order_line.save(update_fields=["shipped_quantity", "allocated_quantity", "updated_at"])
        shipment_line.damaged_quantity = damaged
        shipment_line.save(update_fields=["damaged_quantity", "updated_at"])
        if shipment_line.stock_posted:
            _restock_returned_line(order_line, shipment, sellable, damaged, actor=actor)

    shipment.received_back_at = timezone.now()
    update_fields = ["received_back_at", "updated_at"]
    if actor is not None:
        shipment.updated_by = actor
        update_fields.append("updated_by")
    shipment.save(update_fields=update_fields)

    # Back to confirmed only if something can actually ship again; an order
    # whose units all came back damaged stays shipped-but-undelivered.
    if order.status == SalesOrder.Status.SHIPPED and any(
        line.shippable_quantity for line in locked_lines.values()
    ):
        order.status = SalesOrder.Status.CONFIRMED
        order.save(update_fields=["status", "updated_at"])
    log_action(
        actor=actor,
        action="shipment.received_back",
        target_type="Shipment",
        target_id=shipment.id,
        metadata={
            "order_number": order.order_number,
            "shipment_status": shipment.status,
            "sellable": sum(sellable for sellable, _ in splits.values()),
            "damaged": sum(damaged for _, damaged in splits.values()),
        },
    )
    return shipment


@transaction.atomic
def replace_damaged_units(*, shipment: Shipment, actor=None) -> Shipment:
    """Resolve a received-back consignment's damaged units by replacing them.

    For every line still owed damaged units, replacement stock is reserved
    through the normal reservation path — refused outright if it is not
    available, so nothing is promised that cannot ship — and the units are
    freed to ship again. The order goes back to `confirmed` so the replacement
    can be shipped. No accounting is posted here: the damaged units' revenue
    was reversed and their cost written off at receive-back, and the
    reshipment books its own sale.
    """
    Shipment.objects.select_for_update().filter(pk=shipment.pk).exists()
    shipment.refresh_from_db()
    order = lock_order(shipment.order)
    if shipment.received_back_at is None:
        raise BusinessRuleViolationError(
            "Receive the consignment back before replacing damaged units.",
            code="not_received_back",
        )
    if order.status not in (SalesOrder.Status.CONFIRMED, SalesOrder.Status.SHIPPED):
        raise BusinessRuleViolationError(
            f"Damaged units of a {order.get_status_display().lower()} order cannot be replaced.",
            code="order_not_open",
        )

    owed = [line for line in shipment.lines.all() if line.unresolved_damaged_quantity > 0]
    if not owed:
        raise BusinessRuleViolationError(
            "This consignment has no damaged units left to replace.", code="nothing_to_replace"
        )
    locked_lines = {
        line.id: line
        for line in SalesOrderLine.objects.select_for_update()
        .select_related("variant")
        .prefetch_related("variant__bundle_components__component_variant")
        .filter(id__in=[shipment_line.order_line_id for shipment_line in owed])
    }
    replaced = 0
    for shipment_line in owed:
        order_line = locked_lines[shipment_line.order_line_id]
        quantity = shipment_line.unresolved_damaged_quantity
        if order_line.shipped_quantity - quantity < order_line.returned_quantity:
            raise BusinessRuleViolationError(
                f"Units of line {order_line.id} are claimed by a return; resolve it first.",
                code="units_claimed_by_return",
            )
        if shipment_line.stock_posted:
            for component, component_qty in expand_variant(order_line.variant, quantity):
                try:
                    hold_line_stock(
                        order_line=order_line, variant=component, quantity=component_qty
                    )
                except BusinessRuleViolationError as exc:
                    if exc.code != "insufficient_stock":
                        raise
                    raise BusinessRuleViolationError(
                        f"Not enough stock of {component.sku} to replace {quantity} damaged "
                        "unit(s). Receive more stock first.",
                        code="insufficient_stock",
                    ) from exc
        order_line.shipped_quantity -= quantity
        if not shipment_line.stock_posted:
            order_line.allocated_quantity -= quantity
        order_line.save(update_fields=["shipped_quantity", "allocated_quantity", "updated_at"])
        shipment_line.replaced_quantity += quantity
        shipment_line.save(update_fields=["replaced_quantity", "updated_at"])
        replaced += quantity

    if order.status == SalesOrder.Status.SHIPPED:
        order.status = SalesOrder.Status.CONFIRMED
        order.save(update_fields=["status", "updated_at"])
    log_action(
        actor=actor,
        action="shipment.damaged_replaced",
        target_type="Shipment",
        target_id=shipment.id,
        metadata={"order_number": order.order_number, "replaced": replaced},
    )
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
        logger.exception("Phone risk profile rebuild failed for shipment %s", shipment.id)


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
def dispatch_to_courier(*, shipment: Shipment, actor=None) -> Shipment:
    # Locked so a double-clicked "Book courier" waits for the first booking
    # and then sees it, instead of both reaching the courier and booking (and
    # later charging for) the same parcel twice.
    Shipment.objects.select_for_update().filter(pk=shipment.pk).exists()
    shipment.refresh_from_db()
    if shipment.status in Shipment.TERMINAL_STATUSES:
        raise BusinessRuleViolationError(
            f"Shipment is already {shipment.get_status_display().lower()} and cannot be "
            "booked with a courier.",
            code="terminal_status",
        )
    # Only a courier booking or a courier webhook ever sets courier_status.
    if shipment.courier_status:
        raise BusinessRuleViolationError(
            f"This shipment is already booked with the courier "
            f"(consignment {shipment.tracking_number}).",
            code="already_dispatched",
        )
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
    # The courier's own wording, as the webhooks store it. Never left blank:
    # a blank courier_status is what marks the shipment as not yet booked.
    shipment.courier_status = result.get("provider_status") or result.get("status") or "booked"
    shipment.save(update_fields=["tracking_number", "courier_status", "updated_at"])
    log_action(
        actor=actor,
        action="shipment.dispatched",
        target_type="Shipment",
        target_id=shipment.id,
        metadata={
            "order_number": shipment.order.order_number,
            "carrier": str(carrier),
            "consignment_id": shipment.tracking_number,
        },
    )
    return shipment


def _auto_select_carrier(shipment: Shipment):
    """No carrier was picked by hand at checkout — route to the cheapest one
    still quoting a live rate for this destination and weight."""
    from apps.logistics.selectors.rates import address_zone_text, find_zone_by_address_text
    from apps.logistics.services.courier_selection import select_courier
    from apps.logistics.services.couriers.recipient import total_weight

    address = shipment.order.shipping_address
    kind = shipment.order.order_type
    zone = find_zone_by_address_text(address_zone_text(address), kind=kind) if address else None
    if zone is None:
        raise BusinessRuleViolationError(
            "Cannot auto-select a carrier: no shipping zone for this order's address.",
            code="no_shipping_zone",
        )
    selection = select_courier(zone=zone, weight=total_weight(shipment), kind=kind)
    return selection.carrier
