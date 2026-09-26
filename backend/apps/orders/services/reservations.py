from __future__ import annotations

from django.db import transaction
from django.utils import timezone

from apps.common.exceptions import BusinessRuleViolationError
from apps.inventory.services.stock import release_reservation
from apps.orders.models import StockReservation


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
        .select_related("variant")
        .get(pk=reservation.pk)
    )
    if locked.status != StockReservation.Status.ACTIVE:
        raise BusinessRuleViolationError(
            "This reservation has already been released.", code="already_released"
        )

    release_reservation(variant=locked.variant, quantity=locked.quantity)
    locked.status = StockReservation.Status.RELEASED
    locked.save(update_fields=["status", "updated_at"])

    reservation.status = locked.status
    return reservation


def release_expired_reservations(*, now=None, actor=None) -> int:
    """Release every active reservation past its `expires_at`. Each one commits
    on its own so a single bad row can't strand the rest of the sweep."""
    now = now or timezone.now()
    expired = StockReservation.objects.filter(
        status=StockReservation.Status.ACTIVE, expires_at__lte=now
    ).order_by("created_at")

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
