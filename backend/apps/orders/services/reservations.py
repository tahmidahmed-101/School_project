from __future__ import annotations

from django.db import transaction
from django.db.models import F, Sum
from django.db.models.functions import Greatest
from django.utils import timezone

from apps.catalog.selectors.bundles import expand_variant
from apps.common.exceptions import BusinessRuleViolationError
from apps.inventory.services.stock import release_reservation
from apps.orders.models import SalesOrderLine, StockReservation


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
        .select_related("variant", "order_line__variant")
        .get(pk=reservation.pk)
    )
    if locked.status != StockReservation.Status.ACTIVE:
        raise BusinessRuleViolationError(
            "This reservation has already been released.", code="already_released"
        )

    held = _units_still_held(locked)
    if held:
        release_reservation(variant=locked.variant, quantity=held)
    locked.status = StockReservation.Status.RELEASED
    locked.save(update_fields=["status", "updated_at"])
    _return_preorder_units_to_queue(locked)

    reservation.status = locked.status
    return reservation


def _units_still_held(reservation: StockReservation) -> int:
    """How many of the row's units stock still holds. `create_shipment` hands
    back each consignment's units as it ships but leaves the row at its full
    quantity until the line is fully shipped, so a partly shipped line holds
    only its unshipped units."""
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
        .aggregate(total=Sum("quantity"))["total"]
        or 0
    )
    unshipped = line.shippable_quantity * per_unit
    return max(0, min(reservation.quantity, unshipped - other_rows))


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


def release_expired_reservations(*, now=None, actor=None) -> int:
    """Release every active reservation past its `expires_at`. Each one commits
    on its own so a single bad row can't strand the rest of the sweep."""
    now = now or timezone.now()
    # Stock allocated to a pre-order is held for a paying customer until it
    # ships or staff release it; it does not time out like a checkout hold.
    expired = (
        StockReservation.objects.filter(status=StockReservation.Status.ACTIVE, expires_at__lte=now)
        .exclude(order_line__is_preorder=True)
        .order_by("created_at")
    )

    released = 0
    for reservation in expired:
        try:
            release_stock_reservation(reservation=reservation, actor=actor)
        except BusinessRuleViolationError:
            continue
        released += 1
    return released


@transaction.atomic
def release_line_reservations(*, order_line) -> int:
    """Close a fully shipped line's holds. `create_shipment` already handed the
    units back to Available per consignment, so this marks the rows only —
    calling the inventory release again would decrement Reserved twice."""
    return StockReservation.objects.filter(
        order_line=order_line, status=StockReservation.Status.ACTIVE
    ).update(status=StockReservation.Status.RELEASED, updated_at=timezone.now())
