from __future__ import annotations

from django.db import transaction
from django.db.models import F

from apps.audit.services.audit import log_action
from apps.catalog.selectors.bundles import expand_variant
from apps.inventory.services.stock import (
    get_or_create_default_warehouse,
    lock_variant_stock,
    reserve_stock,
)
from apps.orders.models import SalesOrder, SalesOrderLine, StockReservation


@transaction.atomic
def allocate_preorder_stock(*, actor=None) -> list[dict]:
    """Set arrived stock aside for waiting pre-order lines, oldest order first.

    Only confirmed orders take part, so stock is never held for an order whose
    deposit has not come in. Each allocated unit is a normal reservation, which
    is what lets the line ship and what cancelling the order releases.
    """
    warehouse = get_or_create_default_warehouse()
    lines = list(
        SalesOrderLine.objects.select_for_update()
        .select_related("order", "variant")
        .filter(
            is_preorder=True,
            order__order_type=SalesOrder.OrderType.PREORDER,
            order__status=SalesOrder.Status.CONFIRMED,
            order__deleted_at__isnull=True,
            allocated_quantity__lt=F("quantity"),
        )
        .order_by("order__created_at", "created_at")
    )
    allocated: list[dict] = []
    for line in lines:
        per_unit = expand_variant(line.variant, 1)
        available = {
            item.variant_id: item.available
            for item in lock_variant_stock([component.id for component, _ in per_unit])
            if item.warehouse_id == warehouse.id
        }
        units = min(
            line.awaiting_stock_quantity,
            *(available.get(component.id, 0) // quantity for component, quantity in per_unit),
        )
        if units <= 0:
            continue
        for component, quantity in per_unit:
            reserve_stock(variant=component, warehouse=warehouse, quantity=quantity * units)
            StockReservation.objects.create(
                order_line=line, variant=component, quantity=quantity * units
            )
        line.allocated_quantity += units
        line.save(update_fields=["allocated_quantity", "updated_at"])
        allocated.append(
            {
                "order_id": line.order_id,
                "order_number": line.order.order_number,
                "variant_sku": line.variant_sku or line.variant.sku,
                "quantity": units,
            }
        )
    if allocated:
        log_action(
            actor=actor,
            action="order.preorder_stock_allocated",
            target_type="SalesOrder",
            metadata={"lines": len(allocated), "units": sum(row["quantity"] for row in allocated)},
        )
    return allocated
