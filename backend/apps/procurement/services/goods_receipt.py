from __future__ import annotations

from django.db import transaction
from django.db.models import F

from apps.accounting.services.postings import post_goods_received
from apps.common.exceptions import BusinessRuleViolationError
from apps.inventory.constants import MovementType
from apps.inventory.services.stock import record_movement
from apps.procurement.models import GoodsReceiptNote, GRNLine, PurchaseOrder, PurchaseOrderLine


@transaction.atomic
def create_goods_receipt(
    *, purchase_order: PurchaseOrder, received_date, received_by, lines: list[dict]
) -> GoodsReceiptNote:
    if purchase_order.status not in {
        PurchaseOrder.Status.SUBMITTED,
        PurchaseOrder.Status.RECEIVED,
    }:
        raise BusinessRuleViolationError(
            "Only a submitted purchase order can receive stock.", code="not_submitted"
        )
    if not lines:
        raise BusinessRuleViolationError(
            "A goods receipt needs at least one line.", code="no_lines"
        )

    grn = GoodsReceiptNote.objects.create(
        purchase_order=purchase_order,
        received_date=received_date,
        received_by=received_by,
        status=GoodsReceiptNote.Status.PENDING,
    )

    any_rejected = False
    for line in lines:
        # Lock the PO line row so two concurrent receipts against the same
        # line can't both read the same quantity_received and over-receive.
        po_line: PurchaseOrderLine = PurchaseOrderLine.objects.select_for_update().get(
            pk=line["purchase_order_line"].pk
        )
        quantity = line["quantity_received"]
        condition = line["condition"]

        remaining = po_line.quantity_ordered - po_line.quantity_received
        if quantity > remaining:
            raise BusinessRuleViolationError(
                f"Cannot receive more than the remaining ordered quantity ({remaining}).",
                code="over_receipt",
            )

        grn_line = GRNLine.objects.create(
            goods_receipt=grn,
            purchase_order_line=po_line,
            quantity_received=quantity,
            condition=condition,
        )

        if condition == GRNLine.Condition.ACCEPTED:
            record_movement(
                variant=po_line.variant,
                movement_type=MovementType.PURCHASE_IN,
                quantity=quantity,
                unit_cost=po_line.unit_cost,
                reference_type="goods_receipt",
                reference_id=grn.id,
                actor=received_by,
            )
            po_line.quantity_received += quantity
            po_line.save(update_fields=["quantity_received"])
            post_goods_received(grn_line)
        else:
            any_rejected = True

    grn.status = (
        GoodsReceiptNote.Status.QC_REJECT if any_rejected else GoodsReceiptNote.Status.QC_PASS
    )
    grn.save(update_fields=["status"])

    remaining_lines = purchase_order.lines.exclude(quantity_received__gte=F("quantity_ordered"))
    if not remaining_lines.exists():
        purchase_order.status = PurchaseOrder.Status.RECEIVED
        purchase_order.save(update_fields=["status"])

    return grn
