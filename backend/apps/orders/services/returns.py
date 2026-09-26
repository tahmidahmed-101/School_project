from __future__ import annotations

from django.db import transaction

from apps.accounting.services.postings import post_sales_return
from apps.business.constants import ModuleKey
from apps.business.services.modules import require_feature
from apps.catalog.selectors.bundles import expand_variant
from apps.common.exceptions import BusinessRuleViolationError
from apps.common.utils.codes import generate_document_number
from apps.inventory.constants import MovementType
from apps.inventory.services.stock import record_movement
from apps.orders.models import ReturnRMA, ReturnRMALine, SalesOrder, SalesOrderLine

# Only units that have physically left the building can come back. A partially
# shipped order is still `confirmed`, so gate on the per-line shipped balance
# rather than the order status alone — but reject outright the states where
# nothing can possibly have shipped.
NON_RETURNABLE_ORDER_STATUSES = {
    SalesOrder.Status.PENDING,
    SalesOrder.Status.AWAITING_PAYMENT,
    SalesOrder.Status.CANCELLED,
}


def rmas_in_use() -> str | None:
    count = ReturnRMA.objects.filter(deleted_at__isnull=True).count()
    if count:
        return f"{count} returns are still open on file. Close and remove them first."
    return None


@transaction.atomic
def create_rma(*, order: SalesOrder, lines: list[dict], reason: str = "") -> ReturnRMA:
    """Open a return request against shipped units.

    Every requested quantity is checked against the line's remaining
    returnable balance (shipped minus already-claimed) under a row lock, and
    the claim is recorded on `SalesOrderLine.returned_quantity` immediately.
    Claiming at request time — not at receipt time — is what stops two
    concurrent RMAs from each passing validation for the same units and
    restocking them twice. `reject_rma` gives the claim back.
    """
    require_feature(ModuleKey.ORDERS, "returns")
    if not lines:
        raise BusinessRuleViolationError("An RMA needs at least one line.", code="no_lines")
    if order.status in NON_RETURNABLE_ORDER_STATUSES:
        raise BusinessRuleViolationError(
            "Only orders with shipped units can be returned.", code="order_not_returnable"
        )

    # Collapse duplicate references so two entries for the same line are
    # validated as one combined request instead of two that each pass alone.
    requested: dict[str, int] = {}
    for line in lines:
        order_line = line["order_line"]
        quantity = int(line["quantity"])
        if quantity <= 0:
            raise BusinessRuleViolationError(
                "Return quantity must be positive.", code="invalid_quantity"
            )
        if order_line.order_id != order.id:
            raise BusinessRuleViolationError(
                "Order line does not belong to this order.", code="line_order_mismatch"
            )
        requested[str(order_line.id)] = requested.get(str(order_line.id), 0) + quantity

    locked_lines = {
        str(line.id): line
        for line in SalesOrderLine.objects.select_for_update().filter(id__in=requested.keys())
    }
    for line_id, quantity in requested.items():
        order_line = locked_lines[line_id]
        if order_line.shipped_quantity == 0:
            raise BusinessRuleViolationError(
                f"Line {order_line.id} has not shipped yet and cannot be returned.",
                code="line_not_shipped",
            )
        if quantity > order_line.returnable_quantity:
            raise BusinessRuleViolationError(
                f"Cannot return {quantity} units of line {order_line.id}: only "
                f"{order_line.returnable_quantity} of {order_line.shipped_quantity} "
                "shipped units are still returnable.",
                code="over_return",
            )

    rma_number = generate_document_number("RMA")
    while ReturnRMA.objects.filter(rma_number=rma_number).exists():
        rma_number = generate_document_number("RMA")

    rma = ReturnRMA.objects.create(order=order, rma_number=rma_number, reason=reason)
    ReturnRMALine.objects.bulk_create(
        [
            ReturnRMALine(rma=rma, order_line=locked_lines[line_id], quantity=quantity)
            for line_id, quantity in requested.items()
        ]
    )
    for line_id, quantity in requested.items():
        order_line = locked_lines[line_id]
        order_line.returned_quantity += quantity
        order_line.save(update_fields=["returned_quantity", "updated_at"])
    return rma


def _ensure_status(rma: ReturnRMA, expected: str) -> None:
    if rma.status != expected:
        raise BusinessRuleViolationError(
            f"RMA must be {expected} for this action.", code="invalid_rma_status"
        )


@transaction.atomic
def grade_rma_line(*, line: ReturnRMALine, condition: str) -> ReturnRMALine:
    """Staff sets sellable/damaged once the return physically arrives —
    before `receive_rma` decides whether it restocks."""
    _ensure_status(line.rma, ReturnRMA.Status.APPROVED)
    line.condition = condition
    line.save(update_fields=["condition"])
    return line


@transaction.atomic
def approve_rma(*, rma: ReturnRMA) -> ReturnRMA:
    _ensure_status(rma, ReturnRMA.Status.REQUESTED)
    rma.status = ReturnRMA.Status.APPROVED
    rma.save(update_fields=["status"])
    return rma


@transaction.atomic
def reject_rma(*, rma: ReturnRMA) -> ReturnRMA:
    """Reject the request and hand the claimed units back to the order line so
    they remain returnable under a later RMA."""
    _ensure_status(rma, ReturnRMA.Status.REQUESTED)
    for line in rma.lines.all():
        order_line = SalesOrderLine.objects.select_for_update().get(pk=line.order_line_id)
        order_line.returned_quantity = max(order_line.returned_quantity - line.quantity, 0)
        order_line.save(update_fields=["returned_quantity", "updated_at"])
    rma.status = ReturnRMA.Status.REJECTED
    rma.save(update_fields=["status"])
    return rma


@transaction.atomic
def receive_rma(*, rma: ReturnRMA, actor=None) -> ReturnRMA:
    """Book the physical arrival. Lines graded sellable rejoin stock with a
    `RETURN_IN` ledger entry, expanded into components exactly as the shipment
    consumed them, so returning a bundle restores its components instead of
    inventing stock of the bundle SKU. Damaged units are scrapped and never
    touch the stock ledger.

    Either way the general ledger is reversed by `post_sales_return`, so stock
    and books move together.
    """
    _ensure_status(rma, ReturnRMA.Status.APPROVED)
    if any(not line.condition for line in rma.lines.all()):
        raise BusinessRuleViolationError(
            "Every RMA line must be graded sellable or damaged before receipt.",
            code="ungraded_lines",
        )

    for line in rma.lines.select_related("order_line__variant"):
        if line.condition != ReturnRMALine.Condition.SELLABLE:
            continue
        order_line = line.order_line
        for component, component_qty in expand_variant(order_line.variant, line.quantity):
            record_movement(
                variant=component,
                movement_type=MovementType.RETURN_IN,
                quantity=component_qty,
                reference_type="rma",
                reference_id=rma.id,
                actor=actor,
            )

    # Posted after restocking, but RETURN_IN carries no unit_cost so it leaves
    # avg_cost untouched — the reversal is still valued at the cost the
    # original shipment charged to COGS.
    post_sales_return(rma)

    rma.status = ReturnRMA.Status.RECEIVED
    rma.save(update_fields=["status"])
    return rma
