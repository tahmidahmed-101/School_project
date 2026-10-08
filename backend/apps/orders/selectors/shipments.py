from __future__ import annotations

from uuid import UUID

from django.db.models import F, Q, QuerySet, Sum
from django.db.models.functions import Coalesce

from apps.orders.models import SalesOrder, SalesOrderLine, Shipment, StockReservation


def shipments_list(*, order=None, status: str | None = None) -> QuerySet[Shipment]:
    queryset = (
        Shipment.objects.select_related("order", "carrier")
        .prefetch_related("lines")
        .filter(deleted_at__isnull=True)
    )
    if order is not None:
        queryset = queryset.filter(order=order)
    if status:
        queryset = queryset.filter(status=status)
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
) -> QuerySet[SalesOrderLine]:
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
    lines = with_delivered_quantity(order.lines, name="delivered")
    if not lines.exists() or lines.filter(delivered__lt=F("quantity")).exists():
        return False
    return not StockReservation.objects.filter(
        order_line__order=order, status=StockReservation.Status.ACTIVE
    ).exists()


def get_shipment_detail(shipment_id: str | UUID) -> Shipment | None:
    """One shipment with what its detail serializer reads, in three queries."""
    return (
        Shipment.objects.select_related("carrier")
        .prefetch_related("lines__order_line__variant__product")
        .filter(id=shipment_id, deleted_at__isnull=True)
        .first()
    )


def get_shipment_by_id(shipment_id: str | UUID) -> Shipment | None:
    return Shipment.objects.filter(id=shipment_id, deleted_at__isnull=True).first()


def get_shipment_by_carrier_and_tracking_number(carrier, tracking_number: str) -> Shipment | None:
    if not tracking_number:
        return None
    return Shipment.objects.select_related("order").filter(
        carrier=carrier, tracking_number=tracking_number, deleted_at__isnull=True
    ).first()
