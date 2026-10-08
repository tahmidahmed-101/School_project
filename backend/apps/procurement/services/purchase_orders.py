from __future__ import annotations

from django.db import transaction

from apps.common.exceptions import BusinessRuleViolationError
from apps.common.utils.codes import generate_document_number
from apps.procurement.models import PurchaseOrder, PurchaseOrderLine
from apps.procurement.selectors.kind import LINE_KIND, purchase_order_kind


def _check_supplier_kind(supplier, kind: str) -> None:
    if supplier.kind != kind:
        raise BusinessRuleViolationError(
            "Pick a supplier from the same side as the items: stock or pre-order.",
            code="supplier_kind_mismatch",
        )


def _check_one_kind(
    purchase_order: PurchaseOrder | None, variants, *, supplier, skip_line=None
) -> None:
    kinds = {variant.product.category.category_type for variant in variants}
    if purchase_order is not None:
        lines = purchase_order.lines.all()
        if skip_line is not None:
            lines = lines.exclude(id=skip_line.id)
        kinds.update(lines.values_list(LINE_KIND, flat=True))
    if len(kinds) > 1:
        raise BusinessRuleViolationError(
            "A purchase order holds stock items or pre-order items, not both.",
            code="purchase_kind_mismatch",
        )
    for kind in kinds:
        if purchase_order is None or kind != purchase_order_kind(purchase_order):
            _check_supplier_kind(supplier, kind)


@transaction.atomic
def create_purchase_order(
    *, supplier, order_date, notes: str = "", lines: list[dict]
) -> PurchaseOrder:
    if not lines:
        raise BusinessRuleViolationError(
            "A purchase order needs at least one line.", code="no_lines"
        )

    _check_one_kind(None, [line["variant"] for line in lines], supplier=supplier)

    po_number = generate_document_number("PO")
    while PurchaseOrder.objects.filter(po_number=po_number).exists():
        po_number = generate_document_number("PO")

    purchase_order = PurchaseOrder.objects.create(
        po_number=po_number,
        supplier=supplier,
        order_date=order_date,
        notes=notes,
    )
    PurchaseOrderLine.objects.bulk_create(
        [
            PurchaseOrderLine(
                purchase_order=purchase_order,
                variant=line["variant"],
                quantity_ordered=line["quantity_ordered"],
                unit_cost=line["unit_cost"],
            )
            for line in lines
        ]
    )
    return purchase_order


def _ensure_draft(purchase_order: PurchaseOrder) -> None:
    if purchase_order.status != PurchaseOrder.Status.DRAFT:
        raise BusinessRuleViolationError(
            "Only a draft purchase order can be changed.", code="not_draft"
        )


@transaction.atomic
def update_purchase_order(*, purchase_order: PurchaseOrder, data: dict) -> PurchaseOrder:
    target_status = data.get("status")
    if target_status and target_status != purchase_order.status:
        if (
            target_status == PurchaseOrder.Status.SUBMITTED
            and purchase_order.status == PurchaseOrder.Status.DRAFT
        ):
            purchase_order = submit_purchase_order(purchase_order=purchase_order)
        elif target_status == PurchaseOrder.Status.CANCELLED:
            purchase_order = cancel_purchase_order(purchase_order=purchase_order)
        elif target_status == PurchaseOrder.Status.DRAFT:
            if purchase_order.lines.filter(quantity_received__gt=0).exists():
                raise BusinessRuleViolationError(
                    "Cannot revert a purchase order that has received items to draft.",
                    code="already_received",
                )
            purchase_order.status = PurchaseOrder.Status.DRAFT
            purchase_order.save(update_fields=["status"])
        elif target_status == PurchaseOrder.Status.RECEIVED:
            purchase_order.status = PurchaseOrder.Status.RECEIVED
            purchase_order.save(update_fields=["status"])
        else:
            purchase_order.status = target_status
            purchase_order.save(update_fields=["status"])
    allowed_fields = {"order_date", "notes", "supplier"}
    update_fields = [field for field in data if field in allowed_fields]
    if update_fields:
        if purchase_order.status != PurchaseOrder.Status.DRAFT:
            raise BusinessRuleViolationError(
                "Only a draft purchase order header can be edited.", code="not_draft"
            )
        if "supplier" in update_fields and data["supplier"] != purchase_order.supplier:
            _check_supplier_kind(data["supplier"], purchase_order_kind(purchase_order))
        for field in update_fields:
            setattr(purchase_order, field, data[field])
    if update_fields:
        purchase_order.save(update_fields=update_fields)
    return purchase_order


@transaction.atomic
def add_purchase_order_line(
    *, purchase_order: PurchaseOrder, variant, quantity_ordered: int, unit_cost
) -> PurchaseOrderLine:
    _ensure_draft(purchase_order)
    _check_one_kind(purchase_order, [variant], supplier=purchase_order.supplier)
    return PurchaseOrderLine.objects.create(
        purchase_order=purchase_order,
        variant=variant,
        quantity_ordered=quantity_ordered,
        unit_cost=unit_cost,
    )


@transaction.atomic
def update_purchase_order_line(
    *, purchase_order: PurchaseOrder, line: PurchaseOrderLine, data: dict
) -> PurchaseOrderLine:
    _ensure_draft(purchase_order)
    if "variant" in data:
        _check_one_kind(
            purchase_order, [data["variant"]], supplier=purchase_order.supplier, skip_line=line
        )
    allowed_fields = {"variant", "quantity_ordered", "unit_cost"}
    update_fields = [field for field in data if field in allowed_fields]
    for field in update_fields:
        setattr(line, field, data[field])
    if update_fields:
        line.save(update_fields=update_fields)
    return line


@transaction.atomic
def remove_purchase_order_line(*, purchase_order: PurchaseOrder, line: PurchaseOrderLine) -> None:
    _ensure_draft(purchase_order)
    if purchase_order.lines.count() <= 1:
        raise BusinessRuleViolationError(
            "A purchase order needs at least one line.", code="last_line"
        )
    line.delete()


@transaction.atomic
def submit_purchase_order(*, purchase_order: PurchaseOrder) -> PurchaseOrder:
    _ensure_draft(purchase_order)
    purchase_order.status = PurchaseOrder.Status.SUBMITTED
    purchase_order.save(update_fields=["status"])
    return purchase_order


@transaction.atomic
def cancel_purchase_order(*, purchase_order: PurchaseOrder) -> PurchaseOrder:
    if purchase_order.status == PurchaseOrder.Status.RECEIVED:
        raise BusinessRuleViolationError(
            "A fully received purchase order cannot be cancelled.", code="already_received"
        )
    purchase_order.status = PurchaseOrder.Status.CANCELLED
    purchase_order.save(update_fields=["status"])
    return purchase_order


@transaction.atomic
def delete_purchase_order(*, purchase_order: PurchaseOrder, actor=None) -> None:
    if purchase_order.status not in {
        PurchaseOrder.Status.DRAFT,
        PurchaseOrder.Status.CANCELLED,
    }:
        raise BusinessRuleViolationError(
            "Only draft or cancelled purchase orders can be deleted.",
            code="po_delete_not_allowed",
        )
    purchase_order.soft_delete(deleted_by=actor)
