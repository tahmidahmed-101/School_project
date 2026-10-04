from __future__ import annotations

from datetime import timedelta

from django.db import transaction
from django.db.models import Max
from django.utils import timezone

from apps.accounting.services.postings import post_sales_return
from apps.business.constants import ModuleKey
from apps.business.selectors.policies import (
    ReturnRules,
    governing_return_rules,
    policy_date,
    return_rule_versions,
)
from apps.business.services.modules import require_feature
from apps.catalog.selectors.bundles import expand_variant
from apps.common.exceptions import BusinessRuleViolationError
from apps.common.utils.codes import generate_document_number
from apps.inventory.constants import MovementType
from apps.inventory.services.stock import record_movement
from apps.orders.models import (
    ReturnRMA,
    ReturnRMALine,
    SalesOrder,
    SalesOrderLine,
    Shipment,
    ShipmentLine,
)

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


def _delivered_at_by_line(line_ids: list) -> dict:
    """When each line reached the customer: the latest delivery among the
    consignments that carried it, so a split shipment's window runs from the
    last parcel rather than the first. Lines with no recorded delivery are
    absent — their window has not started."""
    rows = (
        ShipmentLine.objects.filter(
            order_line_id__in=line_ids,
            shipment__status=Shipment.Status.DELIVERED,
            shipment__delivered_at__isnull=False,
            shipment__deleted_at__isnull=True,
        )
        .values("order_line_id")
        .annotate(delivered_at=Max("shipment__delivered_at"))
    )
    return {row["order_line_id"]: row["delivered_at"] for row in rows}


def _enforce_return_policy(versions: list[ReturnRules], order_lines: list[SalesOrderLine]) -> None:
    """Apply, per line, the published version in force when that line reached
    the customer. One governing moment per line drives both the version
    choice and the window: the latest recorded delivery (the same moment
    `_delivered_at_by_line` already gave the window), or now for a line with
    no recorded delivery, since a delivery today would fall under today's
    version. A delivery before every published version keeps the legacy
    behaviour. Every RMA path (customer, staff, seeder) comes through
    `create_rma`, so none can skip this."""
    now = timezone.now()
    delivered = _delivered_at_by_line([line.id for line in order_lines])
    category_by_line: dict | None = None
    for order_line in order_lines:
        delivered_at = delivered.get(order_line.id)
        rules = governing_return_rules(versions, policy_date(delivered_at or now))
        if rules is None:
            continue
        if not rules.preorder_returns_allowed and order_line.is_preorder:
            raise BusinessRuleViolationError(
                f"Line {order_line.id} was a pre-order, which the return policy excludes.",
                code="preorder_not_returnable",
            )
        if rules.non_returnable_category_ids:
            if category_by_line is None:
                category_by_line = {
                    line_id: str(category_id)
                    for line_id, category_id in SalesOrderLine.objects.filter(
                        id__in=[line.id for line in order_lines]
                    ).values_list("id", "variant__product__category_id")
                }
            if category_by_line.get(order_line.id) in rules.non_returnable_category_ids:
                raise BusinessRuleViolationError(
                    f"Line {order_line.id} is in a category the return policy excludes.",
                    code="category_not_returnable",
                )
        if (
            rules.window_days
            and delivered_at is not None
            and now > delivered_at + timedelta(days=rules.window_days)
        ):
            raise BusinessRuleViolationError(
                f"Line {order_line.id} was delivered more than {rules.window_days} days "
                "ago, outside the return window.",
                code="return_window_expired",
            )


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
    versions = return_rule_versions()
    if versions:
        _enforce_return_policy(versions, [locked_lines[line_id] for line_id in requested])

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
