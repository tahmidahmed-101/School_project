from __future__ import annotations

from django.db import transaction
from django.db.models import F, Sum
from django.db.models.functions import Greatest
from django.utils import timezone

from apps.catalog.selectors.bundles import expand_variant
from apps.common.exceptions import BusinessRuleViolationError
from apps.inventory.constants import MovementType
from apps.inventory.selectors.stock import get_stock_item
from apps.inventory.services.stock import (
    record_movement,
    release_reservation,
    reserve_stock,
    reserve_stock_anywhere,
    warehouse_for_variant,
)
from apps.orders.models import SalesOrderLine, StockReservation


def hold_line_stock(*, order_line, variant, quantity: int, prefer=None) -> list[StockReservation]:
    """Hold `quantity` units of `variant` for an order line wherever they are
    in stock, one reservation row per warehouse they come from, so releasing
    or shipping them later hits the warehouse that really holds them."""
    return [
        StockReservation.objects.create(
            order_line=order_line, variant=variant, warehouse=warehouse, quantity=part
        )
        for warehouse, part in reserve_stock_anywhere(
            variant=variant, quantity=quantity, prefer=prefer
        )
    ]


def hold_returned_stock(*, order_line, variant, quantity: int, warehouse=None) -> None:
    """Hold sellable units that came back for an order line again, in the
    warehouse they came back to (`None`: the default one). The line's holds
    that shipped units from there take them back first, so they count as
    unshipped again; only what those cannot take becomes a new hold there."""
    target = warehouse_for_variant(variant, warehouse)
    reopened = 0
    rows = (
        StockReservation.objects.select_for_update()
        .filter(
            order_line=order_line,
            variant=variant,
            warehouse=target,
            status=StockReservation.Status.ACTIVE,
            shipped_quantity__gt=0,
        )
        .order_by("-created_at", "-pk")
    )
    for row in rows:
        give_back = min(quantity - reopened, row.shipped_quantity)
        row.shipped_quantity -= give_back
        row.save(update_fields=["shipped_quantity", "updated_at"])
        reopened += give_back
        if reopened == quantity:
            break
    if reopened:
        reserve_stock(variant=variant, warehouse=target, quantity=reopened)
    if quantity > reopened:
        # The units have just come back into `target`, so it holds them even
        # when it has since been switched off; hold them right there.
        rest = quantity - reopened
        reserve_stock(variant=variant, warehouse=target, quantity=rest)
        StockReservation.objects.create(
            order_line=order_line, variant=variant, warehouse=target, quantity=rest
        )


def ship_held_stock(*, order_line, variant, quantity: int, shipment) -> None:
    """Send `quantity` held units of `variant` out with a consignment: each
    comes off the hold of the warehouse it sits in (oldest hold first) and
    leaves that warehouse with a SALES_OUT.

    Units no hold covers (staff released the order's hold by hand) are held
    again first, from stock that is really free, and shipped from there. They
    never come out of another order's hold; with too little free stock the
    shipment is refused."""
    remaining = quantity
    rows = (
        StockReservation.objects.select_for_update()
        .select_related("warehouse")
        .filter(order_line=order_line, variant=variant, status=StockReservation.Status.ACTIVE)
        .order_by("created_at", "pk")
    )
    for row in rows:
        take = min(remaining, row.held_quantity)
        if take <= 0:
            continue
        _ship_from(variant, row.warehouse, take, shipment)
        row.shipped_quantity += take
        row.save(update_fields=["shipped_quantity", "updated_at"])
        remaining -= take
        if remaining == 0:
            return
    if remaining:
        try:
            fresh = hold_line_stock(order_line=order_line, variant=variant, quantity=remaining)
        except BusinessRuleViolationError as exc:
            if exc.code != "insufficient_stock":
                raise
            raise BusinessRuleViolationError(
                f"The stock held for {variant.sku} on this order was released, and there isn't "
                f"enough free stock to ship {remaining} unit(s) now. Restock it or ship fewer "
                "units.",
                code="insufficient_stock",
            ) from exc
        for row in fresh:
            _ship_from(variant, row.warehouse, row.quantity, shipment)
            row.shipped_quantity = row.quantity
            row.save(update_fields=["shipped_quantity", "updated_at"])


def _ship_from(variant, warehouse, quantity: int, shipment) -> None:
    # Release before the stock-out: the reverse order dips through a state
    # where reserved exceeds on-hand, which the CHECK rejects.
    release_reservation(variant=variant, warehouse=warehouse, quantity=quantity)
    # The stock-out keeps the cost the units left at, so units received back
    # later return at that cost, the same one the shipment charged to COGS.
    stock_item = get_stock_item(
        variant=variant, warehouse=warehouse_for_variant(variant, warehouse)
    )
    record_movement(
        variant=variant,
        warehouse=warehouse,
        movement_type=MovementType.SALES_OUT,
        quantity=quantity,
        unit_cost=stock_item.avg_cost if stock_item else None,
        reference_type="shipment",
        reference_id=shipment.id,
    )


@transaction.atomic
def release_stock_reservation(
    *,
    reservation: StockReservation,
    actor=None,  # noqa: ARG001 -- kept for signature parity with cancel_order's actor threading
) -> StockReservation:
    """Hand a reservation's held units back to Available and mark the row
    released. No ledger entry: stock never physically moved (blueprint §5)."""
    locked = (
        StockReservation.objects.select_for_update()
        .select_related("variant", "warehouse", "order_line__variant")
        .get(pk=reservation.pk)
    )
    if locked.status != StockReservation.Status.ACTIVE:
        raise BusinessRuleViolationError(
            "This reservation has already been released.", code="already_released"
        )

    held = _units_still_held(locked)
    if held:
        release_reservation(variant=locked.variant, warehouse=locked.warehouse, quantity=held)
    locked.status = StockReservation.Status.RELEASED
    locked.save(update_fields=["status", "updated_at"])
    _return_preorder_units_to_queue(locked)

    reservation.status = locked.status
    return reservation


@transaction.atomic
def release_reservation_by_staff(*, reservation: StockReservation, actor=None) -> StockReservation:
    """Release a hold by hand from the dashboard. Allowed while the order is
    unpaid, and for a pre-order allocation (its units go back to the queue).
    A confirmed order's ready-stock hold is promised to the customer: freeing
    it would let the units sell twice, so it ends only by shipping or by
    cancelling the order."""
    from apps.orders.models import SalesOrder

    line = reservation.order_line
    order = line.order
    if (
        not line.is_preorder
        and reservation.status == StockReservation.Status.ACTIVE
        and order.status not in (SalesOrder.Status.PENDING, SalesOrder.Status.AWAITING_PAYMENT)
    ):
        raise BusinessRuleViolationError(
            f"Order {order.order_number} is {order.get_status_display().lower()}, so this "
            "stock is promised to the customer. Ship it, or cancel the order to free it.",
            code="reservation_promised",
        )
    return release_stock_reservation(reservation=reservation, actor=actor)


def _units_still_held(reservation: StockReservation) -> int:
    """How many of the row's units stock still holds: what it has not shipped,
    capped by what the line has left to ship. The cap matters for holds made
    before shipping counted its units per row; those kept their full quantity
    until the line was fully shipped."""
    line = SalesOrderLine.objects.select_for_update().get(pk=reservation.order_line_id)
    per_unit = next(
        (
            quantity
            for component, quantity in expand_variant(line.variant, 1)
            if component.id == reservation.variant_id
        ),
        1,
    )
    other_rows = (
        StockReservation.objects.filter(
            order_line=line,
            variant_id=reservation.variant_id,
            status=StockReservation.Status.ACTIVE,
        )
        .exclude(pk=reservation.pk)
        .aggregate(total=Sum(F("quantity") - F("shipped_quantity")))["total"]
        or 0
    )
    unshipped = line.shippable_quantity * per_unit
    return max(0, min(reservation.held_quantity, unshipped - other_rows))


def _return_preorder_units_to_queue(reservation: StockReservation) -> None:
    """A pre-order line whose hold is released is no longer allocated those
    units, so it waits for the next allocation instead of looking shippable."""
    line = reservation.order_line
    if not line.is_preorder:
        return
    # A bundle holds one row per component; count its units once, on the first.
    component, per_unit = expand_variant(line.variant, 1)[0]
    if component.id != reservation.variant_id:
        return
    SalesOrderLine.objects.filter(pk=line.pk).update(
        allocated_quantity=Greatest(
            F("shipped_quantity"), F("allocated_quantity") - reservation.quantity // per_unit
        )
    )


def release_expired_reservations(*, now=None, actor=None, variant_ids=None) -> int:
    """Release every checkout hold past its `expires_at`. Each one commits on
    its own so a single bad row can't strand the rest of the sweep.

    Only holds of orders still awaiting payment expire: once an order is
    confirmed its stock is promised to a customer until it ships or is
    cancelled, however long that takes. `variant_ids` narrows the sweep to the
    stock a checkout is about to reserve, so expired holds are freed when the
    stock is wanted even with no scheduled sweeper running."""
    from apps.orders.models import SalesOrder

    now = now or timezone.now()
    # Stock allocated to a pre-order is held for a paying customer until it
    # ships or staff release it; it does not time out like a checkout hold.
    expired = (
        StockReservation.objects.filter(
            status=StockReservation.Status.ACTIVE,
            expires_at__lte=now,
            order_line__order__status=SalesOrder.Status.AWAITING_PAYMENT,
        )
        .exclude(order_line__is_preorder=True)
        .order_by("created_at")
    )
    if variant_ids is not None:
        expired = expired.filter(variant_id__in=list(variant_ids))

    from apps.orders.services.orders import lock_order

    released = 0
    for reservation in expired.select_related("order_line__order"):
        try:
            with transaction.atomic():
                # The order lock serialises this with a payment confirming the
                # order, which would otherwise count the hold as still there.
                order = lock_order(reservation.order_line.order)
                if order.status != SalesOrder.Status.AWAITING_PAYMENT:
                    continue
                release_stock_reservation(reservation=reservation, actor=actor)
        except BusinessRuleViolationError:
            continue
        released += 1
    return released


@transaction.atomic
def reinstate_lapsed_holds(order) -> int:
    """Hold stock again for an unpaid order whose checkout hold expired, as it
    is confirmed. Shipping releases what the order holds, so confirming it with
    nothing held would oversell. Refused when the stock has since been sold.
    Returns how many units were held again."""
    held_again = 0
    lines = SalesOrderLine.objects.filter(order=order, is_preorder=False).select_related("variant")
    for line in lines:
        unshipped = line.quantity - line.shipped_quantity
        if unshipped <= 0:
            continue
        for component, component_qty in expand_variant(line.variant, unshipped):
            active = (
                StockReservation.objects.filter(
                    order_line=line,
                    variant=component,
                    status=StockReservation.Status.ACTIVE,
                ).aggregate(total=Sum(F("quantity") - F("shipped_quantity")))["total"]
                or 0
            )
            missing = component_qty - active
            if missing <= 0:
                continue
            try:
                hold_line_stock(order_line=line, variant=component, quantity=missing)
            except BusinessRuleViolationError as exc:
                if exc.code != "insufficient_stock":
                    raise
                raise BusinessRuleViolationError(
                    f"The stock held for {component.sku} was released when this order's "
                    "hold expired, and it has since sold out. Restock it or cancel the order.",
                    code="hold_expired_stock_gone",
                ) from exc
            held_again += missing
    return held_again


@transaction.atomic
def release_line_reservations(*, order_line) -> int:
    """Close a fully shipped line's holds. `create_shipment` already handed the
    units back to Available per consignment, so this marks the rows only —
    calling the inventory release again would decrement Reserved twice."""
    return StockReservation.objects.filter(
        order_line=order_line, status=StockReservation.Status.ACTIVE
    ).update(status=StockReservation.Status.RELEASED, updated_at=timezone.now())
