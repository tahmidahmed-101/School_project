from __future__ import annotations

from typing import Any
from uuid import UUID

from django.db.models import F, Max, Q, QuerySet, Sum
from django.db.models.functions import Coalesce

from apps.orders.models import SalesOrder, SalesOrderLine, Shipment, StockReservation


def shipments_list(
    *, order=None, status: str | None = None, kind: str | None = None
) -> QuerySet[Shipment]:
    queryset = (
        Shipment.objects.select_related("order", "carrier")
        .prefetch_related("lines")
        .filter(deleted_at__isnull=True)
    )
    if order is not None:
        queryset = queryset.filter(order=order)
    if status:
        queryset = queryset.filter(status=status)
    if kind:
        queryset = queryset.filter(order__order_type=kind)
    return queryset.order_by("-created_at")


def delivered_quantity_sum() -> Coalesce:
    """An order line's delivered units, as an annotation for a
    `SalesOrderLine` queryset: the one definition of "delivered" for both the
    completion check and the admin API.

    Only non-deleted DELIVERED consignments count — a pending, in-flight,
    cancelled, failed or returned consignment never reached the customer.
    """
    return Coalesce(
        Sum(
            "shipment_lines__quantity",
            filter=Q(
                shipment_lines__shipment__status=Shipment.Status.DELIVERED,
                shipment_lines__shipment__deleted_at__isnull=True,
            ),
        ),
        0,
    )


def with_delivered_quantity(
    lines: QuerySet[SalesOrderLine], *, name: str = "delivered_quantity"
) -> QuerySet[Any]:
    return lines.annotate(**{name: delivered_quantity_sum()})


def attach_delivered_quantities(lines: list[SalesOrderLine]) -> list[SalesOrderLine]:
    """Make sure every line carries `delivered_quantity`. Lines loaded through
    `_orders_with_related` already do; any others (an order a service handed
    back after refreshing it) are filled in with one query for all of them."""
    missing = [line for line in lines if not hasattr(line, "delivered_quantity")]
    if missing:
        delivered = dict(
            with_delivered_quantity(
                SalesOrderLine.objects.filter(pk__in=[line.pk for line in missing])
            ).values_list("pk", "delivered_quantity")
        )
        for line in missing:
            line.delivered_quantity = delivered.get(line.pk, 0)
    return lines


def order_shipments_complete(order: SalesOrder) -> bool:
    """Whether the order may be delivered: the one rule for both the shipment
    lifecycle and the admin override.

    Every line's ordered quantity must be covered by DELIVERED consignments.
    `shipped_quantity` is not enough — it rises when a consignment is created,
    and a cancelled, failed or returned consignment never reached the
    customer. Over-shipment is refused at creation, so full delivered coverage
    also means nothing else is still in flight. Delivered quantities are
    summed for every line in one query.
    """
    lines = with_delivered_quantity(order.lines.all(), name="delivered")
    if not lines.exists() or lines.filter(delivered__lt=F("quantity")).exists():
        return False
    return not StockReservation.objects.filter(
        order_line__order=order, status=StockReservation.Status.ACTIVE
    ).exists()


def get_shipment_detail(shipment_id: str | UUID) -> Shipment | None:
    """One shipment with what its detail serializer reads, in three queries."""
    return (
        Shipment.objects.select_related("carrier", "order")
        .prefetch_related("lines__order_line__variant__product")
        .filter(id=shipment_id, deleted_at__isnull=True)
        .first()
    )


def get_shipment_by_id(shipment_id: str | UUID) -> Shipment | None:
    return Shipment.objects.filter(id=shipment_id, deleted_at__isnull=True).first()


def get_shipment_by_carrier_and_tracking_number(carrier, tracking_number: str) -> Shipment | None:
    if not tracking_number:
        return None
    return (
        Shipment.objects.select_related("order")
        .filter(carrier=carrier, tracking_number=tracking_number, deleted_at__isnull=True)
        .first()
    )


def shipped_from_warehouses(*, shipment_ids, variant, quantity: int) -> list[tuple]:
    """Split `quantity` units of `variant` coming back from these consignments
    over the warehouses they left from (the latest one first), so returned
    stock goes back where it was taken. Units the ledger cannot place, or
    whose warehouse is gone, go to the default warehouse: `(None, n)`."""
    from apps.inventory.constants import MovementType
    from apps.inventory.models import StockLedgerEntry
    from apps.inventory.selectors.warehouse import all_warehouses

    origins = (
        StockLedgerEntry.objects.filter(
            reference_type="shipment",
            reference_id__in=list(shipment_ids),
            variant=variant,
            movement_type=MovementType.SALES_OUT,
        )
        .values("warehouse_id")
        .annotate(total=Sum("quantity"), last=Max("created_at"))
        .order_by("-last")
    )
    live = {warehouse.id: warehouse for warehouse in all_warehouses()}
    parts: dict = {}
    remaining = quantity
    for origin in origins:
        take = min(remaining, origin["total"])
        if take <= 0:
            break
        warehouse = live.get(origin["warehouse_id"])
        parts[warehouse] = parts.get(warehouse, 0) + take
        remaining -= take
    if remaining:
        parts[None] = parts.get(None, 0) + remaining
    return list(parts.items())


def shipped_unit_cost(*, shipment_ids, variant, warehouse=None):
    """What one unit of `variant` cost when these consignments took it out of
    `warehouse` (any warehouse when `None`), averaged over their stock-outs.
    `None` when a stock-out kept no cost (shipped before costs were kept)."""
    from apps.inventory.constants import MovementType
    from apps.inventory.models import StockLedgerEntry

    entries = StockLedgerEntry.objects.filter(
        reference_type="shipment",
        reference_id__in=list(shipment_ids),
        variant=variant,
        movement_type=MovementType.SALES_OUT,
    )
    if warehouse is not None:
        entries = entries.filter(warehouse=warehouse)
    rows = list(entries.values_list("quantity", "unit_cost"))
    costed = [(quantity, cost) for quantity, cost in rows if cost is not None]
    units = sum(quantity for quantity, _ in rows)
    if not units or len(costed) != len(rows):
        return None
    return sum(quantity * cost for quantity, cost in costed) / units
